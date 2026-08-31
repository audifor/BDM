import { staffPersonIdFromString } from '@/domain/ids'
import { describe, expect, it } from 'vitest'
import { calculateStaffRoleProficiency, createStaffPerson, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, STAFF_ROLE_ATTRIBUTE_WEIGHTS, STAFF_ROLES, type StaffRole } from './StaffPerson'
import { calculateStaffRoleProficiencyByRoleId, isStaffRoleApplicableToEcosystem, LEGACY_STAFF_ROLE_TO_ROLE_ID, STAFF_DEPARTMENTS, staffRoleDefinition, STAFF_ROLE_IDS, STAFF_ROLE_REGISTRY, staffRoleIdsInDepartment } from './StaffRoleRegistry'

const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 40])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const staff = createStaffPerson({ id: staffPersonIdFromString('staff-registry-test'), identity: { firstName: 'Nia', lastName: 'Okoye' }, professional: { attributes: { ...attributes, coaching: 70, tacticalKnowledge: 60, medicalKnowledge: 20 } } })

describe('STAFF_ROLE_REGISTRY', () => {
  it('exists and has unique ids matching StaffRoleId', () => {
    expect(STAFF_ROLE_IDS.length).toBeGreaterThan(0)
    expect(new Set(STAFF_ROLE_IDS).size).toBe(STAFF_ROLE_IDS.length)
    for (const id of STAFF_ROLE_IDS) expect(STAFF_ROLE_REGISTRY[id].id).toBe(id)
  })

  it('every entry belongs to a canonical department', () => {
    for (const definition of Object.values(STAFF_ROLE_REGISTRY)) expect(STAFF_DEPARTMENTS).toContain(definition.department)
  })

  it('supports lookup and throws for unknown ids', () => {
    expect(staffRoleDefinition('headScout').department).toBe('scouting')
    expect(() => staffRoleDefinition('notARole' as never)).toThrow()
  })

  it('every entry has attribute weights summing to a sane bounded range', () => {
    for (const definition of Object.values(STAFF_ROLE_REGISTRY)) {
      const sum = Object.values(definition.attributeWeights).reduce((total, value) => total + (value ?? 0), 0)
      expect(sum).toBeGreaterThan(0.9)
      expect(sum).toBeLessThanOrEqual(1.0001)
    }
  })

  // §6.5 of docs/STAFF_SYSTEM_V2.md: for Wave 1, only the Recruiting department is hard-gated to
  // ncaaLike. No other department may introduce ecosystem restrictions the spec does not require —
  // in particular General Manager, Assistant General Manager, and Cap/Contracts Specialist must
  // remain universal in this wave (they are "most meaningful" under nbaLike per the spec's prose,
  // but that is not the same as being hard-gated away from other ecosystems).
  describe('ecosystem gating (§6.5: Recruiting is the only hard-gated department in Wave 1)', () => {
    it('recruitingCoordinator is applicable in ncaaLike', () => {
      expect(isStaffRoleApplicableToEcosystem('recruitingCoordinator', 'ncaaLike')).toBe(true)
    })
    it('recruitingCoordinator is NOT applicable in nbaLike', () => {
      expect(isStaffRoleApplicableToEcosystem('recruitingCoordinator', 'nbaLike')).toBe(false)
    })
    it('recruitingCoordinator is NOT applicable in fibaLike', () => {
      expect(isStaffRoleApplicableToEcosystem('recruitingCoordinator', 'fibaLike')).toBe(false)
    })
    it('positionalRecruiter follows the same ncaaLike-only rule as recruitingCoordinator', () => {
      expect(isStaffRoleApplicableToEcosystem('positionalRecruiter', 'ncaaLike')).toBe(true)
      expect(isStaffRoleApplicableToEcosystem('positionalRecruiter', 'nbaLike')).toBe(false)
      expect(isStaffRoleApplicableToEcosystem('positionalRecruiter', 'fibaLike')).toBe(false)
    })
    it('generalManager is valid in ncaaLike, nbaLike and fibaLike — not artificially restricted', () => {
      expect(isStaffRoleApplicableToEcosystem('generalManager', 'ncaaLike')).toBe(true)
      expect(isStaffRoleApplicableToEcosystem('generalManager', 'nbaLike')).toBe(true)
      expect(isStaffRoleApplicableToEcosystem('generalManager', 'fibaLike')).toBe(true)
    })
    it('assistantGeneralManager is valid in ncaaLike, nbaLike and fibaLike', () => {
      expect(isStaffRoleApplicableToEcosystem('assistantGeneralManager', 'ncaaLike')).toBe(true)
      expect(isStaffRoleApplicableToEcosystem('assistantGeneralManager', 'nbaLike')).toBe(true)
      expect(isStaffRoleApplicableToEcosystem('assistantGeneralManager', 'fibaLike')).toBe(true)
    })
    it('capContractsSpecialist is valid in ncaaLike, nbaLike and fibaLike — not hard-gated to nbaLike in this wave', () => {
      expect(isStaffRoleApplicableToEcosystem('capContractsSpecialist', 'ncaaLike')).toBe(true)
      expect(isStaffRoleApplicableToEcosystem('capContractsSpecialist', 'nbaLike')).toBe(true)
      expect(isStaffRoleApplicableToEcosystem('capContractsSpecialist', 'fibaLike')).toBe(true)
    })
    it('a universal role like assistantCoach is valid in all three ecosystem kinds', () => {
      expect(isStaffRoleApplicableToEcosystem('assistantCoach', 'ncaaLike')).toBe(true)
      expect(isStaffRoleApplicableToEcosystem('assistantCoach', 'nbaLike')).toBe(true)
      expect(isStaffRoleApplicableToEcosystem('assistantCoach', 'fibaLike')).toBe(true)
    })
    it('non-Recruiting scouts (collegeScout, proScout, internationalScout, regionalScout, headScout, advanceScout) carry no artificial ecosystem restriction', () => {
      for (const scoutRole of ['collegeScout', 'proScout', 'internationalScout', 'regionalScout', 'headScout', 'advanceScout'] as const) {
        expect(isStaffRoleApplicableToEcosystem(scoutRole, 'ncaaLike')).toBe(true)
        expect(isStaffRoleApplicableToEcosystem(scoutRole, 'nbaLike')).toBe(true)
        expect(isStaffRoleApplicableToEcosystem(scoutRole, 'fibaLike')).toBe(true)
      }
    })
    it('only the Recruiting department declares applicableEcosystemKinds in Wave 1 — no other department introduces hard gating', () => {
      for (const definition of Object.values(STAFF_ROLE_REGISTRY)) {
        if (definition.department === 'recruiting') expect(definition.applicableEcosystemKinds).toEqual(['ncaaLike'])
        else expect(definition.applicableEcosystemKinds).toBeUndefined()
      }
    })
  })

  it('groups role ids by department', () => {
    const coaching = staffRoleIdsInDepartment('coaching')
    expect(coaching).toContain('assistantCoach')
    expect(coaching).toContain('headCoach')
    expect(coaching.every((id) => STAFF_ROLE_REGISTRY[id].department === 'coaching')).toBe(true)
  })

  it('maps every legacy StaffRole onto a valid registry entry', () => {
    for (const legacyRole of STAFF_ROLES) {
      const mapped = LEGACY_STAFF_ROLE_TO_ROLE_ID[legacyRole]
      expect(STAFF_ROLE_REGISTRY[mapped]).toBeDefined()
    }
  })

  it('produces byte-identical proficiency scores to the legacy closed-role calculation for all three legacy roles', () => {
    for (const legacyRole of STAFF_ROLES) {
      const mappedRoleId = LEGACY_STAFF_ROLE_TO_ROLE_ID[legacyRole]
      expect(calculateStaffRoleProficiencyByRoleId(staff, mappedRoleId)).toBe(calculateStaffRoleProficiency(staff, legacyRole))
    }
  })

  it('keeps the legacy STAFF_ROLE_ATTRIBUTE_WEIGHTS identical to the registry seed data for legacy roles', () => {
    for (const legacyRole of STAFF_ROLES as readonly StaffRole[]) {
      const mappedRoleId = LEGACY_STAFF_ROLE_TO_ROLE_ID[legacyRole]
      expect(STAFF_ROLE_REGISTRY[mappedRoleId].attributeWeights).toEqual(STAFF_ROLE_ATTRIBUTE_WEIGHTS[legacyRole])
    }
  })
})
