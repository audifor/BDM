import { getRelationshipDimensions, relationshipKey } from '@/domain/relationships'
import { staffRoleDefinition } from '@/domain/staff'
import { createStaffPoliticalCase, type StaffPoliticalCase, type StaffPoliticalPosition } from '@/domain/staffPolitics'
import type { StaffPersonId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { buildStaffPoliticalInfluenceIndex, deriveStaffPoliticalInfluence, type StaffPoliticalInfluenceIndex } from './StaffPoliticalInfluenceEngine'

export const MAX_POLITICAL_ACTORS_PER_CASE = 10
export const STAFF_POLITICAL_POSITION_TUNING = { initialThreshold: 38, switchThreshold: 22, mediationBalanceTolerance: 12, mediationEvidenceThreshold: 15 } as const

export interface StaffPoliticalRelevanceIndex {
  readonly activeStaffByTeamId: Readonly<Record<string, readonly StaffPersonId[]>>
  readonly activeStaffSetByTeamId: Readonly<Record<string, ReadonlySet<StaffPersonId>>>
  readonly activeContextByStaffId: Readonly<Record<string, import('@/domain/staffHumanState').StaffHumanContext>>
  readonly assignmentByStaffId: Readonly<Record<string, import('@/domain/staff').TeamStaffAssignment>>
  readonly staffByTeamAndRole: Readonly<Record<string, readonly StaffPersonId[]>>
  readonly departmentByStaffId: Readonly<Record<string, string>>
  readonly relationshipSourcesByTargetStaffId: Readonly<Record<string, readonly StaffPersonId[]>>
  readonly conflictsByStaffId: Readonly<Record<string, readonly StaffPersonId[]>>
  readonly responsibilitiesByStaffId: Readonly<Record<string, readonly string[]>>
  readonly responsibilityHoldersByTeamAndKind: Readonly<Record<string, StaffPersonId>>
  readonly influenceIndex: StaffPoliticalInfluenceIndex
}

export interface StaffPoliticalPositionAppraisal { readonly supportPressure: number; readonly opposePressure: number; readonly mediatePressure: number; readonly recommendedStance?: import('@/domain/staffPolitics').PoliticalStance }

export function pressureForStance(appraisal: StaffPoliticalPositionAppraisal, stance: import('@/domain/staffPolitics').PoliticalStance): number { return stance === 'SUPPORT' ? appraisal.supportPressure : stance === 'OPPOSE' ? appraisal.opposePressure : appraisal.mediatePressure }

export function buildStaffPoliticalRelevanceIndex(world: GameWorld): StaffPoliticalRelevanceIndex {
  const activeStaffByTeamId: Record<string, StaffPersonId[]> = {}; const departmentByStaffId: Record<string, string> = {}; const assignmentByStaffId: Record<string, import('@/domain/staff').TeamStaffAssignment> = {}; const staffByTeamAndRole: Record<string, StaffPersonId[]> = {}
  for (const assignment of Object.values(world.teamStaffAssignmentsById)) { const employment = world.staffEmploymentByStaffId[assignment.staffPersonId]; if (employment?.status !== 'employed' || employment.teamId !== assignment.teamId) continue; (activeStaffByTeamId[assignment.teamId] ??= []).push(assignment.staffPersonId); (staffByTeamAndRole[`${assignment.teamId}:${assignment.role}`] ??= []).push(assignment.staffPersonId); assignmentByStaffId[assignment.staffPersonId] = assignment; departmentByStaffId[assignment.staffPersonId] = staffRoleDefinition(assignment.role).department }
  for (const staff of Object.values(activeStaffByTeamId)) staff.sort()
  const activeStaffSetByTeamId = Object.fromEntries(Object.entries(activeStaffByTeamId).map(([teamId, staff]) => [teamId, new Set(staff)])) as Record<string, ReadonlySet<StaffPersonId>>
  const activeContextByStaffId: Record<string, import('@/domain/staffHumanState').StaffHumanContext> = {}
  for (const context of Object.values(world.staffHumanContextsById)) if (context.endedOn === undefined && activeStaffSetByTeamId[context.teamId]?.has(context.staffId)) activeContextByStaffId[context.staffId] = context
  const relationshipSourcesByTargetStaffId: Record<string, StaffPersonId[]> = {}
  for (const relationship of Object.values(world.relationshipsByKey)) { const sourceId = relationship.sourceId as StaffPersonId; const targetId = relationship.targetId as StaffPersonId; if (world.staffPeopleById[sourceId] === undefined || world.staffPeopleById[targetId] === undefined) continue; (relationshipSourcesByTargetStaffId[targetId] ??= []).push(sourceId) }
  const conflictsByStaffId: Record<string, StaffPersonId[]> = {}
  for (const conflict of Object.values(world.staffConflictsById)) if (conflict.status === 'ACTIVE') for (const participant of conflict.participants) for (const counterpart of conflict.participants) if (participant.actorId !== counterpart.actorId) (conflictsByStaffId[participant.actorId] ??= []).push(counterpart.actorId as StaffPersonId)
  const responsibilitiesByStaffId: Record<string, string[]> = {}; const responsibilityHoldersByTeamAndKind: Record<string, StaffPersonId> = {}
  for (const responsibility of Object.values(world.responsibilitiesById)) if (responsibility.holderStaffId !== undefined) { (responsibilitiesByStaffId[responsibility.holderStaffId] ??= []).push(responsibility.kind); responsibilityHoldersByTeamAndKind[`${responsibility.teamId}:${responsibility.kind}`] = responsibility.holderStaffId }
  return { activeStaffByTeamId, activeStaffSetByTeamId, activeContextByStaffId, assignmentByStaffId, staffByTeamAndRole, departmentByStaffId, relationshipSourcesByTargetStaffId, conflictsByStaffId, responsibilitiesByStaffId, responsibilityHoldersByTeamAndKind, influenceIndex: buildStaffPoliticalInfluenceIndex(world) }
}

export function discoverRelevantPoliticalActors(world: GameWorld, politicalCase: StaffPoliticalCase, index: StaffPoliticalRelevanceIndex): readonly StaffPersonId[] {
  const subjectId = politicalCase.subjectStaffId; if (subjectId === undefined) return []
  const request = politicalCase.sourceKind === 'CAREER_REQUEST' ? world.staffCareerRequestsById[politicalCase.sourceId] : undefined
  const scores: Record<string, number> = {}; const add = (id: StaffPersonId | undefined, score: number) => { if (id === undefined || id === subjectId || !index.activeStaffSetByTeamId[politicalCase.teamId]?.has(id)) return; scores[id] = (scores[id] ?? 0) + score }
  for (const id of index.relationshipSourcesByTargetStaffId[subjectId] ?? []) add(id, 30)
  for (const id of index.conflictsByStaffId[subjectId] ?? []) add(id, 25)
  const subjectDepartment = index.departmentByStaffId[subjectId]
  for (const id of index.activeStaffByTeamId[politicalCase.teamId] ?? []) if (index.departmentByStaffId[id] === subjectDepartment) add(id, 8)
  if (request?.kind === 'MORE_RESPONSIBILITY') add(index.responsibilityHoldersByTeamAndKind[`${politicalCase.teamId}:${request.targetResponsibilityKind}`], 60)
  if (request?.kind === 'PROMOTION' || request?.kind === 'ROLE_CHANGE') for (const staffId of index.staffByTeamAndRole[`${politicalCase.teamId}:${request.targetRoleId}`] ?? []) add(staffId, 55)
  for (const id of index.activeStaffByTeamId[politicalCase.teamId] ?? []) { const context = index.activeContextByStaffId[id]; if (context !== undefined && deriveStaffPoliticalInfluence(world, context, index.influenceIndex).overall >= 65) add(id, 10) }
  return Object.keys(scores).sort((a, b) => scores[b]! - scores[a]! || a.localeCompare(b)).slice(0, MAX_POLITICAL_ACTORS_PER_CASE) as StaffPersonId[]
}

export function appraiseStaffPoliticalPosition(world: GameWorld, politicalCase: StaffPoliticalCase, actorId: StaffPersonId, index: StaffPoliticalRelevanceIndex): StaffPoliticalPositionAppraisal {
  const subjectId = politicalCase.subjectStaffId!; const dimensions = getRelationshipDimensions(world.relationshipsByKey[relationshipKey(actorId, subjectId)])
  const request = world.staffCareerRequestsById[politicalCase.sourceId]
  const holdsRequested = request?.kind === 'MORE_RESPONSIBILITY' && index.responsibilityHoldersByTeamAndKind[`${politicalCase.teamId}:${request.targetResponsibilityKind}`] === actorId
  const competing = (request?.kind === 'PROMOTION' || request?.kind === 'ROLE_CHANGE') && index.assignmentByStaffId[actorId]?.role === request.targetRoleId
  const conflict = (index.conflictsByStaffId[actorId] ?? []).includes(subjectId)
  const context = index.activeContextByStaffId[actorId]; const influence = context === undefined ? 0 : deriveStaffPoliticalInfluence(world, context, index.influenceIndex).overall
  const supportPressure = Math.max(0, (dimensions.trust + dimensions.perceivedSupport + dimensions.professionalAlignment + dimensions.collaboration + dimensions.professionalRespect) / 10 + influence * .08)
  const opposePressure = (holdsRequested ? 65 : 0) + (competing ? 55 : 0) + (conflict ? 18 : 0) + ((holdsRequested || competing) ? Math.max(0, -dimensions.professionalAlignment - dimensions.trust) / 8 : 0) + influence * .08
  const professionalism = world.personalitiesByPersonId[actorId]?.values.professionalism ?? 50
  const mediatePressure = !holdsRequested && !competing && Math.min(supportPressure, opposePressure) >= STAFF_POLITICAL_POSITION_TUNING.mediationEvidenceThreshold && Math.abs(supportPressure - opposePressure) <= STAFF_POLITICAL_POSITION_TUNING.mediationBalanceTolerance ? Math.max(0, 25 + professionalism * .25 + dimensions.collaboration * .12) : 0
  const max = Math.max(supportPressure, opposePressure, mediatePressure)
  const recommendedStance = max < STAFF_POLITICAL_POSITION_TUNING.initialThreshold ? undefined : max === supportPressure ? 'SUPPORT' : max === opposePressure ? 'OPPOSE' : 'MEDIATE'
  return { supportPressure, opposePressure, mediatePressure, recommendedStance }
}

export function progressStaffPoliticalPositions(world: GameWorld): GameWorld {
  const index = buildStaffPoliticalRelevanceIndex(world); let changed = false
  const cases = Object.values(world.staffPoliticalCasesById).map((politicalCase) => {
    if (politicalCase.status !== 'OPEN') return politicalCase
    const prior = new Map((politicalCase.positions ?? []).map((position) => [position.actorId, position]))
    const positions: StaffPoliticalPosition[] = []
    for (const actorId of discoverRelevantPoliticalActors(world, politicalCase, index)) { const existing = prior.get(actorId); const appraisal = appraiseStaffPoliticalPosition(world, politicalCase, actorId, index); if (existing !== undefined) { const challenger = appraisal.recommendedStance === undefined ? 0 : pressureForStance(appraisal, appraisal.recommendedStance); const current = pressureForStance(appraisal, existing.stance); const switchTo = appraisal.recommendedStance !== undefined && appraisal.recommendedStance !== existing.stance && challenger >= STAFF_POLITICAL_POSITION_TUNING.initialThreshold && challenger - current >= STAFF_POLITICAL_POSITION_TUNING.switchThreshold; positions.push(switchTo ? { actorId, stance: appraisal.recommendedStance!, since: world.currentDate, lastEvaluatedOn: world.currentDate } : { ...existing, lastEvaluatedOn: world.currentDate }); continue } if (appraisal.recommendedStance !== undefined) positions.push({ actorId, stance: appraisal.recommendedStance, since: world.currentDate, lastEvaluatedOn: world.currentDate }) }
    for (const existing of prior.values()) if (!positions.some((position) => position.actorId === existing.actorId) && index.activeStaffSetByTeamId[politicalCase.teamId]?.has(existing.actorId)) positions.push(existing)
    const next = createStaffPoliticalCase({ ...politicalCase, positions }); if (JSON.stringify(next.positions) !== JSON.stringify(politicalCase.positions ?? [])) changed = true; return next
  })
  return changed ? updateGameWorld(world, { staffPoliticalCases: cases }) : world
}
