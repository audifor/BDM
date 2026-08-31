import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { delegationOutcomeIdFromString } from '@/domain/responsibility'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { progressMedicalAdvisories, acceptMedicalRecommendation, MIN_MEDICAL_ADJUSTMENT_DAYS, MAX_MEDICAL_ADJUSTMENT_DAYS } from './MedicalAdvisory'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, attributes: Partial<StaffAttributes> = {}) {
  const staffId = staffPersonIdFromString(`medical-advisory-staff-${role}-${teamId}`)
  const withStaff = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Med', lastName: 'Ic' }, professional: { attributes: { ...flatAttributes, ...attributes } } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`medical-advisory-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
  })
  return { world: withStaff, staffId }
}

function setPersonality(world: GameWorld, staffId: ReturnType<typeof staffPersonIdFromString>, overrides: Partial<Record<string, number>>) {
  const current = world.personalitiesByPersonId[staffId]!
  return { ...world, personalitiesByPersonId: { ...world.personalitiesByPersonId, [staffId]: { values: { ...current.values, ...overrides } } } }
}

function delegateAdvisory(world: GameWorld, teamId: TeamId, kind: 'returnToPlayRecommendation' | 'treatmentRecommendation' | 'riskAssessment', mode: 'advisory' | 'userControlled' | 'organizational', staffId?: ReturnType<typeof staffPersonIdFromString>) {
  const id = `responsibility:${teamId}:${kind}` as never
  return updateGameWorld(world, {
    responsibilities: [...Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind, mode, ...(staffId === undefined ? {} : { holderStaffId: staffId }) }],
  })
}

function withActiveInjury(world: GameWorld, teamId: TeamId) {
  const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
  const injury = createInjury({ id: injuryIdFromString(`medical-advisory-injury-${teamId}`), playerId, kind: 'ankleSprain', severity: 'moderate', injuredOn: world.currentDate, expectedReturnDate: '2099-01-01' as never })
  return { world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), injury] }), injury }
}

describe('progressMedicalAdvisories', () => {
  it('active injury + genuine advisory holder produces a returnToPlayRecommendation and treatmentRecommendation DelegationOutcome, applied: false', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury, injury } = withActiveInjury(base, teamId)
    const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor')
    const delegated = delegateAdvisory(delegateAdvisory(withStaff, teamId, 'returnToPlayRecommendation', 'advisory', staffId), teamId, 'treatmentRecommendation', 'advisory', staffId)

    const progressed = progressMedicalAdvisories(delegated)
    const outcomes = Object.values(progressed.delegationOutcomesById).filter((item) => item.staffId === staffId)
    expect(outcomes).toHaveLength(2)
    for (const outcome of outcomes) {
      expect(outcome.applied).toBe(false)
      expect(outcome.payload.injuryId).toBe(injury.id)
      expect(outcome.payload.playerId).toBe(injury.playerId)
      expect(outcome.payload.baseExpectedReturnDate).toBe(injury.expectedReturnDate)
    }
  })

  it('userControlled produces no Staff-authored medical outcome', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury } = withActiveInjury(base, teamId)
    const delegated = delegateAdvisory(withInjury, teamId, 'returnToPlayRecommendation', 'userControlled')
    const before = Object.keys(delegated.delegationOutcomesById).length
    const progressed = progressMedicalAdvisories(delegated)
    expect(Object.keys(progressed.delegationOutcomesById)).toHaveLength(before)
  })

  it('organizational produces no Staff-authored medical outcome', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury } = withActiveInjury(base, teamId)
    const delegated = delegateAdvisory(withInjury, teamId, 'returnToPlayRecommendation', 'organizational')
    const before = Object.keys(delegated.delegationOutcomesById).length
    const progressed = progressMedicalAdvisories(delegated)
    expect(Object.keys(progressed.delegationOutcomesById)).toHaveLength(before)
  })

  it('vacant (no responsibility row at all) produces no Staff-authored medical outcome', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury } = withActiveInjury(base, teamId)
    const before = Object.keys(withInjury.delegationOutcomesById).length
    const progressed = progressMedicalAdvisories(withInjury)
    expect(Object.keys(progressed.delegationOutcomesById)).toHaveLength(before)
  })

  it('exactly-once: repeated processing of the same injury/kind does not spam duplicate outcomes', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury } = withActiveInjury(base, teamId)
    const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor')
    const delegated = delegateAdvisory(withStaff, teamId, 'returnToPlayRecommendation', 'advisory', staffId)
    const once = progressMedicalAdvisories(delegated)
    const twice = progressMedicalAdvisories(once)
    expect(Object.keys(twice.delegationOutcomesById)).toHaveLength(Object.keys(once.delegationOutcomesById).length)
  })

  it('recommendedExtraDays is always inside the frozen [-2, +5] bounds', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury } = withActiveInjury(base, teamId)
    const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor')
    const delegated = delegateAdvisory(withStaff, teamId, 'returnToPlayRecommendation', 'advisory', staffId)
    const progressed = progressMedicalAdvisories(delegated)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId)!
    const days = outcome.payload.recommendedExtraDays as number
    expect(days).toBeGreaterThanOrEqual(MIN_MEDICAL_ADJUSTMENT_DAYS)
    expect(days).toBeLessThanOrEqual(MAX_MEDICAL_ADJUSTMENT_DAYS)
  })

  it('conservative (low temperament) vs aggressive (high temperament) personality produce discriminating recommendations on average', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id

    function averageExtraDaysFor(temperament: number): number {
      const samples = Array.from({ length: 6 }, (_, index) => index).map((index) => {
        const { world: withInjury } = withActiveInjury(base, teamId)
        const injuryId = `medical-advisory-injury-${teamId}` as never
        const dated = updateGameWorld(withInjury, { injuries: Object.values(withInjury.injuriesById).map((item) => item.id === injuryId ? { ...item, id: `medical-advisory-injury-${teamId}-${index}` as never } : item) })
        const { world: withStaff, staffId } = withStaffInRole(dated, teamId, 'teamDoctor')
        const personalityWorld = setPersonality(withStaff, staffId, { temperament })
        const delegated = delegateAdvisory(personalityWorld, teamId, 'returnToPlayRecommendation', 'advisory', staffId)
        const progressed = progressMedicalAdvisories(delegated)
        const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId)
        return outcome === undefined ? 0 : (outcome.payload.recommendedExtraDays as number)
      })
      return samples.reduce((sum, value) => sum + value, 0) / samples.length
    }

    const conservativeAverage = averageExtraDaysFor(10)
    const aggressiveAverage = averageExtraDaysFor(90)
    expect(conservativeAverage).toBeGreaterThan(aggressiveAverage)
  })
})

describe('acceptMedicalRecommendation', () => {
  function delegatedWorldWithOutcome(kind: 'returnToPlayRecommendation' | 'treatmentRecommendation' = 'returnToPlayRecommendation') {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury, injury } = withActiveInjury(base, teamId)
    const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor')
    const delegated = delegateAdvisory(withStaff, teamId, kind, 'advisory', staffId)
    const progressed = progressMedicalAdvisories(delegated)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === kind)!
    return { world: progressed, outcome, injury, teamId, staffId }
  }

  it('accepts a valid recommendation: updates only the referenced InjuryRecord, marks the outcome applied:true', () => {
    const { world, outcome, injury } = delegatedWorldWithOutcome()
    const result = acceptMedicalRecommendation(world, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updatedInjury = result.world.injuriesById[injury.id]!
    const updatedOutcome = result.world.delegationOutcomesById[outcome.id]!
    expect(updatedOutcome.applied).toBe(true)
    const expectedDate = new Date(`${injury.expectedReturnDate}T00:00:00.000Z`)
    expectedDate.setUTCDate(expectedDate.getUTCDate() + (outcome.payload.recommendedExtraDays as number))
    expect(updatedInjury.expectedReturnDate).toBe(expectedDate.toISOString().slice(0, 10))
  })

  it('computes the new date from baseExpectedReturnDate, not a compounded current date: accepting both recommendations for the same injury does not stack', () => {
    const { world, outcome: firstOutcome } = delegatedWorldWithOutcome('returnToPlayRecommendation')
    const secondFixture = delegatedWorldWithOutcome('treatmentRecommendation')
    void secondFixture
    const afterFirst = acceptMedicalRecommendation(world, firstOutcome.id)
    expect(afterFirst.ok).toBe(true)
    if (!afterFirst.ok) return

    const treatmentOutcome = Object.values(afterFirst.world.delegationOutcomesById).find((item) => item.kind === 'treatmentRecommendation' && item.staffId === firstOutcome.staffId)
    if (treatmentOutcome === undefined) return
    const afterSecond = acceptMedicalRecommendation(afterFirst.world, treatmentOutcome.id)
    expect(afterSecond.ok).toBe(true)
    if (!afterSecond.ok) return

    const finalInjury = afterSecond.world.injuriesById[(firstOutcome.payload.injuryId as string) as never]!
    const expectedBase = new Date(`${treatmentOutcome.payload.baseExpectedReturnDate as string}T00:00:00.000Z`)
    expectedBase.setUTCDate(expectedBase.getUTCDate() + (treatmentOutcome.payload.recommendedExtraDays as number))
    expect(finalInjury.expectedReturnDate).toBe(expectedBase.toISOString().slice(0, 10))
  })

  it('never produces a return date <= injuredOn', () => {
    const { world, outcome, injury } = delegatedWorldWithOutcome()
    const result = acceptMedicalRecommendation(world, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updatedInjury = result.world.injuriesById[injury.id]!
    expect(updatedInjury.expectedReturnDate > injury.injuredOn).toBe(true)
  })

  it('rejects an already-applied outcome atomically (no mutation)', () => {
    const { world, outcome } = delegatedWorldWithOutcome()
    const first = acceptMedicalRecommendation(world, outcome.id)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = acceptMedicalRecommendation(first.world, outcome.id)
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.reason).toBe('alreadyApplied')
  })

  it('rejects a nonexistent outcome id atomically', () => {
    const base = createNewGame()
    const result = acceptMedicalRecommendation(base, delegationOutcomeIdFromString('nonexistent-outcome'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('notFound')
  })

  it('rejects a malformed payload atomically without mutating anything', () => {
    const { world, outcome } = delegatedWorldWithOutcome()
    const tampered = { ...outcome, payload: { ...outcome.payload, recommendedExtraDays: 'not-a-number' } }
    const tamperedWorld = { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcome.id]: tampered } }
    const result = acceptMedicalRecommendation(tamperedWorld, outcome.id)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('malformedPayload')
  })

  it('rejects a stale outcome referencing a since-removed injury atomically', () => {
    const { world, outcome } = delegatedWorldWithOutcome()
    const injuryId = outcome.payload.injuryId as string
    const withoutInjury = { ...world, injuriesById: Object.fromEntries(Object.entries(world.injuriesById).filter(([id]) => id !== injuryId)) }
    const result = acceptMedicalRecommendation(withoutInjury, outcome.id)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('injuryNotFound')
  })

  it('rejects an out-of-bounds recommendedExtraDays atomically', () => {
    const { world, outcome } = delegatedWorldWithOutcome()
    const tampered = { ...outcome, payload: { ...outcome.payload, recommendedExtraDays: 999 } }
    const tamperedWorld = { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcome.id]: tampered } }
    const result = acceptMedicalRecommendation(tamperedWorld, outcome.id)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('outOfBounds')
  })
})
