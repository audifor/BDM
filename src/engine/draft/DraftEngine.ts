import type { PlayerId, TeamId } from '@/domain/ids'
import { getPlayerContractStatus } from '@/domain/contract'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { DraftPick } from '@/domain/draft'
import type { Draft, DraftRules } from '@/domain/draft'
import type { DraftEntry, DraftEntryStatus } from '@/domain/draft'
import type { EcosystemId, SeasonId } from '@/domain/ids'
import { calculateStandings } from '@/engine/competition/standings'
import { createPlayer, calculateAge } from '@/domain/player'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { playerIdFromString } from '@/domain/ids'
import { addDays, addYears } from '@/domain/date'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { createRookieContract } from '@/engine/salary'
import { materializeFutureDraftPickOwnership } from '@/engine/trade'
import { createPlayerRights } from '@/domain/trade'
import { assessCollegeEligibility } from '@/engine/eligibility'
import { generateCanonicalDevelopmentProfile, generateCanonicalRatings } from '@/engine/world/CanonicalPlayerTruthGenerator'
import { assessNbaDraftEligibility } from '@/engine/draft/DraftEligibility'
import { calculatePlayerStatAverages, getPlayerCareerStats } from '@/engine/stats/PlayerHistory'

export function createDraftForCompletedSeason(world: GameWorld, ecosystemId: EcosystemId, sourceSeasonId: SeasonId, rules: DraftRules, prospectPlayerIds: readonly PlayerId[]): GameWorld {
  const ecosystem = world.ecosystems[ecosystemId]; const season = world.seasons[sourceSeasonId]
  if (!ecosystem || ecosystem.kind !== 'nbaLike' || !season || world.competitions[season.competitionId]?.ecosystemId !== ecosystemId || world.seasonHistoryBySeasonId[sourceSeasonId] === undefined) throw new Error('Draft requires a completed NBA-like season')
  const id = `draft:${ecosystemId}:${sourceSeasonId}`; if (world.draftsById[id] !== undefined) return world
  const order = calculateStandings(world, sourceSeasonId).slice().reverse().map((line) => line.teamId)
  if (new Set(prospectPlayerIds).size !== prospectPlayerIds.length || prospectPlayerIds.some((playerId) => world.players[playerId] === undefined)) throw new Error('Draft class must contain unique existing Players')
  const scheduledOn = rules.draftDate ?? addDays(season.endDate, rules.scheduledAfterDays)
  const playerCountBefore = Object.keys(world.players).length
  // The caller supplies the projected eligible pool; production callers use the eligibility evaluator.
  const eligiblePlayerIds = [...prospectPlayerIds]
  const entries = eligiblePlayerIds.map((playerId) => {
    const player = world.players[playerId]!
    const collegeEnrollment = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === playerId && item.status === 'active')
    const sourceTeam = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId))
    const sourceEcosystem = sourceTeam === undefined ? undefined : Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(sourceTeam.id))?.ecosystemId
    const sourcePathway = collegeEnrollment !== undefined || (sourceEcosystem !== undefined && world.ecosystems[sourceEcosystem]?.kind === 'ncaaLike') ? 'college' as const : sourceEcosystem !== undefined && world.ecosystems[sourceEcosystem]?.kind === 'fibaLike' ? 'international' as const : 'other' as const
    const eligibility = assessNbaDraftEligibility(world, playerId, { scheduledOn, rules })
    return { id: `draft-entry:${id}:${playerId}`, draftId: id, playerId, status: 'finalPool' as const, entryType: eligibility.automatic ? 'automatic' as const : 'early' as const, sourcePathway, provenance: rules.provenance ?? 'PRODUCT_ABSTRACTION' as const, history: [{ status: 'finalPool' as const, occurredOn: world.currentDate }] }
  })
  const draft: Draft = { id, ecosystemId, sourceSeasonId, rules, scheduledOn, status: 'scheduled', prospectPlayerIds: eligiblePlayerIds, entries }
  const picks = materializeFutureDraftPickOwnership(world, ecosystemId, Number(season.startDate.slice(0, 4)), Array.from({ length: rules.rounds }, (_, roundIndex) => order.map((teamId, index) => ({ id: `draft-pick:${id}:round:${roundIndex + 1}:original:${teamId}`, draftId: id, round: roundIndex + 1, order: roundIndex * order.length + index + 1, originalTeamId: teamId, ownerTeamId: teamId }))).flat())
  const result = updateGameWorld(world, { drafts: [...Object.values(world.draftsById), draft], draftPicks: [...Object.values(world.draftPicksById), ...picks] })
  if (Object.keys(result.players).length !== playerCountBefore || eligiblePlayerIds.some((playerId) => world.players[playerId] === undefined)) throw new Error('Draft pool construction must preserve existing Player count and identity')
  return result
}
export function openDraft(world: GameWorld, draftId: string): GameWorld {
  const draft = world.draftsById[draftId]
  if (!draft || draft.status !== 'scheduled' || world.currentDate < draft.scheduledOn || world.seasonHistoryBySeasonId[draft.sourceSeasonId] === undefined) return world
  const projection = projectDraftCandidates(world, draftId, world.currentDate)
  const candidates = projection.playerIds
  const entries: DraftEntry[] = (draft.entries ?? []).map((entry) => entry.status === 'declaredEarlyEntry' && candidates.includes(entry.playerId) ? { ...entry, status: 'finalPool', history: [...(entry.history ?? []), { status: 'finalPool', occurredOn: world.currentDate }] } : entry)
  const represented = new Set(entries.map((entry) => entry.playerId))
  for (const playerId of projection.automaticPlayerIds) {
    if (represented.has(playerId)) continue
    const sourcePathway = getSourcePathway(world, playerId)
    entries.push({ id: `draft-entry:${draftId}:${playerId}`, draftId, playerId, status: 'finalPool', entryType: 'automatic', sourcePathway, provenance: draft.rules.provenance ?? 'PRODUCT_ABSTRACTION', history: [{ status: 'finalPool', occurredOn: world.currentDate }] })
  }
  return updateGameWorld(world, { drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, entries, status: 'inProgress' } : item) })
}
export function declareDraftEntry(world: GameWorld, draftId: string, playerId: PlayerId, entryType: 'early' | 'preEnrollment' = 'early'): GameWorld {
  const draft = world.draftsById[draftId]
  const priorEntry = draft?.entries?.find((candidate) => candidate.playerId === playerId)
  if (priorEntry?.status === 'declaredEarlyEntry' || priorEntry?.status === 'finalPool') return world
  if (!draft || draft.status !== 'scheduled' || !world.players[playerId]) throw new Error('Draft declaration is invalid')
  if (priorEntry !== undefined && priorEntry.status !== 'considering') throw new Error('Draft declaration is invalid')
  if (draft.rules.earlyEntryDeadline !== undefined && world.currentDate > draft.rules.earlyEntryDeadline) throw new Error('Draft declaration deadline has passed')
  if (entryType === 'preEnrollment' && (draft.rules.preEnrollmentOptInEffectiveFrom === undefined || world.currentDate < draft.rules.preEnrollmentOptInEffectiveFrom)) throw new Error('Pre-enrollment opt-in is not effective for this Draft cycle')
  const team = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(playerId))
  const ecosystemId = team === undefined ? undefined : Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(team.id))?.ecosystemId
  const kind = ecosystemId === undefined ? undefined : world.ecosystems[ecosystemId]?.kind
  if (kind !== 'ncaaLike' && kind !== 'fibaLike' && entryType !== 'preEnrollment') throw new Error('Draft candidate must be on a college or international pathway')
  const draftYear = Number(draft.scheduledOn.slice(0, 4))
  const eligibility = assessNbaDraftEligibility(world, playerId, draft)
  if (!eligibility.eligible) throw new Error(eligibility.reason)
  if (kind === 'ncaaLike' && !Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === playerId && Number(enrollment.startsOn.slice(0, 4)) + (draft.rules.postHighSchoolSeasonRequirement ?? 1) <= draftYear)) throw new Error('Required post-high-school season has not elapsed')
  if (entryType === 'preEnrollment' && Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === playerId && enrollment.status === 'active')) throw new Error('Enrolled Player cannot use the pre-enrollment entry route')
  const entry: DraftEntry = { ...(priorEntry ?? { id: `draft-entry:${draftId}:${playerId}`, draftId, playerId, entryType, sourcePathway: kind === 'ncaaLike' ? 'college' : kind === 'fibaLike' ? 'international' : 'other', provenance: draft.rules.provenance ?? 'PRODUCT_ABSTRACTION' }), status: 'declaredEarlyEntry', entryType, declaredOn: world.currentDate, history: [...(priorEntry?.history ?? []), { status: 'declaredEarlyEntry', occurredOn: world.currentDate }] }
  return updateGameWorld(world, { drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, entries: priorEntry === undefined ? [...(item.entries ?? []), entry] : item.entries?.map((candidate) => candidate.playerId === playerId ? entry : candidate) } : item) })
}
export function considerDraftEntry(world: GameWorld, draftId: string, playerId: PlayerId): GameWorld {
  const draft = world.draftsById[draftId]
  if (!draft || draft.status !== 'scheduled' || !world.players[playerId]) throw new Error('Draft consideration is invalid')
  const existing = draft.entries?.find((entry) => entry.playerId === playerId)
  if (existing !== undefined) return world
  const eligibility = assessNbaDraftEligibility(world, playerId, draft)
  if (!eligibility.eligible) throw new Error(eligibility.reason)
  const team = Object.values(world.teams).find((item) => item.rosterPlayerIds.includes(playerId))
  const ecosystemId = team === undefined ? undefined : Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(team.id))?.ecosystemId
  const kind = ecosystemId === undefined ? undefined : world.ecosystems[ecosystemId]?.kind
  const entry: DraftEntry = { id: `draft-entry:${draftId}:${playerId}`, draftId, playerId, status: 'considering', entryType: 'early', sourcePathway: kind === 'ncaaLike' ? 'college' : kind === 'fibaLike' ? 'international' : 'other', provenance: draft.rules.provenance ?? 'PRODUCT_ABSTRACTION', history: [{ status: 'considering', occurredOn: world.currentDate }] }
  return updateGameWorld(world, { drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, entries: [...(item.entries ?? []), entry] } : item) })
}
export function withdrawDraftEntry(world: GameWorld, draftId: string, playerId: PlayerId): GameWorld {
  const draft = world.draftsById[draftId]
  const entry = draft?.entries?.find((candidate) => candidate.playerId === playerId)
  if (entry?.status === 'withdrawnNCAAEligible' || entry?.status === 'withdrawnNCAAIneligible' || entry?.status === 'withdrawnNBA') return world
  if (!draft || draft.status !== 'scheduled' || !entry || entry.status !== 'declaredEarlyEntry' && entry.status !== 'finalPool') throw new Error('Draft withdrawal is invalid')
  const withinNbaDeadline = draft.rules.finalWithdrawalDeadline === undefined || world.currentDate <= draft.rules.finalWithdrawalDeadline
  let keepsCollegeEligibility = entry.entryType === 'preEnrollment' && withinNbaDeadline
  const activeEnrollment = Object.values(world.playerEnrollmentsById).find((enrollment) => enrollment.playerId === playerId && enrollment.status === 'active')
  const collegeAssessment = entry.sourcePathway === 'college' && activeEnrollment !== undefined ? assessCollegeEligibility(world, { playerId, teamId: activeEnrollment.teamId, ecosystemId: activeEnrollment.ecosystemId, onDate: world.currentDate }) : undefined
  const withinCollegeDeadline = draft.rules.collegeWithdrawalDeadline === undefined || world.currentDate <= draft.rules.collegeWithdrawalDeadline
  if (entry.sourcePathway === 'college' && activeEnrollment !== undefined) keepsCollegeEligibility = withinCollegeDeadline && collegeAssessment?.eligible === true
  if (!withinNbaDeadline) throw new Error(`NBA Draft withdrawal deadline ${draft.rules.finalWithdrawalDeadline ?? 'not configured'} has passed (rules ${draft.rules.version ?? 'unspecified'})`)
  const status: DraftEntryStatus = keepsCollegeEligibility ? 'withdrawnNCAAEligible' : entry.sourcePathway === 'college' ? 'withdrawnNCAAIneligible' : 'withdrawnNBA'
  const collegeReturnAssessment = entry.sourcePathway !== 'college' ? undefined : {
    assessedOn: world.currentDate,
    allowed: keepsCollegeEligibility,
    ...(draft.rules.collegeWithdrawalDeadline === undefined ? {} : { deadline: draft.rules.collegeWithdrawalDeadline }),
    ...(collegeAssessment === undefined ? {} : { rulesetId: collegeAssessment.rulesetId, rulesetVersion: collegeAssessment.rulesetVersion }),
    reasons: keepsCollegeEligibility ? ['ELIGIBLE_UNDER_COLLEGE_RULESET'] : !withinCollegeDeadline ? ['NCAA_RETURN_DEADLINE_PASSED'] : collegeAssessment?.reasons ?? ['COLLEGE_ELIGIBILITY_RULESET_UNAVAILABLE'],
  }
  return updateGameWorld(world, { drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, entries: item.entries?.map((candidate) => candidate.playerId === playerId ? { ...candidate, status, withdrawnOn: world.currentDate, ...(collegeReturnAssessment === undefined ? {} : { collegeReturnAssessment }), history: [...(candidate.history ?? []), { status, occurredOn: world.currentDate }] } : candidate) } : item) })
}
export function generateDraftProspects(world: GameWorld, draftId: string, count: number): GameWorld {
  const draft = world.draftsById[draftId]; if (!draft || draft.prospectPlayerIds.length > 0 || !Number.isInteger(count) || count < 1) throw new Error('Draft prospects cannot be generated')
  const prospectIds = Array.from({ length: count }, (_, index) => playerIdFromString(`draft-prospect:${draftId}:${index + 1}`))
  const existing = prospectIds.filter((id) => world.players[id] !== undefined)
  if (existing.length === prospectIds.length) return updateGameWorld(world, { drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, prospectPlayerIds: prospectIds } : item) })
  if (existing.length > 0) throw new Error('Draft prospect generation is incomplete')
  const templateTeam = Object.values(world.teams).find((team) => Object.values(world.competitions).some((competition) => competition.ecosystemId === draft.ecosystemId && competition.participantTeamIds.includes(team.id)))
  const template = (templateTeam === undefined ? undefined : world.players[templateTeam.rosterPlayerIds[0]!]) ?? Object.values(world.players)[0]; if (!template) throw new Error('Draft prospects require a player template')
  const prospects = prospectIds.map((id, index) => { const random = new SeededRandomSource(hashStringToSeed(`draft-prospect:${draftId}:${index + 1}`)); const positions = ['PG','SG','SF','PF','C'] as const; const primaryPosition = positions[index % positions.length]!; const ratings = generateCanonicalRatings(hashStringToSeed(draftId), id, primaryPosition, 45, 75); const bioDate = addYears(draft.scheduledOn, -19); return createPlayer({ id, firstName: `Prospect${index + 1}`, lastName: `Class${draftId.slice(-6)}`, gender: template.gender, nationalityId: template.nationalityId, basketball: { primaryPosition, ratings }, bio: { dateOfBirth: bioDate, heightCm: random.nextInt(180, 215), weightKg: random.nextInt(75, 115) }, development: generateCanonicalDevelopmentProfile(hashStringToSeed(draftId), id, ratings, 19) }) })
  return updateGameWorld(world, { players: [...Object.values(world.players), ...prospects], drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, prospectPlayerIds: prospects.map((player) => player.id) } : item) })
}
export interface AiDraftBoardRow { readonly playerId: PlayerId; readonly rank: number; readonly priorityScore: number; readonly knowledgeConfidence: number; readonly publicProduction: number; readonly positionalNeed: number }
export function getAiDraftBoard(world: GameWorld, draftId: string, organizationTeamId?: TeamId): readonly AiDraftBoardRow[] {
  const teamId = organizationTeamId ?? getCurrentDraftPick(world, draftId)?.ownerTeamId
  const team = teamId === undefined ? undefined : world.teams[teamId]
  if (!team) return []
  const organizationId = team.organizationId, policy = world.organizationEvaluationPoliciesById[organizationId]
  const countsByPosition = new Map<string, number>()
  for (const rosteredId of team.rosterPlayerIds) { const position = world.players[rosteredId]?.basketball.primaryPosition; if (position) countsByPosition.set(position, (countsByPosition.get(position) ?? 0) + 1) }
  return getAvailableDraftProspects(world, draftId).map((playerId) => {
    const player = world.players[playerId]!
    const valuation = deriveOrganizationPlayerValuation({ organizationId, playerId, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'DRAFT', publicPosition: player.basketball.primaryPosition, policy })
    const stats = calculatePlayerStatAverages(getPlayerCareerStats(world, playerId))
    const publicProduction = Math.min(10, stats.ppg * 0.2 + stats.rpg * 0.12 + stats.apg * 0.16 + stats.spg * 0.1 + stats.bpg * 0.1)
    const positionalNeed = Math.max(0, 3 - (countsByPosition.get(player.basketball.primaryPosition) ?? 0))
    return { playerId, rank: 0, priorityScore: valuation.priorityScore + Math.round(publicProduction * 4 + positionalNeed * 1.5), knowledgeConfidence: valuation.certainty, publicProduction: Math.round(publicProduction * 10) / 10, positionalNeed }
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.playerId.localeCompare(b.playerId)).map((row, index) => ({ ...row, rank: index + 1 }))
}
export function chooseAiDraftProspect(world: GameWorld, draftId: string, organizationTeamId?: TeamId): PlayerId | undefined { return getAiDraftBoard(world, draftId, organizationTeamId)[0]?.playerId }
export function progressDraftAi(world: GameWorld, draftId: string): GameWorld { let current = world; const userTeamId = Object.values(current.teams).find((team) => team.coachId === current.userCoachId)?.id; for (;;) { const pick = getCurrentDraftPick(current, draftId); if (!pick || pick.ownerTeamId === userTeamId) return current; const prospect = chooseAiDraftProspect(current, draftId,pick.ownerTeamId); if (!prospect) return current; current = makeDraftSelection(current, draftId, pick.ownerTeamId, prospect) } }

function getTeamEcosystemKind(world: GameWorld, teamId: TeamId) { const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(teamId)); return competition === undefined ? undefined : world.ecosystems[competition.ecosystemId]?.kind }
function getSourcePathway(world: GameWorld, playerId: PlayerId): DraftEntry['sourcePathway'] { const team = Object.values(world.teams).find((item) => item.rosterPlayerIds.includes(playerId)); const kind = team === undefined ? undefined : getTeamEcosystemKind(world, team.id); return kind === 'ncaaLike' ? 'college' : kind === 'fibaLike' ? 'international' : 'other' }

export function getDraftPicks(world: GameWorld, draftId: string): readonly DraftPick[] { return Object.values(world.draftPicksById).filter((pick) => pick.draftId === draftId).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) }
export function getCurrentDraftPick(world: GameWorld, draftId: string): DraftPick | undefined { return getDraftPicks(world, draftId).find((pick) => pick.selection === undefined) }
export interface DraftCandidateProjection { readonly playerIds: readonly PlayerId[]; readonly automaticPlayerIds: readonly PlayerId[]; readonly earlyEntryPlayerIds: readonly PlayerId[]; readonly playersBefore: number; readonly playersAfter: number }

/** Derives current Draft candidates from automatic eligibility and valid DraftEntry state. */
export function projectDraftCandidates(world: GameWorld, draftId: string, date = world.currentDate): DraftCandidateProjection {
  const draft = world.draftsById[draftId]
  if (!draft) throw new Error('Draft does not exist')
  const playersBefore = Object.keys(world.players).length
  if (draft.status === 'completed') return { playerIds: [], automaticPlayerIds: [], earlyEntryPlayerIds: [], playersBefore, playersAfter: playersBefore }
  const entries = new Map((draft.entries ?? []).map((entry) => [entry.playerId, entry]))
  const withdrawn = new Set((draft.entries ?? []).filter((entry) => ['withdrawnNCAAEligible', 'withdrawnNCAAIneligible', 'withdrawnNBA'].includes(entry.status)).map((entry) => entry.playerId))
  const selected = new Set(getDraftPicks(world, draftId).flatMap((pick) => pick.selection === undefined ? [] : [pick.selection.playerId]))
  const automatic = new Set<PlayerId>()
  const declared = new Set<PlayerId>()

  for (const team of Object.values(world.teams)) {
    const sourceKind = getTeamEcosystemKind(world, team.id)
    if (sourceKind !== 'ncaaLike' && sourceKind !== 'fibaLike') continue
    for (const playerId of team.rosterPlayerIds) {
      if (world.players[playerId] === undefined || withdrawn.has(playerId)) continue
      if (sourceKind === 'ncaaLike' && !Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === playerId && enrollment.teamId === team.id && enrollment.status === 'active')) continue
      const eligibility = assessNbaDraftEligibility(world, playerId, draft)
      if (eligibility.eligible && eligibility.automatic) automatic.add(playerId)
    }
  }

  for (const entry of draft.entries ?? []) {
    if (entry.status !== 'declaredEarlyEntry' && entry.status !== 'finalPool') continue
    if (entry.entryType === 'automatic') continue
    if (entry.declaredOn === undefined || entry.declaredOn > date || draft.rules.earlyEntryDeadline !== undefined && entry.declaredOn > draft.rules.earlyEntryDeadline) continue
    if (!assessNbaDraftEligibility(world, entry.playerId, draft).eligible) continue
    declared.add(entry.playerId)
  }

  const legacy = draft.prospectPlayerIds.filter((playerId) => {
    const entry = entries.get(playerId)
    if (world.players[playerId] === undefined || withdrawn.has(playerId) || entry?.status === 'considering' || entry?.status === 'drafted' || entry?.status === 'undrafted') return false
    if (entry === undefined) return true // Save V4 legacy classes and fixture-only synthetic classes.
    const eligibility = assessNbaDraftEligibility(world, playerId, draft)
    if (entry.entryType === 'automatic') return eligibility.eligible && eligibility.automatic
    if (entry.declaredOn !== undefined) {
      const declarationValid = entry.declaredOn <= date && (draft.rules.earlyEntryDeadline === undefined || entry.declaredOn <= draft.rules.earlyEntryDeadline)
      return declarationValid && (eligibility.eligible || draft.rules.provenance === undefined || draft.rules.provenance === 'PRODUCT_ABSTRACTION')
    }
    return draft.rules.provenance === undefined || draft.rules.provenance === 'PRODUCT_ABSTRACTION'
  })
  const playerIds = [...new Set([...legacy, ...automatic, ...declared])].filter((playerId) => !selected.has(playerId) && !withdrawn.has(playerId))
  const playersAfter = Object.keys(world.players).length
  if (playersAfter !== playersBefore || playerIds.some((playerId) => world.players[playerId] === undefined)) throw new Error('Draft candidate projection must preserve Player count and existing identities')
  return { playerIds, automaticPlayerIds: [...automatic].filter((playerId) => !selected.has(playerId)), earlyEntryPlayerIds: [...declared].filter((playerId) => !selected.has(playerId)), playersBefore, playersAfter }
}

export function getDraftCandidates(world: GameWorld, draftId: string, date = world.currentDate): readonly PlayerId[] { return projectDraftCandidates(world, draftId, date).playerIds }
export function getAvailableDraftProspects(world: GameWorld, draftId: string): readonly PlayerId[] { return getDraftCandidates(world, draftId) }
export function makeDraftSelection(world: GameWorld, draftId: string, selectingTeamId: TeamId, playerId: PlayerId): GameWorld {
  const draft = world.draftsById[draftId]
  if (!draft) throw new Error('Draft is not in progress')
  if (Object.values(world.draftPicksById).some((pick) => pick.draftId === draftId && pick.selection !== undefined && pick.selection.playerId === playerId && pick.selection.teamId === selectingTeamId)) return world
  if (draft.status !== 'inProgress') throw new Error('Draft is not in progress')
  const pick = getCurrentDraftPick(world, draftId); if (!pick || pick.ownerTeamId !== selectingTeamId || !getAvailableDraftProspects(world, draftId).includes(playerId)) throw new Error('Draft selection is invalid')
  const team = world.teams[selectingTeamId]!; if (team.gender !== world.players[playerId]?.gender) throw new Error('Draft prospect has the wrong gender category')
  const picks = Object.values(world.draftPicksById).map((item) => item.id === pick.id ? { ...item, selection: { playerId, teamId: selectingTeamId } } : item)
  const complete = picks.filter((item) => item.draftId === draftId).every((item) => item.selection !== undefined)
  const rights = createPlayerRights({ id: `draft-rights:${draftId}:${pick.id}:${playerId}`, playerId, ecosystemId: draft.ecosystemId, ownerTeamId: selectingTeamId, originalTeamId: pick.originalTeamId, rightsType: 'draft', acquiredAt: world.currentDate, status: 'active' })
  const entries = draft.entries?.map((entry) => entry.playerId === playerId ? { ...entry, status: 'drafted' as const, history: [...(entry.history ?? []), { status: 'drafted' as const, occurredOn: world.currentDate }] } : complete && entry.status === 'finalPool' ? { ...entry, status: 'undrafted' as const, history: [...(entry.history ?? []), { status: 'undrafted' as const, occurredOn: world.currentDate }] } : entry)
  return updateGameWorld(world, { playerRights: [...Object.values(world.playerRightsById), rights], draftPicks: picks, drafts: Object.values(world.draftsById).map((item) => item.id === draftId ? { ...item, ...(entries === undefined ? {} : { entries }), status: complete ? 'completed' : 'inProgress' } : item) })
}
