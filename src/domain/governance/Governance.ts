import { parseGameDate, type GameDate } from "@/domain/date";
import type { ConferenceId, EcosystemId, StaffPersonId, TeamId } from "@/domain/ids";

export const GOVERNANCE_UNIVERSES = [
  "PROFESSIONAL_CLUB",
  "NBA_WNBA",
  "NCAA",
  "FEDERATION",
] as const;
export type GovernanceUniverse = (typeof GOVERNANCE_UNIVERSES)[number];
export const GOVERNANCE_BODY_KINDS = [
  "OWNERSHIP",
  "BOARD",
  "EXECUTIVE",
  "ATHLETIC_DEPARTMENT",
  "COMPLIANCE",
] as const;
export type GovernanceBodyKind = (typeof GOVERNANCE_BODY_KINDS)[number];
export const GOVERNANCE_ROLES = [
  "OWNER", "OWNERSHIP_REPRESENTATIVE", "GOVERNOR", "ALTERNATE_GOVERNOR", "CHAIR",
  "PRESIDENT", "CHANCELLOR", "TRUSTEE", "REGENT", "BOARD_MEMBER", "CEO",
  "GENERAL_MANAGER", "PRESIDENT_BASKETBALL_OPERATIONS", "SPORTING_DIRECTOR",
  "ATHLETIC_DIRECTOR", "DEPUTY_ATHLETIC_DIRECTOR", "COMPLIANCE_OFFICER",
  "CONFERENCE_COMMISSIONER", "FEDERATION_PRESIDENT", "FEDERATION_EXECUTIVE",
] as const;
export type GovernanceRole = (typeof GOVERNANCE_ROLES)[number];
export const GOVERNANCE_DECISION_TYPES = [
  "BUDGET", "STRATEGIC_PLAN", "COACH_HIRING", "COACH_FIRING", "COACH_CONTRACT",
  "EXECUTIVE_HIRING", "EXECUTIVE_FIRING", "PLAYER_BUDGET", "STAFF_BUDGET",
  "CAPITAL_EXPENDITURE", "FACILITIES", "DEBT", "OWNERSHIP_CHANGE",
  "ORGANIZATIONAL_RESTRUCTURE", "CONFERENCE_MEMBERSHIP", "COMPLIANCE_POLICY",
  "NIL_POLICY", "DONOR_RELATIONS", "COLLECTIVE_RELATIONSHIP",
] as const;
export type GovernanceDecisionType = (typeof GOVERNANCE_DECISION_TYPES)[number];
export const GOVERNANCE_EXTERNAL_RELATIONSHIP_TYPES = [
  "CONFERENCE_MEMBERSHIP",
  "NIL_COLLECTIVE_RELATIONSHIP",
  "DONOR_RELATIONSHIP",
  "BOOSTER_RELATIONSHIP",
  "REGULATORY_RELATIONSHIP",
] as const;
export type GovernanceExternalRelationshipType = (typeof GOVERNANCE_EXTERNAL_RELATIONSHIP_TYPES)[number];
export type GovernanceActor =
  | { readonly kind: "COACH" | "STAFF" | "EXTERNAL"; readonly id: string };

/** Typed bridge for existing Staff Politics actor IDs; BG1 does not alter political rules. */
export function governanceActorForStaff(staffId: StaffPersonId): GovernanceActor {
  return { kind: "STAFF", id: staffId };
}

/** Institution is the durable governance anchor; Teams and programs are linked, never owned by it. */
export interface GovernanceInstitution {
  readonly id: string;
  readonly universe: GovernanceUniverse;
  readonly name: string;
  readonly teamIds: readonly TeamId[];
  readonly ecosystemId?: EcosystemId;
  readonly parentInstitutionId?: string;
}
export interface GovernanceBody {
  readonly id: string;
  readonly institutionId: string;
  readonly kind: GovernanceBodyKind;
  readonly name: string;
}
/**
 * Canonical separation: formal authority is GovernanceBody plus GovernanceAuthorityGrant.
 * External relationships are structural only; Staff Politics owns political influence, while
 * donor, booster and NIL financial influence belong to later economic systems.
 */
/** Historical appointment is the source of truth for a mandate; no mutable current-role index exists. */
export interface GovernanceAppointment {
  readonly id: string;
  readonly bodyId: string;
  readonly actor: GovernanceActor;
  readonly role: GovernanceRole;
  readonly startedOn: GameDate;
  readonly endedOn?: GameDate;
}
/** Decision rights form a directed institutional authority graph. */
export interface GovernanceAuthorityGrant {
  readonly id: string;
  readonly fromBodyId: string;
  readonly toBodyId: string;
  readonly decision: GovernanceDecisionType;
  readonly grantedOn: GameDate;
  readonly revokedOn?: GameDate;
}
/** External institutional attachment. It is deliberately not a formal authority node. */
export type GovernanceExternalRef =
  | { readonly kind: "CONFERENCE"; readonly id: ConferenceId }
  | { readonly kind: "NIL_COLLECTIVE" | "DONOR_ECOSYSTEM" | "BOOSTER_ECOSYSTEM" | "REGULATORY_BODY"; readonly id: string };
export interface GovernanceExternalRelationship {
  readonly id: string;
  readonly institutionId?: string;
  readonly bodyId?: string;
  readonly externalRef: GovernanceExternalRef;
  readonly relationshipType: GovernanceExternalRelationshipType;
  readonly startedOn: GameDate;
  readonly endedOn?: GameDate;
}

export function createGovernanceInstitution(value: GovernanceInstitution): GovernanceInstitution {
  if (!value.id.trim() || !value.name.trim() || !GOVERNANCE_UNIVERSES.includes(value.universe) || new Set(value.teamIds).size !== value.teamIds.length || value.teamIds.some((id) => !id.trim()) || value.parentInstitutionId === value.id) throw new RangeError("Invalid governance institution");
  return { ...value, teamIds: [...value.teamIds] };
}
export function createGovernanceBody(value: GovernanceBody): GovernanceBody {
  if (!value.id.trim() || !value.institutionId.trim() || !value.name.trim() || !GOVERNANCE_BODY_KINDS.includes(value.kind)) throw new RangeError("Invalid governance body");
  return { ...value };
}
export function createGovernanceAppointment(value: GovernanceAppointment): GovernanceAppointment {
  if (!value.id.trim() || !value.bodyId.trim() || !value.actor.id.trim() || !GOVERNANCE_ROLES.includes(value.role) || !["COACH", "STAFF", "EXTERNAL"].includes(value.actor.kind)) throw new RangeError("Invalid governance appointment");
  const startedOn = parseGameDate(value.startedOn); const endedOn = value.endedOn === undefined ? undefined : parseGameDate(value.endedOn);
  if (endedOn !== undefined && endedOn < startedOn) throw new RangeError("Governance appointment ends before it starts");
  return { ...value, actor: { ...value.actor }, startedOn, ...(endedOn === undefined ? {} : { endedOn }) };
}
export function createGovernanceAuthorityGrant(value: GovernanceAuthorityGrant): GovernanceAuthorityGrant {
  if (!value.id.trim() || !value.fromBodyId.trim() || !value.toBodyId.trim() || value.fromBodyId === value.toBodyId || !GOVERNANCE_DECISION_TYPES.includes(value.decision)) throw new RangeError("Invalid governance authority grant");
  const grantedOn = parseGameDate(value.grantedOn); const revokedOn = value.revokedOn === undefined ? undefined : parseGameDate(value.revokedOn);
  if (revokedOn !== undefined && revokedOn < grantedOn) throw new RangeError("Governance authority revoked before grant");
  return { ...value, grantedOn, ...(revokedOn === undefined ? {} : { revokedOn }) };
}
export function createGovernanceExternalRelationship(value: GovernanceExternalRelationship): GovernanceExternalRelationship {
  if (!value.id.trim() || (value.institutionId === undefined && value.bodyId === undefined) || !value.externalRef.id.trim() || !GOVERNANCE_EXTERNAL_RELATIONSHIP_TYPES.includes(value.relationshipType)) throw new RangeError("Invalid governance external relationship");
  const expectedReferenceKind: Readonly<Record<GovernanceExternalRelationshipType, GovernanceExternalRef["kind"]>> = {
    CONFERENCE_MEMBERSHIP: "CONFERENCE",
    NIL_COLLECTIVE_RELATIONSHIP: "NIL_COLLECTIVE",
    DONOR_RELATIONSHIP: "DONOR_ECOSYSTEM",
    BOOSTER_RELATIONSHIP: "BOOSTER_ECOSYSTEM",
    REGULATORY_RELATIONSHIP: "REGULATORY_BODY",
  };
  if (expectedReferenceKind[value.relationshipType] !== value.externalRef.kind) throw new RangeError("Governance external relationship reference does not match its type");
  const startedOn = parseGameDate(value.startedOn); const endedOn = value.endedOn === undefined ? undefined : parseGameDate(value.endedOn);
  if (endedOn !== undefined && endedOn < startedOn) throw new RangeError("Governance external relationship ends before it starts");
  return { ...value, externalRef: { ...value.externalRef }, startedOn, ...(endedOn === undefined ? {} : { endedOn }) };
}
export function isGovernanceAppointmentActive(value: GovernanceAppointment, on: GameDate): boolean { return value.startedOn <= on && (value.endedOn === undefined || value.endedOn >= on); }
export function isGovernanceAuthorityActive(value: GovernanceAuthorityGrant, on: GameDate): boolean { return value.grantedOn <= on && (value.revokedOn === undefined || value.revokedOn >= on); }
