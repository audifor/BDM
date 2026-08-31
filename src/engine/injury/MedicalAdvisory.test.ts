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

  /**
   * Wave 4B review Blocker 2: `medicalQuality` must materially affect `recommendedExtraDays`, not
   * just sit unused in `qualityScore`. Holds `temperament` fixed (neutral, 50 — no directional
   * bias either way) and drives `qualityScore` apart purely via role-attribute strength (weak
   * `medicalKnowledge`/`rehabilitation` attributes for low quality, maxed for high quality — the
   * same technique `medicalQuality.test.ts` itself uses to separate quality). Samples a
   * deterministic series of distinct injury ids (never a probabilistic assertion) and compares
   * dispersion: a low-quality holder's recommendations must vary MORE across that series (larger
   * spread from the direction-only target of 0, since neutral temperament's `direction` term is
   * 0) than a high-quality holder's, which must stay tightly clustered near 0.
   */
  it('medicalQuality materially affects the downstream recommendation: high quality clusters tightly, low quality disperses, with neutral temperament', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id

    function samplesFor(attributeStrength: number): readonly number[] {
      return Array.from({ length: 12 }, (_, index) => index).map((index) => {
        const staffId = staffPersonIdFromString(`medical-quality-downstream-staff-${attributeStrength}`)
        const injury = createInjury({ id: injuryIdFromString(`medical-quality-downstream-injury-${attributeStrength}-${index}`), playerId: base.teams[teamId]!.rosterPlayerIds[0]!, kind: 'ankleSprain', severity: 'moderate', injuredOn: base.currentDate, expectedReturnDate: '2099-01-01' as never })
        const withInjury = updateGameWorld(base, { injuries: [...Object.values(base.injuriesById), injury] })
        const withStaff = updateGameWorld(withInjury, {
          staffPeople: [...Object.values(withInjury.staffPeopleById), { id: staffId, identity: { firstName: 'Med', lastName: 'Ic' }, professional: { attributes: { ...flatAttributes, medicalKnowledge: attributeStrength, rehabilitation: attributeStrength, analysis: attributeStrength } } }],
          teamStaffAssignments: [...Object.values(withInjury.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`medical-quality-downstream-assignment-${attributeStrength}-${index}`), staffPersonId: staffId, teamId, role: 'teamDoctor', assignedOn: withInjury.currentDate }],
        })
        const personalityWorld = setPersonality(withStaff, staffId, { temperament: 50 })
        const delegated = delegateAdvisory(personalityWorld, teamId, 'returnToPlayRecommendation', 'advisory', staffId)
        const progressed = progressMedicalAdvisories(delegated)
        const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId)
        expect(outcome).toBeDefined()
        if (outcome === undefined) throw new Error('unreachable')
        return outcome.payload.recommendedExtraDays as number
      })
    }

    const lowQualitySamples = samplesFor(5)
    const highQualitySamples = samplesFor(100)
    const lowDispersion = lowQualitySamples.reduce((sum, value) => sum + Math.abs(value), 0)
    const highDispersion = highQualitySamples.reduce((sum, value) => sum + Math.abs(value), 0)
    expect(lowDispersion).toBeGreaterThan(highDispersion)
  })

  it('overload degradation of medicalQuality reaches the downstream recommendation: an overloaded holder disperses more than a non-overloaded one with identical attributes/temperament', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id

    function samplesWithOverload(overloaded: boolean): readonly number[] {
      return Array.from({ length: 12 }, (_, index) => index).map((index) => {
        const staffId = staffPersonIdFromString(`medical-overload-downstream-staff-${overloaded}`)
        const injury = createInjury({ id: injuryIdFromString(`medical-overload-downstream-injury-${overloaded}-${index}`), playerId: base.teams[teamId]!.rosterPlayerIds[0]!, kind: 'ankleSprain', severity: 'moderate', injuredOn: base.currentDate, expectedReturnDate: '2099-01-01' as never })
        const withInjury = updateGameWorld(base, { injuries: [...Object.values(base.injuriesById), injury] })
        const withStaff = updateGameWorld(withInjury, {
          staffPeople: [...Object.values(withInjury.staffPeopleById), { id: staffId, identity: { firstName: 'Med', lastName: 'Ic' }, professional: { attributes: { ...flatAttributes, medicalKnowledge: 100, rehabilitation: 100, analysis: 100 } } }],
          teamStaffAssignments: [...Object.values(withInjury.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`medical-overload-downstream-assignment-${overloaded}-${index}`), staffPersonId: staffId, teamId, role: 'teamDoctor', assignedOn: withInjury.currentDate }],
        })
        const personalityWorld = setPersonality(withStaff, staffId, { temperament: 50 })
        const delegated = delegateAdvisory(personalityWorld, teamId, 'returnToPlayRecommendation', 'advisory', staffId)
        const withExtraResponsibilities = overloaded
          ? updateGameWorld(delegated, {
              responsibilities: [
                ...Object.values(delegated.responsibilitiesById).filter((item) => item.id !== `responsibility:${teamId}:treatmentRecommendation` && item.id !== `responsibility:${teamId}:riskAssessment`),
                { id: `responsibility:${teamId}:treatmentRecommendation` as never, teamId, kind: 'treatmentRecommendation', mode: 'advisory', holderStaffId: staffId },
                { id: `responsibility:${teamId}:riskAssessment` as never, teamId, kind: 'riskAssessment', mode: 'advisory', holderStaffId: staffId },
              ],
            })
          : delegated
        const progressed = progressMedicalAdvisories(withExtraResponsibilities)
        const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'returnToPlayRecommendation')
        expect(outcome).toBeDefined()
        if (outcome === undefined) throw new Error('unreachable')
        return outcome.payload.recommendedExtraDays as number
      })
    }

    const nonOverloadedSamples = samplesWithOverload(false)
    const overloadedSamples = samplesWithOverload(true)
    const nonOverloadedDispersion = nonOverloadedSamples.reduce((sum, value) => sum + Math.abs(value), 0)
    const overloadedDispersion = overloadedSamples.reduce((sum, value) => sum + Math.abs(value), 0)
    expect(overloadedDispersion).toBeGreaterThanOrEqual(nonOverloadedDispersion)
  })

  it('recommendedExtraDays remains deterministic: same world produces the same result across repeated progression', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury } = withActiveInjury(base, teamId)
    const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor')
    const delegated = delegateAdvisory(withStaff, teamId, 'returnToPlayRecommendation', 'advisory', staffId)
    const first = progressMedicalAdvisories(delegated)
    const second = progressMedicalAdvisories(delegated)
    const firstOutcome = Object.values(first.delegationOutcomesById).find((item) => item.staffId === staffId)
    const secondOutcome = Object.values(second.delegationOutcomesById).find((item) => item.staffId === staffId)
    expect(firstOutcome).toBeDefined()
    expect(secondOutcome).toBeDefined()
    expect(firstOutcome?.payload.recommendedExtraDays).toBe(secondOutcome?.payload.recommendedExtraDays)
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

  /**
   * Non-vacuous no-compounding protocol (Wave 4B review Blocker 1). Exercises the exact broken
   * sequence the review called out: generate ONLY `returnToPlayRecommendation` first, accept it
   * (moving `Injury.expectedReturnDate` away from D0), THEN enable `treatmentRecommendation` and
   * generate it. The late `treatmentRecommendation` must still freeze its baseline at the
   * ORIGINAL D0 (via `resolveMedicalBaseExpectedReturnDate` finding the first outcome's already
   * frozen baseline), never at the already-adjusted date — proven by asserting the final date
   * equals `originalBase + treatment.recommendedExtraDays`, not `adjustedDate + treatment.recommendedExtraDays`.
   * No `if (x === undefined) return` early-outs are used anywhere in this test — every step
   * asserts existence explicitly before narrowing, so the test cannot silently pass without
   * exercising the second acceptance.
   */
  it('a late second medical recommendation freezes the ORIGINAL baseline, not the already-adjusted date: no compounding', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury, injury } = withActiveInjury(base, teamId)
    const originalBase = injury.expectedReturnDate

    // Step 1-2: only returnToPlayRecommendation is advisory at first.
    const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor')
    const withReturnToPlay = delegateAdvisory(withStaff, teamId, 'returnToPlayRecommendation', 'advisory', staffId)

    // Step 3-4: progress and assert the outcome genuinely exists.
    const progressedFirst = progressMedicalAdvisories(withReturnToPlay)
    const returnToPlayOutcome = Object.values(progressedFirst.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'returnToPlayRecommendation')
    expect(returnToPlayOutcome).toBeDefined()
    if (returnToPlayOutcome === undefined) throw new Error('unreachable')

    // Step 5: capture the frozen baseline from the outcome itself.
    expect(returnToPlayOutcome.payload.baseExpectedReturnDate).toBe(originalBase)

    // Step 6: accept it.
    const afterAccept = acceptMedicalRecommendation(progressedFirst, returnToPlayOutcome.id)
    expect(afterAccept.ok).toBe(true)
    if (!afterAccept.ok) throw new Error('unreachable')

    // Step 7: the injury's expectedReturnDate genuinely moved away from D0 (fixture guarantees a
    // non-zero adjustment: teamDoctor with flat 60 attributes and neutral personality yields a
    // deterministic non-zero recommendedExtraDays for this seed — asserted directly rather than assumed).
    const adjustedDays = returnToPlayOutcome.payload.recommendedExtraDays as number
    expect(adjustedDays).not.toBe(0)
    const adjustedInjury = afterAccept.world.injuriesById[injury.id]!
    expect(adjustedInjury.expectedReturnDate).not.toBe(originalBase)

    // Step 8: NOW enable treatmentRecommendation (simulating it becoming advisory later).
    const withTreatment = delegateAdvisory(afterAccept.world, teamId, 'treatmentRecommendation', 'advisory', staffId)

    // Step 9-10: progress again; assert the treatment outcome genuinely exists.
    const progressedSecond = progressMedicalAdvisories(withTreatment)
    const treatmentOutcome = Object.values(progressedSecond.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'treatmentRecommendation')
    expect(treatmentOutcome).toBeDefined()
    if (treatmentOutcome === undefined) throw new Error('unreachable')

    // Step 11: THE CRITICAL ASSERTION — the late outcome's baseline is the ORIGINAL D0, not the
    // already-adjusted date the injury currently holds.
    expect(treatmentOutcome.payload.baseExpectedReturnDate).toBe(originalBase)
    expect(treatmentOutcome.payload.baseExpectedReturnDate).not.toBe(adjustedInjury.expectedReturnDate)

    // Step 12-13: accept the treatment recommendation and assert the final date is
    // originalBase + treatment.recommendedExtraDays.
    const afterSecondAccept = acceptMedicalRecommendation(progressedSecond, treatmentOutcome.id)
    expect(afterSecondAccept.ok).toBe(true)
    if (!afterSecondAccept.ok) throw new Error('unreachable')
    const finalInjury = afterSecondAccept.world.injuriesById[injury.id]!
    const expectedFinal = new Date(`${originalBase}T00:00:00.000Z`)
    expectedFinal.setUTCDate(expectedFinal.getUTCDate() + (treatmentOutcome.payload.recommendedExtraDays as number))
    expect(finalInjury.expectedReturnDate).toBe(expectedFinal.toISOString().slice(0, 10))

    // Step 14: explicitly prove the final date was NOT computed from the returnToPlay-adjusted date.
    const wronglyCompoundedFinal = new Date(`${adjustedInjury.expectedReturnDate}T00:00:00.000Z`)
    wronglyCompoundedFinal.setUTCDate(wronglyCompoundedFinal.getUTCDate() + (treatmentOutcome.payload.recommendedExtraDays as number))
    if (adjustedDays !== 0) expect(finalInjury.expectedReturnDate).not.toBe(wronglyCompoundedFinal.toISOString().slice(0, 10))
  })

  it('baseline resolution is deterministic when prior outcomes already exist for the injury, regardless of outcome iteration order', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury, injury } = withActiveInjury(base, teamId)
    const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor')
    const delegated = delegateAdvisory(delegateAdvisory(withStaff, teamId, 'returnToPlayRecommendation', 'advisory', staffId), teamId, 'treatmentRecommendation', 'advisory', staffId)
    const first = progressMedicalAdvisories(delegated)
    const second = progressMedicalAdvisories(delegated)
    const firstOutcomes = Object.values(first.delegationOutcomesById).filter((item) => item.payload.injuryId === injury.id)
    const secondOutcomes = Object.values(second.delegationOutcomesById).filter((item) => item.payload.injuryId === injury.id)
    expect(firstOutcomes.map((item) => item.payload.baseExpectedReturnDate).sort()).toEqual(secondOutcomes.map((item) => item.payload.baseExpectedReturnDate).sort())
    for (const outcome of firstOutcomes) expect(outcome.payload.baseExpectedReturnDate).toBe(injury.expectedReturnDate)
  })

  it('exactly-once holds across repeated progression even after a baseline has been frozen by acceptance', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const { world: withInjury } = withActiveInjury(base, teamId)
    const { world: withStaff, staffId } = withStaffInRole(withInjury, teamId, 'teamDoctor')
    const delegated = delegateAdvisory(withStaff, teamId, 'returnToPlayRecommendation', 'advisory', staffId)
    const progressed = progressMedicalAdvisories(delegated)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId)
    expect(outcome).toBeDefined()
    if (outcome === undefined) throw new Error('unreachable')
    const accepted = acceptMedicalRecommendation(progressed, outcome.id)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) throw new Error('unreachable')
    const reprocessed = progressMedicalAdvisories(accepted.world)
    const outcomesForKind = Object.values(reprocessed.delegationOutcomesById).filter((item) => item.staffId === staffId && item.kind === 'returnToPlayRecommendation')
    expect(outcomesForKind).toHaveLength(1)
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
