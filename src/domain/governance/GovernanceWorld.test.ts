import { describe, expect, it } from "vitest";
import { createNewGame } from "@/app/game";
import { governanceActorForStaff } from "@/domain/governance";
import { updateGameWorld } from "@/domain/world";
import { deserializeGameWorldV3, serializeGameWorldV3 } from "@/save/GameWorldSaveV3";

type Universe = "PROFESSIONAL_CLUB" | "NBA_WNBA" | "NCAA" | "FEDERATION";

function governanceFixture(universe: Universe) {
  const base = createNewGame();
  const team = Object.values(base.teams)[0]!;
  const conference = Object.values(base.conferencesById)[0]!;
  const institution = { id: `institution:${universe}`, universe, name: `${universe} institution`, teamIds: [team.id] } as const;
  const bodies = universe === "NCAA"
    ? [
        { id: "body:trustees", institutionId: institution.id, kind: "BOARD" as const, name: "Trustees and regents" },
        { id: "body:president", institutionId: institution.id, kind: "EXECUTIVE" as const, name: "President and chancellor" },
        { id: "body:athletics", institutionId: institution.id, kind: "ATHLETIC_DEPARTMENT" as const, name: "Athletic department" },
        { id: "body:compliance", institutionId: institution.id, kind: "COMPLIANCE" as const, name: "Compliance office" },
      ]
    : universe === "FEDERATION"
      ? [
          { id: "body:federation", institutionId: institution.id, kind: "BOARD" as const, name: "Federation governance" },
          { id: "body:national-team", institutionId: institution.id, kind: "EXECUTIVE" as const, name: "National-team sporting authority" },
        ]
      : [
          { id: "body:ownership", institutionId: institution.id, kind: "OWNERSHIP" as const, name: "Ownership" },
          { id: "body:board", institutionId: institution.id, kind: "BOARD" as const, name: universe === "NBA_WNBA" ? "Governor board" : "Board" },
          { id: "body:executive", institutionId: institution.id, kind: "EXECUTIVE" as const, name: "Basketball executive" },
        ];
  const appointments = universe === "NCAA"
    ? [
        { id: "appointment:president", bodyId: "body:president", actor: { kind: "EXTERNAL" as const, id: "person:president" }, role: "PRESIDENT" as const, startedOn: "2032-01-01" as never, endedOn: "2034-06-30" as never },
        { id: "appointment:ad", bodyId: "body:athletics", actor: { kind: "EXTERNAL" as const, id: "person:ad" }, role: "ATHLETIC_DIRECTOR" as const, startedOn: "2032-01-01" as never },
        { id: "appointment:compliance", bodyId: "body:compliance", actor: { kind: "EXTERNAL" as const, id: "person:compliance" }, role: "COMPLIANCE_OFFICER" as const, startedOn: "2032-01-01" as never },
      ]
    : universe === "NBA_WNBA"
      ? [
          { id: "appointment:governor", bodyId: "body:board", actor: { kind: "EXTERNAL" as const, id: "person:governor" }, role: "GOVERNOR" as const, startedOn: "2032-01-01" as never },
          { id: "appointment:alternate-governor", bodyId: "body:board", actor: { kind: "EXTERNAL" as const, id: "person:alternate-governor" }, role: "ALTERNATE_GOVERNOR" as const, startedOn: "2032-01-01" as never },
          { id: "appointment:basketball-executive", bodyId: "body:executive", actor: { kind: "EXTERNAL" as const, id: "person:basketball-executive" }, role: "PRESIDENT_BASKETBALL_OPERATIONS" as const, startedOn: "2032-01-01" as never },
        ]
      : universe === "FEDERATION"
        ? [
            { id: "appointment:federation-president", bodyId: "body:federation", actor: { kind: "EXTERNAL" as const, id: "person:federation-president" }, role: "FEDERATION_PRESIDENT" as const, startedOn: "2032-01-01" as never },
            { id: "appointment:sporting-director", bodyId: "body:national-team", actor: { kind: "EXTERNAL" as const, id: "person:sporting-director" }, role: "SPORTING_DIRECTOR" as const, startedOn: "2032-01-01" as never },
          ]
        : [{ id: "appointment:ceo", bodyId: "body:executive", actor: { kind: "EXTERNAL" as const, id: "person:ceo" }, role: "CEO" as const, startedOn: "2032-01-01" as never }];
  const grants = universe === "NCAA"
    ? [
        { id: "grant:trustees-president", fromBodyId: "body:trustees", toBodyId: "body:president", decision: "STRATEGIC_PLAN" as const, grantedOn: "2032-01-01" as never },
        { id: "grant:president-athletics", fromBodyId: "body:president", toBodyId: "body:athletics", decision: "BUDGET" as const, grantedOn: "2032-01-01" as never },
        { id: "grant:athletics-compliance", fromBodyId: "body:athletics", toBodyId: "body:compliance", decision: "COMPLIANCE_POLICY" as const, grantedOn: "2032-01-01" as never },
      ]
    : universe === "FEDERATION"
      ? [{ id: "grant:federation-national-team", fromBodyId: "body:federation", toBodyId: "body:national-team", decision: "STRATEGIC_PLAN" as const, grantedOn: "2032-01-01" as never }]
      : [
          { id: `grant:${universe}:ownership-board`, fromBodyId: "body:ownership", toBodyId: "body:board", decision: "STRATEGIC_PLAN" as const, grantedOn: "2032-01-01" as never },
          { id: `grant:${universe}:board-executive`, fromBodyId: "body:board", toBodyId: "body:executive", decision: "PLAYER_BUDGET" as const, grantedOn: "2032-01-01" as never },
        ];
  const externalRelationships = universe === "NCAA"
    ? [
        { id: "external:conference", institutionId: institution.id, externalRef: { kind: "CONFERENCE" as const, id: conference.id }, relationshipType: "CONFERENCE_MEMBERSHIP" as const, startedOn: "2032-01-01" as never },
        { id: "external:nil", bodyId: "body:athletics", externalRef: { kind: "NIL_COLLECTIVE" as const, id: "nil-collective:placeholder" }, relationshipType: "NIL_COLLECTIVE_RELATIONSHIP" as const, startedOn: "2032-01-01" as never },
        { id: "external:donors", bodyId: "body:athletics", externalRef: { kind: "DONOR_ECOSYSTEM" as const, id: "donor-ecosystem:placeholder" }, relationshipType: "DONOR_RELATIONSHIP" as const, startedOn: "2032-01-01" as never },
        { id: "external:boosters", bodyId: "body:athletics", externalRef: { kind: "BOOSTER_ECOSYSTEM" as const, id: "booster-ecosystem:placeholder" }, relationshipType: "BOOSTER_RELATIONSHIP" as const, startedOn: "2032-01-01" as never },
      ]
    : [];
  return updateGameWorld(base, {
    governanceInstitutions: [institution],
    governanceBodies: bodies,
    governanceAppointments: appointments,
    governanceAuthorityGrants: grants,
    governanceExternalRelationships: externalRelationships,
  });
}

describe("Governance world integration", () => {
  it("rejects invalid BG3 period, evaluation, source, and transition references", () => {
    const world = governanceFixture("PROFESSIONAL_CLUB"), institution = Object.values(world.governanceInstitutionsById)[0]!, body = world.governanceBodiesById["body:board"]!, managerId = world.userCoachId
    const period = { id: "bg3-period", institutionId: institution.id, universe: institution.universe, manager: { kind: "COACH" as const, id: managerId }, startedOn: world.currentDate, endedOn: "2033-01-01" as never }
    expect(() => updateGameWorld(world, { governanceManagerEvaluationPeriods: [{ ...period, manager: { kind: "COACH", id: "missing" } }] })).toThrow()
    expect(() => updateGameWorld(world, { governanceManagerEvaluationPeriods: [{ ...period, institutionId: "missing" }] })).toThrow()
    expect(() => updateGameWorld(world, { governanceManagerEvaluationPeriods: [{ ...period, startedOn: "2034-01-01" as never }] })).toThrow()
    expect(() => updateGameWorld(world, { governanceManagerEvaluationPeriods: [period, period] })).toThrow()
    const withPeriod = updateGameWorld(world, { governanceManagerEvaluationPeriods: [period] })
    const evaluation = { id: "bg3-evaluation", evaluationPeriodId: period.id, evaluatorBodyId: body.id, evaluatedOn: world.currentDate, objectiveEvaluations: [], factors: [{ id: "factor", kind: "INSTITUTIONAL_PATIENCE" as const, status: "PRESENT" as const, weight: 1, direction: "POSITIVE" as const, normalizedValue: .8, source: { kind: "GOVERNANCE_BODY" as const, bodyId: body.id } }] }
    expect(() => updateGameWorld(withPeriod, { governanceManagerEvaluations: [{ ...evaluation, evaluationPeriodId: "missing" }] })).toThrow()
    expect(() => updateGameWorld(withPeriod, { governanceManagerEvaluations: [{ ...evaluation, evaluatorBodyId: "missing" }] })).toThrow()
    expect(() => updateGameWorld(withPeriod, { governanceManagerEvaluations: [{ ...evaluation, evaluatedOn: "2031-01-01" as never }] })).toThrow()
    expect(() => updateGameWorld(withPeriod, { governanceManagerEvaluations: [{ ...evaluation, evaluatedOn: "2034-01-02" as never }] })).toThrow()
    expect(() => updateGameWorld(withPeriod, { governanceManagerEvaluations: [{ ...evaluation, factors: [...evaluation.factors, { ...evaluation.factors[0] }] }] })).toThrow()
    expect(() => updateGameWorld(withPeriod, { governanceManagerEvaluations: [{ ...evaluation, factors: [{ ...evaluation.factors[0], source: { kind: "GOVERNANCE_BODY", bodyId: "missing" } }] }] })).toThrow()
    const withEvaluation = updateGameWorld(withPeriod, { governanceManagerEvaluations: [evaluation] })
    const transition = { id: "bg3-transition", managerId, institutionId: institution.id, bodyId: body.id, evaluationId: evaluation.id, nextState: "STABLE" as const, effectiveOn: world.currentDate, triggerKinds: ["INSTITUTIONAL_PATIENCE" as const], sourceFactorIds: ["factor"] }
    expect(updateGameWorld(withEvaluation, { governanceJobSecurityTransitions: [transition] }).governanceJobSecurityTransitionsById[transition.id]).toBeDefined()
    expect(() => updateGameWorld(withEvaluation, { governanceJobSecurityTransitions: [{ ...transition, managerId: "missing" }] })).toThrow()
    expect(() => updateGameWorld(withEvaluation, { governanceJobSecurityTransitions: [{ ...transition, evaluationId: "missing" }] })).toThrow()
    expect(() => updateGameWorld(withEvaluation, { governanceJobSecurityTransitions: [{ ...transition, institutionId: "missing" }] })).toThrow()
    expect(() => updateGameWorld(withEvaluation, { governanceJobSecurityTransitions: [{ ...transition, bodyId: "missing" }] })).toThrow()
    expect(() => updateGameWorld(withEvaluation, { governanceJobSecurityTransitions: [{ ...transition, effectiveOn: "2031-01-01" as never }] })).toThrow()
    expect(() => updateGameWorld(withEvaluation, { governanceJobSecurityTransitions: [{ ...transition, sourceFactorIds: ["missing"] }] })).toThrow()
    expect(() => updateGameWorld(withEvaluation, { governanceJobSecurityTransitions: [transition, transition] })).toThrow()
  })
  it("permits overlapping BG3 periods as additive historical body-specific records", () => {
    const world = governanceFixture("PROFESSIONAL_CLUB"), institution = Object.values(world.governanceInstitutionsById)[0]!, manager = world.userCoachId
    const first = { id: "period:one", institutionId: institution.id, universe: institution.universe, manager: { kind: "COACH" as const, id: manager }, startedOn: world.currentDate }
    const second = { ...first, id: "period:two" }
    expect(Object.keys(updateGameWorld(world, { governanceManagerEvaluationPeriods: [first, second] }).governanceManagerEvaluationPeriodsById)).toEqual([first.id, second.id])
  })
  it.each([["PROFESSIONAL_CLUB", 3], ["NBA_WNBA", 3], ["NCAA", 4], ["FEDERATION", 2]] as const)("models %s as its own governance structure", (universe, bodyCount) => {
    const world = governanceFixture(universe);
    expect(Object.values(world.governanceInstitutionsById)[0]!.universe).toBe(universe);
    expect(Object.keys(world.governanceBodiesById)).toHaveLength(bodyCount);
    if (universe === "NCAA") {
      expect(Object.values(world.governanceAppointmentsById).map((appointment) => appointment.role)).toEqual(["PRESIDENT", "ATHLETIC_DIRECTOR", "COMPLIANCE_OFFICER"]);
      expect(Object.values(world.governanceBodiesById).map((body) => body.kind)).toEqual(["BOARD", "EXECUTIVE", "ATHLETIC_DEPARTMENT", "COMPLIANCE"]);
      expect(Object.values(world.governanceExternalRelationshipsById).map((relationship) => relationship.relationshipType)).toEqual(["CONFERENCE_MEMBERSHIP", "NIL_COLLECTIVE_RELATIONSHIP", "DONOR_RELATIONSHIP", "BOOSTER_RELATIONSHIP"]);
    }
    if (universe === "NBA_WNBA") expect(Object.values(world.governanceAppointmentsById).map((appointment) => appointment.role)).toEqual(["GOVERNOR", "ALTERNATE_GOVERNOR", "PRESIDENT_BASKETBALL_OPERATIONS"]);
  });

  it("round-trips all governance collections and historical dates, while old V3 saves default empty", () => {
    const world = governanceFixture("NCAA");
    const saved = serializeGameWorldV3(world, "2032-01-02T00:00:00.000Z");
    const loaded = deserializeGameWorldV3(saved);
    expect(loaded.governanceInstitutionsById).toEqual(world.governanceInstitutionsById);
    expect(loaded.governanceBodiesById).toEqual(world.governanceBodiesById);
    expect(loaded.governanceAppointmentsById).toEqual(world.governanceAppointmentsById);
    expect(loaded.governanceAuthorityGrantsById).toEqual(world.governanceAuthorityGrantsById);
    expect(loaded.governanceExternalRelationshipsById).toEqual(world.governanceExternalRelationshipsById);
    const reserialized = serializeGameWorldV3(loaded, "2032-01-02T00:00:00.000Z");
    expect(governanceRuntime(reserialized)).toEqual(governanceRuntime(saved));
    const legacy = structuredClone(saved);
    const runtime = legacy.payload.staffCareerRuntime as Record<string, unknown>;
    delete runtime.governanceInstitutions; delete runtime.governanceBodies;
    delete runtime.governanceAppointments; delete runtime.governanceAuthorityGrants;
    delete runtime.governanceExternalRelationships;
    const oldLoaded = deserializeGameWorldV3(legacy);
    expect(Object.values(oldLoaded.governanceInstitutionsById)).toHaveLength(0);
    expect(Object.values(oldLoaded.governanceBodiesById)).toHaveLength(0);
    expect(Object.values(oldLoaded.governanceAppointmentsById)).toHaveLength(0);
    expect(Object.values(oldLoaded.governanceAuthorityGrantsById)).toHaveLength(0);
    expect(Object.values(oldLoaded.governanceExternalRelationshipsById)).toHaveLength(0);
  });

  it("rejects missing references, duplicate IDs or team links, and governance cycles", () => {
    const world = governanceFixture("PROFESSIONAL_CLUB");
    expect(() => updateGameWorld(world, { governanceBodies: [...Object.values(world.governanceBodiesById), { id: "body:bad", institutionId: "missing", kind: "BOARD", name: "Bad" }] })).toThrow();
    expect(() => updateGameWorld(world, { governanceAppointments: [{ id: "appointment:bad", bodyId: "body:missing", actor: { kind: "EXTERNAL", id: "person:bad" }, role: "CEO", startedOn: "2032-01-01" as never }] })).toThrow();
    expect(() => updateGameWorld(world, { governanceAuthorityGrants: [{ id: "grant:bad", fromBodyId: "body:missing", toBodyId: "body:board", decision: "BUDGET", grantedOn: "2032-01-01" as never }] })).toThrow();
    expect(() => updateGameWorld(world, { governanceAuthorityGrants: [{ id: "grant:bad-target", fromBodyId: "body:ownership", toBodyId: "body:missing", decision: "BUDGET", grantedOn: "2032-01-01" as never }] })).toThrow();
    expect(() => updateGameWorld(world, { governanceAppointments: [{ id: "appointment:bad-date", bodyId: "body:board", actor: { kind: "EXTERNAL", id: "person:bad" }, role: "CEO", startedOn: "2032-02-01" as never, endedOn: "2032-01-01" as never }] })).toThrow();
    expect(() => updateGameWorld(world, { governanceBodies: [...Object.values(world.governanceBodiesById), Object.values(world.governanceBodiesById)[0]!] })).toThrow();
    expect(() => updateGameWorld(world, { governanceInstitutions: [...Object.values(world.governanceInstitutionsById), { id: "institution:duplicate", universe: "PROFESSIONAL_CLUB", name: "Duplicate", teamIds: [Object.values(world.teams)[0]!.id] }] })).toThrow();
    expect(() => updateGameWorld(world, { governanceAuthorityGrants: [...Object.values(world.governanceAuthorityGrantsById), { id: "grant:cycle", fromBodyId: "body:board", toBodyId: "body:ownership", decision: "STRATEGIC_PLAN", grantedOn: "2032-01-01" as never }] })).toThrow();
    const parentCycle = Object.values(world.governanceInstitutionsById)[0]!;
    expect(() => updateGameWorld(world, { governanceInstitutions: [{ ...parentCycle, parentInstitutionId: "institution:parent" }, { id: "institution:parent", universe: "PROFESSIONAL_CLUB", name: "Parent", teamIds: [], parentInstitutionId: parentCycle.id }] })).toThrow();
    expect(() => updateGameWorld(world, { governanceInstitutions: [{ ...parentCycle, parentInstitutionId: "institution:missing" }] })).toThrow();
  });

  it("enforces BG2 period and objective references, ownership, and historical windows", () => {
    const world = governanceFixture("PROFESSIONAL_CLUB");
    const period = expectationPeriod();
    const validInstitutionObjective = expectationObjective({ id: "objective:institution", ownerInstitutionId: "institution:PROFESSIONAL_CLUB" });
    const validBodyObjective = expectationObjective({ id: "objective:body", ownerBodyId: "body:board" });
    const validExecutiveObjective = expectationObjective({ id: "objective:executive", ownerBodyId: "body:executive", metric: "PLAYER_DEVELOPMENT_SCORE", family: "PLAYER_DEVELOPMENT" });
    const valid = updateGameWorld(world, { governanceExpectationPeriods: [period, expectationPeriod({ id: "period:open", startedOn: "2034-01-01" as never, endedOn: undefined })], governanceObjectives: [validInstitutionObjective, validBodyObjective, validExecutiveObjective] });
    expect(Object.keys(valid.governanceExpectationPeriodsById)).toEqual(["period:history", "period:open"]);
    expect(valid.governanceExpectationPeriodsById["period:open"]!.endedOn).toBeUndefined();
    expect(valid.governanceObjectivesById["objective:institution"]!.expectationPeriodId).toBe("period:history");
    expect(valid.governanceObjectivesById["objective:body"]!.ownerBodyId).toBe("body:board");
    expect(valid.governanceObjectivesById["objective:executive"]!.ownerBodyId).toBe("body:executive");

    expect(() => updateGameWorld(world, { governanceExpectationPeriods: [expectationPeriod({ institutionId: "institution:missing" })] })).toThrow();
    expect(() => updateGameWorld(world, { governanceExpectationPeriods: [expectationPeriod({ universe: "NCAA" })] })).toThrow();
    expect(() => updateGameWorld(world, { governanceExpectationPeriods: [expectationPeriod({ startedOn: "2033-01-01" as never, endedOn: "2032-01-01" as never })] })).toThrow();
    expect(() => updateGameWorld(world, { governanceObjectives: [expectationObjective({ expectationPeriodId: "period:missing" })] })).toThrow();
    const withPeriod = updateGameWorld(world, { governanceExpectationPeriods: [period] });
    expect(() => updateGameWorld(withPeriod, { governanceObjectives: [expectationObjective({ ownerInstitutionId: "institution:missing" })] })).toThrow();
    expect(() => updateGameWorld(withPeriod, { governanceObjectives: [expectationObjective({ ownerInstitutionId: "institution:other" })], governanceInstitutions: [...Object.values(world.governanceInstitutionsById), { id: "institution:other", universe: "PROFESSIONAL_CLUB", name: "Other", teamIds: [] }] })).toThrow();
    expect(() => updateGameWorld(withPeriod, { governanceObjectives: [expectationObjective({ ownerBodyId: "body:missing" })] })).toThrow();
    expect(() => updateGameWorld(withPeriod, { governanceObjectives: [expectationObjective({ ownerInstitutionId: undefined, ownerBodyId: "body:other" })], governanceInstitutions: [...Object.values(world.governanceInstitutionsById), { id: "institution:other", universe: "PROFESSIONAL_CLUB", name: "Other", teamIds: [] }], governanceBodies: [...Object.values(world.governanceBodiesById), { id: "body:other", institutionId: "institution:other", kind: "BOARD", name: "Other board" }] })).toThrow();
    expect(() => updateGameWorld(withPeriod, { governanceObjectives: [expectationObjective({ evaluationStartsOn: "2031-12-31" as never })] })).toThrow();
    expect(() => updateGameWorld(withPeriod, { governanceObjectives: [expectationObjective({ evaluationEndsOn: "2033-01-01" as never })] })).toThrow();
    expect(() => updateGameWorld(withPeriod, { governanceObjectives: [expectationObjective({ evaluationStartsOn: "2032-12-31" as never, evaluationEndsOn: "2032-01-01" as never })] })).toThrow();
  });

  it("round-trips every BG2 target shape, historical field, and missing-BG2 legacy save", () => {
    const base = governanceFixture("NCAA");
    const period = { id: "period:bg2", institutionId: "institution:NCAA", universe: "NCAA" as const, startedOn: "2032-01-01" as never, endedOn: "2032-12-31" as never };
    const objectives = [
      { id: "objective:numeric", expectationPeriodId: period.id, ownerInstitutionId: period.institutionId, family: "PLAYER_DEVELOPMENT" as const, horizon: "SHORT" as const, metric: "PLAYER_DEVELOPMENT_SCORE" as const, comparison: "AT_LEAST" as const, target: { kind: "NUMERIC" as const, value: 60 }, tolerance: 2, partialTolerance: 5, importance: 70, evaluationStartsOn: "2032-02-01" as never, evaluationEndsOn: "2032-10-01" as never },
      { id: "objective:boolean", expectationPeriodId: period.id, ownerBodyId: "body:athletics", family: "SPORTING_RESULTS" as const, horizon: "MEDIUM" as const, metric: "PLAYOFF_QUALIFICATION" as const, comparison: "BOOLEAN_SUCCESS" as const, target: { kind: "BOOLEAN" as const, value: true }, tolerance: 0, importance: 80, evaluationStartsOn: "2032-03-01" as never, evaluationEndsOn: "2032-11-01" as never },
      { id: "objective:range", expectationPeriodId: period.id, ownerBodyId: "body:athletics", family: "ROSTER_CONSTRUCTION" as const, horizon: "LONG" as const, metric: "ROSTER_AGE_PROFILE" as const, comparison: "BETWEEN" as const, target: { kind: "RANGE" as const, minimum: 23, maximum: 27 }, tolerance: 0, importance: 50, evaluationStartsOn: "2032-04-01" as never, evaluationEndsOn: "2032-12-01" as never },
    ];
    const world = updateGameWorld(base, { governanceExpectationPeriods: [period], governanceObjectives: objectives });
    const saved = serializeGameWorldV3(world, "2032-01-02T00:00:00.000Z");
    const loaded = deserializeGameWorldV3(saved);
    expect(loaded.governanceExpectationPeriodsById).toEqual(world.governanceExpectationPeriodsById);
    expect(loaded.governanceObjectivesById).toEqual(world.governanceObjectivesById);
    expect(loaded.governanceObjectivesById["objective:numeric"]!.target).toEqual({ kind: "NUMERIC", value: 60 });
    expect(loaded.governanceObjectivesById["objective:boolean"]!.target).toEqual({ kind: "BOOLEAN", value: true });
    expect(loaded.governanceObjectivesById["objective:range"]!.target).toEqual({ kind: "RANGE", minimum: 23, maximum: 27 });
    expect(loaded.governanceObjectivesById["objective:numeric"]!.partialTolerance).toBe(5);
    expect(loaded.governanceObjectivesById["objective:boolean"]!.partialTolerance).toBeUndefined();
    expect(governanceRuntime(serializeGameWorldV3(loaded, "2032-01-02T00:00:00.000Z"))).toEqual(governanceRuntime(saved));
    const legacy = structuredClone(saved); const runtime = legacy.payload.staffCareerRuntime as Record<string, unknown>;
    delete runtime.governanceExpectationPeriods; delete runtime.governanceObjectives;
    const oldLoaded = deserializeGameWorldV3(legacy);
    expect(oldLoaded.governanceExpectationPeriodsById).toEqual({});
    expect(oldLoaded.governanceObjectivesById).toEqual({});
  });

  it("provides a typed staff-political actor bridge without changing staff politics", () => {
    const staffId = "staff:political-actor" as never;
    expect(governanceActorForStaff(staffId)).toEqual({ kind: "STAFF", id: staffId });
  });

  it("validates BG4 grant-evidenced decision history without executing coach employment", () => {
    const world = governanceFixture("PROFESSIONAL_CLUB");
    const grants = [
      ...Object.values(world.governanceAuthorityGrantsById),
      { id: "grant:bg4:owner-board", fromBodyId: "body:ownership", toBodyId: "body:board", decision: "COACH_FIRING" as const, grantedOn: world.currentDate },
      { id: "grant:bg4:board-executive", fromBodyId: "body:board", toBodyId: "body:executive", decision: "COACH_FIRING" as const, grantedOn: world.currentDate },
    ];
    const rights = [
      { id: "right:bg4:propose", authorityGrantId: "grant:bg4:board-executive", bodyId: "body:executive", edgeParticipant: "DELEGATE" as const, right: "PROPOSE" as const },
      { id: "right:bg4:review", authorityGrantId: "grant:bg4:owner-board", bodyId: "body:board", edgeParticipant: "DELEGATE" as const, right: "REVIEW" as const },
      { id: "right:bg4:approve", authorityGrantId: "grant:bg4:owner-board", bodyId: "body:board", edgeParticipant: "DELEGATE" as const, right: "APPROVE" as const, approvalRequirement: "ALL_OF" as const },
      { id: "right:bg4:execute", authorityGrantId: "grant:bg4:board-executive", bodyId: "body:executive", edgeParticipant: "DELEGATE" as const, right: "EXECUTE" as const },
    ];
    const decision = { id: "decision:bg4", institutionId: "institution:PROFESSIONAL_CLUB", decisionType: "COACH_FIRING" as const, proposedByBodyId: "body:executive", proposedOn: world.currentDate, subject: { kind: "COACH" as const, coachId: world.userCoachId } };
    const events = [
      { id: "01", decisionId: decision.id, kind: "PROPOSED" as const, bodyId: "body:executive", effectiveOn: world.currentDate, authorityGrantIds: ["grant:bg4:board-executive"] },
      { id: "02", decisionId: decision.id, kind: "REVIEW_STARTED" as const, bodyId: "body:board", effectiveOn: world.currentDate, authorityGrantIds: ["grant:bg4:owner-board"] },
      { id: "03", decisionId: decision.id, kind: "APPROVED" as const, bodyId: "body:board", effectiveOn: world.currentDate, authorityGrantIds: ["grant:bg4:owner-board"] },
    ];
    const updated = updateGameWorld(world, { governanceAuthorityGrants: grants, governanceDecisionParticipationGrants: rights, governanceDecisions: [decision], governanceDecisionEvents: events });
    expect(updated.governanceDecisionEventsById["03"]).toBeDefined();
    expect(Object.values(updated.teams)[0]!.coachId).toBe(Object.values(world.teams)[0]!.coachId);
    const reloaded = deserializeGameWorldV3(serializeGameWorldV3(updated, "2032-01-02T00:00:00.000Z"));
    expect(reloaded.governanceDecisionsById[decision.id]!.subject).toEqual(decision.subject);
    expect(reloaded.governanceDecisionEventsById["03"]!.authorityGrantIds).toEqual(["grant:bg4:owner-board"]);
  });

  it("keeps external attachments outside formal authority and authority-cycle resolution", () => {
    const world = governanceFixture("NCAA");
    const externalIds = Object.keys(world.governanceExternalRelationshipsById);
    expect(Object.values(world.governanceAuthorityGrantsById).flatMap((grant) => [grant.fromBodyId, grant.toBodyId])).not.toEqual(expect.arrayContaining(externalIds));
    for (const externalId of ["external:nil", "external:donors", "external:boosters", "external:conference"]) {
      expect(() => updateGameWorld(world, { governanceAuthorityGrants: [...Object.values(world.governanceAuthorityGrantsById), { id: `grant:${externalId}`, fromBodyId: "body:athletics", toBodyId: externalId, decision: "NIL_POLICY", grantedOn: "2032-01-01" as never }] })).toThrow();
    }
  });

  it("permits a formal-only strategic decision to execute but blocks unsupported effect-required decisions", () => {
    const base = governanceFixture("PROFESSIONAL_CLUB"), institution = Object.values(base.governanceInstitutionsById)[0]!, date = base.currentDate
    const make = (decisionType: "STRATEGIC_PLAN" | "COACH_HIRING" | "EXECUTIVE_HIRING" | "EXECUTIVE_FIRING") => {
      const grant = { id: `grant:${decisionType}`, fromBodyId: "body:ownership", toBodyId: "body:board", decision: decisionType, grantedOn: date }
      const subject = decisionType === "STRATEGIC_PLAN" ? { kind: "GENERIC" as const, referenceId: "plan" } : decisionType === "COACH_HIRING" ? { kind: "COACH" as const, coachId: base.userCoachId } : { kind: "EXECUTIVE" as const, staffId: Object.values(base.staffPeopleById)[0]!.id }
      const decision = { id: `decision:${decisionType}`, institutionId: institution.id, decisionType, proposedByBodyId: "body:board", proposedOn: date, subject }
      const rights = [{ id: `propose:${decisionType}`, authorityGrantId: grant.id, bodyId: "body:board", edgeParticipant: "DELEGATE" as const, right: "PROPOSE" as const }, { id: `approve:${decisionType}`, authorityGrantId: grant.id, bodyId: "body:ownership", edgeParticipant: "DELEGATOR" as const, right: "APPROVE" as const }, { id: `execute:${decisionType}`, authorityGrantId: grant.id, bodyId: "body:board", edgeParticipant: "DELEGATE" as const, right: "EXECUTE" as const }]
      const events = [{ id: `01:${decisionType}`, decisionId: decision.id, kind: "PROPOSED" as const, bodyId: "body:board", effectiveOn: date, authorityGrantIds: [grant.id] }, { id: `02:${decisionType}`, decisionId: decision.id, kind: "APPROVED" as const, bodyId: "body:ownership", effectiveOn: date, authorityGrantIds: [grant.id] }, { id: `03:${decisionType}`, decisionId: decision.id, kind: "EXECUTED" as const, bodyId: "body:board", effectiveOn: date, authorityGrantIds: [grant.id] }]
      return { governanceAuthorityGrants: [...Object.values(base.governanceAuthorityGrantsById), grant], governanceDecisionParticipationGrants: rights, governanceDecisions: [decision], governanceDecisionEvents: events }
    }
    expect(updateGameWorld(base, make("STRATEGIC_PLAN")).governanceDecisionEventsById["03:STRATEGIC_PLAN"]).toBeDefined()
    for (const type of ["COACH_HIRING", "EXECUTIVE_HIRING", "EXECUTIVE_FIRING"] as const) expect(() => updateGameWorld(base, make(type))).toThrow("unimplemented execution effect")
  });

  it("requires a manager-evaluation source to match the decision institution and coach, while remaining optional", () => {
    const base = governanceFixture("PROFESSIONAL_CLUB"), institution = Object.values(base.governanceInstitutionsById)[0]!, coachB = Object.values(base.coaches).find((coach) => coach.id !== base.userCoachId)!, date = base.currentDate
    const grant = { id: "grant:source", fromBodyId: "body:ownership", toBodyId: "body:board", decision: "COACH_FIRING" as const, grantedOn: date }, rights = [{ id: "source-propose", authorityGrantId: grant.id, bodyId: "body:board", edgeParticipant: "DELEGATE" as const, right: "PROPOSE" as const }], decision = { id: "source-decision", institutionId: institution.id, decisionType: "COACH_FIRING" as const, proposedByBodyId: "body:board", proposedOn: date, subject: { kind: "COACH" as const, coachId: base.userCoachId } }, events = [{ id: "source-proposed", decisionId: decision.id, kind: "PROPOSED" as const, bodyId: "body:board", effectiveOn: date, authorityGrantIds: [grant.id] }]
    const common = { governanceAuthorityGrants: [...Object.values(base.governanceAuthorityGrantsById), grant], governanceDecisionParticipationGrants: rights, governanceDecisions: [decision], governanceDecisionEvents: events }
    expect(updateGameWorld(base, common).governanceDecisionsById[decision.id]!.source).toBeUndefined()
    expect(() => updateGameWorld(base, { ...common, governanceDecisions: [{ ...decision, source: { kind: "MANAGER_EVALUATION", evaluationId: "missing" } }] })).toThrow()
    const period = { id: "source-period", institutionId: institution.id, universe: institution.universe, manager: { kind: "COACH" as const, id: base.userCoachId }, startedOn: date }, evaluation = { id: "source-evaluation", evaluationPeriodId: period.id, evaluatorBodyId: "body:board", evaluatedOn: date, objectiveEvaluations: [], factors: [{ id: "source-factor", kind: "INSTITUTIONAL_PATIENCE" as const, status: "PRESENT" as const, weight: 1, direction: "POSITIVE" as const, normalizedValue: .8, source: { kind: "GOVERNANCE_BODY" as const, bodyId: "body:board" } }] }
    expect(updateGameWorld(base, { ...common, governanceManagerEvaluationPeriods: [period], governanceManagerEvaluations: [evaluation], governanceDecisions: [{ ...decision, source: { kind: "MANAGER_EVALUATION", evaluationId: evaluation.id } }] }).governanceDecisionsById[decision.id]!.source).toEqual({ kind: "MANAGER_EVALUATION", evaluationId: evaluation.id })
    expect(() => updateGameWorld(base, { ...common, governanceManagerEvaluationPeriods: [{ ...period, manager: { kind: "COACH", id: coachB.id } }], governanceManagerEvaluations: [evaluation], governanceDecisions: [{ ...decision, source: { kind: "MANAGER_EVALUATION", evaluationId: evaluation.id } }] })).toThrow("does not match its institution or coach")
    const otherInstitution = { id: "institution:other", universe: "PROFESSIONAL_CLUB" as const, name: "Other", teamIds: [] }, otherBody = { id: "body:other", institutionId: otherInstitution.id, kind: "BOARD" as const, name: "Other board" }, otherPeriod = { ...period, institutionId: otherInstitution.id, universe: otherInstitution.universe }, otherEvaluation = { ...evaluation, evaluationPeriodId: otherPeriod.id, evaluatorBodyId: otherBody.id, factors: [{ ...evaluation.factors[0]!, source: { kind: "GOVERNANCE_BODY" as const, bodyId: otherBody.id } }] }
    expect(() => updateGameWorld(base, { ...common, governanceInstitutions: [...Object.values(base.governanceInstitutionsById), otherInstitution], governanceBodies: [...Object.values(base.governanceBodiesById), otherBody], governanceManagerEvaluationPeriods: [otherPeriod], governanceManagerEvaluations: [otherEvaluation], governanceDecisions: [{ ...decision, source: { kind: "MANAGER_EVALUATION", evaluationId: otherEvaluation.id } }] })).toThrow("does not match its institution or coach")
  });
});

describe('BG5C commitment world validation', () => {
  const setup = () => {
    const base = createNewGame(), team = Object.values(base.teams)[0]!, institution = { id: 'bg5c-world-institution', universe: 'PROFESSIONAL_CLUB' as const, name: 'BG5C', teamIds: [team.id] }, body = { id: 'bg5c-world-body', institutionId: institution.id, kind: 'BOARD' as const, name: 'Board' }, commitment = { id: 'bg5c-world-commitment', institutionId: institution.id, promisor: { kind: 'BODY' as const, bodyId: body.id }, beneficiary: { kind: 'ACTOR' as const, actor: { kind: 'COACH' as const, id: base.userCoachId } }, summary: 'Plan', dueOn: '2032-01-10' as never, provenance: { kind: 'STANDALONE' as const } }
    return { base, institution, body, commitment }
  }
  it('indexes valid commitments and rejects party, deadline, and actor violations', () => {
    const { base, institution, body, commitment } = setup(), made = { id: '01', commitmentId: commitment.id, kind: 'MADE' as const, effectiveOn: '2032-01-01' as never, actor: commitment.promisor }
    expect(updateGameWorld(base, { governanceInstitutions: [institution], governanceBodies: [body], governanceCommitments: [commitment], governanceCommitmentEvents: [made] }).governanceCommitmentsById[commitment.id]).toBeDefined()
    expect(() => updateGameWorld(base, { governanceInstitutions: [institution], governanceBodies: [body], governanceCommitments: [{ ...commitment, promisor: { kind: 'BODY', bodyId: 'missing' } }], governanceCommitmentEvents: [made] })).toThrow()
    expect(() => updateGameWorld(base, { governanceInstitutions: [institution], governanceBodies: [body], governanceCommitments: [{ ...commitment, dueOn: '2031-12-31' as never }], governanceCommitmentEvents: [made] })).toThrow()
    expect(() => updateGameWorld(base, { governanceInstitutions: [institution], governanceBodies: [body], governanceCommitments: [commitment], governanceCommitmentEvents: [{ ...made, actor: commitment.beneficiary }] })).toThrow()
  })
  it('enforces breach and supersession references including cycles', () => {
    const { base, institution, body, commitment } = setup(), successor = { ...commitment, id: 'bg5c-world-successor', summary: 'Next' }, made = (id: string) => ({ id: `made:${id}`, commitmentId: id, kind: 'MADE' as const, effectiveOn: '2032-01-01' as never, actor: commitment.promisor })
    expect(() => updateGameWorld(base, { governanceInstitutions: [institution], governanceBodies: [body], governanceCommitments: [commitment], governanceCommitmentEvents: [made(commitment.id), { id: 'breach', commitmentId: commitment.id, kind: 'BREACHED' as const, effectiveOn: '2032-01-10' as never }] })).toThrow()
    expect(() => updateGameWorld(base, { governanceInstitutions: [institution], governanceBodies: [body], governanceCommitments: [commitment, successor], governanceCommitmentEvents: [made(commitment.id), made(successor.id), { id: 'a-b', commitmentId: commitment.id, kind: 'SUPERSEDED' as const, effectiveOn: '2032-01-02' as never, successorCommitmentId: successor.id }, { id: 'b-a', commitmentId: successor.id, kind: 'SUPERSEDED' as const, effectiveOn: '2032-01-03' as never, successorCommitmentId: commitment.id }] })).toThrow()
  })
})

function governanceRuntime(save: ReturnType<typeof serializeGameWorldV3>): Record<string, unknown> {
  const runtime = save.payload.staffCareerRuntime as Record<string, unknown>;
  return {
    governanceInstitutions: runtime.governanceInstitutions,
    governanceBodies: runtime.governanceBodies,
    governanceAppointments: runtime.governanceAppointments,
    governanceAuthorityGrants: runtime.governanceAuthorityGrants,
    governanceExternalRelationships: runtime.governanceExternalRelationships,
    governanceExpectationPeriods: runtime.governanceExpectationPeriods,
    governanceObjectives: runtime.governanceObjectives,
  };
}

function expectationPeriod(overrides: Record<string, unknown> = {}) { return { id: "period:history", institutionId: "institution:PROFESSIONAL_CLUB", universe: "PROFESSIONAL_CLUB" as const, startedOn: "2032-01-01" as never, endedOn: "2032-12-31" as never, ...overrides }; }
function expectationObjective(overrides: Record<string, unknown> = {}) { return { id: "objective:base", expectationPeriodId: "period:history", ownerInstitutionId: "institution:PROFESSIONAL_CLUB", family: "PLAYER_DEVELOPMENT" as const, horizon: "SHORT" as const, metric: "PLAYER_DEVELOPMENT_SCORE" as const, comparison: "AT_LEAST" as const, target: { kind: "NUMERIC" as const, value: 50 }, tolerance: 5, importance: 80, evaluationStartsOn: "2032-01-01" as never, evaluationEndsOn: "2032-12-31" as never, ...overrides }; }
