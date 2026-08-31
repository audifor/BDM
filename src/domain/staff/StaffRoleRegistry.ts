import type { SportsEcosystemKind } from '@/domain/ecosystem'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, type StaffPerson, type StaffProfessionalAttributeKey } from './StaffPerson'
import { STAFF_ROLE_IDS, type StaffRoleId } from './StaffRoleId'

export { STAFF_ROLE_IDS, ASSIGNABLE_STAFF_ROLE_IDS, type StaffRoleId } from './StaffRoleId'

/** Stable organizational grouping used for UI sectioning and workload aggregation. Does not vary by ecosystem. */
export const STAFF_DEPARTMENTS = ['coaching', 'performance', 'medical', 'scouting', 'basketballOperations', 'recruiting'] as const
export type StaffDepartment = typeof STAFF_DEPARTMENTS[number]

/**
 * Canonical, data-driven, extensible role catalogue (`StaffRoleId` definitions live in
 * `StaffRoleId.ts`). Adding a role means adding one registry entry
 * (id/department/seniority/weights/capacityCost/optional ecosystem gating) — never a new
 * switch/if-chain in UI or engine code.
 */

export type StaffRoleSeniority = 'junior' | 'standard' | 'senior' | 'director'

export interface StaffRoleDefinition {
  readonly id: StaffRoleId
  readonly department: StaffDepartment
  readonly seniority: StaffRoleSeniority
  readonly attributeWeights: Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>>
  /** undefined = universal across every ecosystem kind. */
  readonly applicableEcosystemKinds?: readonly SportsEcosystemKind[]
  /** Default workload units consumed per assignment. See `@/domain/responsibility` for the workload model. */
  readonly capacityCost: number
}

const w = (weights: Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>>) => weights

export const STAFF_ROLE_REGISTRY: Readonly<Record<StaffRoleId, StaffRoleDefinition>> = {
  headCoach: { id: 'headCoach', department: 'coaching', seniority: 'director', capacityCost: 3, attributeWeights: w({ coaching: .22, tacticalKnowledge: .2, leadership: .18, communication: .12, motivation: .1, analysis: .08, adaptability: .06, discipline: .04 }) },
  associateCoach: { id: 'associateCoach', department: 'coaching', seniority: 'senior', capacityCost: 2, attributeWeights: w({ coaching: .22, tacticalKnowledge: .2, leadership: .14, communication: .12, motivation: .1, analysis: .1, discipline: .07, adaptability: .05 }) },
  assistantCoach: { id: 'assistantCoach', department: 'coaching', seniority: 'standard', capacityCost: 2, attributeWeights: w({ coaching: .2, tacticalKnowledge: .18, playerDevelopment: .14, leadership: .1, communication: .1, motivation: .1, analysis: .07, discipline: .06, adaptability: .05 }) },
  offensiveSpecialist: { id: 'offensiveSpecialist', department: 'coaching', seniority: 'standard', capacityCost: 2, attributeWeights: w({ tacticalKnowledge: .3, coaching: .22, analysis: .18, communication: .1, playerDevelopment: .1, adaptability: .1 }) },
  defensiveSpecialist: { id: 'defensiveSpecialist', department: 'coaching', seniority: 'standard', capacityCost: 2, attributeWeights: w({ tacticalKnowledge: .3, coaching: .22, discipline: .18, analysis: .12, communication: .1, playerDevelopment: .08 }) },
  playerDevelopmentCoach: { id: 'playerDevelopmentCoach', department: 'coaching', seniority: 'standard', capacityCost: 2, attributeWeights: w({ playerDevelopment: .34, coaching: .18, communication: .16, motivation: .14, adaptability: .1, analysis: .08 }) },
  shootingCoach: { id: 'shootingCoach', department: 'coaching', seniority: 'junior', capacityCost: 1, attributeWeights: w({ playerDevelopment: .32, coaching: .26, communication: .16, motivation: .14, analysis: .12 }) },
  skillsCoach: { id: 'skillsCoach', department: 'coaching', seniority: 'junior', capacityCost: 1, attributeWeights: w({ playerDevelopment: .32, coaching: .24, communication: .16, adaptability: .14, motivation: .14 }) },
  bigManCoach: { id: 'bigManCoach', department: 'coaching', seniority: 'junior', capacityCost: 1, attributeWeights: w({ playerDevelopment: .3, coaching: .26, tacticalKnowledge: .16, communication: .14, motivation: .14 }) },

  strengthConditioningCoach: { id: 'strengthConditioningCoach', department: 'performance', seniority: 'standard', capacityCost: 2, attributeWeights: w({ discipline: .26, motivation: .2, medicalKnowledge: .16, communication: .14, adaptability: .12, leadership: .12 }) },
  performanceCoach: { id: 'performanceCoach', department: 'performance', seniority: 'standard', capacityCost: 2, attributeWeights: w({ analysis: .24, medicalKnowledge: .2, discipline: .18, adaptability: .16, communication: .12, motivation: .1 }) },
  loadManagementSpecialist: { id: 'loadManagementSpecialist', department: 'performance', seniority: 'junior', capacityCost: 1, attributeWeights: w({ analysis: .28, medicalKnowledge: .26, discipline: .18, adaptability: .16, communication: .12 }) },
  developmentSpecialist: { id: 'developmentSpecialist', department: 'performance', seniority: 'junior', capacityCost: 1, attributeWeights: w({ playerDevelopment: .3, motivation: .22, communication: .18, adaptability: .16, analysis: .14 }) },

  teamDoctor: { id: 'teamDoctor', department: 'medical', seniority: 'director', capacityCost: 2, attributeWeights: w({ medicalKnowledge: .4, rehabilitation: .24, analysis: .14, discipline: .1, communication: .08, leadership: .04 }) },
  physiotherapist: { id: 'physiotherapist', department: 'medical', seniority: 'standard', capacityCost: 2, attributeWeights: w({ medicalKnowledge: .35, rehabilitation: .3, analysis: .1, communication: .1, discipline: .05, adaptability: .05, leadership: .05 }) },
  rehabilitationSpecialist: { id: 'rehabilitationSpecialist', department: 'medical', seniority: 'standard', capacityCost: 2, attributeWeights: w({ rehabilitation: .38, medicalKnowledge: .3, discipline: .12, communication: .1, adaptability: .1 }) },
  sportsScientist: { id: 'sportsScientist', department: 'medical', seniority: 'standard', capacityCost: 1, attributeWeights: w({ analysis: .32, medicalKnowledge: .26, adaptability: .16, communication: .14, discipline: .12 }) },

  headScout: { id: 'headScout', department: 'scouting', seniority: 'director', capacityCost: 2, attributeWeights: w({ talentEvaluation: .26, potentialEvaluation: .24, analysis: .16, leadership: .14, communication: .1, adaptability: .1 }) },
  regionalScout: { id: 'regionalScout', department: 'scouting', seniority: 'standard', capacityCost: 2, attributeWeights: w({ talentEvaluation: .25, potentialEvaluation: .25, analysis: .15, adaptability: .1, communication: .1, tacticalKnowledge: .05, playerDevelopment: .05, leadership: .05 }) },
  advanceScout: { id: 'advanceScout', department: 'scouting', seniority: 'standard', capacityCost: 2, attributeWeights: w({ tacticalKnowledge: .3, analysis: .28, talentEvaluation: .16, communication: .14, adaptability: .12 }) },
  collegeScout: { id: 'collegeScout', department: 'scouting', seniority: 'standard', capacityCost: 1, applicableEcosystemKinds: ['ncaaLike'], attributeWeights: w({ talentEvaluation: .28, potentialEvaluation: .28, analysis: .16, adaptability: .14, communication: .14 }) },
  internationalScout: { id: 'internationalScout', department: 'scouting', seniority: 'standard', capacityCost: 1, attributeWeights: w({ talentEvaluation: .26, potentialEvaluation: .26, adaptability: .2, analysis: .14, communication: .14 }) },
  proScout: { id: 'proScout', department: 'scouting', seniority: 'standard', capacityCost: 1, applicableEcosystemKinds: ['nbaLike', 'fibaLike'], attributeWeights: w({ talentEvaluation: .3, analysis: .24, potentialEvaluation: .18, adaptability: .14, communication: .14 }) },

  generalManager: { id: 'generalManager', department: 'basketballOperations', seniority: 'director', capacityCost: 3, applicableEcosystemKinds: ['nbaLike', 'fibaLike'], attributeWeights: w({ analysis: .22, leadership: .2, talentEvaluation: .18, communication: .16, adaptability: .14, discipline: .1 }) },
  assistantGeneralManager: { id: 'assistantGeneralManager', department: 'basketballOperations', seniority: 'senior', capacityCost: 2, applicableEcosystemKinds: ['nbaLike', 'fibaLike'], attributeWeights: w({ analysis: .24, talentEvaluation: .2, leadership: .16, communication: .16, adaptability: .14, discipline: .1 }) },
  directorOfBasketballOperations: { id: 'directorOfBasketballOperations', department: 'basketballOperations', seniority: 'director', capacityCost: 2, attributeWeights: w({ leadership: .24, analysis: .2, communication: .18, discipline: .14, adaptability: .14, talentEvaluation: .1 }) },
  sportingDirector: { id: 'sportingDirector', department: 'basketballOperations', seniority: 'director', capacityCost: 2, attributeWeights: w({ leadership: .24, analysis: .18, talentEvaluation: .18, communication: .16, adaptability: .14, discipline: .1 }) },
  analyticsStaff: { id: 'analyticsStaff', department: 'basketballOperations', seniority: 'standard', capacityCost: 1, attributeWeights: w({ analysis: .5, talentEvaluation: .18, adaptability: .16, communication: .16 }) },
  capContractsSpecialist: { id: 'capContractsSpecialist', department: 'basketballOperations', seniority: 'standard', capacityCost: 1, applicableEcosystemKinds: ['nbaLike'], attributeWeights: w({ analysis: .4, discipline: .24, communication: .18, adaptability: .18 }) },

  recruitingCoordinator: { id: 'recruitingCoordinator', department: 'recruiting', seniority: 'senior', capacityCost: 2, applicableEcosystemKinds: ['ncaaLike'], attributeWeights: w({ talentEvaluation: .24, communication: .22, leadership: .16, adaptability: .16, potentialEvaluation: .12, analysis: .1 }) },
  positionalRecruiter: { id: 'positionalRecruiter', department: 'recruiting', seniority: 'standard', capacityCost: 1, applicableEcosystemKinds: ['ncaaLike'], attributeWeights: w({ talentEvaluation: .26, communication: .24, potentialEvaluation: .18, adaptability: .16, analysis: .16 }) },
}

/** Legacy `StaffRole` (`assistantCoach`/`scout`/`medical`) mapped onto the widened registry. */
export const LEGACY_STAFF_ROLE_TO_ROLE_ID = {
  assistantCoach: 'assistantCoach',
  scout: 'regionalScout',
  medical: 'physiotherapist',
} as const satisfies Readonly<Record<'assistantCoach' | 'scout' | 'medical', StaffRoleId>>

export function staffRoleDefinition(roleId: StaffRoleId): StaffRoleDefinition {
  const definition = STAFF_ROLE_REGISTRY[roleId]
  if (definition === undefined) throw new RangeError(`Unknown Staff role id: ${roleId}`)
  return definition
}

export function isStaffRoleApplicableToEcosystem(roleId: StaffRoleId, ecosystemKind: SportsEcosystemKind): boolean {
  const applicable = staffRoleDefinition(roleId).applicableEcosystemKinds
  return applicable === undefined || applicable.includes(ecosystemKind)
}

/** Generalized proficiency: reads weights from `STAFF_ROLE_REGISTRY` instead of a closed switch. */
export function calculateStaffRoleProficiencyByRoleId(person: StaffPerson, roleId: StaffRoleId): number {
  const weights = staffRoleDefinition(roleId).attributeWeights
  return Math.round(
    Object.entries(weights).reduce((sum, [key, weight]) => sum + person.professional.attributes[key as StaffProfessionalAttributeKey] * weight!, 0),
  )
}

export function staffRoleIdsInDepartment(department: StaffDepartment): readonly StaffRoleId[] {
  return STAFF_ROLE_IDS.filter((id) => STAFF_ROLE_REGISTRY[id].department === department)
}

function assertWeightsAreWellFormed(): void {
  for (const definition of Object.values(STAFF_ROLE_REGISTRY)) {
    for (const key of Object.keys(definition.attributeWeights)) {
      if (!STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.includes(key as StaffProfessionalAttributeKey)) {
        throw new RangeError(`Staff role ${definition.id} references unknown attribute ${key}`)
      }
    }
  }
}
assertWeightsAreWellFormed()
