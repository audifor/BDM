import type { SportsEcosystemKind } from '@/domain/ecosystem'
import type { TrainingCategory } from '@/domain/training/TrainingCatalog'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, type StaffPerson, type StaffProfessionalAttributeKey, type StaffProfessionalProfile } from './StaffPerson'
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
  /** Explicit role fit for executing Training in a category; missing categories are ineligible. */
  readonly trainingCategoryFit?: Readonly<Partial<Record<TrainingCategory, number>>>
  /** Optional module-specific fit overrides for tactical Training. */
  readonly trainingDefinitionFit?: Readonly<Record<string, number>>
}

const w = (weights: Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>>) => weights

export const STAFF_ROLE_REGISTRY: Readonly<Record<StaffRoleId, StaffRoleDefinition>> = {
  headCoach: { id: 'headCoach', department: 'coaching', seniority: 'director', capacityCost: 3, attributeWeights: w({ coaching: .22, tacticalKnowledge: .2, leadership: .18, communication: .12, motivation: .1, analysis: .08, adaptability: .06, discipline: .04 }) },
  associateCoach: { id: 'associateCoach', department: 'coaching', seniority: 'senior', capacityCost: 2, attributeWeights: w({ coaching: .22, tacticalKnowledge: .2, leadership: .14, communication: .12, motivation: .1, analysis: .1, discipline: .07, adaptability: .05 }), trainingCategoryFit: { shooting: .65, ballHandling: .55, playmaking: .95, defense: .9, rebounding: .7, tactical: .95 }, trainingDefinitionFit: { offensiveSystem: .92, spacing: .9, pickAndRollOffense: .92, defensiveSystem: .92, pickAndRollDefense: .92, transition: .88, teamCohesion: .95 } },
  assistantCoach: { id: 'assistantCoach', department: 'coaching', seniority: 'standard', capacityCost: 2, attributeWeights: w({ coaching: .2, tacticalKnowledge: .18, playerDevelopment: .14, leadership: .1, communication: .1, motivation: .1, analysis: .07, discipline: .06, adaptability: .05 }), trainingCategoryFit: { shooting: .6, finishing: .5, ballHandling: .6, playmaking: .85, defense: .85, rebounding: .7, tactical: .85 }, trainingDefinitionFit: { offensiveSystem: .85, spacing: .82, pickAndRollOffense: .85, defensiveSystem: .85, pickAndRollDefense: .85, transition: .82, teamCohesion: .9 } },
  offensiveSpecialist: { id: 'offensiveSpecialist', department: 'coaching', seniority: 'standard', capacityCost: 2, attributeWeights: w({ tacticalKnowledge: .3, coaching: .22, analysis: .18, communication: .1, playerDevelopment: .1, adaptability: .1 }), trainingCategoryFit: { playmaking: 1, tactical: .8 }, trainingDefinitionFit: { offensiveSystem: 1, spacing: 1, pickAndRollOffense: 1, defensiveSystem: .15, pickAndRollDefense: .15, transition: .9 } },
  defensiveSpecialist: { id: 'defensiveSpecialist', department: 'coaching', seniority: 'standard', capacityCost: 2, attributeWeights: w({ tacticalKnowledge: .3, coaching: .22, discipline: .18, analysis: .12, communication: .1, playerDevelopment: .08 }), trainingCategoryFit: { defense: 1, rebounding: .85, tactical: .8 }, trainingDefinitionFit: { offensiveSystem: .15, spacing: .15, defensiveSystem: 1, pickAndRollDefense: 1, transition: .55 } },
  playerDevelopmentCoach: { id: 'playerDevelopmentCoach', department: 'coaching', seniority: 'standard', capacityCost: 2, attributeWeights: w({ playerDevelopment: .34, coaching: .18, communication: .16, motivation: .14, adaptability: .1, analysis: .08 }), trainingCategoryFit: { shooting: .85, finishing: .9, ballHandling: .9, playmaking: .7, tactical: .5 }, trainingDefinitionFit: { offensiveSystem: .5, teamCohesion: .85 } },
  shootingCoach: { id: 'shootingCoach', department: 'coaching', seniority: 'junior', capacityCost: 1, attributeWeights: w({ playerDevelopment: .32, coaching: .26, communication: .16, motivation: .14, analysis: .12 }), trainingCategoryFit: { shooting: 1, finishing: .55 } },
  skillsCoach: { id: 'skillsCoach', department: 'coaching', seniority: 'junior', capacityCost: 1, attributeWeights: w({ playerDevelopment: .32, coaching: .24, communication: .16, adaptability: .14, motivation: .14 }), trainingCategoryFit: { shooting: .92, finishing: 1, ballHandling: 1, playmaking: .65, tactical: .55 }, trainingDefinitionFit: { spacing: .5, teamCohesion: .55 } },
  bigManCoach: { id: 'bigManCoach', department: 'coaching', seniority: 'junior', capacityCost: 1, attributeWeights: w({ playerDevelopment: .3, coaching: .26, tacticalKnowledge: .16, communication: .14, motivation: .14 }), trainingCategoryFit: { finishing: .85, rebounding: 1 } },

  strengthConditioningCoach: { id: 'strengthConditioningCoach', department: 'performance', seniority: 'standard', capacityCost: 2, attributeWeights: w({ discipline: .26, motivation: .2, medicalKnowledge: .16, communication: .14, adaptability: .12, leadership: .12 }), trainingCategoryFit: { physical: 1, recovery: .65 } },
  performanceCoach: { id: 'performanceCoach', department: 'performance', seniority: 'standard', capacityCost: 2, attributeWeights: w({ analysis: .24, medicalKnowledge: .2, discipline: .18, adaptability: .16, communication: .12, motivation: .1 }), trainingCategoryFit: { physical: .95, recovery: .85 }, trainingDefinitionFit: { teamCohesion: .65 } },
  loadManagementSpecialist: { id: 'loadManagementSpecialist', department: 'performance', seniority: 'junior', capacityCost: 1, attributeWeights: w({ analysis: .28, medicalKnowledge: .26, discipline: .18, adaptability: .16, communication: .12 }), trainingCategoryFit: { physical: .8, recovery: .95 } },
  developmentSpecialist: { id: 'developmentSpecialist', department: 'performance', seniority: 'junior', capacityCost: 1, attributeWeights: w({ playerDevelopment: .3, motivation: .22, communication: .18, adaptability: .16, analysis: .14 }), trainingCategoryFit: { physical: .7 } },

  teamDoctor: { id: 'teamDoctor', department: 'medical', seniority: 'director', capacityCost: 2, attributeWeights: w({ medicalKnowledge: .4, rehabilitation: .24, analysis: .14, discipline: .1, communication: .08, leadership: .04 }), trainingCategoryFit: { recovery: .75 } },
  physiotherapist: { id: 'physiotherapist', department: 'medical', seniority: 'standard', capacityCost: 2, attributeWeights: w({ medicalKnowledge: .35, rehabilitation: .3, analysis: .1, communication: .1, discipline: .05, adaptability: .05, leadership: .05 }), trainingCategoryFit: { recovery: 1 } },
  rehabilitationSpecialist: { id: 'rehabilitationSpecialist', department: 'medical', seniority: 'standard', capacityCost: 2, attributeWeights: w({ rehabilitation: .38, medicalKnowledge: .3, discipline: .12, communication: .1, adaptability: .1 }), trainingCategoryFit: { recovery: 1 } },
  sportsScientist: { id: 'sportsScientist', department: 'medical', seniority: 'standard', capacityCost: 1, attributeWeights: w({ analysis: .32, medicalKnowledge: .26, adaptability: .16, communication: .14, discipline: .12 }), trainingCategoryFit: { physical: .7, recovery: .9 } },

  headScout: { id: 'headScout', department: 'scouting', seniority: 'director', capacityCost: 2, attributeWeights: w({ talentEvaluation: .26, potentialEvaluation: .24, analysis: .16, leadership: .14, communication: .1, adaptability: .1 }) },
  regionalScout: { id: 'regionalScout', department: 'scouting', seniority: 'standard', capacityCost: 2, attributeWeights: w({ talentEvaluation: .25, potentialEvaluation: .25, analysis: .15, adaptability: .1, communication: .1, tacticalKnowledge: .05, playerDevelopment: .05, leadership: .05 }) },
  advanceScout: { id: 'advanceScout', department: 'scouting', seniority: 'standard', capacityCost: 2, attributeWeights: w({ tacticalKnowledge: .3, analysis: .28, talentEvaluation: .16, communication: .14, adaptability: .12 }) },
  collegeScout: { id: 'collegeScout', department: 'scouting', seniority: 'standard', capacityCost: 1, attributeWeights: w({ talentEvaluation: .28, potentialEvaluation: .28, analysis: .16, adaptability: .14, communication: .14 }) },
  internationalScout: { id: 'internationalScout', department: 'scouting', seniority: 'standard', capacityCost: 1, attributeWeights: w({ talentEvaluation: .26, potentialEvaluation: .26, adaptability: .2, analysis: .14, communication: .14 }) },
  proScout: { id: 'proScout', department: 'scouting', seniority: 'standard', capacityCost: 1, attributeWeights: w({ talentEvaluation: .3, analysis: .24, potentialEvaluation: .18, adaptability: .14, communication: .14 }) },

  generalManager: { id: 'generalManager', department: 'basketballOperations', seniority: 'director', capacityCost: 3, attributeWeights: w({ analysis: .22, leadership: .2, talentEvaluation: .18, communication: .16, adaptability: .14, discipline: .1 }) },
  assistantGeneralManager: { id: 'assistantGeneralManager', department: 'basketballOperations', seniority: 'senior', capacityCost: 2, attributeWeights: w({ analysis: .24, talentEvaluation: .2, leadership: .16, communication: .16, adaptability: .14, discipline: .1 }) },
  directorOfBasketballOperations: { id: 'directorOfBasketballOperations', department: 'basketballOperations', seniority: 'director', capacityCost: 2, attributeWeights: w({ leadership: .24, analysis: .2, communication: .18, discipline: .14, adaptability: .14, talentEvaluation: .1 }) },
  sportingDirector: { id: 'sportingDirector', department: 'basketballOperations', seniority: 'director', capacityCost: 2, attributeWeights: w({ leadership: .24, analysis: .18, talentEvaluation: .18, communication: .16, adaptability: .14, discipline: .1 }) },
  analyticsStaff: { id: 'analyticsStaff', department: 'basketballOperations', seniority: 'standard', capacityCost: 1, attributeWeights: w({ analysis: .5, talentEvaluation: .18, adaptability: .16, communication: .16 }), trainingCategoryFit: { playmaking: .55, defense: .55, tactical: .65 }, trainingDefinitionFit: { offensiveSystem: .6, spacing: .65, pickAndRollOffense: .65, defensiveSystem: .6, pickAndRollDefense: .65 } },
  capContractsSpecialist: { id: 'capContractsSpecialist', department: 'basketballOperations', seniority: 'standard', capacityCost: 1, attributeWeights: w({ analysis: .4, discipline: .24, communication: .18, adaptability: .18 }) },

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

/** Canonical role fit for executing one concrete Training definition. No registered fit means the role is not eligible. */
export function trainingStaffRoleFit(roleId: StaffRoleId, category: TrainingCategory, definitionId: string): number | undefined {
  const role = staffRoleDefinition(roleId)
  return role.trainingDefinitionFit?.[definitionId] ?? role.trainingCategoryFit?.[category]
}

export function isTrainingStaffRoleEligible(roleId: StaffRoleId, category: TrainingCategory, definitionId: string): boolean {
  return trainingStaffRoleFit(roleId, category, definitionId) !== undefined
}

export function isStaffRoleApplicableToEcosystem(roleId: StaffRoleId, ecosystemKind: SportsEcosystemKind): boolean {
  const applicable = staffRoleDefinition(roleId).applicableEcosystemKinds
  return applicable === undefined || applicable.includes(ecosystemKind)
}

/** Generalized proficiency: reads weights from `STAFF_ROLE_REGISTRY` instead of a closed switch. */
export function calculateStaffRoleProficiencyByRoleId(person: StaffPerson, roleId: StaffRoleId): number {
  return calculateStaffRoleProficiencyFromProfile(person.professional, roleId)
}

/** Shared profile-based calculation for role proficiency when a consumer has canonical professional truth only. */
export function calculateStaffRoleProficiencyFromProfile(professional: StaffProfessionalProfile, roleId: StaffRoleId): number {
  const weights = staffRoleDefinition(roleId).attributeWeights
  return Math.round(
    Object.entries(weights).reduce((sum, [key, weight]) => sum + professional.attributes[key as StaffProfessionalAttributeKey] * weight!, 0),
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
