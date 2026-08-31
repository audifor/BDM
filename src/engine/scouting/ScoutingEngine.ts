import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import { organizationIdForTeam, type OrganizationId, type PlayerId, type StaffPersonId, type TeamId } from '@/domain/ids'
import { CANONICAL_RATING_KEYS } from '@/domain/player'
import type { OrganizationKnowledge, OrganizationKnowledgeDimension } from '@/domain/knowledge'
import { createEvaluatorProfile, type EvaluatorFinding, type EvaluatorProfile, type EvaluatorReport, type Evidence, type ScoutingAssignment, type ScoutingMission, type ScoutingPriority } from '@/domain/scouting'
import { updateGameWorld, type GameWorld } from '@/domain/world'

const missionUnits: Readonly<Record<ScoutingMission, number>> = { QUICK_LOOK: 1, FULL_REPORT: 4, SKILL_EVALUATION: 2, POTENTIAL_EVALUATION: 2, TACTICAL_FIT: 2, LIVE_GAME: 2 }
const missionDays: Readonly<Record<ScoutingMission, number>> = { QUICK_LOOK: 1, FULL_REPORT: 5, SKILL_EVALUATION: 3, POTENTIAL_EVALUATION: 3, TACTICAL_FIT: 3, LIVE_GAME: 1 }
const domains = { finishing: ['rimFinishing', 'contactFinishing', 'postScoring'], shooting: ['midRangeShooting', 'threePointShooting', 'freeThrowShooting'], creation: ['ballHandling', 'passing', 'courtVision'], perimeterDefense: ['perimeterDefense', 'screenNavigation', 'steal'], interiorDefense: ['interiorDefense', 'rimProtection', 'defensiveAwareness'], rebounding: ['offensiveRebounding', 'defensiveRebounding'], physical: ['speed', 'acceleration', 'vertical', 'strength'] } as const

export function evaluatorProfile(world: GameWorld, staffId: StaffPersonId): EvaluatorProfile {
  const existing = world.evaluatorProfilesByStaffId[staffId]
  if (existing !== undefined) return existing
  const staff = world.staffPeopleById[staffId]; if (!staff) throw new Error('Evaluator does not exist')
  const ability = staff.professional.attributes.talentEvaluation
  return createEvaluatorProfile({ staffPersonId: staffId, experience: Math.round((ability + staff.professional.attributes.analysis) / 3), perks: ability >= 80 ? ['EYE_FOR_SHOOTERS'] : [], biases: ability < 45 ? ['PRODUCTION_BIAS'] : [] })
}

export function requestScouting(world: GameWorld, input: { organizationId: OrganizationId; playerId: PlayerId; missionType: ScoutingMission; priority?: ScoutingPriority; evaluatorStaffId?: StaffPersonId; targetDimension?: string; teamContextId?: TeamId; gameId?: string; requestedBy?: 'HEAD_COACH' | 'SCOUTING_DEPARTMENT' }): GameWorld {
  const evaluatorStaffId = input.evaluatorStaffId ?? chooseEvaluator(world, input.organizationId, input.missionType)
  if (!world.players[input.playerId] || !world.staffPeopleById[evaluatorStaffId]) throw new Error('Scouting request references missing entity')
  if (Object.values(world.scoutingAssignmentsById).some((item) => item.organizationId === input.organizationId && item.subjectPlayerId === input.playerId && item.evaluatorStaffId === evaluatorStaffId && item.missionType === input.missionType && item.status !== 'COMPLETED' && item.status !== 'CANCELLED')) return world
  const id = `scouting:${input.organizationId}:${input.playerId}:${evaluatorStaffId}:${input.missionType}:${world.currentDate}`
  const assignment: ScoutingAssignment = { id, organizationId: input.organizationId, subjectPlayerId: input.playerId, evaluatorStaffId, missionType: input.missionType, requestedBy: input.requestedBy ?? 'HEAD_COACH', priority: input.priority ?? 'NORMAL', createdAt: world.currentDate, status: 'QUEUED', ...(input.targetDimension === undefined ? {} : { targetDimension: input.targetDimension }), ...(input.teamContextId === undefined ? {} : { teamContextId: input.teamContextId }), ...(input.gameId === undefined ? {} : { gameId: input.gameId }) }
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
      const capacity = assignment.missionType === 'QUICK_LOOK' ? 6 : 4
      if (activeWorkload(next, assignment.evaluatorStaffId) + missionUnits[assignment.missionType] > capacity) continue
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

export function durationDays(world: GameWorld, assignment: ScoutingAssignment): number {
  const staff = world.staffPeopleById[assignment.evaluatorStaffId]!
  const profile = evaluatorProfile(world, assignment.evaluatorStaffId)
  const relevant = assignment.missionType === 'POTENTIAL_EVALUATION' ? staff.professional.attributes.potentialEvaluation : assignment.missionType === 'TACTICAL_FIT' ? Math.round((staff.professional.attributes.tacticalKnowledge + staff.professional.attributes.analysis) / 2) : staff.professional.attributes.talentEvaluation
  const workload = activeWorkload(world, assignment.evaluatorStaffId)
  return Math.max(1, missionDays[assignment.missionType] + (relevant < 50 ? 1 : 0) + (profile.experience < 30 ? 1 : 0) + (workload >= 4 ? 1 : 0))
}
export function activeWorkload(world: GameWorld, staffId: StaffPersonId): number { return Object.values(world.scoutingAssignmentsById).filter((item) => item.evaluatorStaffId === staffId && item.status === 'ACTIVE').reduce((sum, item) => sum + missionUnits[item.missionType], 0) }

function completeAssignment(world: GameWorld, assignmentId: string): GameWorld {
  const assignment = world.scoutingAssignmentsById[assignmentId]!; const evidence = createEvidence(world, assignment); const report = generateEvaluatorReport(world, assignment, evidence)
  const knowledge = consolidateOrganizationKnowledge(world.organizationKnowledge, report, evidence, evaluatorProfile(world, assignment.evaluatorStaffId), world.currentDate)
  return updateGameWorld(world, { evidence: [...Object.values(world.evidenceById), evidence], evaluatorReports: [...Object.values(world.evaluatorReportsById), report], organizationKnowledge: knowledge, scoutingAssignments: Object.values(world.scoutingAssignmentsById).map((item) => item.id === assignmentId ? { ...item, status: 'COMPLETED', completedAt: world.currentDate } : item) })
}
function createEvidence(world: GameWorld, assignment: ScoutingAssignment): Evidence { const source = assignment.missionType === 'LIVE_GAME' ? 'OPPONENT_GAME' : assignment.missionType === 'TACTICAL_FIT' ? 'VIDEO_SCOUTING' : 'LIVE_SCOUTING'; return { id: `evidence:${assignment.id}`, organizationId: assignment.organizationId, subjectPlayerId: assignment.subjectPlayerId, source, observedAt: world.currentDate, quality: missionUnits[assignment.missionType] / 4, dimensions: dimensionsFor(assignment), context: assignment.missionType, ...(assignment.gameId === undefined ? {} : { gameId: assignment.gameId }) } }
export function generateEvaluatorReport(world: GameWorld, assignment: ScoutingAssignment, evidence: Evidence): EvaluatorReport {
  const player = world.players[assignment.subjectPlayerId]!, staff = world.staffPeopleById[assignment.evaluatorStaffId]!, profile = evaluatorProfile(world, assignment.evaluatorStaffId)
  const ability = assignment.missionType === 'POTENTIAL_EVALUATION' ? staff.professional.attributes.potentialEvaluation : assignment.missionType === 'TACTICAL_FIT' ? Math.round((staff.professional.attributes.tacticalKnowledge + staff.professional.attributes.analysis) / 2) : staff.professional.attributes.talentEvaluation
  const findings = dimensionsFor(assignment).map((dimension) => { const truth = truthForDimension(player, dimension, assignment.missionType); const error = deterministicError(`${assignment.id}:${dimension}`, ability, profile, dimension, evidence.source); const perkReduction = profile.perks.includes('EYE_FOR_SHOOTERS') && dimension === 'shooting' || profile.perks.includes('PROJECTION_EXPERT') && dimension.startsWith('potential:') ? 2 : profile.perks.includes('TAPE_GRINDER') && evidence.source === 'VIDEO_SCOUTING' ? 1 : profile.perks.includes('LIVE_SCOUT') && evidence.source !== 'VIDEO_SCOUTING' ? 1 : 0; const uncertainty = Math.max(3, Math.round(17 - ability / 9 - profile.experience / 18 - perkReduction + (1 - evidence.quality) * 5)); return { dimension, estimate: clamp(Math.round(truth + error), 1, 100), uncertainty, confidence: clamp(Math.round(100 - uncertainty * 4 + evidence.quality * 12), 1, 95), coverageContribution: Math.round(evidence.quality * 100) / 100 } })
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
  const knowledge = world.organizationKnowledge.find((item) => item.organizationId === organizationId && item.subjectPlayerId === playerId); const own = Object.values(world.teams).some((team) => organizationIdForTeam(team.id) === organizationId && team.rosterPlayerIds.includes(playerId)); const findings = Object.values(knowledge?.dimensions ?? {}); const freshness = findings.length === 0 ? (own ? .65 : 0) : findings.reduce((sum, item) => sum + lazyFreshness(item.assessedAt, world.currentDate), 0) / findings.length; const uncertainty = findings.reduce((sum, item) => sum + (item.uncertainty ?? 20), 0) / Math.max(1, findings.length); return { organizationId, playerId, overallCoverage: findings.length === 0 ? (own ? .55 : 0) : average(findings.map((item) => item.coverage)), overallConfidence: findings.length === 0 ? (own ? .55 : 0) : average(findings.map((item) => item.confidence)), freshness, disagreement: uncertainty >= 13 ? 'HIGH' : uncertainty >= 8 ? 'MODERATE' : 'LOW', knownDomains: Object.keys(knowledge?.dimensions ?? {}), ...(findings.length === 0 ? {} : { lastAssessedAt: findings.map((item) => item.assessedAt).sort().at(-1)! }) }
}
function chooseEvaluator(world:GameWorld, organizationId:OrganizationId, mission:ScoutingMission):StaffPersonId { const teamId = organizationId as unknown as TeamId; const candidates = Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === teamId && item.role === 'regionalScout').map((item) => item.staffPersonId); const selected = candidates.sort((a,b) => score(world,b,mission)-score(world,a,mission) || a.localeCompare(b))[0]; if (!selected) throw new Error('Organization has no scout'); return selected }
function score(world:GameWorld,id:StaffPersonId,mission:ScoutingMission):number { const a=world.staffPeopleById[id]!.professional.attributes; return (mission==='POTENTIAL_EVALUATION'?a.potentialEvaluation:mission==='TACTICAL_FIT'?a.tacticalKnowledge+a.analysis:a.talentEvaluation)+evaluatorProfile(world,id).experience*.15-activeWorkload(world,id)*10 }
function dimensionsFor(a:ScoutingAssignment):readonly string[] { if(a.missionType==='SKILL_EVALUATION')return[a.targetDimension??'shooting'];if(a.missionType==='POTENTIAL_EVALUATION')return['potential:shooting','potential:finishing','potential:creation','potential:passing','potential:defense','potential:rebounding','potential:physical','potential:mental'];if(a.missionType==='TACTICAL_FIT')return['tacticalFit'];if(a.missionType==='QUICK_LOOK')return['shooting','physical'];return Object.keys(domains) }
function truthForDimension(player:GameWorld['players'][PlayerId],dimension:string,mission:ScoutingMission):number { if(dimension.startsWith('potential:')) { const domain=dimension.slice(10) as keyof typeof player.development.ceilings; return player.development.ceilings[domain] ?? 50 } if(dimension==='tacticalFit')return 50; const keys=(domains as Record<string,readonly string[]>)[dimension]??[dimension]; return average(keys.map((key)=>player.basketball.ratings[key as typeof CANONICAL_RATING_KEYS[number]]??50)) }
function deterministicError(key:string,ability:number,profile:EvaluatorProfile,dimension:string,source:string):number { let hash=2166136261;for(const char of key)hash=Math.imul(hash^char.charCodeAt(0),16777619);const perkReduction=profile.perks.includes('EYE_FOR_SHOOTERS')&&dimension==='shooting'||profile.perks.includes('PROJECTION_EXPERT')&&dimension.startsWith('potential:')||profile.perks.includes('TAPE_GRINDER')&&source==='VIDEO_SCOUTING'||profile.perks.includes('LIVE_SCOUT')&&source!=='VIDEO_SCOUTING'?2:0;const noise=((hash>>>0)%2001/1000-1)*Math.max(2,18-ability/10-profile.experience/25-perkReduction);const bias=(profile.biases.includes('UPSIDE_BIAS')&&dimension.startsWith('potential:')?3:0)+(profile.biases.includes('ATHLETICISM_BIAS')&&dimension==='physical'?3:0)+(profile.biases.includes('PRODUCTION_BIAS')&&dimension==='shooting'?2:0)+(profile.biases.includes('SIZE_BIAS')&&dimension==='physical'?1:0);return noise+bias }
function updateAssignment(world:GameWorld,assignment:ScoutingAssignment):GameWorld{return updateGameWorld(world,{scoutingAssignments:Object.values(world.scoutingAssignmentsById).map(item=>item.id===assignment.id?assignment:item)})}
function lazyFreshness(assessed:GameDate,now:GameDate):number { const days=Math.max(0,Math.round((Date.UTC(Number(now.slice(0,4)),Number(now.slice(5,7))-1,Number(now.slice(8,10)))-Date.UTC(Number(assessed.slice(0,4)),Number(assessed.slice(5,7))-1,Number(assessed.slice(8,10))))/86400000));return clamp01(1-days/365) }
function average(values:readonly number[]):number{return values.length===0?0:values.reduce((a,b)=>a+b,0)/values.length}function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value))}function clamp01(value:number):number{return clamp(value,0,1)}
