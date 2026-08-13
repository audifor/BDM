import { staffPersonIdFromString, teamIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createGameDate } from '@/domain/date'
import { describe, expect, it } from 'vitest'
import { calculateStaffRoleProficiency, createStaffPerson, createTeamStaffAssignment, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, STAFF_ROLE_ATTRIBUTE_WEIGHTS } from './StaffPerson'

const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 20])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number],number>
const medical = createStaffPerson({id:staffPersonIdFromString('staff-medical'),identity:{firstName:'Mira',lastName:'Vale'},professional:{attributes:{...attributes,coaching:24,tacticalKnowledge:18,medicalKnowledge:90,rehabilitation:86}}})
describe('StaffPerson',()=>{
  it('uses exactly the common thirteen professional attributes',()=>expect(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS).toHaveLength(13))
  it('rejects missing and invalid professional attributes',()=>{const {coaching:_missing,...missing}=attributes;expect(()=>createStaffPerson({...medical,professional:{attributes:missing as typeof attributes}})).toThrow();expect(()=>createStaffPerson({...medical,professional:{attributes:{...attributes,coaching:101}}})).toThrow();expect(()=>createStaffPerson({...medical,professional:{attributes:{...attributes,coaching:1.5}}})).toThrow()})
  it('derives role proficiency for every role from centralized weights',()=>{for(const weights of Object.values(STAFF_ROLE_ATTRIBUTE_WEIGHTS))expect(Object.values(weights).reduce((sum,value)=>sum+value,0)).toBeCloseTo(1);expect(calculateStaffRoleProficiency(medical,'medical')).toBeGreaterThan(calculateStaffRoleProficiency(medical,'assistantCoach'));expect(()=>calculateStaffRoleProficiency(medical,'scout')).not.toThrow()})
  it('validates role assignment structure without making role part of the person',()=>expect(createTeamStaffAssignment({id:teamStaffAssignmentIdFromString('assignment'),staffPersonId:medical.id,teamId:teamIdFromString('team'),role:'medical',assignedOn:createGameDate(2032,10,1)}).role).toBe('medical'))
})
