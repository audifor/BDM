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
  createFacilityComponent,
  isFacilityComponentType,
  type CreateFacilityComponentInput,
  type FacilityComponent,
  type FacilityComponentStatus,
  type FacilityComponentType,
} from './FacilityComponent'

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
} from './FacilityOwnership'

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
  createFacilityUsageRight,
  getActiveFacilityUsageRights,
  type CreateFacilityUsageRightInput,
  type FacilityUsageRight,
} from './FacilityUsageRight'

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
  facilityNameAt,
  facilityStatusAt,
  facilitiesUsedByTeamAt,
  organizationsRelatedToFacilityAt,
  ownersOfFacilityAt,
  usersOfFacilityAt,
} from './FacilityQueries'
