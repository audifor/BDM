import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import { type GameId, type OrganizationId, type PlayerId, type StaffPersonId, type TeamId } from '@/domain/ids'
import { PLAYER_TRUTH_RATING_KEYS } from '@/domain/player'
import {
  PLAYER_AGGREGATE_SCOUTING_KEYS,
  PLAYER_RATING_SCOUTING_FAMILIES,
  playerRatingScoutingFamily,
  ratingKeyFromKnowledgeDimension,
  ratingKnowledgeDimensionFor,
  ratingKeysForAggregateDimension,
  ratingKeysForScoutingFamily,
  type PlayerAggregateScoutingDimension,
  type PlayerRatingScoutingFamily,
} from '@/domain/player/PlayerTruthCatalog'
import type { OrganizationKnowledge, OrganizationKnowledgeDimension } from '@/domain/knowledge'
import { getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { calculateStaffRoleProficiencyByRoleId, staffRoleIdsInDepartment, type StaffRoleId } from '@/domain/staff'
import { createEvaluatorProfile, SCOUTING_TERRITORY_WORKLOAD_COST, type EvaluatorFinding, type EvaluatorProfile, type EvaluatorReport, type Evidence, type ScoutingAssignment, type ScoutingMission, type ScoutingPriority } from '@/domain/scouting'
import { updateGameWorld, type GameWorld } from '@/domain/world'

const missionUnits: Readonly<Record<ScoutingMission, number>> = { QUICK_LOOK: 1, FULL_REPORT: 4, SKILL_EVALUATION: 2, POTENTIAL_EVALUATION: 2, TACTICAL_FIT: 2, LIVE_GAME: 2 }
const missionDays: Readonly<Record<ScoutingMission, number>> = { QUICK_LOOK: 1, FULL_REPORT: 5, SKILL_EVALUATION: 3, POTENTIAL_EVALUATION: 3, TACTICAL_FIT: 3, LIVE_GAME: 1 }
const AGGREGATE_DIMENSIONS = Object.keys(PLAYER_AGGREGATE_SCOUTING_KEYS) as PlayerAggregateScoutingDimension[]
const SCOUTING_FAMILY_SET = new Set<string>(PLAYER_RATING_SCOUTING_FAMILIES)

export function evaluatorProfile(world: GameWorld, staffId: StaffPersonId): EvaluatorProfile {
  const existing = world.evaluatorProfilesByStaffId[staffId]
  if (existing !== undefined) return existing
  const staff = world.staffPeopleById[staffId]; if (!staff) throw new Error('Evaluator does not exist')
  const ability = staff.professional.attributes.talentEvaluation
  return createEvaluatorProfile({ staffPersonId: staffId, experience: Math.round((ability + staff.professional.attributes.analysis) / 3), perks: ability >= 80 ? ['EYE_FOR_SHOOTERS'] : [], biases: ability < 45 ? ['PRODUCTION_BIAS'] : [] })
}

export function requestScouting(world: GameWorld, input: { organizationId: OrganizationId; playerId: PlayerId; missionType: ScoutingMission; priority?: ScoutingPriority; evaluatorStaffId?: StaffPersonId; targetDimension?: string; teamContextId?: TeamId; gameId?: string; requestedBy?: 'HEAD_COACH' | 'SCOUTING_DEPARTMENT'; staffQualityScore?: number }): GameWorld {
  const evaluatorStaffId = input.evaluatorStaffId ?? chooseEvaluator(world, input.organizationId, input.missionType, input.teamContextId)
  if (!world.players[input.playerId] || !world.staffPeopleById[evaluatorStaffId]) throw new Error('Scouting request references missing entity')
  if (input.missionType === 'SKILL_EVALUATION' && input.targetDimension !== undefined && !isSkillTarget(input.targetDimension)) throw new Error(`Unknown scouting skill family ${input.targetDimension}`)
  if (input.missionType === 'LIVE_GAME' && !isValidLiveGameTarget(world, input.playerId, input.gameId)) throw new Error('Live Game requires a scheduled game involving the Player and their current team')
  if (input.teamContextId !== undefined) {
    const team = world.teams[input.teamContextId]
    if (team === undefined || team.organizationId !== input.organizationId) throw new Error('Scouting team context does not belong to this organization')
    if (!isScoutingEvaluatorEligible(world, team.id, evaluatorStaffId, input.missionType)) throw new Error('Selected Staff is not eligible for this Scouting mission')
  }
  if (Object.values(world.scoutingAssignmentsById).some((item) => item.organizationId === input.organizationId && item.subjectPlayerId === input.playerId && item.evaluatorStaffId === evaluatorStaffId && item.missionType === input.missionType && item.status !== 'COMPLETED' && item.status !== 'CANCELLED')) return world
  const id = `scouting:${input.organizationId}:${input.playerId}:${evaluatorStaffId}:${input.missionType}:${world.currentDate}`
  const assignment: ScoutingAssignment = { id, organizationId: input.organizationId, subjectPlayerId: input.playerId, evaluatorStaffId, missionType: input.missionType, requestedBy: input.requestedBy ?? 'HEAD_COACH', priority: input.priority ?? 'NORMAL', createdAt: world.currentDate, status: 'QUEUED', ...(input.targetDimension === undefined ? {} : { targetDimension: input.targetDimension }), ...(input.teamContextId === undefined ? {} : { teamContextId: input.teamContextId }), ...(input.gameId === undefined ? {} : { gameId: input.gameId }), ...(input.staffQualityScore === undefined ? {} : { staffQualityScore: input.staffQualityScore }) }
  return updateGameWorld(world, { evaluatorProfilesByStaffId: { ...world.evaluatorProfilesByStaffId, [evaluatorStaffId]: evaluatorProfile(world, evaluatorStaffId) }, scoutingAssignments: [...Object.values(world.scoutingAssignmentsById), assignment] })
}

/** Bounded candidate input keeps department autonomy out of a world-wide daily scan. */
export function deriveScoutingNeeds(world: GameWorld, organizationId: OrganizationId, candidatePlayerIds: readonly PlayerId[]): GameWorld {
  const candidate = [...candidatePlayerIds].sort().find((id) => world.players[id] !== undefined && !world.organizationKnowledge.some((k) => k.organizationId === organizationId && k.subjectPlayerId === id))
  return candidate === undefined ? world : requestScouting(world, { organizationId, playerId: candidate, missionType: 'QUICK_LOOK', requestedBy: 'SCOUTING_DEPARTMENT' })
}
/** Explicit source boundary for public data, stats, combine, workout and event integrations. */
export function recordEvidence(world: GameWorld, evidence: Evidence): GameWorld {
  if (world.evidenceById[evidence.id] !== undefined) return world
  return updateGameWorld(world, { evidence: [...Object.values(world.evidenceById), evidence] })
}

/** Processes active work only. It intentionally never scans knowledge or report history. */
export function progressScoutingAssignments(world: GameWorld): GameWorld {
  let next = world
  const priority = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const
  for (const assignment of Object.values(world.scoutingAssignmentsById).filter((item) => item.status !== 'COMPLETED' && item.status !== 'CANCELLED').sort((a, b) => priority[a.priority] - priority[b.priority] || a.id.localeCompare(b.id))) {
    if (assignment.status === 'QUEUED') {
      if (!hasScoutingCapacityForMission(next, assignment.evaluatorStaffId, assignment.missionType)) continue
      if (assignment.missionType === 'LIVE_GAME' && (assignment.gameId === undefined || world.games[assignment.gameId as keyof typeof world.games]?.date !== world.currentDate)) continue
      const expectedCompletionAt = addDays(world.currentDate, durationDays(next, assignment))
      next = updateAssignment(next, { ...assignment, status: 'ACTIVE', startedAt: world.currentDate, expectedCompletionAt })
      if (assignment.missionType === 'LIVE_GAME') next = completeAssignment(next, assignment.id)
      continue
    }
    if (assignment.expectedCompletionAt === undefined || compareGameDates(next.currentDate, assignment.expectedCompletionAt) < 0) continue
    next = completeAssignment(next, assignment.id)
  }
  return next
}

export function hasScoutingCapacityForMission(world: GameWorld, staffId: StaffPersonId, missionType: ScoutingMission): boolean {
  const territoryAllowance = Math.min(
    SCOUTING_TERRITORY_WORKLOAD_COST,
    Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.scoutStaffId === staffId && item.status === 'ACTIVE').length * SCOUTING_TERRITORY_WORKLOAD_COST,
  )
  const capacity = (missionType === 'QUICK_LOOK' ? 6 : 4) + territoryAllowance
  return activeWorkload(world, staffId) + missionUnits[missionType] <= capacity
}

const SCOUTING_ROLE_IDS = new Set<StaffRoleId>(staffRoleIdsInDepartment('scouting'))

export function isScoutingEvaluatorEligible(world: GameWorld, teamId: TeamId, staffId: StaffPersonId, missionType: ScoutingMission): boolean {
  const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === teamId && item.staffPersonId === staffId)
  const employment = world.staffEmploymentByStaffId[staffId]
  if (assignment === undefined || !SCOUTING_ROLE_IDS.has(assignment.role) || employment?.status !== 'employed' || employment.teamId !== teamId) return false
  if (assignment.role === 'advanceScout' && missionType !== 'TACTICAL_FIT' && missionType !== 'LIVE_GAME') return false
  return hasScoutingCapacityForMission(world, staffId, missionType)
}

export function getEligibleScoutingEvaluators(world: GameWorld, teamId: TeamId, missionType: ScoutingMission): readonly StaffPersonId[] {
  return Object.values(world.teamStaffAssignmentsById)
    .filter((item) => item.teamId === teamId && isScoutingEvaluatorEligible(world, teamId, item.staffPersonId, missionType))
    .map((item) => ({ staffId: item.staffPersonId, roleId: item.role }))
    .sort((left, right) => scoutingEvaluatorScore(world, right.staffId, right.roleId, missionType) - scoutingEvaluatorScore(world, left.staffId, left.roleId, missionType) || left.staffId.localeCompare(right.staffId))
    .map((item) => item.staffId)
}

export function updateScoutingAssignmentPriority(world: GameWorld, assignmentId: string, priority: ScoutingPriority): GameWorld {
  const assignment = world.scoutingAssignmentsById[assignmentId]
  if (assignment === undefined || assignment.status === 'COMPLETED' || assignment.status === 'CANCELLED') throw new Error('Only queued or active Scouting assignments can change priority')
  if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) throw new Error('Invalid Scouting priority')
  if (assignment.priority === priority) return world
  return updateGameWorld(world, { scoutingAssignments: Object.values(world.scoutingAssignmentsById).map((item) => item.id === assignmentId ? { ...item, priority } : item) })
}

export function cancelScoutingAssignment(world: GameWorld, assignmentId: string): GameWorld {
  const assignment = world.scoutingAssignmentsById[assignmentId]
  if (assignment === undefined || assignment.status === 'COMPLETED' || assignment.status === 'CANCELLED') throw new Error('Only queued or active Scouting assignments can be cancelled')
  return updateGameWorld(world, { scoutingAssignments: Object.values(world.scoutingAssignmentsById).map((item) => item.id === assignmentId ? { ...item, status: 'CANCELLED' } : item) })
}

export function durationDays(world: GameWorld, assignment: ScoutingAssignment): number {
  const staff = world.staffPeopleById[assignment.evaluatorStaffId]!
  const profile = evaluatorProfile(world, assignment.evaluatorStaffId)
  const relevant = assignment.missionType === 'POTENTIAL_EVALUATION' ? staff.professional.attributes.potentialEvaluation : assignment.missionType === 'TACTICAL_FIT' ? Math.round((staff.professional.attributes.tacticalKnowledge + staff.professional.attributes.analysis) / 2) : staff.professional.attributes.talentEvaluation
  const workload = activeWorkload(world, assignment.evaluatorStaffId)
  return Math.max(1, missionDays[assignment.missionType] + (relevant < 50 ? 1 : 0) + (profile.experience < 30 ? 1 : 0) + (workload >= 4 ? 1 : 0))
}
export function activeWorkload(world: GameWorld, staffId: StaffPersonId): number { return Object.values(world.scoutingAssignmentsById).filter((item) => item.evaluatorStaffId === staffId && item.status === 'ACTIVE').reduce((sum, item) => sum + missionUnits[item.missionType], 0) + Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.scoutStaffId === staffId && item.status === 'ACTIVE').length * SCOUTING_TERRITORY_WORKLOAD_COST }

function completeAssignment(world: GameWorld, assignmentId: string): GameWorld {
  const assignment = world.scoutingAssignmentsById[assignmentId]!; const evidence = createEvidence(world, assignment); const report = generateEvaluatorReport(world, assignment, evidence)
  const knowledge = consolidateOrganizationKnowledge(world.organizationKnowledge, report, evidence, evaluatorProfile(world, assignment.evaluatorStaffId), world.currentDate)
  return updateGameWorld(world, { evidence: [...Object.values(world.evidenceById), evidence], evaluatorReports: [...Object.values(world.evaluatorReportsById), report], organizationKnowledge: knowledge, scoutingAssignments: Object.values(world.scoutingAssignmentsById).map((item) => item.id === assignmentId ? { ...item, status: 'COMPLETED', completedAt: world.currentDate } : item) })
}
function createEvidence(world: GameWorld, assignment: ScoutingAssignment): Evidence { const source = assignment.missionType === 'LIVE_GAME' ? 'OPPONENT_GAME' : assignment.missionType === 'TACTICAL_FIT' ? 'VIDEO_SCOUTING' : 'LIVE_SCOUTING'; return { id: `evidence:${assignment.id}`, organizationId: assignment.organizationId, subjectPlayerId: assignment.subjectPlayerId, source, observedAt: world.currentDate, quality: missionUnits[assignment.missionType] / 4, dimensions: dimensionsFor(assignment), context: assignment.missionType, ...(assignment.gameId === undefined ? {} : { gameId: assignment.gameId }) } }
/**
 * Wave 3 quality-based uncertainty adjustment (§7): a Staff-driven assignment
 * (`assignment.staffQualityScore` set only by delegated/advisory Staff creation paths, never by
 * manual HEAD_COACH requests) nudges uncertainty by a small BOUNDED delta centered on quality 50
 * — higher quality never widens expected uncertainty relative to lower quality under otherwise
 * equivalent inputs. Applied additively alongside the existing ability/experience/perk/evidence
 * terms, never replacing them; the existing `Math.max(3, ...)` floor and report/domain bounds
 * still apply afterward.
 */
const QUALITY_UNCERTAINTY_SWING = 4

function qualityUncertaintyAdjustment(staffQualityScore: number | undefined): number {
  if (staffQualityScore === undefined) return 0
  return Math.round(((50 - staffQualityScore) / 50) * QUALITY_UNCERTAINTY_SWING)
}

export function generateEvaluatorReport(world: GameWorld, assignment: ScoutingAssignment, evidence: Evidence): EvaluatorReport {
  const player = world.players[assignment.subjectPlayerId]!, staff = world.staffPeopleById[assignment.evaluatorStaffId]!, profile = evaluatorProfile(world, assignment.evaluatorStaffId)
  const ability = assignment.missionType === 'POTENTIAL_EVALUATION' ? staff.professional.attributes.potentialEvaluation : assignment.missionType === 'TACTICAL_FIT' ? Math.round((staff.professional.attributes.tacticalKnowledge + staff.professional.attributes.analysis) / 2) : staff.professional.attributes.talentEvaluation
  const qualityAdjustment = qualityUncertaintyAdjustment(assignment.staffQualityScore)
  const findings = dimensionsFor(assignment).map((dimension) => {
    const truth = truthForDimension(player, dimension)
    const error = deterministicError(`${assignment.id}:${evidence.id}:${dimension}`, ability, profile, dimension, evidence.source)
    const specialization = specializationReduction(profile, dimension, evidence.source)
    const uncertainty = Math.max(3, Math.round(17 - ability / 9 - profile.experience / 18 - specialization + (1 - evidence.quality) * 5 + qualityAdjustment))
    const coverageContribution = Math.min(0.85, Math.max(0, evidence.quality * (0.6 + (ability + profile.experience) / 500)))
    return {
      dimension,
      estimate: clamp(Math.round(truth + error), 1, 100),
      uncertainty,
      confidence: clamp(Math.round(100 - uncertainty * 4 + evidence.quality * 12), 1, 95),
      coverageContribution: Math.round(coverageContribution * 100) / 100,
    }
  })
  return { id: `report:${assignment.id}`, organizationId: assignment.organizationId, subjectPlayerId: assignment.subjectPlayerId, evaluatorStaffId: assignment.evaluatorStaffId, assignmentId: assignment.id, missionType: assignment.missionType, createdAt: world.currentDate, evidenceIds: [evidence.id], findings, ...(assignment.missionType === 'TACTICAL_FIT' ? { tacticalFit: clamp(Math.round((staff.professional.attributes.tacticalKnowledge + staff.professional.attributes.analysis) / 2 + deterministicError(`${assignment.id}:${assignment.teamContextId ?? ''}`, ability, profile, 'fit', evidence.source)), 1, 100) } : {}) }
}
export function consolidateOrganizationKnowledge(existing: readonly OrganizationKnowledge[], report: EvaluatorReport, evidence: Evidence, profile: EvaluatorProfile, now: GameDate): readonly OrganizationKnowledge[] {
  const prior = existing.find((item) => item.organizationId === report.organizationId && item.subjectPlayerId === report.subjectPlayerId)
  const byDimension: Record<string, OrganizationKnowledgeDimension> = { ...(prior?.dimensions ?? {}) }
  for (const finding of report.findings) { const old = byDimension[finding.dimension]; const duplicateEvidence = old?.evidenceIds?.includes(evidence.id) ?? false; const weight = (finding.confidence / 100) * (1 - finding.uncertainty / 25) * (0.7 + profile.experience / 300) * (duplicateEvidence ? .25 : 1); const oldWeight = old === undefined ? 0 : old.confidence * old.coverage; const total = Math.max(.01, weight + oldWeight); const disagreement = old === undefined || old.estimate === undefined ? 0 : Math.abs(old.estimate - finding.estimate); byDimension[finding.dimension] = { coverage: clamp01((old?.coverage ?? 0) + finding.coverageContribution * (old === undefined ? 1 : duplicateEvidence ? .05 : .45)), confidence: clamp01((oldWeight + weight * (1 - Math.min(.5, disagreement / 40))) / total), assessedAt: now, provenance: 'scoutReport', estimate: Math.round(((old?.estimate ?? finding.estimate) * oldWeight + finding.estimate * weight) / total), uncertainty: clamp(Math.round((old?.uncertainty ?? finding.uncertainty) * oldWeight / total + finding.uncertainty * weight / total + disagreement * .18), 1, 20), evidenceIds: [...new Set([...(old?.evidenceIds ?? []), evidence.id])], reportIds: [...new Set([...(old?.reportIds ?? []), report.id])] } }
  const current = { organizationId: report.organizationId, subjectPlayerId: report.subjectPlayerId, dimensions: byDimension }
  return [...existing.filter((item) => item !== prior), current]
}
export function getPlayerKnowledgeSummary(world: GameWorld, organizationId: OrganizationId, playerId: PlayerId): { readonly organizationId:OrganizationId; readonly playerId:PlayerId; readonly overallCoverage:number; readonly overallConfidence:number; readonly freshness:number; readonly disagreement:'LOW'|'MODERATE'|'HIGH'; readonly knownDomains:readonly string[]; readonly lastAssessedAt?:GameDate } {
  const knowledge = world.organizationKnowledge.find((item) => item.organizationId === organizationId && item.subjectPlayerId === playerId)
  const own = Object.values(world.teams).some((team) => team.organizationId === organizationId && team.rosterPlayerIds.includes(playerId))
  const dimensions = knowledge?.dimensions ?? {}
  const findings = Object.values(dimensions)
  const player = world.players[playerId]
  const derivedAggregates = player === undefined ? [] : AGGREGATE_DIMENSIONS.filter((dimension) =>
    getOrganizationRatingEvaluation({ organizationId, playerId, dimension, knowledge: world.organizationKnowledge, currentDate: world.currentDate, publicPosition: player.basketball.primaryPosition }).mode !== 'UNKNOWN',
  )
  const knownDomains = [...new Set([...Object.keys(dimensions), ...derivedAggregates])].sort()
  const freshness = findings.length === 0 ? (own ? .65 : 0) : findings.reduce((sum, item) => sum + lazyFreshness(item.assessedAt, world.currentDate), 0) / findings.length
  const uncertainty = findings.reduce((sum, item) => sum + (item.uncertainty ?? 20), 0) / Math.max(1, findings.length)
  return {
    organizationId,
    playerId,
    overallCoverage: findings.length === 0 ? (own ? .55 : 0) : average(findings.map((item) => item.coverage)),
    overallConfidence: findings.length === 0 ? (own ? .55 : 0) : average(findings.map((item) => item.confidence)),
    freshness,
    disagreement: uncertainty >= 13 ? 'HIGH' : uncertainty >= 8 ? 'MODERATE' : 'LOW',
    knownDomains,
    ...(findings.length === 0 ? {} : { lastAssessedAt: findings.map((item) => item.assessedAt).sort().at(-1)! }),
  }
}
function chooseEvaluator(world: GameWorld, organizationId: OrganizationId, mission: ScoutingMission, teamContextId?: TeamId): StaffPersonId {
  const teamIds = teamContextId === undefined ? Object.values(world.teams).filter((team) => team.organizationId === organizationId).map((team) => team.id) : [teamContextId]
  const selected = teamIds.flatMap((teamId) => getEligibleScoutingEvaluators(world, teamId, mission)).sort((a, b) => {
    const roleA = Object.values(world.teamStaffAssignmentsById).find((item) => item.staffPersonId === a)?.role
    const roleB = Object.values(world.teamStaffAssignmentsById).find((item) => item.staffPersonId === b)?.role
    return scoutingEvaluatorScore(world, b, roleB!, mission) - scoutingEvaluatorScore(world, a, roleA!, mission) || a.localeCompare(b)
  })[0]
  if (selected === undefined) throw new Error('Organization has no eligible Scout with available capacity')
  return selected
}
function scoutingEvaluatorScore(world: GameWorld, id: StaffPersonId, role: StaffRoleId, mission: ScoutingMission): number {
  const a = world.staffPeopleById[id]!.professional.attributes
  const ability = mission === 'POTENTIAL_EVALUATION' ? a.potentialEvaluation : mission === 'TACTICAL_FIT' ? a.tacticalKnowledge : a.talentEvaluation
  return calculateStaffRoleProficiencyByRoleId(world.staffPeopleById[id]!, role) * .55 + ability * .3 + a.analysis * .15 - activeWorkload(world, id) * 8
}
function isValidLiveGameTarget(world: GameWorld, playerId: PlayerId, gameId: string | undefined): boolean {
  if (gameId === undefined) return false
  const playerTeam = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId))
  const game = world.games[gameId as GameId]
  return playerTeam !== undefined && game?.status === 'scheduled' && compareGameDates(game.date, world.currentDate) >= 0 && (game.homeTeamId === playerTeam.id || game.awayTeamId === playerTeam.id)
}
function isSkillTarget(value: string): boolean {
  return SCOUTING_FAMILY_SET.has(value) || Object.hasOwn(PLAYER_AGGREGATE_SCOUTING_KEYS, value)
}

function dimensionsFor(assignment: ScoutingAssignment): readonly string[] {
  if (assignment.missionType === 'SKILL_EVALUATION') {
    const target = assignment.targetDimension ?? 'shooting'
    const keys = SCOUTING_FAMILY_SET.has(target)
      ? ratingKeysForScoutingFamily(target as PlayerRatingScoutingFamily)
      : ratingKeysForAggregateDimension(target as PlayerAggregateScoutingDimension)
    return keys.map(ratingKnowledgeDimensionFor)
  }
  if (assignment.missionType === 'POTENTIAL_EVALUATION') return ['potential:shooting','potential:finishing','potential:creation','potential:passing','potential:defense','potential:rebounding','potential:physical','potential:mental']
  if (assignment.missionType === 'TACTICAL_FIT') return ['tacticalFit']
  if (assignment.missionType === 'QUICK_LOOK') return ['shooting','physical']
  if (assignment.missionType === 'FULL_REPORT') return PLAYER_TRUTH_RATING_KEYS.map(ratingKnowledgeDimensionFor)
  return AGGREGATE_DIMENSIONS
}

function truthForDimension(player: GameWorld['players'][PlayerId], dimension: string): number {
  if (dimension.startsWith('potential:')) {
    const domain = dimension.slice(10) as keyof typeof player.development.ceilings
    return player.development.ceilings[domain] ?? 50
  }
  if (dimension === 'tacticalFit') return 50
  const ratingKey = ratingKeyFromKnowledgeDimension(dimension)
  if (ratingKey !== undefined) return player.basketball.ratings[ratingKey]
  if (Object.hasOwn(PLAYER_AGGREGATE_SCOUTING_KEYS, dimension)) {
    return average(ratingKeysForAggregateDimension(dimension as PlayerAggregateScoutingDimension).map((key) => player.basketball.ratings[key]))
  }
  return 50
}

function ratingFamilyForDimension(dimension: string): PlayerRatingScoutingFamily | undefined {
  const ratingKey = ratingKeyFromKnowledgeDimension(dimension)
  if (ratingKey !== undefined) return playerRatingScoutingFamily(ratingKey)
  return SCOUTING_FAMILY_SET.has(dimension) ? dimension as PlayerRatingScoutingFamily : undefined
}

function specializationReduction(profile: EvaluatorProfile, dimension: string, source: string): number {
  const family = ratingFamilyForDimension(dimension)
  if (profile.perks.includes('EYE_FOR_SHOOTERS') && family === 'shooting') return 2
  if (profile.perks.includes('PROJECTION_EXPERT') && dimension.startsWith('potential:')) return 2
  if (profile.perks.includes('TAPE_GRINDER') && source === 'VIDEO_SCOUTING') return 1
  if (profile.perks.includes('LIVE_SCOUT') && source !== 'VIDEO_SCOUTING') return 1
  return 0
}

function deterministicError(key: string, ability: number, profile: EvaluatorProfile, dimension: string, source: string): number {
  let hash = 2166136261
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  const perkReduction = specializationReduction(profile, dimension, source)
  const noise = ((hash >>> 0) % 2001 / 1000 - 1) * Math.max(2, 18 - ability / 10 - profile.experience / 25 - perkReduction)
  const family = ratingFamilyForDimension(dimension)
  const isPhysical = family === 'physical' || dimension === 'physical'
  const isShooting = family === 'shooting' || dimension === 'shooting'
  const bias = (profile.biases.includes('UPSIDE_BIAS') && dimension.startsWith('potential:') ? 3 : 0)
    + (profile.biases.includes('ATHLETICISM_BIAS') && isPhysical ? 3 : 0)
    + (profile.biases.includes('PRODUCTION_BIAS') && isShooting ? 2 : 0)
    + (profile.biases.includes('SIZE_BIAS') && isPhysical ? 1 : 0)
  return noise + bias
}
function updateAssignment(world:GameWorld,assignment:ScoutingAssignment):GameWorld{return updateGameWorld(world,{scoutingAssignments:Object.values(world.scoutingAssignmentsById).map(item=>item.id===assignment.id?assignment:item)})}
function lazyFreshness(assessed:GameDate,now:GameDate):number { const days=Math.max(0,Math.round((Date.UTC(Number(now.slice(0,4)),Number(now.slice(5,7))-1,Number(now.slice(8,10)))-Date.UTC(Number(assessed.slice(0,4)),Number(assessed.slice(5,7))-1,Number(assessed.slice(8,10))))/86400000));return clamp01(1-days/365) }
function average(values:readonly number[]):number{return values.length===0?0:values.reduce((a,b)=>a+b,0)/values.length}function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value))}function clamp01(value:number):number{return clamp(value,0,1)}
