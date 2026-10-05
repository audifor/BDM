import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { Responsibility, ResponsibilityKind } from '@/domain/responsibility'
import type { GameWorld } from './GameWorld'

type TeamStaffAssignment = GameWorld['teamStaffAssignmentsById'][keyof GameWorld['teamStaffAssignmentsById']]

/**
 * WSR2 daily-execution indexes over canonical world collections.
 *
 * World collections are immutable records: every update builds a new collection object (`updateGameWorld`), nothing writes into an
 * existing one. An index cached against the collection OBJECT (WeakMap) can therefore never be stale: a changed collection is a
 * different object and gets its own index on first use, and the index dies with the collection. Indexes are execution infrastructure,
 * never world truth, and are never persisted.
 *
 * Each index answers exactly what the scan it replaces answered, in the same order: `filter` keeps collection order, `find` returns
 * the first match in collection order.
 */
export interface ResponsibilityIndex {
  readonly byTeam: ReadonlyMap<TeamId, readonly Responsibility[]>
  readonly byHolder: ReadonlyMap<StaffPersonId, readonly Responsibility[]>
  readonly byTeamKind: ReadonlyMap<string, Responsibility>
}

const responsibilityIndexes = new WeakMap<object, ResponsibilityIndex>()

export function responsibilityIndex(collection: Readonly<Record<string, Responsibility>>): ResponsibilityIndex {
  let index = responsibilityIndexes.get(collection)
  if (index === undefined) {
    const byTeam = new Map<TeamId, Responsibility[]>()
    const byHolder = new Map<StaffPersonId, Responsibility[]>()
    const byTeamKind = new Map<string, Responsibility>()
    for (const responsibility of Object.values(collection)) {
      let team = byTeam.get(responsibility.teamId)
      if (team === undefined) { team = []; byTeam.set(responsibility.teamId, team) }
      team.push(responsibility)
      if (responsibility.holderStaffId !== undefined) {
        let held = byHolder.get(responsibility.holderStaffId)
        if (held === undefined) { held = []; byHolder.set(responsibility.holderStaffId, held) }
        held.push(responsibility)
      }
      const key = teamKindKey(responsibility.teamId, responsibility.kind)
      if (!byTeamKind.has(key)) byTeamKind.set(key, responsibility)
    }
    index = { byTeam, byHolder, byTeamKind }
    responsibilityIndexes.set(collection, index)
  }
  return index
}

export function teamKindKey(teamId: TeamId, kind: ResponsibilityKind): string {
  return `${teamId}\u0000${kind}`
}

export interface StaffAssignmentIndex {
  /** First assignment of each staff person in collection order (what `find` returned). */
  readonly byStaff: ReadonlyMap<StaffPersonId, TeamStaffAssignment>
  /** Assignments of each team, in collection order. */
  readonly byTeam: ReadonlyMap<TeamId, readonly TeamStaffAssignment[]>
  /** Every assignment of each staff person, in collection order (what `filter` by staff returned). */
  readonly allByStaff: ReadonlyMap<StaffPersonId, readonly TeamStaffAssignment[]>
}

const assignmentIndexes = new WeakMap<object, StaffAssignmentIndex>()

export function staffAssignmentIndex(collection: Readonly<Record<string, TeamStaffAssignment>>): StaffAssignmentIndex {
  let index = assignmentIndexes.get(collection)
  if (index === undefined) {
    const byStaff = new Map<StaffPersonId, TeamStaffAssignment>()
    const byTeam = new Map<TeamId, TeamStaffAssignment[]>()
    const allByStaff = new Map<StaffPersonId, TeamStaffAssignment[]>()
    for (const assignment of Object.values(collection)) {
      if (!byStaff.has(assignment.staffPersonId)) byStaff.set(assignment.staffPersonId, assignment)
      let all = allByStaff.get(assignment.staffPersonId)
      if (all === undefined) { all = []; allByStaff.set(assignment.staffPersonId, all) }
      all.push(assignment)
      let team = byTeam.get(assignment.teamId)
      if (team === undefined) { team = []; byTeam.set(assignment.teamId, team) }
      team.push(assignment)
    }
    index = { byStaff, byTeam, allByStaff }
    assignmentIndexes.set(collection, index)
  }
  return index
}

type PlayerContract = GameWorld['contractsById'][keyof GameWorld['contractsById']]
type WorldTeam = GameWorld['teams'][keyof GameWorld['teams']]

const contractIndexes = new WeakMap<object, ReadonlyMap<string, readonly PlayerContract[]>>()

/** Contracts of each player, in collection order (what `Object.values(contracts).filter(c => c.playerId === id)` returned). */
export function contractsByPlayer(collection: GameWorld['contractsById']): ReadonlyMap<string, readonly PlayerContract[]> {
  let index = contractIndexes.get(collection)
  if (index === undefined) {
    const built = new Map<string, PlayerContract[]>()
    for (const contract of Object.values(collection)) {
      let list = built.get(contract.playerId)
      if (list === undefined) { list = []; built.set(contract.playerId, list) }
      list.push(contract)
    }
    index = built
    contractIndexes.set(collection, index)
  }
  return index
}

const rosterIndexes = new WeakMap<object, ReadonlyMap<string, readonly WorldTeam[]>>()

/** Teams whose roster lists each player, in team collection order. */
export function teamsByRosterPlayer(teams: GameWorld['teams']): ReadonlyMap<string, readonly WorldTeam[]> {
  let index = rosterIndexes.get(teams)
  if (index === undefined) {
    const built = new Map<string, WorldTeam[]>()
    for (const team of Object.values(teams)) for (const playerId of new Set(team.rosterPlayerIds)) {
      let list = built.get(playerId)
      if (list === undefined) { list = []; built.set(playerId, list) }
      list.push(team)
    }
    index = built
    rosterIndexes.set(teams, index)
  }
  return index
}

export interface TeamIndex {
  /** First team (collection order) coached by each coach. */
  readonly byCoach: ReadonlyMap<string, WorldTeam>
  /** Organizations that own at least one team. */
  readonly organizations: ReadonlySet<string>
}

const teamIndexes = new WeakMap<object, TeamIndex>()

export function teamIndex(teams: GameWorld['teams']): TeamIndex {
  let index = teamIndexes.get(teams)
  if (index === undefined) {
    const byCoach = new Map<string, WorldTeam>()
    const organizations = new Set<string>()
    for (const team of Object.values(teams)) {
      if (team.coachId !== undefined && !byCoach.has(team.coachId)) byCoach.set(team.coachId, team)
      organizations.add(team.organizationId)
    }
    index = { byCoach, organizations }
    teamIndexes.set(teams, index)
  }
  return index
}

type StaffHumanContextEntry = GameWorld['staffHumanContextsById'][keyof GameWorld['staffHumanContextsById']]
type StaffContractEntry = GameWorld['staffContractsById'][keyof GameWorld['staffContractsById']]

const liveContextIndexes = new WeakMap<object, ReadonlyMap<string, StaffHumanContextEntry>>()

/** First live (not ended) Human-State context of each staff person, in collection order. */
export function liveStaffContextByStaff(collection: GameWorld['staffHumanContextsById']): ReadonlyMap<string, StaffHumanContextEntry> {
  let index = liveContextIndexes.get(collection)
  if (index === undefined) {
    const built = new Map<string, StaffHumanContextEntry>()
    for (const context of Object.values(collection)) if (context.endedOn === undefined && !built.has(context.staffId)) built.set(context.staffId, context)
    index = built
    liveContextIndexes.set(collection, index)
  }
  return index
}

const staffContractIndexes = new WeakMap<object, ReadonlyMap<string, readonly StaffContractEntry[]>>()

/** Staff contracts of each staff person, in collection order. */
export function staffContractsByStaff(collection: GameWorld['staffContractsById']): ReadonlyMap<string, readonly StaffContractEntry[]> {
  let index = staffContractIndexes.get(collection)
  if (index === undefined) {
    const built = new Map<string, StaffContractEntry[]>()
    for (const contract of Object.values(collection)) {
      let list = built.get(contract.staffId)
      if (list === undefined) { list = []; built.set(contract.staffId, list) }
      list.push(contract)
    }
    index = built
    staffContractIndexes.set(collection, index)
  }
  return index
}

type CohesionUnit = GameWorld['staffUnitCohesionStatesByUnitKey'][keyof GameWorld['staffUnitCohesionStatesByUnitKey']]
type StaffConflictEntry = GameWorld['staffConflictsById'][keyof GameWorld['staffConflictsById']]

const cohesionIndexes = new WeakMap<object, ReadonlyMap<string, readonly CohesionUnit[]>>()

/** Unit cohesion states of each scope (team), in collection order. */
export function cohesionUnitsByScope(collection: GameWorld['staffUnitCohesionStatesByUnitKey']): ReadonlyMap<string, readonly CohesionUnit[]> {
  let index = cohesionIndexes.get(collection)
  if (index === undefined) {
    const built = new Map<string, CohesionUnit[]>()
    for (const unit of Object.values(collection)) {
      let list = built.get(unit.scopeKey)
      if (list === undefined) { list = []; built.set(unit.scopeKey, list) }
      list.push(unit)
    }
    index = built
    cohesionIndexes.set(collection, index)
  }
  return index
}

const conflictIndexes = new WeakMap<object, ReadonlyMap<string, readonly StaffConflictEntry[]>>()

/** Conflicts each actor takes part in, in collection order (a conflict appears once per actor even if listed twice). */
export function conflictsByParticipant(collection: GameWorld['staffConflictsById']): ReadonlyMap<string, readonly StaffConflictEntry[]> {
  let index = conflictIndexes.get(collection)
  if (index === undefined) {
    const built = new Map<string, StaffConflictEntry[]>()
    for (const conflict of Object.values(collection)) for (const actorId of new Set(conflict.participants.map((participant) => participant.actorId as string))) {
      let list = built.get(actorId)
      if (list === undefined) { list = []; built.set(actorId, list) }
      list.push(conflict)
    }
    index = built
    conflictIndexes.set(collection, index)
  }
  return index
}

type EligibilityProfileEntry = GameWorld['eligibilityProfilesById'][keyof GameWorld['eligibilityProfilesById']]
type EligibilityRestrictionEntry = GameWorld['eligibilityRestrictionsById'][keyof GameWorld['eligibilityRestrictionsById']]

/** Key of an eligibility profile: one player at one program of one ecosystem. */
export function eligibilityProfileKey(playerId: string, ecosystemId: string, programTeamId: string): string {
  return `${playerId}|${ecosystemId}|${programTeamId}`
}

const eligibilityProfileIndexes = new WeakMap<object, ReadonlyMap<string, EligibilityProfileEntry>>()

/** First eligibility profile (collection order) of each player, ecosystem and program. */
export function eligibilityProfileIndex(collection: GameWorld['eligibilityProfilesById']): ReadonlyMap<string, EligibilityProfileEntry> {
  let index = eligibilityProfileIndexes.get(collection)
  if (index === undefined) {
    const built = new Map<string, EligibilityProfileEntry>()
    for (const profile of Object.values(collection)) {
      const key = eligibilityProfileKey(profile.playerId, profile.ecosystemId, profile.programTeamId)
      if (!built.has(key)) built.set(key, profile)
    }
    index = built
    eligibilityProfileIndexes.set(collection, index)
  }
  return index
}

const eligibilityRestrictionIndexes = new WeakMap<object, ReadonlyMap<string, readonly EligibilityRestrictionEntry[]>>()

/** Eligibility restrictions of each player, in collection order. */
export function eligibilityRestrictionsByPlayer(collection: GameWorld['eligibilityRestrictionsById']): ReadonlyMap<string, readonly EligibilityRestrictionEntry[]> {
  let index = eligibilityRestrictionIndexes.get(collection)
  if (index === undefined) {
    const built = new Map<string, EligibilityRestrictionEntry[]>()
    for (const restriction of Object.values(collection)) {
      let list = built.get(restriction.playerId)
      if (list === undefined) { list = []; built.set(restriction.playerId, list) }
      list.push(restriction)
    }
    index = built
    eligibilityRestrictionIndexes.set(collection, index)
  }
  return index
}

type StaffReactionRecordEntry = GameWorld['staffReactionRecordsById'][keyof GameWorld['staffReactionRecordsById']]
type MemoryEntry = GameWorld['memoriesById'][keyof GameWorld['memoriesById']]

const reactionIndexes = new WeakMap<object, ReadonlyMap<string, readonly StaffReactionRecordEntry[]>>()

/** Staff reaction records of each Human-State context, in collection order (the history grows every week). */
export function reactionRecordsByContext(collection: GameWorld['staffReactionRecordsById']): ReadonlyMap<string, readonly StaffReactionRecordEntry[]> {
  let index = reactionIndexes.get(collection)
  if (index === undefined) {
    const built = new Map<string, StaffReactionRecordEntry[]>()
    for (const record of Object.values(collection)) {
      let list = built.get(record.contextId)
      if (list === undefined) { list = []; built.set(record.contextId, list) }
      list.push(record)
    }
    index = built
    reactionIndexes.set(collection, index)
  }
  return index
}

const memoryIndexes = new WeakMap<object, ReadonlyMap<string, readonly MemoryEntry[]>>()

/** Memories of each owner, in collection order (the history grows with every season). */
export function memoriesByOwner(collection: GameWorld['memoriesById']): ReadonlyMap<string, readonly MemoryEntry[]> {
  let index = memoryIndexes.get(collection)
  if (index === undefined) {
    const built = new Map<string, MemoryEntry[]>()
    for (const memory of Object.values(collection)) {
      let list = built.get(memory.owner.id)
      if (list === undefined) { list = []; built.set(memory.owner.id, list) }
      list.push(memory)
    }
    index = built
    memoryIndexes.set(collection, index)
  }
  return index
}
