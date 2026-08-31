import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { getMedicalRiskAssessments } from './MedicalRiskAssessment'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string) {
  const staffId = staffPersonIdFromString(`risk-assessment-staff-${role}-${teamId}`)
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Ris', lastName: 'Kay' }, professional: { attributes: flatAttributes } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`risk-assessment-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
    }),
    staffId,
  }
}

function delegateAdvisory(world: GameWorld, teamId: TeamId, mode: 'advisory' | 'userControlled' | 'organizational', staffId?: ReturnType<typeof staffPersonIdFromString>) {
  const id = `responsibility:${teamId}:riskAssessment` as never
  return updateGameWorld(world, {
    responsibilities: [...Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind: 'riskAssessment', mode, ...(staffId === undefined ? {} : { holderStaffId: staffId }) }],
  })
}

describe('getMedicalRiskAssessments', () => {
  it('is pure: never mutates world/Player/InjuryRecord state', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const before = JSON.stringify(base)
    getMedicalRiskAssessments(base, teamId)
    expect(JSON.stringify(base)).toBe(before)
  })

  it('returns one entry per roster player, deterministically ordered by playerId', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const result = getMedicalRiskAssessments(base, teamId)
    expect(result.map((item) => item.playerId)).toEqual([...base.teams[teamId]!.rosterPlayerIds].sort())
  })

  it('an active injury raises risk score/band with a reason', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const playerId = base.teams[teamId]!.rosterPlayerIds[0]!
    const injury = createInjury({ id: injuryIdFromString('risk-injury-1'), playerId, kind: 'kneeSprain', severity: 'serious', injuredOn: base.currentDate, expectedReturnDate: '2099-01-01' as never })
    const withInjury = updateGameWorld(base, { injuries: [...Object.values(base.injuriesById), injury] })
    const result = getMedicalRiskAssessments(withInjury, teamId)
    const assessed = result.find((item) => item.playerId === playerId)!
    expect(assessed.riskScore).toBeGreaterThan(0)
    expect(assessed.reasons.length).toBeGreaterThan(0)
  })

  it('advisory holder contributes a quality signal', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world, staffId } = withStaffInRole(base, teamId, 'teamDoctor')
    const delegated = delegateAdvisory(world, teamId, 'advisory', staffId)
    const result = getMedicalRiskAssessments(delegated, teamId)
    expect(result[0]!.quality).toBeDefined()
    expect(Number.isInteger(result[0]!.quality)).toBe(true)
  })

  it('userControlled does not invent a Staff-authored quality signal', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const delegated = delegateAdvisory(base, teamId, 'userControlled')
    const result = getMedicalRiskAssessments(delegated, teamId)
    expect(result[0]!.quality).toBeUndefined()
  })

  it('organizational does not invent a Staff-authored quality signal', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const delegated = delegateAdvisory(base, teamId, 'organizational')
    const result = getMedicalRiskAssessments(delegated, teamId)
    expect(result[0]!.quality).toBeUndefined()
  })

  it('vacant (no responsibility) does not invent a Staff-authored quality signal', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const result = getMedicalRiskAssessments(base, teamId)
    expect(result[0]!.quality).toBeUndefined()
  })
})
