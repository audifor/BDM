import { addBusinessDays, athleticsAidChangeTransferWindow, createTransferPortalEntry, headCoachChangeTransferWindow, noNewHeadCoachTransferWindow, type TransferPortalEntry, type TransferPortalRuleset, type TransferPortalWindow } from '@/domain/eligibility'
import { aidChangeQualifiesForPortal } from '@/domain/collegeCompensation'
import { addDays, compareGameDates } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createTeam } from '@/domain/team'
import { executeAutomaticEnforcementRemedies } from '@/engine/enforcement/EnforcementRemedies'
import { isPlayerCareerActive } from '@/engine/career/PlayerCareerLifecycle'

export type TransferPortalActionResult = { readonly ok: true; readonly world: GameWorld } | { readonly ok: false; readonly reason: string }

/** Derives the basketball head-coach exception from canonical Coach career history. */
export function projectHeadCoachPortalWindow(world: GameWorld, sourceTeamId: TeamId, championshipFinalDate: import('@/domain/date').GameDate, ruleset: TransferPortalRuleset): { readonly exception: 'HEAD_COACH_CHANGE' | 'NO_NEW_HEAD_COACH_AFTER_30_DAYS'; readonly window: TransferPortalWindow } | undefined {
  const history = Object.values(world.coachCareerHistoryByCoachId).flat().filter((item) => item.teamId === sourceTeamId).sort((a, b) => a.date.localeCompare(b.date))
  const departure = [...history].reverse().find((item) => item.kind === 'departure' && item.date >= championshipFinalDate)
  if (departure === undefined) return undefined
  const replacement = history.find((item) => item.kind === 'appointment' && item.date > departure.date)
  if (replacement !== undefined) {
    const window = headCoachChangeTransferWindow(championshipFinalDate, replacement.date, ruleset)
    if (window !== undefined) return { exception: 'HEAD_COACH_CHANGE', window }
  }
  const day31 = addDays(departure.date, 31)
  if (compareGameDates(world.currentDate, day31) < 0) return undefined
  const window = noNewHeadCoachTransferWindow(championshipFinalDate, departure.date, ruleset, replacement?.date)
  return window === undefined ? undefined : { exception: 'NO_NEW_HEAD_COACH_AFTER_30_DAYS', window }
}

/** Production head-coach exception path derives the final date and exception solely from world history. */
export function submitHeadCoachExceptionTransferNotice(world: GameWorld, entry: Omit<TransferPortalEntry, 'notifiedOn' | 'status' | 'processedOn' | 'processingDueOn' | 'educationalModuleCompletedOn' | 'exception'>): TransferPortalActionResult {
  const season = world.seasons[world.currentSeasonId]
  const sourceCompetition = season === undefined ? undefined : world.competitions[season.competitionId]
  if (sourceCompetition === undefined || !sourceCompetition.participantTeamIds.includes(entry.sourceTeamId)) return { ok: false, reason: 'CHAMPIONSHIP_CONTEXT_UNAVAILABLE' }
  const final = Object.values(world.games).filter((game) => game.seasonId === season.id && game.competitionId === sourceCompetition.id && game.stakes === 'final').sort((a, b) => b.date.localeCompare(a.date))[0]
  const ruleset = world.transferPortalRulesetsById[entry.rulesetId]
  if (final === undefined || ruleset === undefined || ruleset.ecosystemId !== entry.ecosystemId) return { ok: false, reason: 'CHAMPIONSHIP_OR_RULESET_UNAVAILABLE' }
  const projection = projectHeadCoachPortalWindow(world, entry.sourceTeamId, final.date, ruleset)
  if (projection === undefined) return { ok: false, reason: 'HEAD_COACH_EXCEPTION_NOT_QUALIFIED' }
  return submitTransferNotice(world, { ...entry, exception: projection.exception }, projection.window)
}

/** Aid exception qualification comes from the signed agreement history; the caller supplies only its stable event ID. */
export function submitAthleticsAidExceptionTransferNotice(world: GameWorld, entry: Omit<TransferPortalEntry, 'notifiedOn' | 'status' | 'processedOn' | 'processingDueOn' | 'educationalModuleCompletedOn' | 'exception'>, changeId: string): TransferPortalActionResult {
  const agreement = Object.values(world.athleticsAidAgreementsById).find((item) => item.playerId === entry.playerId && item.teamId === entry.sourceTeamId && item.institutionId === world.teams[entry.sourceTeamId]?.organizationId && aidChangeQualifiesForPortal(item, changeId))
  const change = agreement?.history.find((item) => item.id === changeId)
  const ruleset = world.transferPortalRulesetsById[entry.rulesetId]
  if (agreement === undefined || change === undefined || ruleset === undefined || ruleset.ecosystemId !== entry.ecosystemId) return { ok: false, reason: 'QUALIFYING_AID_CHANGE_UNAVAILABLE' }
  return submitTransferNotice(world, { ...entry, exception: 'ATHLETICS_AID_CHANGE' }, athleticsAidChangeTransferWindow(change.date, ruleset))
}

/** Records written notice only when the supplied source-backed initiation period is open. */
export function submitTransferNotice(world: GameWorld, entry: Omit<TransferPortalEntry, 'notifiedOn' | 'status' | 'processedOn' | 'processingDueOn' | 'educationalModuleCompletedOn'>, window: TransferPortalWindow): TransferPortalActionResult {
  if (compareGameDates(world.currentDate, window.opensOn) < 0 || compareGameDates(world.currentDate, window.closesOn) > 0) return { ok: false, reason: 'NOTIFICATION_WINDOW_CLOSED' }
  const source = world.teams[entry.sourceTeamId]
  const ruleset = world.transferPortalRulesetsById[entry.rulesetId]
  if (!isPlayerCareerActive(world, entry.playerId) || !source?.rosterPlayerIds.includes(entry.playerId) || ruleset?.ecosystemId !== entry.ecosystemId || ruleset.effectiveFrom > world.currentDate || (ruleset.effectiveTo !== undefined && ruleset.effectiveTo < world.currentDate)) return { ok: false, reason: 'TRANSFER_SOURCE_OR_RULESET_INVALID' }
  if (!Object.values(world.playerEnrollmentsById).some((item) => item.playerId === entry.playerId && item.teamId === entry.sourceTeamId && item.ecosystemId === entry.ecosystemId && item.status === 'active')) return { ok: false, reason: 'ACTIVE_SOURCE_ENROLLMENT_REQUIRED' }
  if (world.transferPortalEntriesById[entry.id] !== undefined || Object.values(world.transferPortalEntriesById).some((item) => item.playerId === entry.playerId && item.ecosystemId === entry.ecosystemId && (item.status === 'noticePending' || item.status === 'authorized'))) return { ok: false, reason: 'PORTAL_ENTRY_ALREADY_ACTIVE' }
  const record = createTransferPortalEntry({ ...entry, notifiedOn: world.currentDate, status: 'noticePending' })
  return { ok: true, world: updateGameWorld(world, { transferPortalEntries: [...Object.values(world.transferPortalEntriesById), record] }) }
}

/** The module completion starts the institution's two-business-day processing clock. */
export function completeTransferEducationModule(world: GameWorld, entryId: string): TransferPortalActionResult {
  const entry = world.transferPortalEntriesById[entryId]
  if (entry === undefined || entry.status !== 'noticePending') return { ok: false, reason: 'PORTAL_NOTICE_NOT_PENDING' }
  if (entry.educationalModuleCompletedOn !== undefined) return { ok: true, world }
  const completed = createTransferPortalEntry({ ...entry, educationalModuleCompletedOn: world.currentDate, processingDueOn: addBusinessDays(world.currentDate, 2) })
  return { ok: true, world: updateGameWorld(world, { transferPortalEntries: Object.values(world.transferPortalEntriesById).map((item) => item.id === entryId ? completed : item) }) }
}

export function processTransferPortalEntry(world: GameWorld, entryId: string): TransferPortalActionResult {
  const entry = world.transferPortalEntriesById[entryId]
  if (entry === undefined || entry.status !== 'noticePending' || entry.educationalModuleCompletedOn === undefined || entry.processingDueOn === undefined) return { ok: false, reason: 'PORTAL_REQUIREMENTS_INCOMPLETE' }
  if (compareGameDates(world.currentDate, entry.processingDueOn) > 0) return { ok: false, reason: 'PROCESSING_DEADLINE_EXCEEDED' }
  const authorized = createTransferPortalEntry({ ...entry, processedOn: world.currentDate, status: 'authorized' })
  return { ok: true, world: updateGameWorld(world, { transferPortalEntries: Object.values(world.transferPortalEntriesById).map((item) => item.id === entryId ? authorized : item) }) }
}

/** Product abstraction for a Player who stops pursuing a transfer and remains at the source institution. */
export function withdrawTransferPortalEntry(world: GameWorld, entryId: string): TransferPortalActionResult {
  const entry = world.transferPortalEntriesById[entryId]
  if (entry === undefined || entry.status !== 'authorized') return { ok: false, reason: 'PORTAL_ENTRY_NOT_ACTIVE' }
  const updated = { ...entry, status: 'withdrawn' as const }
  return { ok: true, world: updateGameWorld(world, {
    transferPortalEntries: Object.values(world.transferPortalEntriesById).map((item) => item.id === entryId ? updated : item),
    recruitProfiles: Object.values(world.recruitProfilesById).map((profile) => profile.transferPortalEntryId === entryId && ['open', 'committed'].includes(profile.status) ? { ...profile, status: 'unsigned' as const } : profile),
  }) }
}

/** Authorization remains a precondition for every destination recruiting action. */
export function canRecruitTransferPlayer(world: GameWorld, playerId: string, destinationTeamId: TeamId): boolean {
  if (!isPlayerCareerActive(world, playerId)) return false
  const entry = Object.values(world.transferPortalEntriesById).find((item) => item.playerId === playerId && item.status === 'authorized')
  const sourceCompetitions = entry === undefined ? [] : Object.values(world.competitions).filter((competition) => competition.ecosystemId === entry.ecosystemId && competition.participantTeamIds.includes(entry.sourceTeamId))
  return entry !== undefined && entry.sourceTeamId !== destinationTeamId && world.teams[entry.sourceTeamId]?.rosterPlayerIds.includes(entry.playerId) === true && world.teams[destinationTeamId]?.rosterPlayerIds.includes(entry.playerId) !== true && Object.values(world.playerEnrollmentsById).some((item) => item.playerId === entry.playerId && item.teamId === entry.sourceTeamId && item.ecosystemId === entry.ecosystemId && item.status === 'active') && sourceCompetitions.some((competition) => competition.participantTeamIds.includes(destinationTeamId))
}

export type TransferDownstreamAction = 'AID_SIGNING' | 'BENEFITS_SIGNING' | 'ROSTER_SUBMISSION' | 'ATHLETIC_ACTIVITY'
export type TransferAuthorizationResult = { readonly ok: true; readonly world: GameWorld; readonly authorized: boolean; readonly violationId?: string } | { readonly ok: false; readonly world: GameWorld; readonly reason: string }

/** Shared destination guard; a deliberate prohibited action records automatic canonical remedies. */
const activeEnrollmentsByPlayer = new WeakMap<GameWorld['playerEnrollmentsById'], ReadonlyMap<string, readonly GameWorld['playerEnrollmentsById'][string][]>>()
function activePlayerEnrollments(world: GameWorld, playerId: string) {
  let index = activeEnrollmentsByPlayer.get(world.playerEnrollmentsById)
  if (index === undefined) {
    const players = new Map<string, GameWorld['playerEnrollmentsById'][string][]>()
    for (const enrollment of Object.values(world.playerEnrollmentsById)) {
      if (enrollment.status !== 'active') continue
      const records = players.get(enrollment.playerId) ?? []
      records.push(enrollment)
      players.set(enrollment.playerId, records)
    }
    index = players
    activeEnrollmentsByPlayer.set(world.playerEnrollmentsById, index)
  }
  return index.get(playerId) ?? []
}

export function validateTransferAuthorization(world: GameWorld, playerId: import('@/domain/ids').PlayerId, destinationTeamId: TeamId, action: TransferDownstreamAction, commitUnauthorized = false): TransferAuthorizationResult {
  const source = activePlayerEnrollments(world, playerId).find(item => item.teamId !== destinationTeamId)
  if (source === undefined) return { ok: true, world, authorized: true }
  const competition = Object.values(world.competitions).find((item) => item.ecosystemId === source.ecosystemId && item.participantTeamIds.includes(destinationTeamId))
  if (competition === undefined) return { ok: true, world, authorized: true }
  const authorized = Object.values(world.transferPortalEntriesById).some((item) => item.playerId === playerId && item.sourceTeamId === source.teamId && item.status === 'authorized')
  if (authorized) return { ok: true, world, authorized: true }
  if (!commitUnauthorized) return { ok: false, world, reason: 'TRANSFER_PORTAL_AUTHORIZATION_REQUIRED' }
  const rules = world.enforcementRulesByEcosystemId[source.ecosystemId]
  if (rules?.enabled !== true || rules.maximumChampionshipSegmentContests === undefined || rules.contestLimitSource === undefined) return { ok: false, world, reason: 'ENFORCEMENT_RULE_UNAVAILABLE' }
  const coachId = world.teams[destinationTeamId]?.coachId
  const staffId = coachId === undefined ? undefined : world.coaches[coachId]?.staffProfileId
  if (staffId === undefined) return { ok: false, world, reason: 'HEAD_COACH_UNAVAILABLE' }
  const violationId = `violation:ghost-transfer:${destinationTeamId}:${playerId}`
  const consequence = executeAutomaticEnforcementRemedies(world, { violation: { id: violationId, ecosystemId: source.ecosystemId, programTeamId: destinationTeamId, playerId, category: 'unauthorizedTransfer', severity: 'major', source: `GHOST_TRANSFER_UNAUTHORIZED:${action}` }, staffId, activities: ['COACHING', 'RECRUITING', 'ADMINISTRATIVE'], maximumChampionshipSegmentContests: rules.maximumChampionshipSegmentContests, contestLimitSource: rules.contestLimitSource, fineRateBasisPoints: 2_000 })
  return consequence.ok ? { ok: true, world: consequence.world, authorized: false, violationId } : consequence
}

/** The authorized roster move belongs to completeCollegeTransfer; this route records a deliberate prohibited submission. */
export function submitCollegeTransferRosterAddition(world: GameWorld, playerId: import('@/domain/ids').PlayerId, destinationTeamId: TeamId, commitUnauthorized = false): TransferPortalActionResult {
  if (world.teams[destinationTeamId]?.rosterPlayerIds.includes(playerId)) return { ok: true, world }
  const authorization = validateTransferAuthorization(world, playerId, destinationTeamId, 'ROSTER_SUBMISSION', commitUnauthorized)
  if (!authorization.ok) return authorization
  if (authorization.authorized) return { ok: false, reason: 'SIGNED_TRANSFER_COMPLETION_REQUIRED' }
  return { ok: true, world: updateGameWorld(authorization.world, { teams: Object.values(authorization.world.teams).map((team) => createTeam({ ...team, rosterPlayerIds: team.id === destinationTeamId ? [...team.rosterPlayerIds, playerId] : team.rosterPlayerIds.filter((id) => id !== playerId) })) }) }
}
