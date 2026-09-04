import { describe, expect, it } from "vitest";
import { createGovernanceAppointment, createGovernanceAuthorityGrant, createGovernanceBody, createGovernanceExternalRelationship, createGovernanceInstitution, isGovernanceAppointmentActive } from "./Governance";

describe("Governance domain", () => {
  it("separates institutional universe, bodies, historical mandates and authority", () => {
    const institution = createGovernanceInstitution({ id: "ncaa:university", universe: "NCAA", name: "North University", teamIds: ["team:north"] as never });
    const body = createGovernanceBody({ id: "body:trustees", institutionId: institution.id, kind: "BOARD", name: "Trustees" });
    const appointment = createGovernanceAppointment({ id: "appointment:ad", bodyId: body.id, actor: { kind: "EXTERNAL", id: "person:ad" }, role: "ATHLETIC_DIRECTOR", startedOn: "2032-01-01" as never });
    const authority = createGovernanceAuthorityGrant({ id: "authority:budget", fromBodyId: body.id, toBodyId: "body:athletics", decision: "BUDGET", grantedOn: "2032-01-01" as never });
    expect(isGovernanceAppointmentActive(appointment, "2032-02-01" as never)).toBe(true); expect(authority.toBodyId).toBe("body:athletics");
  });
  it("rejects collapsed or invalid historical relationships", () => {
    expect(() => createGovernanceInstitution({ id: "x", universe: "NCAA", name: "x", teamIds: ["t", "t"] as never })).toThrow();
    expect(() => createGovernanceAuthorityGrant({ id: "x", fromBodyId: "b", toBodyId: "b", decision: "BUDGET", grantedOn: "2032-01-01" as never })).toThrow();
    expect(() => createGovernanceExternalRelationship({ id: "x", institutionId: "i", externalRef: { kind: "NIL_COLLECTIVE", id: "collective" }, relationshipType: "DONOR_RELATIONSHIP", startedOn: "2032-01-01" as never })).toThrow();
    expect(() => createGovernanceAppointment({ id: "x", bodyId: "b", actor: { kind: "EXTERNAL", id: "a" }, role: "PRESIDENT", startedOn: "2032-02-01" as never, endedOn: "2032-01-01" as never })).toThrow();
  });
});
