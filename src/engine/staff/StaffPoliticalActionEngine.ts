import { createStaffPoliticalAction, staffPoliticalActionIdFor, type StaffPoliticalAction, type StaffPoliticalCase, type StaffPoliticalPosition } from '@/domain/staffPolitics'
import type { StaffPersonId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { StaffPoliticalRelevanceIndex } from './StaffPoliticalPositionEngine'

export const MAX_NEW_POLITICAL_ACTIONS_PER_CASE_PER_CHECKPOINT = 4
export const STAFF_POLITICAL_ACTION_TUNING = { endorseMinInfluence: 45, lobbyMinInfluence: 55, lobbyMinLeadershipAccess: 55, coordinateMinActorInfluence: 35, coordinateMinCombinedInfluence: 100, mediateMinInfluence: 45, maxNewActionsPerCasePerCheckpoint: MAX_NEW_POLITICAL_ACTIONS_PER_CASE_PER_CHECKPOINT } as const

interface Candidate { readonly priority: number; readonly action: StaffPoliticalAction }
export interface StaffPoliticalActionProgressResult { readonly world: GameWorld; readonly createdActions: readonly StaffPoliticalAction[] }

export function progressStaffPoliticalActions(world: GameWorld, index: StaffPoliticalRelevanceIndex): GameWorld { return progressStaffPoliticalActionsDetailed(world, index).world }
export function progressStaffPoliticalActionsDetailed(world: GameWorld, index: StaffPoliticalRelevanceIndex): StaffPoliticalActionProgressResult {
  const existing = new Set(Object.keys(world.staffPoliticalActionsById))
  const actionsCreatedThisCheckpointByCaseId: Record<string, number> = {}
  for (const action of Object.values(world.staffPoliticalActionsById)) if (action.performedOn === world.currentDate) actionsCreatedThisCheckpointByCaseId[action.caseId] = (actionsCreatedThisCheckpointByCaseId[action.caseId] ?? 0) + 1
  const additions: StaffPoliticalAction[] = []
  for (const politicalCase of Object.values(world.staffPoliticalCasesById)) {
    if (politicalCase.status !== 'OPEN') continue
    const candidates = candidatesForCase(world, politicalCase, index, existing)
    const remaining = Math.max(0, MAX_NEW_POLITICAL_ACTIONS_PER_CASE_PER_CHECKPOINT - (actionsCreatedThisCheckpointByCaseId[politicalCase.id] ?? 0))
    for (const candidate of candidates.sort((left, right) => left.priority - right.priority || left.action.id.localeCompare(right.action.id)).slice(0, remaining)) {
      if (!existing.has(candidate.action.id)) { existing.add(candidate.action.id); additions.push(candidate.action) }
    }
  }
  return additions.length === 0 ? { world, createdActions: [] } : { world: updateGameWorld(world, { staffPoliticalActions: [...Object.values(world.staffPoliticalActionsById), ...additions] }), createdActions: additions }
}

function candidatesForCase(world: GameWorld, politicalCase: StaffPoliticalCase, index: StaffPoliticalRelevanceIndex, existing: ReadonlySet<string>): Candidate[] {
  const positions = (politicalCase.positions ?? []).filter((position) => index.activeStaffSetByTeamId[politicalCase.teamId]?.has(position.actorId))
  const candidates: Candidate[] = []
  const add = (priority: number, kind: StaffPoliticalAction['kind'], stance: StaffPoliticalAction['stance'], actorIds: readonly StaffPersonId[], target?: StaffPoliticalAction['target']) => {
    const id = staffPoliticalActionIdFor(politicalCase.id, kind, stance, actorIds, target)
    if (!existing.has(id)) candidates.push({ priority, action: createStaffPoliticalAction({ id, caseId: politicalCase.id, teamId: politicalCase.teamId, kind, stance, actorIds, ...(target === undefined ? {} : { target }), performedOn: world.currentDate }) })
  }
  const influenceFor = (actorId: StaffPersonId) => index.politicalInfluenceByStaffId[actorId]
  const coachId = world.teams[politicalCase.teamId]?.coachId
  for (const position of positions) {
    const influence = influenceFor(position.actorId)
    if (influence === undefined) continue
    if (position.stance === 'MEDIATE') {
      if (influence.overall >= STAFF_POLITICAL_ACTION_TUNING.mediateMinInfluence && positions.some((other) => other.stance === 'SUPPORT') && positions.some((other) => other.stance === 'OPPOSE')) add(0, 'MEDIATE', 'MEDIATE', [position.actorId])
      continue
    }
    const canLobby = coachId !== undefined && world.coaches[coachId] !== undefined && influence.overall >= STAFF_POLITICAL_ACTION_TUNING.lobbyMinInfluence && influence.leadershipAccess >= STAFF_POLITICAL_ACTION_TUNING.lobbyMinLeadershipAccess
    if (canLobby) add(1, 'LOBBY', position.stance, [position.actorId], { kind: 'COACH', id: coachId })
    else if (position.stance === 'SUPPORT' && influence.overall >= STAFF_POLITICAL_ACTION_TUNING.endorseMinInfluence) add(3, 'ENDORSE', 'SUPPORT', [position.actorId])
  }
  for (const stance of ['SUPPORT', 'OPPOSE'] as const) {
    const participants = positions.filter((position) => position.stance === stance).map((position) => ({ actorId: position.actorId, influence: influenceFor(position.actorId)?.overall ?? 0 })).filter((participant) => participant.influence >= STAFF_POLITICAL_ACTION_TUNING.coordinateMinActorInfluence).sort((left, right) => right.influence - left.influence || left.actorId.localeCompare(right.actorId)).slice(0, 4)
    if (participants.length >= 2 && participants.reduce((sum, participant) => sum + participant.influence, 0) >= STAFF_POLITICAL_ACTION_TUNING.coordinateMinCombinedInfluence) add(2, 'COORDINATE', stance, participants.map((participant) => participant.actorId).sort((left, right) => left.localeCompare(right)) as StaffPersonId[])
  }
  return candidates
}
