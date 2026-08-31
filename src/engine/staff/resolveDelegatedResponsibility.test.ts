import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { resolveAdvisoryResponsibility, resolveDelegatedResponsibility } from './resolveDelegatedResponsibility'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string) {
  const staffId = staffPersonIdFromString(`resolver-test-staff-${role}-${teamId}`)
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Res', lastName: 'Olver' }, professional: { attributes: flatAttributes } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`resolver-test-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
    }),
    staffId,
  }
}

function setResponsibility(world: GameWorld, teamId: TeamId, kind: 'assignScouts' | 'oppositionScouting' | 'oppositionReport', mode: 'delegated' | 'advisory' | 'userControlled', staffId?: ReturnType<typeof staffPersonIdFromString>) {
  const id = `responsibility:${teamId}:${kind}` as never
  return updateGameWorld(world, {
    responsibilities: [
      ...Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.id !== id),
      { id, teamId, kind, mode, ...(staffId === undefined ? {} : { holderStaffId: staffId }) },
    ],
  })
}

describe('resolveAdvisoryResponsibility', () => {
  it('resolves when the responsibility is genuinely advisory with a valid holder', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const withAdvisory = setResponsibility(world, teamId, 'oppositionReport', 'advisory', staffId)
    const resolution = resolveAdvisoryResponsibility(withAdvisory, teamId, 'oppositionReport')
    expect(resolution?.staffId).toBe(staffId)
    expect(resolution?.context.roleId).toBe('advanceScout')
  })

  it('returns undefined when the responsibility is delegated, not advisory', () => {
    // oppositionReport does not support 'delegated' mode at all (canonical registry), so this
    // uses assignScouts (which supports both) to isolate the mode check itself.
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const withDelegated = setResponsibility(world, teamId, 'assignScouts', 'delegated', staffId)
    expect(resolveAdvisoryResponsibility(withDelegated, teamId, 'assignScouts')).toBeUndefined()
  })

  it('returns undefined when userControlled/vacant', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    expect(resolveAdvisoryResponsibility(base, teamId, 'oppositionReport')).toBeUndefined()
  })

  it('returns undefined when the holder has no live TeamStaffAssignment on the same team', () => {
    // world.validateWorld() itself already rejects this state at the updateGameWorld boundary
    // (defense-in-depth), so to test the resolver's OWN independent guard we construct the raw
    // object directly, exactly as a corrupted/legacy world state could theoretically look before
    // any validation runs.
    const base = createNewGame()
    const teamIds = Object.values(base.teams).map((team) => team.id)
    const teamId = teamIds[0]!
    const otherTeamId = teamIds[1]!
    const { world, staffId } = withStaffInRole(base, otherTeamId, 'advanceScout')
    const id = `responsibility:${teamId}:oppositionReport` as never
    const corrupted = { ...world, responsibilitiesById: { ...world.responsibilitiesById, [id]: { id, teamId, kind: 'oppositionReport', mode: 'advisory', holderStaffId: staffId } } }
    expect(resolveAdvisoryResponsibility(corrupted, teamId, 'oppositionReport')).toBeUndefined()
  })

  it('returns undefined when the holder id does not exist as a StaffPerson', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const id = `responsibility:${teamId}:oppositionReport` as never
    const corrupted = { ...base, responsibilitiesById: { ...base.responsibilitiesById, [id]: { id, teamId, kind: 'oppositionReport', mode: 'advisory', holderStaffId: staffPersonIdFromString('nonexistent-staff') } } }
    expect(resolveAdvisoryResponsibility(corrupted, teamId, 'oppositionReport')).toBeUndefined()
  })

  it('the resolved context workload is derived from canonical world state, not caller-supplied', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const withAdvisory = setResponsibility(world, teamId, 'oppositionReport', 'advisory', staffId)
    const resolution = resolveAdvisoryResponsibility(withAdvisory, teamId, 'oppositionReport')
    expect(resolution?.context.workload.staffId).toBe(staffId)
    expect(resolution?.context.workload.overloaded).toBe(false)
  })
})

describe('resolveDelegatedResponsibility (Wave 2 regression)', () => {
  it('still resolves only for genuinely delegated responsibilities', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withStaffInRole(base, teamId, 'regionalScout')
    const withDelegated = setResponsibility(world, teamId, 'assignScouts', 'delegated', staffId)
    expect(resolveDelegatedResponsibility(withDelegated, teamId, 'assignScouts')?.staffId).toBe(staffId)
  })

  it('returns undefined for an advisory-mode responsibility', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const withAdvisory = setResponsibility(world, teamId, 'oppositionReport', 'advisory', staffId)
    expect(resolveDelegatedResponsibility(withAdvisory, teamId, 'oppositionReport')).toBeUndefined()
  })
})
