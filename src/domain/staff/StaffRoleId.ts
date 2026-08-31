/**
 * Canonical, data-driven, extensible role id catalogue — the real assignment authority for
 * `TeamStaffAssignment.role` (see `StaffPerson.ts`) and for `StaffRoleDefinition.id` (see
 * `StaffRoleRegistry.ts`). Split into its own leaf module (no dependencies) because both of
 * those files need it and must not import each other.
 *
 * `headCoach` is included only so shared code can reason about "who coaches this team"
 * uniformly; it is not a `StaffPerson` role — Head Coach remains the existing `Coach` entity,
 * and Responsibility eligibility for it routes through `eligibleParticipant: 'coach'` (see
 * `@/domain/responsibility`), never through a `TeamStaffAssignment`.
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

/** Assignable roles only — excludes `headCoach`, which is never a `TeamStaffAssignment.role`. */
export const ASSIGNABLE_STAFF_ROLE_IDS = STAFF_ROLE_IDS.filter((id): id is Exclude<StaffRoleId, 'headCoach'> => id !== 'headCoach')
