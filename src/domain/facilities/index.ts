export { createPlace, PLACE_KINDS, type CreatePlaceInput, type Place, type PlaceKind } from './Place'

export {
  FACILITY_CAPABILITIES,
  FACILITY_PURPOSES,
  FACILITY_TYPES,
  isFacilityCapability,
  isFacilityPurpose,
  isFacilityType,
  type FacilityCapability,
  type FacilityPurpose,
  type FacilityType,
} from './FacilityType'

export {
  FACILITY_STATUSES,
  TERMINAL_FACILITY_STATUSES,
  isFacilityStatus,
  isTerminalFacilityStatus,
  type FacilityStatus,
} from './FacilityLifecycle'

export { createFacility, type CreateFacilityInput, type CreateFacilityPhysicalProfileInput, type Facility, type FacilityPhysicalProfile } from './Facility'

export {
  FACILITY_COMPONENT_STATUSES,
  FACILITY_COMPONENT_TYPES,
  componentCategory,
  createFacilityComponent,
  isFacilityComponentType,
  type CreateFacilityComponentInput,
  type FacilityComponent,
  type FacilityComponentStatus,
  type FacilityComponentType,
} from './FacilityComponent'

export {
  FACILITY_COMPONENT_CATEGORIES,
  isFacilityComponentCategory,
  type FacilityComponentCategory,
} from './FacilityComponentCategory'

export {
  CAPACITY_UNITS,
  COURT_SURFACE_TYPES,
  createCapacitySpecification,
  createCourtSpecification,
  createFacilityComponentSpecification,
  isCapacityUnit,
  isCourtSurfaceType,
  type CapacitySpecification,
  type CapacityUnit,
  type CourtSpecification,
  type CourtSurfaceType,
  type CreateCapacitySpecificationInput,
  type CreateCourtSpecificationInput,
  type CreateFacilityComponentSpecificationInput,
  type FacilityComponentSpecification,
} from './FacilityComponentSpecification'

export {
  FACILITY_COMPONENT_CAPABILITIES,
  isFacilityComponentCapability,
  type FacilityComponentCapability,
} from './FacilityComponentCapability'

export {
  createFacilityNameRecord,
  resolveFacilityNameAt,
  type CreateFacilityNameRecordInput,
  type FacilityNameRecord,
} from './FacilityNameHistory'

export {
  createFacilityOwnershipActor,
  createFacilityOwnershipInterest,
  getActiveFacilityOwnership,
  totalKnownFacilityOwnershipPercentage,
  type CreateFacilityOwnershipInterestInput,
  type FacilityOwnershipActor,
  type FacilityOwnershipInterest,
  type FacilityOwnershipSnapshot,
} from './FacilityOwnership'

export {
  createFacilityControlActor,
  createFacilityControlRight,
  type CreateFacilityControlRightInput,
  type FacilityControlActor,
  type FacilityControlRight,
} from './FacilityControl'

export {
  createFacilityOperatorAssignment,
  type CreateFacilityOperatorAssignmentInput,
  type FacilityOperatorAssignment,
} from './FacilityOperator'

export {
  FACILITY_ORGANIZATION_RELATIONSHIP_KINDS,
  FACILITY_TEAM_RELATIONSHIP_KINDS,
  createFacilityOrganizationRelationship,
  createFacilityTeamRelationship,
  getActiveFacilitiesForTeam,
  getActiveFacilityOrganizationRelationships,
  getActiveFacilityTeamRelationships,
  type CreateFacilityOrganizationRelationshipInput,
  type CreateFacilityTeamRelationshipInput,
  type FacilityOrganizationRelationship,
  type FacilityOrganizationRelationshipKind,
  type FacilityTeamRelationship,
  type FacilityTeamRelationshipKind,
} from './FacilityRelationship'

export {
  FACILITY_USAGE_EXCLUSIVITIES,
  FACILITY_USAGE_PRIORITIES,
  FACILITY_USAGE_PURPOSES,
  createFacilityUsageRight,
  getActiveFacilityUsageRights,
  isActiveFacilityUsageRightOn,
  isFacilityUsagePurpose,
  usageRightCoversComponent,
  type CreateFacilityUsageRightInput,
  type FacilityUsageExclusivity,
  type FacilityUsagePriority,
  type FacilityUsagePurpose,
  type FacilityUsageRight,
} from './FacilityUsageRight'

export {
  facilityRightsOverlapInTime,
} from './FacilityConflict'

export {
  createFacilityCompetitionApproval,
  type CreateFacilityCompetitionApprovalInput,
  type FacilityCompetitionApproval,
} from './FacilityCompetitionApproval'

export {
  createFacilityStatusRecord,
  resolveFacilityStatusAt,
  type CreateFacilityStatusRecordInput,
  type FacilityStatusRecord,
} from './FacilityStatusHistory'

export {
  FacilityValidationError,
  validateFacilitiesDomain,
  type FacilityValidationContext,
} from './FacilityValidation'

export {
  activeFacilityComponentsAt,
  capabilitiesOfFacility,
  childComponentsOf,
  componentsOfFacility,
  componentsOfFacilityByCategory,
  componentsOfFacilityByType,
  controllersOfFacilityAt,
  courtsOfFacility,
  facilitiesOperatedByOrganizationAt,
  facilitiesOwnedByOrganizationAt,
  facilitiesUsedByOrganizationAt,
  facilitiesUsedByTeamAt,
  facilitiesWithCapability,
  facilityComponentsUsableByTeamAt,
  facilityHasCapability,
  facilityNameAt,
  facilityOwnershipAt,
  facilityRightsConflictsAt,
  facilityStatusAt,
  homeFacilitiesForTeamAt,
  medicalComponentsOfFacility,
  operatorsOfFacilityAt,
  organizationsRelatedToFacilityAt,
  organizationsUsingFacilityAt,
  ownershipShareOfAt,
  ownersOfFacilityAt,
  practiceCourtsOfFacility,
  recoveryComponentsOfFacility,
  rootComponentsOfFacility,
  teamsUsingFacilityAt,
  trainingComponentsOfFacility,
  trainingFacilitiesForTeamAt,
  usableComponentsForTeamAt,
  usageRightsForFacilityAt,
  usageRightsForOrganizationAt,
  usageRightsForTeamAt,
  usersOfFacilityAt,
  whoControlsFacilityAt,
  type FacilityRightsConflict,
} from './FacilityQueries'
