import { getPlayerContractStatus } from '@/domain/contract'
import type { PlayerId, TeamId } from '@/domain/ids'
import { canTeamAffordAdditionalSalary, getFreeAgents, getTeamFinancialSnapshot, type GameWorld } from '@/domain/world'
import { pendingBindingRosterPlayerIds } from '@/engine/recruiting/RecruitingRosterCommitments'
import { getPlayerMarketTerms } from '@/engine/market/PlayerMarketTerms'
import { evaluateAiDraftProspect } from '@/engine/draft/DraftEngine'
import { advisePlayerCareerPathway } from './ProfessionalPathwayDecision'
import { isPlayerCareerActive } from './PlayerCareerLifecycle'
import { getCollegeOrRosterSourceTeam, signDraftRightsToNba, signUndraftedPlayerToNba } from './EcosystemTransitions'

export interface ProfessionalAcquisitionEvaluation {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly draftId: string
  readonly rightsId?: string
  readonly priorityScore: number
  readonly annualSalary?: number
  readonly contractYears?: number
  readonly blocker?: string
}
export interface ProfessionalAcquisitionDecision extends ProfessionalAcquisitionEvaluation {
  readonly attempted: boolean
  readonly signed: boolean
}

/** Reuses the Draft valuation and player career choice; eligibility is distinct from willingness. */
export function evaluateProfessionalAcquisition(world: GameWorld, input: { readonly playerId: PlayerId; readonly teamId: TeamId; readonly draftId: string; readonly rightsId?: string }): ProfessionalAcquisitionEvaluation {
  const player = world.players[input.playerId], team = world.teams[input.teamId], draft = world.draftsById[input.draftId]
  const result = { ...input, priorityScore: 0 }
  if (!player || !team || !draft || !isPlayerCareerActive(world, input.playerId)) return { ...result, blocker: 'PLAYER_OR_DESTINATION_UNAVAILABLE' }
  if (team.coachId === world.userCoachId) return { ...result, blocker: 'USER_SIGNING_DECISION_REQUIRED' }
  const source = getCollegeOrRosterSourceTeam(world, player.id)
  if (!source) return { ...result, blocker: 'SOURCE_NOT_ROSTERED' }
  const competition = Object.values(world.competitions).find(item => item.participantTeamIds.includes(source.id))
  const ecosystem = competition && world.ecosystems[competition.ecosystemId]
  const destination = Object.values(world.competitions).find(item => item.participantTeamIds.includes(team.id))
  if (!ecosystem || !destination || !['ncaaLike', 'fibaLike'].includes(ecosystem.kind) || destination.ecosystemId !== draft.ecosystemId || world.ecosystems[destination.ecosystemId]?.kind !== 'nbaLike' || player.gender !== team.gender) return { ...result, blocker: 'INVALID_ECOSYSTEM_ROUTE' }
  if (Object.values(world.contractsById).some(item => item.playerId === player.id && ['active', 'scheduled'].includes(getPlayerContractStatus(item, world.currentDate)))) return { ...result, blocker: 'SOURCE_CONTRACT_ACTIVE' }
  const valuation = evaluateAiDraftProspect(world, team.id, player.id)
  const evaluated = { ...result, priorityScore: valuation.priorityScore }
  let terms: { annualSalary: number; contractYears: number }
  if (input.rightsId !== undefined) {
    const rights = world.playerRightsById[input.rightsId]
    if (!rights || rights.status !== 'active' || rights.ownerTeamId !== team.id || rights.playerId !== player.id || rights.contractId !== undefined) return { ...evaluated, blocker: 'RIGHTS_NOT_ACTIONABLE' }
    const pick = Object.values(world.draftPicksById).find(item => item.draftId === draft.id && item.selection?.playerId === player.id)
    const scale = world.salaryRulesBySeasonId[draft.sourceSeasonId]?.rookieScale
    const entry = pick && scale?.entries.find(item => item.pickOrder === pick.order)
    if (!entry || !scale) return { ...evaluated, blocker: 'NO_CONFIGURED_RIGHTS_TERMS' }
    terms = { annualSalary: entry.cashSalary, contractYears: scale.contractYears }
  } else {
    if (draft.status !== 'completed' || !draft.entries?.some(item => item.playerId === player.id && item.status === 'undrafted') || Object.values(world.playerRightsById).some(item => item.playerId === player.id && item.status === 'active')) return { ...evaluated, blocker: 'UNDRAFTED_MARKET_UNAVAILABLE' }
    // Draft board depth affects ranking, not authorization to fill every position.
    // Ordinary Market AI currently acquires for the canonical playable roster deficit.
    if (team.rosterPlayerIds.length >= 5) return { ...evaluated, blocker: 'AI_ROSTER_COVERAGE_SATISFIED' }
    terms = getPlayerMarketTerms(world, player.id)
  }
  const quoted = { ...evaluated, ...terms }
  if (!canTeamAffordAdditionalSalary(world, team.id, terms.annualSalary)) return { ...quoted, blocker: 'SALARY_UNAFFORDABLE' }
  // A individually affordable acquisition must leave a fundable playable roster.
  // Use the existing legal Market supply and quotes; neither salary rules nor
  // rights are changed when the club must defer this signing.
  const remainingSlots = Math.max(0, 5 - team.rosterPlayerIds.length - 1)
  if (remainingSlots > 0) {
    const reserved = pendingBindingRosterPlayerIds(world)
    const completion = getFreeAgents(world).filter(candidate => candidate.gender === team.gender && candidate.id !== player.id && !reserved.has(candidate.id))
      .map(candidate => getPlayerMarketTerms(world, candidate.id).annualSalary).sort((a, b) => a - b).slice(0, remainingSlots)
    const completionSalary = completion.reduce((sum, salary) => sum + salary, 0)
    if (completion.length < remainingSlots || terms.annualSalary + completionSalary > getTeamFinancialSnapshot(world, team.id).remainingPlayerSalaryBudget) return { ...quoted, blocker: 'AI_MINIMUM_ROSTER_UNFUNDED' }
  }
  if (valuation.positionalNeed === 0) return { ...quoted, blocker: 'AI_POSITION_ALREADY_COVERED' }
  if (ecosystem.kind === 'ncaaLike') {
    const season = Object.values(world.seasons).filter(item => item.competitionId === competition!.id && item.startDate <= world.currentDate).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
    const decision = advisePlayerCareerPathway(world, player.id, source.id, season?.id).decision
    if (decision === 'stayCollege' || decision === 'withdrawDraft') return { ...quoted, blocker: 'PLAYER_PREFERS_COLLEGE' }
    if (decision === 'enterPortal') return { ...quoted, blocker: 'PLAYER_PREFERS_PORTAL' }
  }
  return quoted
}

/** Called after new selections and at monthly follow-up; no signing rate or movement quota. */
export function progressAiProfessionalPathways(world: GameWorld): { readonly world: GameWorld; readonly decisions: readonly ProfessionalAcquisitionDecision[] } {
  let current = world
  const decisions: ProfessionalAcquisitionDecision[] = []
  const attempt = (evaluation: ProfessionalAcquisitionEvaluation) => {
    if (evaluation.blocker !== undefined) { decisions.push({ ...evaluation, attempted: false, signed: false }); return }
    const id = evaluation.rightsId === undefined ? `professional:undrafted:${evaluation.draftId}:${evaluation.playerId}` : `professional:rights:${evaluation.rightsId}`
    const input = { id, playerId: evaluation.playerId, toTeamId: evaluation.teamId }
    current = evaluation.rightsId === undefined
      ? signUndraftedPlayerToNba(current, { ...input, draftId: evaluation.draftId })
      : signDraftRightsToNba(current, { ...input, rightsId: evaluation.rightsId, annualSalary: evaluation.annualSalary!, contractYears: evaluation.contractYears! })
    decisions.push({ ...evaluation, attempted: true, signed: current.ecosystemTransitionsById[id] !== undefined })
  }
  const rights = Object.values(current.playerRightsById).filter(item => item.rightsType === 'draft' && item.status === 'active' && item.contractId === undefined)
  const evaluations = rights.flatMap(right => {
    const pick = Object.values(current.draftPicksById).find(item => item.selection?.playerId === right.playerId)
    return pick === undefined ? [] : [evaluateProfessionalAcquisition(current, { playerId: right.playerId, teamId: right.ownerTeamId, draftId: pick.draftId, rightsId: right.id })]
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.playerId.localeCompare(b.playerId))
  for (const row of evaluations) attempt(evaluateProfessionalAcquisition(current, row))
  for (const draft of Object.values(current.draftsById).filter(item => item.status === 'completed').sort((a, b) => a.id.localeCompare(b.id))) {
    const teams = Object.values(current.competitions).filter(item => item.ecosystemId === draft.ecosystemId).flatMap(item => item.participantTeamIds)
    for (const teamId of [...new Set(teams)].sort()) {
      const candidates = (draft.entries ?? []).filter(entry => entry.status === 'undrafted').map(entry => evaluateProfessionalAcquisition(current, { playerId: entry.playerId, teamId, draftId: draft.id })).sort((a, b) => b.priorityScore - a.priorityScore || a.playerId.localeCompare(b.playerId))
      for (const row of candidates) attempt(evaluateProfessionalAcquisition(current, row))
    }
  }
  return { world: current, decisions }
}
