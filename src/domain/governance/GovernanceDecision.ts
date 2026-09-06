import { parseGameDate, type GameDate } from "@/domain/date";
import { GOVERNANCE_DECISION_TYPES, type GovernanceAuthorityGrant, type GovernanceBody, type GovernanceDecisionType } from "./Governance";

export const GOVERNANCE_DECISION_RIGHTS = ["PROPOSE", "REVIEW", "APPROVE", "VETO", "EXECUTE"] as const;
export type GovernanceDecisionRight = (typeof GOVERNANCE_DECISION_RIGHTS)[number];
export const GOVERNANCE_DECISION_EXECUTION_POLICIES = ["FORMAL_ONLY", "EFFECT_REQUIRED"] as const;
export type GovernanceDecisionExecutionPolicy = (typeof GOVERNANCE_DECISION_EXECUTION_POLICIES)[number];
export const GOVERNANCE_DECISION_EVENT_KINDS = ["PROPOSED", "REVIEW_STARTED", "APPROVED", "REJECTED", "VETOED", "EXECUTED", "WITHDRAWN"] as const;
export type GovernanceDecisionEventKind = (typeof GOVERNANCE_DECISION_EVENT_KINDS)[number];
export type GovernanceDecisionStatus = GovernanceDecisionEventKind;

export type GovernanceDecisionSubject =
  | { readonly kind: "COACH"; readonly coachId: string }
  | { readonly kind: "EXECUTIVE"; readonly staffId: string }
  | { readonly kind: "BUDGET"; readonly scope: "TEAM" | "INSTITUTION"; readonly referenceId: string }
  | { readonly kind: "FACILITY"; readonly facilityId: string }
  | { readonly kind: "ORGANIZATIONAL"; readonly institutionId: string; readonly bodyId?: string }
  | { readonly kind: "GENERIC"; readonly referenceId: string };
export type GovernanceDecisionSource = { readonly kind: "MANAGER_EVALUATION"; readonly evaluationId: string };
export const GOVERNANCE_DECISION_SUBJECT_KINDS: Readonly<Record<GovernanceDecisionType, readonly GovernanceDecisionSubject["kind"][]>> = {
  COACH_HIRING: ["COACH"], COACH_FIRING: ["COACH"], COACH_CONTRACT: ["COACH"],
  EXECUTIVE_HIRING: ["EXECUTIVE"], EXECUTIVE_FIRING: ["EXECUTIVE"],
  BUDGET: ["BUDGET"], PLAYER_BUDGET: ["BUDGET"], STAFF_BUDGET: ["BUDGET"], FACILITIES: ["FACILITY"],
  OWNERSHIP_CHANGE: ["ORGANIZATIONAL"], ORGANIZATIONAL_RESTRUCTURE: ["ORGANIZATIONAL"],
  STRATEGIC_PLAN: ["ORGANIZATIONAL", "GENERIC"], CAPITAL_EXPENDITURE: ["BUDGET", "FACILITY", "GENERIC"], DEBT: ["BUDGET", "GENERIC"], CONFERENCE_MEMBERSHIP: ["ORGANIZATIONAL", "GENERIC"], COMPLIANCE_POLICY: ["ORGANIZATIONAL", "GENERIC"], NIL_POLICY: ["ORGANIZATIONAL", "GENERIC"], DONOR_RELATIONS: ["ORGANIZATIONAL", "GENERIC"], COLLECTIVE_RELATIONSHIP: ["ORGANIZATIONAL", "GENERIC"],
};
export const GOVERNANCE_MANAGER_EVALUATION_DECISION_TYPES = ["COACH_FIRING", "COACH_CONTRACT"] as const;
const executionPolicyByDecisionType: Readonly<Record<GovernanceDecisionType, GovernanceDecisionExecutionPolicy>> = {
  BUDGET: "FORMAL_ONLY", STRATEGIC_PLAN: "FORMAL_ONLY", COACH_HIRING: "EFFECT_REQUIRED", COACH_FIRING: "EFFECT_REQUIRED", COACH_CONTRACT: "FORMAL_ONLY",
  EXECUTIVE_HIRING: "EFFECT_REQUIRED", EXECUTIVE_FIRING: "EFFECT_REQUIRED", PLAYER_BUDGET: "FORMAL_ONLY", STAFF_BUDGET: "FORMAL_ONLY",
  CAPITAL_EXPENDITURE: "FORMAL_ONLY", FACILITIES: "FORMAL_ONLY", DEBT: "FORMAL_ONLY", OWNERSHIP_CHANGE: "FORMAL_ONLY",
  ORGANIZATIONAL_RESTRUCTURE: "FORMAL_ONLY", CONFERENCE_MEMBERSHIP: "FORMAL_ONLY", COMPLIANCE_POLICY: "FORMAL_ONLY", NIL_POLICY: "FORMAL_ONLY",
  DONOR_RELATIONS: "FORMAL_ONLY", COLLECTIVE_RELATIONSHIP: "FORMAL_ONLY",
};
function isGovernanceDecisionType(value: unknown): value is GovernanceDecisionType { return typeof value === "string" && GOVERNANCE_DECISION_TYPES.includes(value as GovernanceDecisionType); }
export function governanceDecisionExecutionPolicy(value: unknown): GovernanceDecisionExecutionPolicy { if (!isGovernanceDecisionType(value)) throw new RangeError("Unknown governance decision type"); return executionPolicyByDecisionType[value]; }
function isDecisionSubjectValid(subject: GovernanceDecisionSubject): boolean {
  if (subject.kind === "COACH") return typeof subject.coachId === "string" && subject.coachId.trim() !== "";
  if (subject.kind === "EXECUTIVE") return typeof subject.staffId === "string" && subject.staffId.trim() !== "";
  if (subject.kind === "BUDGET") return (subject.scope === "TEAM" || subject.scope === "INSTITUTION") && typeof subject.referenceId === "string" && subject.referenceId.trim() !== "";
  if (subject.kind === "FACILITY") return typeof subject.facilityId === "string" && subject.facilityId.trim() !== "";
  if (subject.kind === "ORGANIZATIONAL") return typeof subject.institutionId === "string" && subject.institutionId.trim() !== "" && (subject.bodyId === undefined || (typeof subject.bodyId === "string" && subject.bodyId.trim() !== ""));
  return subject.kind === "GENERIC" && typeof subject.referenceId === "string" && subject.referenceId.trim() !== "";
}
export interface GovernanceDecision {
  readonly id: string;
  readonly institutionId: string;
  readonly decisionType: GovernanceDecisionType;
  readonly proposedByBodyId: string;
  readonly proposedOn: GameDate;
  readonly subject: GovernanceDecisionSubject;
  readonly source?: GovernanceDecisionSource;
}
/** An explicit role granted through one BG1 delegation edge; it never changes that edge's direction. */
export interface GovernanceDecisionParticipationGrant {
  readonly id: string;
  readonly authorityGrantId: string;
  readonly bodyId: string;
  readonly edgeParticipant: "DELEGATOR" | "DELEGATE";
  readonly right: GovernanceDecisionRight;
  readonly approvalRequirement?: "ALL_OF";
}
export interface GovernanceDecisionEvent {
  readonly id: string;
  readonly decisionId: string;
  readonly kind: GovernanceDecisionEventKind;
  readonly bodyId: string;
  readonly effectiveOn: GameDate;
  readonly authorityGrantIds: readonly string[];
}
export interface GovernanceDecisionRightsResolution {
  readonly decisionType: GovernanceDecisionType;
  readonly institutionId: string;
  readonly asOfDate: GameDate;
  readonly proposerBodyIds: readonly string[];
  readonly reviewerBodyIds: readonly string[];
  readonly approverBodyIds: readonly string[];
  readonly vetoBodyIds: readonly string[];
  readonly executorBodyIds: readonly string[];
  readonly authorityGrantIds: readonly string[];
}

export function createGovernanceDecision(value: GovernanceDecision): GovernanceDecision {
  const sourceIsValid = value.source === undefined || (value.source.kind === "MANAGER_EVALUATION" && typeof value.source.evaluationId === "string" && value.source.evaluationId.trim() !== "" && GOVERNANCE_MANAGER_EVALUATION_DECISION_TYPES.includes(value.decisionType as (typeof GOVERNANCE_MANAGER_EVALUATION_DECISION_TYPES)[number]));
  if (!value.id.trim() || !value.institutionId.trim() || !value.proposedByBodyId.trim() || !isGovernanceDecisionType(value.decisionType) || !isDecisionSubjectValid(value.subject) || !GOVERNANCE_DECISION_SUBJECT_KINDS[value.decisionType].includes(value.subject.kind) || !sourceIsValid) throw new RangeError("Invalid governance decision");
  return { ...value, proposedOn: parseGameDate(value.proposedOn), subject: { ...value.subject }, ...(value.source === undefined ? {} : { source: { ...value.source } }) };
}
export function createGovernanceDecisionParticipationGrant(value: GovernanceDecisionParticipationGrant): GovernanceDecisionParticipationGrant {
  if (!value.id.trim() || !value.authorityGrantId.trim() || !value.bodyId.trim() || !["DELEGATOR", "DELEGATE"].includes(value.edgeParticipant) || !GOVERNANCE_DECISION_RIGHTS.includes(value.right) || (value.approvalRequirement !== undefined && (value.right !== "APPROVE" || value.approvalRequirement !== "ALL_OF"))) throw new RangeError("Invalid governance decision participation grant");
  return { ...value };
}
export function createGovernanceDecisionEvent(value: GovernanceDecisionEvent): GovernanceDecisionEvent {
  if (!value.id.trim() || !value.decisionId.trim() || !value.bodyId.trim() || !GOVERNANCE_DECISION_EVENT_KINDS.includes(value.kind) || value.authorityGrantIds.length === 0 || new Set(value.authorityGrantIds).size !== value.authorityGrantIds.length || value.authorityGrantIds.some((id) => !id.trim())) throw new RangeError("Invalid governance decision event");
  return { ...value, effectiveOn: parseGameDate(value.effectiveOn), authorityGrantIds: [...value.authorityGrantIds] };
}

const rightForEvent: Readonly<Record<GovernanceDecisionEventKind, GovernanceDecisionRight>> = { PROPOSED: "PROPOSE", REVIEW_STARTED: "REVIEW", APPROVED: "APPROVE", REJECTED: "APPROVE", VETOED: "VETO", EXECUTED: "EXECUTE", WITHDRAWN: "PROPOSE" };
export function requiredRightForGovernanceDecisionEvent(kind: GovernanceDecisionEventKind): GovernanceDecisionRight { return rightForEvent[kind]; }
export function deriveGovernanceDecisionStatus(events: readonly GovernanceDecisionEvent[], requiredApproverBodyIds: readonly string[] = []): GovernanceDecisionStatus | undefined {
  const ordered = [...events].sort(compareEvents); const last = ordered.at(-1);
  if (last?.kind === "APPROVED" && requiredApproverBodyIds.some((id) => !ordered.some((event) => event.kind === "APPROVED" && event.bodyId === id))) return "REVIEW_STARTED";
  return last?.kind;
}
export function validateGovernanceDecisionLifecycle(events: readonly GovernanceDecisionEvent[]): void {
  const ordered = [...events].sort(compareEvents); let status: GovernanceDecisionStatus | undefined;
  for (const event of ordered) {
    const allowed: readonly GovernanceDecisionEventKind[] = status === undefined ? ["PROPOSED"] : status === "PROPOSED" ? ["REVIEW_STARTED", "APPROVED", "REJECTED", "VETOED", "WITHDRAWN", "EXECUTED"] : status === "REVIEW_STARTED" ? ["APPROVED", "REJECTED", "VETOED", "WITHDRAWN"] : status === "APPROVED" ? ["APPROVED", "VETOED", "EXECUTED"] : [];
    if (!allowed.includes(event.kind)) throw new RangeError(`Invalid governance decision transition ${status ?? "NONE"} -> ${event.kind}`);
    status = event.kind;
  }
}
export function resolveGovernanceDecisionRights(input: { readonly decisionType: GovernanceDecisionType; readonly institutionId: string; readonly asOfDate: GameDate; readonly bodies: readonly GovernanceBody[]; readonly authorityGrants: readonly GovernanceAuthorityGrant[]; readonly participationGrants: readonly GovernanceDecisionParticipationGrant[] }): GovernanceDecisionRightsResolution {
  const bodyInstitution = new Map(input.bodies.map((body) => [body.id, body.institutionId]));
  const active = input.authorityGrants.filter((grant) => grant.decision === input.decisionType && bodyInstitution.get(grant.fromBodyId) === input.institutionId && bodyInstitution.get(grant.toBodyId) === input.institutionId && grant.grantedOn <= input.asOfDate && (grant.revokedOn === undefined || grant.revokedOn >= input.asOfDate));
  const activeIds = new Set(active.map((grant) => grant.id));
  const validParticipation = input.participationGrants.filter((participation) => { const authority = active.find((grant) => grant.id === participation.authorityGrantId); return authority !== undefined && bodyInstitution.get(participation.bodyId) === input.institutionId && participation.bodyId === (participation.edgeParticipant === "DELEGATOR" ? authority.fromBodyId : authority.toBodyId); });
  const byRight = (right: GovernanceDecisionRight) => [...new Set(validParticipation.filter((grant) => grant.right === right).map((grant) => grant.bodyId))].sort();
  return { decisionType: input.decisionType, institutionId: input.institutionId, asOfDate: input.asOfDate, proposerBodyIds: byRight("PROPOSE"), reviewerBodyIds: byRight("REVIEW"), approverBodyIds: byRight("APPROVE"), vetoBodyIds: byRight("VETO"), executorBodyIds: byRight("EXECUTE"), authorityGrantIds: [...new Set(validParticipation.map((grant) => grant.authorityGrantId))].sort() };
}
export function assertGovernanceDecisionEventAuthorized(event: GovernanceDecisionEvent, resolution: GovernanceDecisionRightsResolution): void {
  const bodies = requiredRightForGovernanceDecisionEvent(event.kind) === "PROPOSE" ? resolution.proposerBodyIds : requiredRightForGovernanceDecisionEvent(event.kind) === "REVIEW" ? resolution.reviewerBodyIds : requiredRightForGovernanceDecisionEvent(event.kind) === "APPROVE" ? resolution.approverBodyIds : requiredRightForGovernanceDecisionEvent(event.kind) === "VETO" ? resolution.vetoBodyIds : resolution.executorBodyIds;
  if (!bodies.includes(event.bodyId)) throw new RangeError(`Governance body ${event.bodyId} lacks ${requiredRightForGovernanceDecisionEvent(event.kind)} authority`);
}
/** Returns only grant IDs that exactly support this event body/right at the event date. */
export function resolveGovernanceDecisionEventAuthorityGrantIds(input: { readonly event: Pick<GovernanceDecisionEvent, 'kind' | 'bodyId' | 'effectiveOn'>; readonly decisionType: GovernanceDecisionType; readonly institutionId: string; readonly bodies: readonly GovernanceBody[]; readonly authorityGrants: readonly GovernanceAuthorityGrant[]; readonly participationGrants: readonly GovernanceDecisionParticipationGrant[] }): readonly string[] {
  const right = requiredRightForGovernanceDecisionEvent(input.event.kind)
  const institutions = new Map(input.bodies.map((body) => [body.id, body.institutionId]))
  return input.participationGrants.filter((participation) => {
    const authority = input.authorityGrants.find((grant) => grant.id === participation.authorityGrantId)
    return participation.bodyId === input.event.bodyId && participation.right === right && authority !== undefined && authority.decision === input.decisionType && institutions.get(authority.fromBodyId) === input.institutionId && institutions.get(authority.toBodyId) === input.institutionId && participation.bodyId === (participation.edgeParticipant === 'DELEGATOR' ? authority.fromBodyId : authority.toBodyId) && authority.grantedOn <= input.event.effectiveOn && (authority.revokedOn === undefined || authority.revokedOn >= input.event.effectiveOn)
  }).map((participation) => participation.authorityGrantId).sort()
}
function compareEvents(a: GovernanceDecisionEvent, b: GovernanceDecisionEvent): number { return a.effectiveOn.localeCompare(b.effectiveOn) || a.id.localeCompare(b.id); }
