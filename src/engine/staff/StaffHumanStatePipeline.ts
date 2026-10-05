import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import {
  staffHumanContextIdFor,
  createStaffHumanContext,
  classifyWorkloadBand,
  type StaffHumanContext,
  type StaffHumanContextId,
} from '@/domain/staffHumanState'
import {
  initializeStaffExpectationProfile,
  initializeStaffHumanState,
  appraiseStaffHumanState,
  applyHumanStateRecovery,
} from '@/engine/staff/StaffHumanAppraisalEngine'
import { calculateStaffWorkload, getStaffAssignment } from '@/domain/world'
import { emitWorkloadTransitionEvents } from './StaffHumanWorkloadTracking'
import { appraiseStaffCareer, progressStaffCareerAutonomy as evolveStaffCareerAutonomy, STAFF_CAREER_AUTONOMY_TUNING } from './StaffCareerAutonomyEngine'
import { staffCareerRequestIdFor, type StaffCareerRequest, type StaffCareerRequestKind } from '@/domain/staffCareerAutonomy'
import { RESPONSIBILITY_REGISTRY } from '@/domain/responsibility'
import { calculateStaffRoleProficiencyByRoleId, isStaffRoleApplicableToEcosystem, STAFF_ROLE_REGISTRY } from '@/domain/staff'
import { buildStaffPoliticalInfluenceIndex } from './StaffPoliticalInfluenceEngine'
import { isStaffWeeklyCheckpoint } from './StaffWeeklyCadence'

/**
 * Wave 5A §21/§37 — the single canonical daily/periodic authority for Staff Human State.
 * Responsibilities per call:
 *  1. Ensure a `StaffHumanContext`/initial `StaffHumanState`/`StaffExpectationProfile` exists for
 *     every currently-employed Staff person (context creation is itself idempotent — a context id
 *     is deterministic from `(staffId, teamId, startedOn)`, so calling this repeatedly for an
 *     unchanged employment never creates a duplicate or resets existing state).
 *  2. Apply Recovery (stress/frustration drift toward baseline) every call — cheap, incremental.
 *  3. Run the periodic Appraisal pass on a weekly cadence (`shouldRunWeeklyAppraisal`), not daily.
 *  4. Detect sustained workload-band transitions and emit the corresponding Human Events.
 *
 * Never duplicates logic in `advanceGameDay`/`ContinueFlow`/UI/stores — every temporal caller
 * routes through this one function (see `CalendarEngine.advanceDay`).
 */
export function progressStaffHumanState(world: GameWorld): GameWorld {
  let next = ensureStaffHumanContexts(world)
  next = applyDailyRecovery(next)
  next = emitWorkloadTransitionEvents(next)
  if (isStaffWeeklyCheckpoint(next.currentDate)) next = runWeeklyAppraisal(next)
  return next
}

/** Runs after conflict and culture progression so career appraisal reads their current canonical state. */
export function progressStaffCareerAutonomyAppraisal(world: GameWorld): GameWorld {
  return isStaffWeeklyCheckpoint(world.currentDate) ? progressWeeklyStaffCareerAutonomy(world) : world
}

/** Wave 5E weekly continuation of the canonical Human-State cadence. It is intentionally state-only: request execution remains an application concern. */
function progressWeeklyStaffCareerAutonomy(world: GameWorld): GameWorld {
  const states = Object.values(world.staffCareerAutonomyByContextId)
  // WSR2: position of each context's state in `states` (context ids are unique), instead of a findIndex scan per context.
  const stateIndexByContext = new Map(states.map((item, index) => [item.contextId, index]))
  const requests = Object.values(world.staffCareerRequestsById) as StaffCareerRequest[]
  const requestsByContext = new Map<string, StaffCareerRequest[]>()
  for (const item of requests) { const list = requestsByContext.get(item.contextId); if (list === undefined) requestsByContext.set(item.contextId, [item]); else list.push(item) }
  const lookup = careerRequestLookup(world)
  let changed = false
  for (const context of Object.values(world.staffHumanContextsById)) {
    if (context.endedOn !== undefined) continue
    const human = world.staffHumanStatesByContextId[context.id]
    if (human === undefined) continue
    const prior = world.staffCareerAutonomyByContextId[context.id]
    const next = evolveStaffCareerAutonomy(prior, appraiseStaffCareer(world, context, human), context, world.currentDate)
    const index = stateIndexByContext.get(context.id) ?? -1
    if (index < 0) { stateIndexByContext.set(context.id, states.length); states.push(next) } else states[index] = next
    changed ||= prior === undefined || prior.intensity !== next.intensity || prior.primaryIntent !== next.primaryIntent || prior.outlook !== next.outlook
    const request = requestFor(world, context, next.primaryIntent, lookup)
    if (request !== undefined && next.intensity >= STAFF_CAREER_AUTONOMY_TUNING.requestIntensity && canCreateRequest(requestsByContext.get(request.contextId) ?? [], request, world.currentDate)) {
      requests.push(request)
      const list = requestsByContext.get(request.contextId)
      if (list === undefined) requestsByContext.set(request.contextId, [request]); else list.push(request)
      changed = true
    }
  }
  return changed ? updateGameWorld(world, { staffCareerAutonomyStates: states, staffCareerRequests: requests }) : world
}

/**
 * WSR2: lookups the weekly career pass made by scanning world collections for every Staff context, built once per pass. Each answers
 * exactly what its scan answered: the first competition (collection order) listing a team, and the team's responsibilities in order.
 */
interface CareerRequestLookup {
  readonly firstCompetitionByTeam: ReadonlyMap<string, GameWorld['competitions'][keyof GameWorld['competitions']]>
  readonly responsibilitiesByTeam: ReadonlyMap<string, readonly GameWorld['responsibilitiesById'][keyof GameWorld['responsibilitiesById']][]>
}

function careerRequestLookup(world: GameWorld): CareerRequestLookup {
  const firstCompetitionByTeam = new Map<string, GameWorld['competitions'][keyof GameWorld['competitions']]>()
  for (const competition of Object.values(world.competitions)) for (const teamId of competition.participantTeamIds) if (!firstCompetitionByTeam.has(teamId)) firstCompetitionByTeam.set(teamId, competition)
  const responsibilitiesByTeam = new Map<string, GameWorld['responsibilitiesById'][keyof GameWorld['responsibilitiesById']][]>()
  for (const item of Object.values(world.responsibilitiesById)) { const list = responsibilitiesByTeam.get(item.teamId); if (list === undefined) responsibilitiesByTeam.set(item.teamId, [item]); else list.push(item) }
  return { firstCompetitionByTeam, responsibilitiesByTeam }
}

function requestFor(world: GameWorld, context: StaffHumanContext, intent: import('@/domain/staffCareerAutonomy').StaffCareerIntent, lookup: CareerRequestLookup = careerRequestLookup(world)): StaffCareerRequest | undefined {
  const employment = world.staffEmploymentByStaffId[context.staffId]
  if (employment?.status !== 'employed') return undefined
  let kind: StaffCareerRequestKind | undefined
  let targetRoleId: StaffCareerRequest['targetRoleId']
  let targetResponsibilityKind: StaffCareerRequest['targetResponsibilityKind']
  if (intent === 'PROMOTION' || intent === 'ROLE_CHANGE') {
    const current = STAFF_ROLE_REGISTRY[employment.roleId!]
    const ecosystem = lookup.firstCompetitionByTeam.get(context.teamId)
    if (ecosystem === undefined) return undefined
    const ecosystemKind = world.ecosystems[ecosystem.ecosystemId]!.kind
    const levels = ['junior', 'standard', 'senior', 'director']
    const currentRank = levels.indexOf(current.seniority)
    const nextRank = levels.findIndex((_, index) => index > currentRank && Object.values(STAFF_ROLE_REGISTRY).some((role) => role.department === current.department && levels.indexOf(role.seniority) === index && isStaffRoleApplicableToEcosystem(role.id, ecosystemKind)))
    const higher = nextRank < 0 ? undefined : Object.values(STAFF_ROLE_REGISTRY).filter((role) => role.department === current.department && levels.indexOf(role.seniority) === nextRank && isStaffRoleApplicableToEcosystem(role.id, ecosystemKind)).sort((a, b) => calculateStaffRoleProficiencyByRoleId(world.staffPeopleById[context.staffId]!, b.id) - calculateStaffRoleProficiencyByRoleId(world.staffPeopleById[context.staffId]!, a.id) || a.id.localeCompare(b.id))[0]
    if (higher === undefined) return undefined
    kind = intent === 'PROMOTION' ? 'PROMOTION' : 'ROLE_CHANGE'; targetRoleId = higher.id
  } else if (intent === 'MORE_RESPONSIBILITY') {
    const eligible = Object.values(RESPONSIBILITY_REGISTRY).filter((definition) => definition.eligibleRoleIds.includes(employment.roleId!) && !(lookup.responsibilitiesByTeam.get(context.teamId) ?? []).some((item) => item.kind === definition.kind && item.holderStaffId !== undefined)).sort((a, b) => a.kind.localeCompare(b.kind))[0]
    if (eligible === undefined) return undefined
    kind = 'MORE_RESPONSIBILITY'; targetResponsibilityKind = eligible.kind
  } else if (intent === 'CONTRACT_IMPROVEMENT') kind = 'CONTRACT_DISCUSSION'
  else if (intent === 'EXIT_NOW') kind = 'RELEASE'
  if (kind === undefined) return undefined
  const id = staffCareerRequestIdFor(context.id, kind, targetRoleId ?? targetResponsibilityKind, world.currentDate)
  return { id, contextId: context.id, staffId: context.staffId, teamId: context.teamId, kind, createdOn: world.currentDate, status: 'OPEN', ...(targetRoleId === undefined ? {} : { targetRoleId }), ...(targetResponsibilityKind === undefined ? {} : { targetResponsibilityKind }) }
}

function canCreateRequest(requests: readonly StaffCareerRequest[], request: StaffCareerRequest, date: string): boolean {
  const equivalent = requests.filter((item) => item.contextId === request.contextId && item.kind === request.kind && item.targetRoleId === request.targetRoleId && item.targetResponsibilityKind === request.targetResponsibilityKind)
  if (equivalent.some((item) => item.status === 'OPEN')) return false
  const latest = equivalent.sort((a, b) => (b.resolvedOn ?? b.createdOn).localeCompare(a.resolvedOn ?? a.createdOn))[0]
  return latest === undefined || daysBetween(latest.resolvedOn ?? latest.createdOn, date) >= 28
}

function daysBetween(from: string, to: string): number { return Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000)) }

function ensureStaffHumanContexts(world: GameWorld): GameWorld {
  const newContexts: StaffHumanContext[] = []
  const newStates: ReturnType<typeof initializeStaffHumanState>[] = []
  const newExpectations: ReturnType<typeof initializeStaffExpectationProfile>[] = []

  for (const [staffId, employment] of Object.entries(world.staffEmploymentByStaffId) as [StaffPersonId, GameWorld['staffEmploymentByStaffId'][StaffPersonId]][]) {
    if (employment.status !== 'employed' || employment.teamId === undefined || employment.startedOn === undefined) continue
    const contextId = staffHumanContextIdFor(staffId, employment.teamId, employment.startedOn)
    if (world.staffHumanContextsById[contextId] !== undefined) continue

    const context = createStaffHumanContext({ id: contextId, staffId, teamId: employment.teamId, startedOn: employment.startedOn })
    const expectations = initializeStaffExpectationProfile(world, context)
    const state = initializeStaffHumanState(world, context, expectations.current)
    newContexts.push(context)
    newExpectations.push(expectations)
    newStates.push(state)
  }

  if (newContexts.length === 0) return world
  return updateGameWorld(world, {
    staffHumanContexts: [...Object.values(world.staffHumanContextsById), ...newContexts],
    staffHumanStates: [...Object.values(world.staffHumanStatesByContextId), ...newStates],
    staffExpectationProfiles: [...Object.values(world.staffExpectationProfilesByContextId), ...newExpectations],
  })
}

function applyDailyRecovery(world: GameWorld): GameWorld {
  const updates = Object.values(world.staffHumanStatesByContextId)
    .map((state) => ({ state, recovered: applyHumanStateRecovery(state, world.personalitiesByPersonId[state.staffId]) }))
    .filter((item) => item.recovered.stress !== item.state.stress || item.recovered.frustration !== item.state.frustration)
  if (updates.length === 0) return world
  // WSR2: context ids are unique, so a map answers exactly what `updates.find` by context id answered.
  const recoveredByContext = new Map(updates.map((item) => [item.state.contextId, item.recovered]))
  return updateGameWorld(world, {
    staffHumanStates: Object.values(world.staffHumanStatesByContextId).map((state) => recoveredByContext.get(state.contextId) ?? state),
  })
}

function runWeeklyAppraisal(world: GameWorld): GameWorld {
  const contexts = Object.values(world.staffHumanContextsById).filter((context) => context.endedOn === undefined)
  if (contexts.length === 0) return world
  const politicalInfluenceIndex = buildStaffPoliticalInfluenceIndex(world)

  const updatedStates: Record<StaffHumanContextId, ReturnType<typeof appraiseStaffHumanState>['state']> = {} as never
  const updatedExpectations: Record<StaffHumanContextId, ReturnType<typeof appraiseStaffHumanState>['expectations']> = {} as never

  for (const context of contexts) {
    const state = world.staffHumanStatesByContextId[context.id]
    const expectations = world.staffExpectationProfilesByContextId[context.id]
    if (state === undefined || expectations === undefined) continue
    const monthsSinceEstablished = monthsBetween(expectations.establishedOn, world.currentDate)
    const result = appraiseStaffHumanState(world, context, state, expectations, monthsSinceEstablished, politicalInfluenceIndex)
    updatedStates[context.id] = result.state
    updatedExpectations[context.id] = result.expectations
  }

  if (Object.keys(updatedStates).length === 0) return world
  return updateGameWorld(world, {
    staffHumanStates: Object.values(world.staffHumanStatesByContextId).map((state) => updatedStates[state.contextId] ?? state),
    staffExpectationProfiles: Object.values(world.staffExpectationProfilesByContextId).map((profile) => updatedExpectations[profile.contextId] ?? profile),
  })
}

function monthsBetween(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth] = fromDate.split('-').map(Number)
  const [toYear, toMonth] = toDate.split('-').map(Number)
  return Math.max(0, (toYear! - fromYear!) * 12 + (toMonth! - fromMonth!))
}

/** Read-only helper for callers (UI/appraisal debugging) needing "does this Staff currently have a live workload band". */
export function currentWorkloadBandFor(world: GameWorld, staffId: StaffPersonId, teamId: TeamId): ReturnType<typeof classifyWorkloadBand> | undefined {
  const assignment = getStaffAssignment(world, staffId)
  if (assignment === undefined || assignment.teamId !== teamId) return undefined
  return classifyWorkloadBand(calculateStaffWorkload(world, staffId).utilization)
}
