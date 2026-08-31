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

  it('gates recruiting roles to ncaaLike ecosystems only', () => {
    expect(isStaffRoleApplicableToEcosystem('recruitingCoordinator', 'ncaaLike')).toBe(true)
    expect(isStaffRoleApplicableToEcosystem('recruitingCoordinator', 'nbaLike')).toBe(false)
    expect(isStaffRoleApplicableToEcosystem('assistantCoach', 'nbaLike')).toBe(true)
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
