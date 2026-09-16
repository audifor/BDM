/**
 * Canonical, data-driven, extensible role id catalogue — the real assignment authority for
 * `TeamStaffAssignment.role` (see `StaffPerson.ts`) and for `StaffRoleDefinition.id` (see
 * `StaffRoleRegistry.ts`). Split into its own leaf module (no dependencies) because both of
 * those files need it and must not import each other.
 *
 * `headCoach` is the canonical coaching role on a StaffProfile. The `Coach` entity is only
 * a gameplay/RPG facade over that StaffProfile. Supporting `TeamStaffAssignment` contracts
 * may still exclude `headCoach` while the team-assignment migration remains scoped separately.
 */
export const STAFF_ROLE_IDS = [
  // coaching
  'headCoach', 'associateCoach', 'assistantCoach', 'offensiveSpecialist', 'defensiveSpecialist',
  'playerDevelopmentCoach', 'shootingCoach', 'skillsCoach', 'bigManCoach',
  // performance
  'strengthConditioningCoach', 'performanceCoach', 'loadManagementSpecialist', 'developmentSpecialist',
  // medical
  'teamDoctor', 'physiotherapist', 'rehabilitationSpecialist', 'sportsScientist',
  // scouting
  'headScout', 'regionalScout', 'advanceScout', 'collegeScout', 'internationalScout', 'proScout',
  // basketball operations
  'generalManager', 'assistantGeneralManager', 'directorOfBasketballOperations', 'sportingDirector', 'analyticsStaff', 'capContractsSpecialist',
  // recruiting (ncaaLike only)
  'recruitingCoordinator', 'positionalRecruiter',
] as const
export type StaffRoleId = typeof STAFF_ROLE_IDS[number]

/** Supporting assignment roles only — excludes `headCoach`, which is represented by the Coach facade. */
export const ASSIGNABLE_STAFF_ROLE_IDS = STAFF_ROLE_IDS.filter((id): id is Exclude<StaffRoleId, 'headCoach'> => id !== 'headCoach')
