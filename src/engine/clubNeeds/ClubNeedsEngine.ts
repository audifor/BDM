import { addDays, type GameDate } from '@/domain/date'
import { getPlayerContractStatus } from '@/domain/contract'
import type { PlayerId, TeamId } from '@/domain/ids'
import { isPlayerAvailable } from '@/domain/world'
import { BASKETBALL_POSITIONS, type BasketballPosition } from '@/domain/primitives'
import { evaluatePlayerEligibility } from '@/engine/eligibility'
import { calculatePlayerImpact } from '@/engine/team'
import { assessClubStrategy } from '@/engine/clubStrategy/ClubStrategyEngine'
import type { ClubStrategicMode, ClubFinancialPosture } from '@/domain/clubStrategy'
import type { GameWorld } from '@/domain/world'
import type { Player } from '@/domain/player'
import { assessContractRosterPlanning, hasContinuousContractSuccessor, type ContractRosterPlanning } from './ContractRosterPlanning'

export type ClubNeedKind = 'ROSTER_SIZE' | 'POSITIONAL_DEPTH' | 'STARTER_QUALITY_GAP' | 'BENCH_QUALITY_GAP' | 'ROLE_GAP' | 'CONTRACT_CONTINUITY' | 'CONTRACT_CLUSTER' | 'AGING_CORE' | 'DEVELOPMENT_OPPORTUNITY' | 'POSITION_SURPLUS' | 'TEMPORARY_COVER' | 'ELIGIBILITY_GAP' | 'FINANCIAL_PRESSURE'
export type ClubNeedSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type ClubNeedUrgency = 'IMMEDIATE' | 'SOON' | 'PLANNED' | 'MONITOR'
export type ClubNeedConfidence = 'HIGH' | 'MODERATE' | 'LOW'
export type ClubNeedStrategicFit = 'HIGH' | 'MODERATE' | 'LOW'
export type ClubNeedTemporalScope = 'STRUCTURAL' | 'TEMPORARY' | 'OPPORTUNITY'
export type ClubNeedRole = 'PRIMARY_HANDLING' | 'SPACING' | 'RIM_PROTECTION'
export type ClubNeedsKnowledgePerspective = 'USER_ANALYTICS' | 'ORGANIZATION_KNOWLEDGE'
export type ClubNeedsComparisonStatus = 'AVAILABLE' | 'UNKNOWN'

export interface ClubNeedEvidence {
  readonly code: string
  readonly values: Readonly<Record<string, string | number | boolean | readonly (string | number | boolean)[] | readonly Readonly<Record<string, string | number | boolean>>[]>>
}

export interface ClubNeed {
  readonly id: string
  readonly priorityRank: number
  readonly kind: ClubNeedKind
  readonly severity: ClubNeedSeverity
  readonly urgency: ClubNeedUrgency
  readonly confidence: ClubNeedConfidence
  readonly strategicFit: ClubNeedStrategicFit
  readonly affectedArea: 'ROSTER' | 'POSITION' | 'ROLE' | 'CONTRACT' | 'TIMELINE' | 'AVAILABILITY' | 'ELIGIBILITY' | 'FINANCE'
  readonly targetPosition?: BasketballPosition
  readonly targetRole?: ClubNeedRole
  readonly relatedPlayerIds: readonly PlayerId[]
  readonly evidence: readonly ClubNeedEvidence[]
  readonly deadline?: GameDate
  readonly temporalScope: ClubNeedTemporalScope
  readonly financialContext: ClubFinancialPosture
}

export interface ClubNeedsAssessment {
  readonly teamId: TeamId
  readonly asOfDate: GameDate
  readonly strategy: ClubStrategicMode
  readonly financialContext: ClubFinancialPosture
  readonly knowledgePerspective: ClubNeedsKnowledgePerspective
  readonly externalComparisonStatus: ClubNeedsComparisonStatus
  readonly contractRosterPlanning: ContractRosterPlanning
  readonly needs: readonly ClubNeed[]
}

const POSITION_RATINGS: Readonly<Record<ClubNeedRole, readonly (keyof Player['basketball']['ratings'])[]>> = {
  PRIMARY_HANDLING: ['BALL_CONTROL', 'PASSING_VISION', 'PRESSURE_HANDLING'],
  SPACING: ['THREE_POINT_STATIC', 'SPACING', 'MOVEMENT_SHOOTING'],
  RIM_PROTECTION: ['RIM_PROTECTION', 'POST_DEFENSE', 'DEFENSIVE_REBOUNDING'],
}
const SEVERITY_ORDER: Readonly<Record<ClubNeedSeverity, number>> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const URGENCY_ORDER: Readonly<Record<ClubNeedUrgency, number>> = { IMMEDIATE: 0, SOON: 1, PLANNED: 2, MONITOR: 3 }
const FIT_ORDER: Readonly<Record<ClubNeedStrategicFit, number>> = { HIGH: 0, MODERATE: 1, LOW: 2 }
const CONFIDENCE_ORDER: Readonly<Record<ClubNeedConfidence, number>> = { HIGH: 0, MODERATE: 1, LOW: 2 }
export const CONTRACT_REVIEW_HORIZON_DAYS = 365

/** A deterministic, non-persisted account of what one club's current roster needs and why. */
export function assessClubNeeds(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate, knowledgePerspective?: ClubNeedsKnowledgePerspective): ClubNeedsAssessment {
  const team = world.teams[teamId]
  if (!team) throw new RangeError(`Unknown Team ${teamId}`)
  const perspective = knowledgePerspective ?? (team.coachId === world.userCoachId ? 'USER_ANALYTICS' : 'ORGANIZATION_KNOWLEDGE')
  const datedWorld = onDate === world.currentDate ? world : { ...world, currentDate: onDate }
  const strategicAssessment = assessClubStrategy(datedWorld, teamId)
  const strategy = world.clubStrategicStatesByTeamId[teamId]?.mode ?? strategicAssessment.candidateMode
  const financialContext: ClubFinancialPosture = strategicAssessment.financialPressure === 'HIGH' ? 'STRESSED' : strategicAssessment.financialPressure === 'MODERATE' ? 'CONSTRAINED' : strategicAssessment.financialPressure === 'LOW' ? 'HEALTHY' : 'UNKNOWN'
  const contractRosterPlanning = assessContractRosterPlanning(world, teamId, onDate)
  const rosterIds = [...team.rosterPlayerIds].sort((a, b) => a.localeCompare(b))
  const availableIds = rosterIds.filter((id) => isPlayerAvailable(world, id, onDate))
  const rosterSet = new Set(rosterIds)
  const lineup = world.lineupsByTeamId[teamId]
  const needs: Omit<ClubNeed, 'priorityRank'>[] = []
  const push = (input: Omit<ClubNeed, 'id' | 'priorityRank' | 'financialContext'> & { readonly id?: string }) => {
    const id = `${teamId}:${input.id ?? [input.kind, input.targetPosition ?? '', input.targetRole ?? '', ...input.relatedPlayerIds].join(':')}`
    needs.push(Object.freeze({ ...input, id, financialContext }))
  }

  if (rosterIds.length < 5) push({ kind: 'ROSTER_SIZE', severity: 'CRITICAL', urgency: 'IMMEDIATE', confidence: 'HIGH', strategicFit: 'HIGH', affectedArea: 'ROSTER', relatedPlayerIds: Object.freeze(rosterIds), evidence: [{ code: 'BELOW_PLAYABLE_MINIMUM', values: { rostered: rosterIds.length, playableMinimum: 5 } }], temporalScope: 'STRUCTURAL' })
  else if (availableIds.length < 5) {
    const injured = rosterIds.filter((id) => !isPlayerAvailable(world, id, onDate))
    const returns = injured.map((id) => Object.values(world.injuriesById).find((injury) => injury.playerId === id && injury.injuredOn <= onDate && injury.expectedReturnDate > onDate)?.expectedReturnDate).filter((date): date is GameDate => date !== undefined).sort()
    const latestReturn = returns.at(-1)
    if (latestReturn && addDays(onDate, 14) < latestReturn) push({ kind: 'TEMPORARY_COVER', severity: 'HIGH', urgency: latestReturn > addDays(onDate, 30) ? 'IMMEDIATE' : 'SOON', confidence: returns.length === injured.length ? 'HIGH' : 'MODERATE', strategicFit: strategy === 'SURVIVE' ? 'MODERATE' : 'HIGH', affectedArea: 'AVAILABILITY', relatedPlayerIds: Object.freeze(injured), evidence: [{ code: 'AVAILABLE_BELOW_PLAYABLE_MINIMUM', values: { rostered: rosterIds.length, available: availableIds.length, injured: injured.length, expectedReturnDates: returns } }], deadline: latestReturn, temporalScope: 'TEMPORARY' })
  }

  if (strategicAssessment.financialPressure === 'HIGH' || strategicAssessment.financialPressure === 'MODERATE') push({ kind: 'FINANCIAL_PRESSURE', severity: strategicAssessment.financialPressure === 'HIGH' ? 'HIGH' : 'MEDIUM', urgency: strategicAssessment.financialPressure === 'HIGH' ? 'SOON' : 'PLANNED', confidence: 'HIGH', strategicFit: strategy === 'SURVIVE' ? 'HIGH' : 'MODERATE', affectedArea: 'FINANCE', relatedPlayerIds: Object.freeze([]), evidence: [{ code: 'FINANCE_V2_DISTRESS_CONTEXT', values: { financialPressure: strategicAssessment.financialPressure, posture: financialContext } }], temporalScope: 'STRUCTURAL' })

  const positionPool = perspective === 'USER_ANALYTICS' ? activeCompetitionPlayers(world, teamId, onDate) : undefined
  const keyPlayers = new Set<PlayerId>()
  for (const position of BASKETBALL_POSITIONS) {
    const rosterAtPosition = rosterIds.filter((id) => canPlay(world, id, position))
    const availableAtPosition = availableIds.filter((id) => canPlay(world, id, position))
    const ranked = [...availableAtPosition].sort((a, b) => impact(world, b) - impact(world, a) || a.localeCompare(b))
    const assignedStarter = lineup?.starters[position]
    const starter = assignedStarter && availableAtPosition.includes(assignedStarter) ? assignedStarter : ranked[0]
    if (starter) keyPlayers.add(starter)
    for (const id of lineup ? [lineup.bench.B1, lineup.bench.B2, lineup.bench.B3].filter((value): value is PlayerId => value !== undefined && rosterSet.has(value)) : []) keyPlayers.add(id)

    if (rosterAtPosition.length === 0) {
      push({ kind: 'POSITIONAL_DEPTH', severity: 'HIGH', urgency: 'SOON', confidence: 'HIGH', strategicFit: strategicFit(strategy, 'POSITIONAL_DEPTH'), affectedArea: 'POSITION', targetPosition: position, relatedPlayerIds: Object.freeze([]), evidence: [{ code: 'NO_ROSTER_COVERAGE', values: { position, rostered: 0, available: 0 } }], temporalScope: 'STRUCTURAL' })
    } else if (rosterAtPosition.length === 1) {
      push({ kind: 'POSITIONAL_DEPTH', severity: 'HIGH', urgency: 'SOON', confidence: 'HIGH', strategicFit: strategicFit(strategy, 'POSITIONAL_DEPTH'), affectedArea: 'POSITION', targetPosition: position, relatedPlayerIds: Object.freeze(rosterAtPosition), evidence: [{ code: 'SINGLE_ROSTER_COVERAGE', values: { position, rostered: 1, available: availableAtPosition.length } }], temporalScope: 'STRUCTURAL' })
    } else if (availableAtPosition.length < 2 && rosterAtPosition.length > 1) {
      const returnDates = rosterAtPosition.flatMap((id) => Object.values(world.injuriesById).filter((injury) => injury.playerId === id && injury.injuredOn <= onDate && injury.expectedReturnDate > onDate).map((injury) => injury.expectedReturnDate)).sort()
      const latestReturn = returnDates.at(-1)
      if (latestReturn && addDays(onDate, 14) < latestReturn) push({ kind: 'TEMPORARY_COVER', severity: 'HIGH', urgency: latestReturn > addDays(onDate, 30) ? 'IMMEDIATE' : 'SOON', confidence: 'HIGH', strategicFit: strategy === 'SURVIVE' ? 'MODERATE' : 'HIGH', affectedArea: 'AVAILABILITY', targetPosition: position, relatedPlayerIds: Object.freeze(rosterAtPosition), evidence: [{ code: 'POSITION_UNAVAILABLE_UNTIL_RETURN', values: { position, rostered: rosterAtPosition.length, available: availableAtPosition.length, expectedReturnDates: returnDates } }], deadline: latestReturn, temporalScope: 'TEMPORARY' })
    }

    const peerValues = positionPool?.[position].map((id) => impact(world, id)) ?? []
    if (starter && peerValues.length >= 6 && percentile(impact(world, starter), peerValues) < 0.25) push({ kind: 'STARTER_QUALITY_GAP', severity: 'MEDIUM', urgency: 'PLANNED', confidence: 'MODERATE', strategicFit: strategy === 'DEVELOP' && ageOf(world, starter, onDate) !== undefined && ageOf(world, starter, onDate)! <= 23 ? 'LOW' : strategicFit(strategy, 'STARTER_QUALITY_GAP'), affectedArea: 'POSITION', targetPosition: position, relatedPlayerIds: Object.freeze([starter]), evidence: [{ code: 'STARTER_LOW_POSITIONAL_PERCENTILE', values: { position, playerId: starter, percentile: percentile(impact(world, starter), peerValues), comparisonPlayers: peerValues.length, signal: 'calculatePlayerImpact' } }], temporalScope: 'STRUCTURAL' })
    const backup = ranked.find((id) => id !== starter)
    if (backup && peerValues.length >= 6 && percentile(impact(world, backup), peerValues) < 0.25) push({ kind: 'BENCH_QUALITY_GAP', severity: 'MEDIUM', urgency: 'PLANNED', confidence: 'MODERATE', strategicFit: strategicFit(strategy, 'BENCH_QUALITY_GAP'), affectedArea: 'POSITION', targetPosition: position, relatedPlayerIds: Object.freeze([backup]), evidence: [{ code: 'BACKUP_LOW_POSITIONAL_PERCENTILE', values: { position, playerId: backup, percentile: percentile(impact(world, backup), peerValues), comparisonPlayers: peerValues.length, signal: 'calculatePlayerImpact' } }], temporalScope: 'STRUCTURAL' })
    if (rosterAtPosition.filter((id) => world.players[id]?.basketball.primaryPosition === position).length >= 4) {
      const surplus = rosterAtPosition.filter((id) => world.players[id]?.basketball.primaryPosition === position).sort((a, b) => (ageOf(world, b, onDate) ?? 0) - (ageOf(world, a, onDate) ?? 0) || a.localeCompare(b))
      push({ kind: 'POSITION_SURPLUS', severity: 'LOW', urgency: 'MONITOR', confidence: 'MODERATE', strategicFit: strategy === 'SELL' || strategy === 'REBUILD' ? 'HIGH' : 'LOW', affectedArea: 'POSITION', targetPosition: position, relatedPlayerIds: Object.freeze(surplus), evidence: [{ code: 'FOUR_PRIMARY_POSITION_PLAYERS', values: { position, rostered: surplus.length, normalLineupSlots: 2 } }], temporalScope: 'STRUCTURAL' })
    }
  }

  for (const role of Object.keys(POSITION_RATINGS) as ClubNeedRole[]) {
    const ranked = availableIds.map((id) => ({ id, rating: roleRating(world, id, role) })).sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
    if (ranked.length > 0 && ranked[0]!.rating < 50) push({ kind: 'ROLE_GAP', severity: 'MEDIUM', urgency: 'PLANNED', confidence: 'MODERATE', strategicFit: strategicFit(strategy, 'ROLE_GAP'), affectedArea: 'ROLE', targetRole: role, relatedPlayerIds: Object.freeze(ranked.slice(0, 3).map((item) => item.id)), evidence: [{ code: 'NO_AVAILABLE_PLAYER_AT_MIDPOINT', values: { role, bestRatingMean: Math.round(ranked[0]!.rating * 10) / 10, midpoint: 50, ratingKeys: POSITION_RATINGS[role] as readonly string[] } }], temporalScope: 'STRUCTURAL' })
  }

  const contracts = Object.values(world.contractsById).filter((contract) => contract.teamId === teamId && getPlayerContractStatus(contract, onDate) === 'active' && contract.term.expiresOn <= addDays(onDate, CONTRACT_REVIEW_HORIZON_DAYS) && !hasContinuousContractSuccessor(world, contract.id)).sort((a, b) => a.term.expiresOn.localeCompare(b.term.expiresOn) || a.playerId.localeCompare(b.playerId) || a.id.localeCompare(b.id))
  const keyExpiring = contracts.filter((contract) => keyPlayers.has(contract.playerId))
  for (const contract of keyExpiring) push({ id: `CONTRACT_CONTINUITY:${contract.id}`, kind: 'CONTRACT_CONTINUITY', severity: 'HIGH', urgency: contract.term.expiresOn <= addDays(onDate, 30) ? 'IMMEDIATE' : contract.term.expiresOn <= addDays(onDate, 90) ? 'SOON' : 'PLANNED', confidence: 'HIGH', strategicFit: strategicFit(strategy, 'CONTRACT_CONTINUITY'), affectedArea: 'CONTRACT', relatedPlayerIds: Object.freeze([contract.playerId]), evidence: [{ code: 'KEY_PLAYER_CONTRACT_EXPIRY', values: { playerId: contract.playerId, contractId: contract.id, expiresOn: contract.term.expiresOn, keyPlayer: true } }], deadline: contract.term.expiresOn, temporalScope: 'STRUCTURAL' })
  if (keyExpiring.length >= 3) push({ kind: 'CONTRACT_CLUSTER', severity: 'HIGH', urgency: keyExpiring.some((contract) => contract.term.expiresOn <= addDays(onDate, 30)) ? 'IMMEDIATE' : keyExpiring.some((contract) => contract.term.expiresOn <= addDays(onDate, 90)) ? 'SOON' : 'PLANNED', confidence: 'HIGH', strategicFit: strategicFit(strategy, 'CONTRACT_CLUSTER'), affectedArea: 'CONTRACT', relatedPlayerIds: Object.freeze(keyExpiring.map((contract) => contract.playerId).sort()), evidence: [{ code: 'MULTIPLE_KEY_EXPIRIES', values: { count: keyExpiring.length, contractIds: keyExpiring.map((contract) => contract.id), expiresOn: keyExpiring.map((contract) => contract.term.expiresOn) } }], deadline: keyExpiring[0]!.term.expiresOn, temporalScope: 'STRUCTURAL' })

  const ages = rosterIds.map((id) => ({ id, age: ageOf(world, id, onDate) })).filter((item): item is { id: PlayerId; age: number } => item.age !== undefined)
  const aging = ages.filter((item) => item.age >= 32)
  if (aging.length >= 3) push({ kind: 'AGING_CORE', severity: 'MEDIUM', urgency: 'PLANNED', confidence: ages.length === rosterIds.length ? 'HIGH' : 'MODERATE', strategicFit: strategy === 'CONTEND' || strategy === 'REBUILD' ? 'HIGH' : strategy === 'DEVELOP' ? 'LOW' : 'MODERATE', affectedArea: 'TIMELINE', relatedPlayerIds: Object.freeze(aging.map((item) => item.id).sort()), evidence: [{ code: 'VETERAN_CORE', values: { count: aging.length, rosterCount: rosterIds.length, thresholdAge: 32, ages: aging.map((item) => item.age) } }], temporalScope: 'STRUCTURAL' })
  const young = ages.filter((item) => item.age <= 23)
  if (young.length >= 3) push({ kind: 'DEVELOPMENT_OPPORTUNITY', severity: 'LOW', urgency: 'MONITOR', confidence: ages.length === rosterIds.length ? 'HIGH' : 'MODERATE', strategicFit: strategy === 'DEVELOP' || strategy === 'REBUILD' ? 'HIGH' : 'LOW', affectedArea: 'TIMELINE', relatedPlayerIds: Object.freeze(young.map((item) => item.id).sort()), evidence: [{ code: 'YOUNG_CORE', values: { count: young.length, rosterCount: rosterIds.length, thresholdAge: 23, ages: young.map((item) => item.age) } }], temporalScope: 'OPPORTUNITY' })

  for (const season of activeSeasons(world, teamId, onDate)) {
    const evaluations = availableIds.map((id) => ({ id, result: evaluatePlayerEligibility(world, { playerId: id, teamId, competitionId: season.competitionId, seasonId: season.id, onDate }) }))
    const ineligible = evaluations.filter(({ result }) => !result.eligible && !result.reasons.includes('INVALID_SEASON_CONTEXT')).map(({ id }) => id)
    const eligible = availableIds.filter((id) => !ineligible.includes(id))
    if (eligible.length < Math.min(5, availableIds.length) && ineligible.length > 0) push({ id: `ELIGIBILITY_GAP:${season.competitionId}:${season.id}`, kind: 'ELIGIBILITY_GAP', severity: eligible.length < 5 ? 'HIGH' : 'MEDIUM', urgency: 'SOON', confidence: 'HIGH', strategicFit: 'HIGH', affectedArea: 'ELIGIBILITY', relatedPlayerIds: Object.freeze(ineligible), evidence: [{ code: 'ACTIVE_COMPETITION_ELIGIBILITY_REDUCES_SQUAD', values: { competitionId: season.competitionId, seasonId: season.id, eligibleAvailable: eligible.length, ineligibleAvailable: ineligible.length, reasons: evaluations.filter(({ id }) => ineligible.includes(id)).map(({ id, result }) => ({ playerId: id, reasons: result.reasons.join(',') })) } }], temporalScope: 'STRUCTURAL' })
  }

  const ordered = needs.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || FIT_ORDER[a.strategicFit] - FIT_ORDER[b.strategicFit] || CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] || a.kind.localeCompare(b.kind) || (a.targetPosition ?? '').localeCompare(b.targetPosition ?? '') || (a.targetRole ?? '').localeCompare(b.targetRole ?? '') || a.id.localeCompare(b.id)).map((need, index) => Object.freeze({ ...need, priorityRank: index + 1 }))
  return Object.freeze({ teamId, asOfDate: onDate, strategy, financialContext, knowledgePerspective: perspective, externalComparisonStatus: perspective === 'USER_ANALYTICS' ? 'AVAILABLE' : 'UNKNOWN', contractRosterPlanning, needs: Object.freeze(ordered) })
}

function activeSeasons(world: GameWorld, teamId: TeamId, date: GameDate) {
  return Object.values(world.seasons).filter((season) => {
    const participants = season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []
    return participants.includes(teamId) && season.startDate <= date && season.endDate >= date
  }).sort((a, b) => a.id.localeCompare(b.id))
}

function activeCompetitionPlayers(world: GameWorld, teamId: TeamId, date: GameDate): Record<BasketballPosition, PlayerId[]> {
  const teamIds = new Set(activeSeasons(world, teamId, date).flatMap((season) => season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []))
  const players = [...teamIds].sort().flatMap((id) => world.teams[id]?.rosterPlayerIds ?? []).filter((id) => world.players[id] !== undefined)
  return Object.fromEntries(BASKETBALL_POSITIONS.map((position) => [position, [...new Set(players.filter((id) => world.players[id]!.basketball.primaryPosition === position))].sort()])) as Record<BasketballPosition, PlayerId[]>
}

function canPlay(world: GameWorld, playerId: PlayerId, position: BasketballPosition): boolean {
  const profile = world.players[playerId]?.basketball
  return profile !== undefined && (profile.primaryPosition === position || profile.secondaryPositions?.includes(position) === true)
}
function impact(world: GameWorld, playerId: PlayerId): number { return calculatePlayerImpact(world.players[playerId]!) }
function percentile(value: number, values: readonly number[]): number {
  const worse = values.filter((item) => item < value).length
  const better = values.filter((item) => item > value).length
  return worse + better === 0 ? 0.5 : worse / (worse + better)
}
function ageOf(world: GameWorld, playerId: PlayerId, date: GameDate): number | undefined {
  const player = world.players[playerId]
  const birth = player?.personId ? world.personsById[player.personId]?.dateOfBirth : undefined
  if (!birth) return undefined
  let age = Number(date.slice(0, 4)) - Number(birth.slice(0, 4))
  if (date.slice(5) < birth.slice(5)) age -= 1
  return age
}
function roleRating(world: GameWorld, playerId: PlayerId, role: ClubNeedRole): number {
  const ratings = world.players[playerId]!.basketball.ratings
  return POSITION_RATINGS[role].reduce((total, key) => total + ratings[key], 0) / POSITION_RATINGS[role].length
}
function strategicFit(strategy: ClubStrategicMode, kind: ClubNeedKind): ClubNeedStrategicFit {
  if (['ROSTER_SIZE', 'POSITIONAL_DEPTH', 'TEMPORARY_COVER', 'ELIGIBILITY_GAP'].includes(kind)) return 'HIGH'
  if (kind === 'FINANCIAL_PRESSURE') return strategy === 'SURVIVE' ? 'HIGH' : 'MODERATE'
  if (strategy === 'CONTEND') return ['STARTER_QUALITY_GAP', 'BENCH_QUALITY_GAP', 'ROLE_GAP', 'CONTRACT_CONTINUITY', 'CONTRACT_CLUSTER'].includes(kind) ? 'HIGH' : 'MODERATE'
  if (strategy === 'DEVELOP') return kind === 'DEVELOPMENT_OPPORTUNITY' ? 'HIGH' : kind === 'STARTER_QUALITY_GAP' || kind === 'BENCH_QUALITY_GAP' ? 'LOW' : 'MODERATE'
  if (strategy === 'REBUILD') return kind === 'AGING_CORE' || kind === 'POSITION_SURPLUS' || kind === 'DEVELOPMENT_OPPORTUNITY' ? 'HIGH' : kind === 'BENCH_QUALITY_GAP' ? 'LOW' : 'MODERATE'
  if (strategy === 'SELL') return kind === 'POSITION_SURPLUS' || kind === 'CONTRACT_CONTINUITY' || kind === 'CONTRACT_CLUSTER' ? 'HIGH' : kind === 'BENCH_QUALITY_GAP' ? 'LOW' : 'MODERATE'
  if (strategy === 'SURVIVE') return kind === 'AGING_CORE' || kind === 'STARTER_QUALITY_GAP' || kind === 'BENCH_QUALITY_GAP' || kind === 'ROLE_GAP' ? 'LOW' : 'MODERATE'
  return 'MODERATE'
}
