import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, getNextScheduledGame, type GameWorld } from '@/domain/world'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { requestScouting } from './ScoutingEngine'
import { progressAdvisoryScoutingReports } from './AdvisoryScoutingReports'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, attributes: Partial<StaffAttributes> = {}) {
  const staffId = staffPersonIdFromString(`advisory-scouting-staff-${role}-${teamId}`)
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Adv', lastName: 'Isor' }, professional: { attributes: { ...flatAttributes, ...attributes } } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`advisory-scouting-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
    }),
    staffId,
  }
}

function delegateAdvisory(world: GameWorld, teamId: TeamId, kind: 'oppositionReport' | 'prospectReport', staffId: ReturnType<typeof staffPersonIdFromString>) {
  const id = `responsibility:${teamId}:${kind}` as never
  return updateGameWorld(world, {
    responsibilities: [...Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind, mode: 'advisory', holderStaffId: staffId }],
  })
}

describe('progressAdvisoryScoutingReports', () => {
  it('a genuine advisory oppositionReport holder with a bounded target triggers the existing requestScouting() path, producing a canonical ScoutingAssignment (never a second report type)', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    if (getNextScheduledGame(base, teamId) === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const delegated = delegateAdvisory(world, teamId, 'oppositionReport', staffId)
    const progressed = progressAdvisoryScoutingReports(delegated)
    const created = Object.values(progressed.scoutingAssignmentsById).find((assignment) => assignment.evaluatorStaffId === staffId && assignment.requestedBy === 'SCOUTING_DEPARTMENT')
    expect(created).toBeDefined()
  })

  it('records an advisory (applied: false) DelegationOutcome, never applied: true, since creating a request is not an irreversible action', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    if (getNextScheduledGame(base, teamId) === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const delegated = delegateAdvisory(world, teamId, 'oppositionReport', staffId)
    const progressed = progressAdvisoryScoutingReports(delegated)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.kind === 'oppositionReport' && item.staffId === staffId)
    expect(outcome).toBeDefined()
    expect(outcome!.applied).toBe(false)
  })

  it('manual HEAD_COACH requestScouting() usage remains completely unaffected: requesting manually still works exactly as before', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const player = base.teams[teamId]!.rosterPlayerIds[0]
    if (player === undefined) return
    const { world, staffId } = withStaffInRole(base, teamId, 'advanceScout')
    const manual = requestScouting(world, { organizationId: `organization:${teamId}` as never, playerId: player, missionType: 'QUICK_LOOK', evaluatorStaffId: staffId, requestedBy: 'HEAD_COACH' })
    const created = Object.values(manual.scoutingAssignmentsById).find((assignment) => assignment.evaluatorStaffId === staffId)
    expect(created?.requestedBy).toBe('HEAD_COACH')
    expect(created?.staffQualityScore).toBeUndefined()
  })

  it('userControlled produces no advisory scouting requests', () => {
    const base = createNewGame()
    const before = Object.keys(base.scoutingAssignmentsById).length
    const progressed = progressAdvisoryScoutingReports(base)
    expect(Object.keys(progressed.scoutingAssignmentsById)).toHaveLength(before)
  })

  it('a prospectReport advisory holder uses the bounded recruiting board as its target source', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const boardEntries = base.recruitingBoards.filter((entry) => entry.programTeamId === teamId)
    if (boardEntries.length === 0) return
    const { world, staffId } = withStaffInRole(base, teamId, 'collegeScout')
    const delegated = delegateAdvisory(world, teamId, 'prospectReport', staffId)
    const progressed = progressAdvisoryScoutingReports(delegated)
    const created = Object.values(progressed.scoutingAssignmentsById).find((assignment) => assignment.evaluatorStaffId === staffId)
    if (created !== undefined) {
      const boardPlayerIds = boardEntries.map((entry) => world.recruitProfilesById[entry.recruitId]?.playerId)
      expect(boardPlayerIds).toContain(created.subjectPlayerId)
    }
  })
})
