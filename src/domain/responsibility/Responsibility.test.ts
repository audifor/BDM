import { createGameDate } from '@/domain/date'
import { staffPersonIdFromString, teamIdFromString } from '@/domain/ids'
import { createStaffPerson, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { describe, expect, it } from 'vitest'
import {
  createDelegationOutcome,
  createResponsibility,
  delegationOutcomeIdFromString,
  RESPONSIBILITY_DOMAINS,
  RESPONSIBILITY_KINDS,
  RESPONSIBILITY_MODES,
  RESPONSIBILITY_REGISTRY,
  responsibilityDefinition,
  responsibilityIdForTeam,
  responsibilityIdFromString,
  validateResponsibilityAssignment,
} from './Responsibility'

const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const scout = createStaffPerson({ id: staffPersonIdFromString('resp-staff-scout'), identity: { firstName: 'Rin', lastName: 'Aoki' }, professional: { attributes } })
const teamId = teamIdFromString('resp-team-1')

describe('RESPONSIBILITY_REGISTRY', () => {
  it('covers exactly the canonical domains and kinds', () => {
    for (const kind of RESPONSIBILITY_KINDS) expect(RESPONSIBILITY_DOMAINS).toContain(RESPONSIBILITY_REGISTRY[kind].domain)
  })

  it('every kind supports its own default mode', () => {
    for (const kind of RESPONSIBILITY_KINDS) {
      const definition = RESPONSIBILITY_REGISTRY[kind]
      expect(definition.supportedModes).toContain(definition.defaultMode)
      for (const mode of definition.supportedModes) expect(RESPONSIBILITY_MODES).toContain(mode)
    }
  })

  it('carries workload metadata as a positive integer', () => {
    for (const kind of RESPONSIBILITY_KINDS) expect(RESPONSIBILITY_REGISTRY[kind].capacityCost).toBeGreaterThan(0)
  })

  it('throws for an unknown kind lookup', () => {
    expect(() => responsibilityDefinition('unknownKind' as never)).toThrow()
  })

  it('gives rotationPlanning to the Head Coach only, with no eligible Staff role', () => {
    expect(RESPONSIBILITY_REGISTRY.rotationPlanning.eligibleParticipant).toBe('coach')
    expect(RESPONSIBILITY_REGISTRY.rotationPlanning.eligibleRoleIds).toHaveLength(0)
  })
})

describe('createResponsibility', () => {
  it('accepts a valid vacant userControlled row (the Wave 1 default)', () => {
    const responsibility = createResponsibility({ id: responsibilityIdForTeam(teamId, 'assignScouts'), teamId, kind: 'assignScouts', mode: 'userControlled' })
    expect(responsibility.mode).toBe('userControlled')
    expect(responsibility.holderStaffId).toBeUndefined()
  })

  it('rejects a mode the responsibility kind does not support', () => {
    expect(() => createResponsibility({ id: responsibilityIdForTeam(teamId, 'rotationPlanning'), teamId, kind: 'rotationPlanning', mode: 'delegated' })).toThrow()
  })

  it('rejects a holder on a userControlled/organizational row', () => {
    expect(() => createResponsibility({ id: responsibilityIdForTeam(teamId, 'assignScouts'), teamId, kind: 'assignScouts', mode: 'userControlled', holderStaffId: scout.id })).toThrow()
  })
})

describe('validateResponsibilityAssignment', () => {
  it('accepts an eligible role for a delegated responsibility', () => {
    expect(validateResponsibilityAssignment('assignScouts', 'delegated', 'headScout', scout)).toEqual({ ok: true })
  })

  it('rejects an ineligible staff role — a staff member who does not meet a responsibility restriction must not be assignable silently', () => {
    const result = validateResponsibilityAssignment('assignScouts', 'delegated', 'physiotherapist', scout)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('ineligibleRole')
  })

  it('rejects a mode unsupported by the responsibility', () => {
    const result = validateResponsibilityAssignment('rotationPlanning', 'delegated', undefined, undefined)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('unsupportedMode')
  })

  it('rejects assigning a Staff holder to a Head-Coach-only responsibility', () => {
    const result = validateResponsibilityAssignment('rotationPlanning', 'userControlled', 'assistantCoach', scout)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('headCoachOnly')
  })

  it('rejects an unknown responsibility kind', () => {
    expect(validateResponsibilityAssignment('unknownKind' as never, 'userControlled', undefined, undefined).reason).toBe('unknownKind')
  })
})

describe('DelegationOutcome foundation', () => {
  it('constructs a valid outcome and clamps quality score validation', () => {
    const outcome = createDelegationOutcome({
      id: delegationOutcomeIdFromString('outcome-1'),
      responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'assignScouts')),
      staffId: scout.id,
      decidedOn: createGameDate(2032, 10, 1),
      kind: 'assignScouts',
      applied: true,
      qualityScore: 72,
      payload: { note: 'ok', count: 3 },
    })
    expect(outcome.qualityScore).toBe(72)
    expect(outcome.payload).toEqual({ note: 'ok', count: 3 })
  })

  it('rejects a non-integer or out-of-range quality score', () => {
    const base = { id: delegationOutcomeIdFromString('outcome-2'), responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'assignScouts')), staffId: scout.id, decidedOn: createGameDate(2032, 10, 1), kind: 'assignScouts' as const, applied: false, payload: {} }
    expect(() => createDelegationOutcome({ ...base, qualityScore: 101 })).toThrow()
    expect(() => createDelegationOutcome({ ...base, qualityScore: -1 })).toThrow()
    expect(() => createDelegationOutcome({ ...base, qualityScore: 1.5 })).toThrow()
  })

  it('a legacy outcome with no userDisposition/userDecidedOn remains valid (Wave 4C3 additive backward compatibility)', () => {
    const outcome = createDelegationOutcome({
      id: delegationOutcomeIdFromString('outcome-legacy'),
      responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'assignScouts')),
      staffId: scout.id,
      decidedOn: createGameDate(2032, 10, 1),
      kind: 'assignScouts',
      applied: true,
      qualityScore: 55,
      payload: {},
    })
    expect(outcome.userDisposition).toBeUndefined()
    expect(outcome.userDecidedOn).toBeUndefined()
  })

  it('accepts a coherent accepted disposition (applied true, userDecidedOn set)', () => {
    const outcome = createDelegationOutcome({
      id: delegationOutcomeIdFromString('outcome-accepted'),
      responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'treatmentRecommendation')),
      staffId: scout.id,
      decidedOn: createGameDate(2032, 10, 1),
      kind: 'treatmentRecommendation',
      applied: true,
      qualityScore: 55,
      payload: {},
      userDisposition: 'accepted',
      userDecidedOn: createGameDate(2032, 10, 2),
    })
    expect(outcome.userDisposition).toBe('accepted')
    expect(outcome.userDecidedOn).toBe(createGameDate(2032, 10, 2))
    expect(outcome.applied).toBe(true)
  })

  it('accepts a coherent dismissed disposition (applied false, userDecidedOn set)', () => {
    const outcome = createDelegationOutcome({
      id: delegationOutcomeIdFromString('outcome-dismissed'),
      responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'oppositionScouting')),
      staffId: scout.id,
      decidedOn: createGameDate(2032, 10, 1),
      kind: 'oppositionScouting',
      applied: false,
      qualityScore: 55,
      payload: {},
      userDisposition: 'dismissed',
      userDecidedOn: createGameDate(2032, 10, 2),
    })
    expect(outcome.userDisposition).toBe('dismissed')
    expect(outcome.applied).toBe(false)
  })

  it('rejects userDisposition without userDecidedOn, and incoherent applied/disposition combinations', () => {
    const base = { id: delegationOutcomeIdFromString('outcome-invalid'), responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'assignScouts')), staffId: scout.id, decidedOn: createGameDate(2032, 10, 1), kind: 'assignScouts' as const, qualityScore: 50, payload: {} }
    expect(() => createDelegationOutcome({ ...base, applied: true, userDisposition: 'accepted' })).toThrow()
    expect(() => createDelegationOutcome({ ...base, applied: false, userDisposition: 'accepted', userDecidedOn: createGameDate(2032, 10, 2) })).toThrow()
    expect(() => createDelegationOutcome({ ...base, applied: true, userDisposition: 'dismissed', userDecidedOn: createGameDate(2032, 10, 2) })).toThrow()
  })

  it('rejects userDecidedOn without userDisposition (bidirectional invariant)', () => {
    const base = { id: delegationOutcomeIdFromString('outcome-decidedon-only'), responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'assignScouts')), staffId: scout.id, decidedOn: createGameDate(2032, 10, 1), kind: 'assignScouts' as const, applied: false, qualityScore: 50, payload: {} }
    expect(() => createDelegationOutcome({ ...base, userDecidedOn: createGameDate(2032, 10, 2) })).toThrow(RangeError)
  })

  it('rejects a runtime-invalid userDisposition value that is not accepted/dismissed', () => {
    const base = { id: delegationOutcomeIdFromString('outcome-bad-disposition'), responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'assignScouts')), staffId: scout.id, decidedOn: createGameDate(2032, 10, 1), kind: 'assignScouts' as const, applied: false, qualityScore: 50, payload: {} }
    expect(() => createDelegationOutcome({ ...base, userDisposition: 'whatever' as never, userDecidedOn: createGameDate(2032, 10, 2) })).toThrow(RangeError)
  })

  it('legacy outcome with neither field remains valid', () => {
    const outcome = createDelegationOutcome({
      id: delegationOutcomeIdFromString('outcome-legacy-neither'),
      responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'assignScouts')),
      staffId: scout.id,
      decidedOn: createGameDate(2032, 10, 1),
      kind: 'assignScouts',
      applied: false,
      qualityScore: 50,
      payload: {},
    })
    expect(outcome.userDisposition).toBeUndefined()
    expect(outcome.userDecidedOn).toBeUndefined()
  })

  it('parses userDecidedOn as a GameDate', () => {
    const outcome = createDelegationOutcome({
      id: delegationOutcomeIdFromString('outcome-date'),
      responsibilityId: responsibilityIdFromString(responsibilityIdForTeam(teamId, 'assignScouts')),
      staffId: scout.id,
      decidedOn: createGameDate(2032, 10, 1),
      kind: 'assignScouts',
      applied: false,
      qualityScore: 50,
      payload: {},
      userDisposition: 'dismissed',
      userDecidedOn: '2032-10-03' as never,
    })
    expect(outcome.userDecidedOn).toBe(createGameDate(2032, 10, 3))
  })
})
