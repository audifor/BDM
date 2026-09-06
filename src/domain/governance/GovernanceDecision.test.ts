import { describe, expect, it } from "vitest";
import { createGovernanceDecision, deriveGovernanceDecisionStatus, governanceDecisionExecutionPolicy, resolveGovernanceDecisionEventAuthorityGrantIds, resolveGovernanceDecisionRights, validateGovernanceDecisionLifecycle, type GovernanceDecisionEvent, type GovernanceDecisionParticipationGrant } from "./GovernanceDecision";
import { GOVERNANCE_DECISION_TYPES } from "./Governance";
import type { GovernanceAuthorityGrant, GovernanceBody } from "./Governance";

const date = "2032-01-01" as never;
const clubBodies = ["board", "executive", "owner"].map((id) => ({ id, institutionId: "club", kind: "BOARD" as const, name: id }));
const authorities: readonly GovernanceAuthorityGrant[] = [
  { id: "grant:board-exec", fromBodyId: "board", toBodyId: "executive", decision: "COACH_FIRING", grantedOn: date },
  { id: "grant:owner-board", fromBodyId: "owner", toBodyId: "board", decision: "COACH_FIRING", grantedOn: date },
];
const participation: readonly GovernanceDecisionParticipationGrant[] = [
  { id: "right:propose", authorityGrantId: "grant:board-exec", bodyId: "executive", edgeParticipant: "DELEGATE", right: "PROPOSE" },
  { id: "right:approve", authorityGrantId: "grant:owner-board", bodyId: "board", edgeParticipant: "DELEGATE", right: "APPROVE", approvalRequirement: "ALL_OF" },
  { id: "right:execute", authorityGrantId: "grant:board-exec", bodyId: "executive", edgeParticipant: "DELEGATE", right: "EXECUTE" },
  { id: "right:veto", authorityGrantId: "grant:owner-board", bodyId: "owner", edgeParticipant: "DELEGATOR", right: "VETO" },
];
const event = (kind: GovernanceDecisionEvent["kind"], bodyId: string, id: string = kind): GovernanceDecisionEvent => ({ id, decisionId: "decision", kind, bodyId, effectiveOn: ({ PROPOSED: "2032-01-01", REVIEW_STARTED: "2032-01-02", APPROVED: "2032-01-03", REJECTED: "2032-01-03", VETOED: "2032-01-04", EXECUTED: "2032-01-05", WITHDRAWN: "2032-01-03" } as const)[kind] as never, authorityGrantIds: [bodyId === "board" || bodyId === "owner" ? "grant:owner-board" : "grant:board-exec"] });

describe("Governance decisions", () => {
  it("centralizes compatible typed subjects and manager-evaluation evidence", () => {
    const base = { id: "decision", institutionId: "club", proposedByBodyId: "board", proposedOn: date };
    expect(createGovernanceDecision({ ...base, decisionType: "COACH_FIRING", subject: { kind: "COACH", coachId: "coach" } }).subject.kind).toBe("COACH");
    expect(() => createGovernanceDecision({ ...base, decisionType: "COACH_FIRING", subject: { kind: "FACILITY", facilityId: "facility" } })).toThrow();
    expect(() => createGovernanceDecision({ ...base, decisionType: "FACILITIES", subject: { kind: "COACH", coachId: "coach" } })).toThrow();
    expect(() => createGovernanceDecision({ ...base, decisionType: "EXECUTIVE_FIRING", subject: { kind: "BUDGET", scope: "TEAM", referenceId: "team" } })).toThrow();
    expect(() => createGovernanceDecision({ ...base, decisionType: "BUDGET", subject: { kind: "BUDGET", scope: "TEAM", referenceId: "team" }, source: { kind: "MANAGER_EVALUATION", evaluationId: "evaluation" } })).toThrow();
  });
  it('defines one exhaustive execution policy and rejects unknown decision types', () => {
    expect(GOVERNANCE_DECISION_TYPES.map(governanceDecisionExecutionPolicy)).toEqual([
      'FORMAL_ONLY', 'FORMAL_ONLY', 'EFFECT_REQUIRED', 'EFFECT_REQUIRED', 'FORMAL_ONLY', 'EFFECT_REQUIRED', 'EFFECT_REQUIRED', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY', 'FORMAL_ONLY',
    ])
    expect(() => governanceDecisionExecutionPolicy('UNKNOWN')).toThrow('Unknown governance decision type')
  })
  it("resolves only active, matching, explicitly participated authority in deterministic order", () => {
    const rights = resolveGovernanceDecisionRights({ decisionType: "COACH_FIRING", institutionId: "club", asOfDate: date, bodies: clubBodies, authorityGrants: [...authorities].reverse(), participationGrants: [...participation].reverse() });
    expect(rights.proposerBodyIds).toEqual(["executive"]); expect(rights.approverBodyIds).toEqual(["board"]); expect(rights.executorBodyIds).toEqual(["executive"]); expect(rights.vetoBodyIds).toEqual(["owner"]);
    expect(resolveGovernanceDecisionRights({ decisionType: "BUDGET", institutionId: "club", asOfDate: date, bodies: clubBodies, authorityGrants: authorities, participationGrants: participation }).authorityGrantIds).toEqual([]);
    expect(resolveGovernanceDecisionRights({ decisionType: "COACH_FIRING", institutionId: "club", asOfDate: "2031-12-31" as never, bodies: clubBodies, authorityGrants: authorities, participationGrants: participation }).proposerBodyIds).toEqual([]);
    expect(resolveGovernanceDecisionRights({ decisionType: "COACH_FIRING", institutionId: "club", asOfDate: "2032-02-01" as never, bodies: clubBodies, authorityGrants: [{ ...authorities[0]!, revokedOn: "2032-01-31" as never }, authorities[1]!], participationGrants: participation }).proposerBodyIds).toEqual([]);
  });
  it("uses additive history for valid lifecycle, veto and idempotent execution boundaries", () => {
    const complete = [event("PROPOSED", "executive"), event("REVIEW_STARTED", "board"), event("APPROVED", "board"), event("EXECUTED", "executive")];
    // This fixture has no review right, so lifecycle is intentionally tested independently from authority.
    expect(() => validateGovernanceDecisionLifecycle(complete)).not.toThrow();
    expect(() => validateGovernanceDecisionLifecycle([event("PROPOSED", "executive"), event("APPROVED", "board")])).not.toThrow();
    expect(deriveGovernanceDecisionStatus(complete, ["board"])).toBe("EXECUTED");
    expect(() => validateGovernanceDecisionLifecycle([event("PROPOSED", "executive"), event("REJECTED", "board"), event("EXECUTED", "executive")])).toThrow();
    expect(() => validateGovernanceDecisionLifecycle([event("PROPOSED", "executive"), event("APPROVED", "board"), event("VETOED", "owner"), event("EXECUTED", "executive")])).toThrow();
    expect(() => validateGovernanceDecisionLifecycle([...complete, event("EXECUTED", "executive", "again")])).toThrow();
  });
  it("keeps multiple required approvals pending until every formal approver has acted", () => {
    const events = [event("PROPOSED", "executive"), event("REVIEW_STARTED", "board"), event("APPROVED", "board")];
    expect(deriveGovernanceDecisionStatus(events, ["board", "owner"])).toBe("REVIEW_STARTED");
    expect(deriveGovernanceDecisionStatus([...events, event("APPROVED", "owner", "owner-approval")], ["board", "owner"])).toBe("APPROVED");
  });
  it("keeps professional, NBA/WNBA, NCAA and federation authority graphs data-driven", () => {
    const graph = (decision: GovernanceAuthorityGrant["decision"], body: string, id: string) => ({ id, fromBodyId: "superior", toBodyId: body, decision, grantedOn: date });
    const right = (authorityGrantId: string, bodyId: string, right: GovernanceDecisionParticipationGrant["right"], id: string) => ({ id, authorityGrantId, bodyId, edgeParticipant: "DELEGATE" as const, right });
    const bodies = (institutionId: string, ids: string[]) => ids.map((id) => ({ id, institutionId, kind: "BOARD" as const, name: id }));
    const professional = resolveGovernanceDecisionRights({ decisionType: "COACH_FIRING", institutionId: "pro", asOfDate: date, bodies: bodies("pro", ["superior", "executive"]), authorityGrants: [graph("COACH_FIRING", "executive", "pro-coach")], participationGrants: [right("pro-coach", "executive", "PROPOSE", "pro-right")] });
    const nba = resolveGovernanceDecisionRights({ decisionType: "BUDGET", institutionId: "nba", asOfDate: date, bodies: bodies("nba", ["superior", "governor", "gm"]), authorityGrants: [graph("BUDGET", "governor", "nba-budget"), graph("COACH_FIRING", "gm", "nba-coach")], participationGrants: [right("nba-budget", "governor", "APPROVE", "nba-right"), right("nba-coach", "gm", "PROPOSE", "nba-coach-right")] });
    const ncaa = resolveGovernanceDecisionRights({ decisionType: "COMPLIANCE_POLICY", institutionId: "ncaa", asOfDate: date, bodies: bodies("ncaa", ["superior", "compliance"]), authorityGrants: [graph("COMPLIANCE_POLICY", "compliance", "ncaa-compliance")], participationGrants: [right("ncaa-compliance", "compliance", "APPROVE", "ncaa-right")] });
    const federation = resolveGovernanceDecisionRights({ decisionType: "STRATEGIC_PLAN", institutionId: "federation", asOfDate: date, bodies: bodies("federation", ["superior", "president"]), authorityGrants: [graph("STRATEGIC_PLAN", "president", "fed-plan")], participationGrants: [right("fed-plan", "president", "APPROVE", "fed-right")] });
    expect(professional.proposerBodyIds).toEqual(["executive"]); expect(nba.approverBodyIds).toEqual(["governor"]); expect(nba.proposerBodyIds).toEqual([]);
    expect(ncaa.approverBodyIds).toEqual(["compliance"]); expect(federation.approverBodyIds).toEqual(["president"]);
  });
  it("isolates institutions and ignores a third party fabricated participation grant", () => {
    const bodies = [
      { id: "a-board", institutionId: "a", kind: "BOARD" as const, name: "A board" }, { id: "a-exec", institutionId: "a", kind: "EXECUTIVE" as const, name: "A executive" },
      { id: "b-board", institutionId: "b", kind: "BOARD" as const, name: "B board" }, { id: "b-exec", institutionId: "b", kind: "EXECUTIVE" as const, name: "B executive" }, { id: "intruder", institutionId: "a", kind: "EXECUTIVE" as const, name: "Intruder" },
    ];
    const grants = [{ id: "a", fromBodyId: "a-board", toBodyId: "a-exec", decision: "COACH_FIRING" as const, grantedOn: date }, { id: "b", fromBodyId: "b-board", toBodyId: "b-exec", decision: "COACH_FIRING" as const, grantedOn: date }];
    const rights = resolveGovernanceDecisionRights({ decisionType: "COACH_FIRING", institutionId: "a", asOfDate: date, bodies, authorityGrants: grants, participationGrants: [
      { id: "a-right", authorityGrantId: "a", bodyId: "a-exec", edgeParticipant: "DELEGATE", right: "PROPOSE" },
      { id: "b-right", authorityGrantId: "b", bodyId: "b-exec", edgeParticipant: "DELEGATE", right: "PROPOSE" },
      { id: "stolen", authorityGrantId: "a", bodyId: "intruder", edgeParticipant: "DELEGATE", right: "VETO" },
    ] });
    expect(rights.proposerBodyIds).toEqual(["a-exec"]); expect(rights.vetoBodyIds).toEqual([]);
  });
  it('returns only exact active execution evidence deterministically', () => {
    const grants = [{ ...authorities[0]!, id: 'z' }, { ...authorities[0]!, id: 'a' }], participation = grants.map((grant) => ({ id: `right:${grant.id}`, authorityGrantId: grant.id, bodyId: 'executive', edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const }))
    const input = { event: { kind: 'EXECUTED' as const, bodyId: 'executive', effectiveOn: date }, decisionType: 'COACH_FIRING' as const, institutionId: 'club', bodies: clubBodies, authorityGrants: grants, participationGrants: participation }
    expect(resolveGovernanceDecisionEventAuthorityGrantIds(input)).toEqual(['a', 'z']); expect(resolveGovernanceDecisionEventAuthorityGrantIds({ ...input, event: { ...input.event, bodyId: 'board' } })).toEqual([])
    expect(resolveGovernanceDecisionEventAuthorityGrantIds({ ...input, authorityGrants: [{ ...grants[0]!, revokedOn: '2031-12-31' as never }, { ...grants[1]!, grantedOn: '2033-01-01' as never }] })).toEqual([])
  })
  const invalidExecutionEvidence: readonly [string, { readonly bodyId?: string; readonly bodies?: readonly GovernanceBody[]; readonly grants?: readonly GovernanceAuthorityGrant[]; readonly participation?: GovernanceDecisionParticipationGrant }][] = [
    ['wrong body', { bodyId: 'board' }],
    ['wrong right', { participation: { ...participation[2]!, right: 'APPROVE' as const } }],
    ['foreign institution', { bodies: [...clubBodies, { id: 'foreign-executive', institutionId: 'foreign', kind: 'EXECUTIVE' as const, name: 'foreign' }], participation: { ...participation[2]!, bodyId: 'foreign-executive' } }],
    ['unrelated edge', { participation: { ...participation[2]!, authorityGrantId: 'grant:owner-board' } }],
    ['endpoint mismatch', { participation: { ...participation[2]!, edgeParticipant: 'DELEGATOR' as const } }],
    ['wrong decision type', { grants: [{ ...authorities[0]!, decision: 'BUDGET' as const }] }],
  ];
  it.each(invalidExecutionEvidence)('rejects %s execution evidence', (_name, change) => {
    const input = { event: { kind: 'EXECUTED' as const, bodyId: change.bodyId ?? 'executive', effectiveOn: date }, decisionType: 'COACH_FIRING' as const, institutionId: 'club', bodies: change.bodies ?? clubBodies, authorityGrants: change.grants ?? [authorities[0]!], participationGrants: [change.participation ?? participation[2]!] }
    expect(resolveGovernanceDecisionEventAuthorityGrantIds(input)).toEqual([])
  })
});
