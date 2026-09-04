import { describe, expect, it } from "vitest";
import { createNewGame } from "@/app/game";
import { addDays } from "@/domain/date";
import {
  staffPersonIdFromString,
  teamStaffAssignmentIdFromString,
} from "@/domain/ids";
import {
  createStaffPerson,
  createTeamStaffAssignment,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
} from "@/domain/staff";
import {
  createStaffPoliticalAlliance,
  createStaffPoliticalFaction,
  staffPoliticalActionIdFor,
  staffPoliticalAllianceIdFor,
  staffPoliticalCaseIdFor,
  staffPoliticalFactionIdFor,
} from "@/domain/staffPolitics";
import { updateGameWorld } from "@/domain/world";
import {
  deriveStaffPoliticalFactionMemberGroups,
  deriveStaffPoliticalPowerBlocs,
  reconcileStaffPoliticalGroups,
  type StaffPoliticalCoordinationEvidence,
} from "./StaffPoliticalGroupEngine";

function evidence(
  left: string,
  right: string,
  score = 40,
): StaffPoliticalCoordinationEvidence {
  const [staffAId, staffBId] = [left, right].sort();
  return {
    teamId: "team",
    staffAId,
    staffBId,
    coordinatedActionCount: 2,
    sameSideCaseCount: 0,
    oppositeSideCaseCount: 0,
    lastCoordinatedOn: "2025-01-01",
    agendaEvidence: { CAREER: 2 },
    score,
    caseCount: 2,
  };
}
function clique(
  members: readonly string[],
  score = 40,
): StaffPoliticalCoordinationEvidence[] {
  return members.flatMap((left, index) =>
    members.slice(index + 1).map((right) => evidence(left, right, score)),
  );
}
function groups(
  nodes: readonly string[],
  rows: readonly StaffPoliticalCoordinationEvidence[],
): readonly string[][] {
  return deriveStaffPoliticalFactionMemberGroups(nodes, rows);
}

function addCoordination(
  base: ReturnType<typeof createNewGame>,
  pairs: readonly (readonly [string, string])[],
  date = base.currentDate,
) {
  const dated = updateGameWorld(base, { currentDate: date });
  const teamId = Object.values(dated.teams)[0]!.id;
  const members = Object.values(dated.teamStaffAssignmentsById)
    .filter((assignment) => assignment.teamId === teamId)
    .map((assignment) => assignment.staffPersonId)
    .sort();
  const cases = pairs.flatMap(([left, right], index) =>
    [0, 1].map((round) => {
      const sourceId = `group-evidence-${Object.keys(dated.staffPoliticalCasesById).length + index}-${round}`;
      const id = staffPoliticalCaseIdFor(teamId, "CAREER_REQUEST", sourceId);
      return {
        politicalCase: {
          id,
          scopeKey: teamId,
          teamId,
          sourceKind: "CAREER_REQUEST" as const,
          sourceId,
          agenda: "CAREER" as const,
          openedOn: date,
          lastEvaluatedOn: date,
          status: "OPEN" as const,
          positions: [],
        },
        action: {
          id: staffPoliticalActionIdFor(
            id,
            "COORDINATE",
            "SUPPORT",
            [left, right].sort() as never,
          ),
          caseId: id,
          teamId,
          kind: "COORDINATE" as const,
          stance: "SUPPORT" as const,
          actorIds: [left, right].sort() as never,
          performedOn: date,
        },
      };
    }),
  );
  return {
    teamId,
    members,
    world: updateGameWorld(dated, {
      staffPoliticalCases: [
        ...Object.values(dated.staffPoliticalCasesById),
        ...cases.map((item) => item.politicalCase),
      ],
      staffPoliticalActions: [
        ...Object.values(dated.staffPoliticalActionsById),
        ...cases.map((item) => item.action),
      ],
    }),
  };
}
function withTeamStaff(base: ReturnType<typeof createNewGame>, count: number) {
  const teamId = Object.values(base.teams)[0]!.id;
  const existing = Object.values(base.teamStaffAssignmentsById).filter(
    (assignment) => assignment.teamId === teamId,
  );
  const attributes = Object.fromEntries(
    STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60]),
  ) as Record<(typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS)[number], number>;
  const additions = Array.from(
    { length: Math.max(0, count - existing.length) },
    (_, index) => {
      const staffId = staffPersonIdFromString(`group-extra-${index}`);
      return {
        staff: createStaffPerson({
          id: staffId,
          identity: { firstName: "Group", lastName: `${index}` },
          professional: { attributes },
        }),
        assignment: createTeamStaffAssignment({
          id: teamStaffAssignmentIdFromString(
            `group-extra-assignment-${index}`,
          ),
          staffPersonId: staffId,
          teamId,
          role: "assistantCoach",
          assignedOn: base.currentDate,
        }),
        employment: {
          status: "employed" as const,
          teamId,
          roleId: "assistantCoach" as never,
          startedOn: base.currentDate,
        },
      };
    },
  );
  return updateGameWorld(base, {
    staffPeople: [
      ...Object.values(base.staffPeopleById),
      ...additions.map((item) => item.staff),
    ],
    teamStaffAssignments: [
      ...Object.values(base.teamStaffAssignmentsById),
      ...additions.map((item) => item.assignment),
    ],
    staffEmploymentByStaffId: {
      ...base.staffEmploymentByStaffId,
      ...Object.fromEntries(
        additions.map((item) => [item.staff.id, item.employment]),
      ),
    },
  });
}
function worldWithCoordination(
  pairs: readonly (readonly [string, string])[],
  date = createNewGame().currentDate,
  staffCount = 3,
) {
  return addCoordination(
    withTeamStaff(
      updateGameWorld(createNewGame(), { currentDate: date }),
      staffCount,
    ),
    pairs,
    date,
  );
}

describe("StaffPoliticalGroupEngine faction topology", () => {
  it("A: derives one cohesive three-member faction", () =>
    expect(groups(["A", "B", "C"], clique(["A", "B", "C"]))).toEqual([
      ["A", "B", "C"],
    ]));
  it("B: derives one cohesive four-member faction, never four triples", () =>
    expect(groups(["A", "B", "C", "D"], clique(["A", "B", "C", "D"]))).toEqual([
      ["A", "B", "C", "D"],
    ]));
  it("C: keeps disconnected cohesive networks separate", () =>
    expect(
      groups(
        ["A", "B", "C", "D", "E", "F"],
        [...clique(["A", "B", "C"]), ...clique(["D", "E", "F"])],
      ),
    ).toEqual([
      ["A", "B", "C"],
      ["D", "E", "F"],
    ]));
  it("D: removes a single bridge instead of merging two cohesive camps", () =>
    expect(
      groups(
        ["A", "B", "C", "D", "E", "F"],
        [
          ...clique(["A", "B", "C"], 60),
          ...clique(["D", "E", "F"], 60),
          evidence("C", "D", 40),
        ],
      ),
    ).toEqual([
      ["A", "B", "C"],
      ["D", "E", "F"],
    ]));
  it("E: replaces a three-member identity with one deterministic four-member identity on a join", () => {
    expect(groups(["A", "B", "C"], clique(["A", "B", "C"]))).toEqual([
      ["A", "B", "C"],
    ]);
    expect(groups(["A", "B", "C", "D"], clique(["A", "B", "C", "D"]))).toEqual([
      ["A", "B", "C", "D"],
    ]);
  });
  it("F: removes unsupported members from current faction truth", () =>
    expect(groups(["A", "B", "C", "D"], clique(["A", "B", "C"]))).toEqual([
      ["A", "B", "C"],
    ]));
  it("G: deterministically splits a formerly connected six-member network into camps", () =>
    expect(
      groups(
        ["A", "B", "C", "D", "E", "F"],
        [...clique(["A", "B", "C"], 70), ...clique(["D", "E", "F"], 70)],
      ),
    ).toEqual([
      ["A", "B", "C"],
      ["D", "E", "F"],
    ]));
  it("H: is invariant to evidence and node ordering", () => {
    const rows = [
      ...clique(["A", "B", "C"], 60),
      ...clique(["D", "E", "F"], 60),
      evidence("C", "D", 40),
    ];
    const expected = groups(["A", "B", "C", "D", "E", "F"], rows);
    expect(groups(["F", "E", "D", "C", "B", "A"], [...rows].reverse())).toEqual(
      expected,
    );
  });
});

describe("StaffPoliticalGroupEngine reconciliation", () => {
  it("creates one alliance and faction from current coordination evidence and is idempotent", () => {
    const available = worldWithCoordination([]).members.slice(0, 3);
    const coordinated = worldWithCoordination([
      [available[0]!, available[1]!],
      [available[0]!, available[2]!],
      [available[1]!, available[2]!],
    ]);
    const reconciled = reconcileStaffPoliticalGroups(coordinated.world);
    expect(Object.values(reconciled.staffPoliticalAlliancesById)).toHaveLength(
      3,
    );
    expect(Object.values(reconciled.staffPoliticalFactionsById)).toMatchObject([
      { memberIds: available, status: "ACTIVE", leaderId: expect.any(String) },
    ]);
    expect(reconcileStaffPoliticalGroups(reconciled)).toBe(reconciled);
  });

  it("preserves formedOn and updates lastReinforcedOn for unchanged current evidence", () => {
    const seed = worldWithCoordination([]);
    const members = seed.members.slice(0, 3);
    const first = reconcileStaffPoliticalGroups(
      worldWithCoordination(
        [
          [members[0]!, members[1]!],
          [members[0]!, members[2]!],
          [members[1]!, members[2]!],
        ],
        seed.world.currentDate,
      ).world,
    );
    const faction = Object.values(first.staffPoliticalFactionsById)[0]!;
    const later = addDays(first.currentDate, 7);
    const reinforced = reconcileStaffPoliticalGroups(
      addCoordination(
        first,
        [
          [members[0]!, members[1]!],
          [members[0]!, members[2]!],
          [members[1]!, members[2]!],
        ],
        later,
      ).world,
    );
    const refreshed = reinforced.staffPoliticalFactionsById[faction.id]!;
    expect(refreshed.formedOn).toBe(faction.formedOn);
    expect(refreshed.lastReinforcedOn).toBe(later);
  });

  it("makes unsupported alliances and factions dormant, then dissolved using GameDate", () => {
    const base = createNewGame();
    const teamId = Object.values(base.teams)[0]!.id;
    const members = Object.values(base.teamStaffAssignmentsById)
      .filter((assignment) => assignment.teamId === teamId)
      .map((assignment) => assignment.staffPersonId)
      .sort()
      .slice(0, 3);
    const alliance = createStaffPoliticalAlliance({
      id: staffPoliticalAllianceIdFor(teamId, members.slice(0, 2)),
      teamId,
      memberIds: members.slice(0, 2),
      formedOn: base.currentDate,
      lastReinforcedOn: base.currentDate,
      status: "ACTIVE",
      sharedAgendaWeights: { CAREER: 2 },
      coordinationScore: 40,
      cohesionScore: 40,
    });
    const faction = createStaffPoliticalFaction({
      id: staffPoliticalFactionIdFor(teamId, members),
      teamId,
      memberIds: members,
      leaderId: members[0]!,
      formedOn: base.currentDate,
      lastReinforcedOn: base.currentDate,
      status: "ACTIVE",
      dominantAgendas: ["CAREER"],
      cohesionScore: 40,
      influenceScore: 50,
    });
    const dormant = reconcileStaffPoliticalGroups(
      updateGameWorld(base, {
        staffPoliticalAlliances: [alliance],
        staffPoliticalFactions: [faction],
      }),
    );
    expect(dormant.staffPoliticalAlliancesById[alliance.id]!.status).toBe(
      "DORMANT",
    );
    expect(dormant.staffPoliticalFactionsById[faction.id]!.status).toBe(
      "DORMANT",
    );
    const dissolved = reconcileStaffPoliticalGroups(
      updateGameWorld(dormant, { currentDate: addDays(base.currentDate, 366) }),
    );
    expect(dissolved.staffPoliticalAlliancesById[alliance.id]!.status).toBe(
      "DISSOLVED",
    );
    expect(dissolved.staffPoliticalFactionsById[faction.id]!.status).toBe(
      "DISSOLVED",
    );
  });

  it("transitions exact faction identities on join and loss without leaving stale ACTIVE groups", () => {
    const seed = worldWithCoordination([], createNewGame().currentDate, 4);
    const members = seed.members.slice(0, 4);
    const three = reconcileStaffPoliticalGroups(
      addCoordination(
        seed.world,
        [
          [members[0]!, members[1]!],
          [members[0]!, members[2]!],
          [members[1]!, members[2]!],
        ],
        seed.world.currentDate,
      ).world,
    );
    const grown = reconcileStaffPoliticalGroups(
      addCoordination(
        three,
        clique(members).map((row) => [row.staffAId, row.staffBId] as const),
        addDays(seed.world.currentDate, 1),
      ).world,
    );
    const oldId = staffPoliticalFactionIdFor(seed.teamId, members.slice(0, 3));
    const newId = staffPoliticalFactionIdFor(seed.teamId, members);
    expect(three.staffPoliticalFactionsById[oldId]!.status).toBe("ACTIVE");
    expect(grown.staffPoliticalFactionsById[newId]!.status).toBe("ACTIVE");
    expect(grown.staffPoliticalFactionsById[oldId]!.status).toBe("DORMANT");
  });
  it("marks a persisted faction dormant when current evidence no longer supports it", () => {
    const base = createNewGame();
    const teamId = Object.values(base.teams)[0]!.id;
    const members = Object.values(base.teamStaffAssignmentsById)
      .filter((assignment) => assignment.teamId === teamId)
      .map((assignment) => assignment.staffPersonId)
      .sort()
      .slice(0, 3);
    const faction = createStaffPoliticalFaction({
      id: staffPoliticalFactionIdFor(teamId, members),
      teamId,
      memberIds: members,
      leaderId: members[0]!,
      formedOn: base.currentDate,
      lastReinforcedOn: base.currentDate,
      status: "ACTIVE",
      dominantAgendas: ["CAREER"],
      cohesionScore: 50,
      influenceScore: 50,
    });
    const reconciled = reconcileStaffPoliticalGroups(
      updateGameWorld(base, { staffPoliticalFactions: [faction] }),
    );
    expect(reconciled.staffPoliticalFactionsById[faction.id]!.status).toBe(
      "DORMANT",
    );
  });

  it("derives a non-persisted power bloc from active faction and alliance sources", () => {
    const base = createNewGame();
    const teamId = Object.values(base.teams)[0]!.id;
    const members = Object.values(base.teamStaffAssignmentsById)
      .filter((assignment) => assignment.teamId === teamId)
      .map((assignment) => assignment.staffPersonId)
      .sort()
      .slice(0, 3);
    const pair = members.slice(0, 2) as [
      (typeof members)[number],
      (typeof members)[number],
    ];
    const alliance = createStaffPoliticalAlliance({
      id: staffPoliticalAllianceIdFor(teamId, pair),
      teamId,
      memberIds: pair,
      formedOn: base.currentDate,
      lastReinforcedOn: base.currentDate,
      status: "ACTIVE",
      sharedAgendaWeights: { CAREER: 2 },
      coordinationScore: 40,
      cohesionScore: 40,
    });
    const faction = createStaffPoliticalFaction({
      id: staffPoliticalFactionIdFor(teamId, members),
      teamId,
      memberIds: members,
      leaderId: members[0]!,
      formedOn: base.currentDate,
      lastReinforcedOn: base.currentDate,
      status: "ACTIVE",
      dominantAgendas: ["CAREER"],
      cohesionScore: 50,
      influenceScore: 50,
    });
    expect(
      deriveStaffPoliticalPowerBlocs(
        updateGameWorld(base, {
          staffPoliticalAlliances: [alliance],
          staffPoliticalFactions: [faction],
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        memberIds: members,
        sourceAllianceIds: [alliance.id],
        sourceFactionIds: [faction.id],
        leaderId: faction.leaderId,
      }),
    ]);
  });
});

describe("Staff political group domain invariants", () => {
  it("rejects invalid membership, leadership, scores, and agenda data while canonical IDs are stable", () => {
    const teamId = Object.values(createNewGame().teams)[0]!.id;
    const members = Object.values(createNewGame().teamStaffAssignmentsById)
      .filter((assignment) => assignment.teamId === teamId)
      .map((assignment) => assignment.staffPersonId)
      .sort()
      .slice(0, 3);
    const faction = {
      id: staffPoliticalFactionIdFor(teamId, members),
      teamId,
      memberIds: members,
      leaderId: members[0]!,
      formedOn: "2032-10-01" as never,
      lastReinforcedOn: "2032-10-01" as never,
      status: "ACTIVE" as const,
      dominantAgendas: ["CAREER"] as const,
      cohesionScore: 50,
      influenceScore: 50,
    };
    const alliance = {
      id: staffPoliticalAllianceIdFor(teamId, members.slice(0, 2)),
      teamId,
      memberIds: members.slice(0, 2),
      formedOn: faction.formedOn,
      lastReinforcedOn: faction.lastReinforcedOn,
      status: "ACTIVE" as const,
      sharedAgendaWeights: { CAREER: 1 },
      coordinationScore: 50,
      cohesionScore: 50,
    };
    expect(staffPoliticalFactionIdFor(teamId, members)).toBe(faction.id);
    expect(() =>
      createStaffPoliticalFaction({
        ...faction,
        memberIds: [members[0]!, members[0]!, members[2]!],
      }),
    ).toThrow();
    expect(() =>
      createStaffPoliticalFaction({
        ...faction,
        memberIds: [...members].reverse(),
      }),
    ).toThrow();
    expect(() =>
      createStaffPoliticalFaction({
        ...faction,
        memberIds: members.slice(0, 2),
      }),
    ).toThrow();
    expect(() =>
      createStaffPoliticalFaction({ ...faction, leaderId: "outside" as never }),
    ).toThrow();
    expect(() =>
      createStaffPoliticalFaction({ ...faction, cohesionScore: 101 }),
    ).toThrow();
    expect(() =>
      createStaffPoliticalFaction({
        ...faction,
        dominantAgendas: ["INVALID"] as never,
      }),
    ).toThrow();
    expect(() =>
      createStaffPoliticalAlliance({
        ...alliance,
        memberIds: [members[0]!, members[0]!],
      }),
    ).toThrow();
    expect(() =>
      createStaffPoliticalAlliance({ ...alliance, memberIds: [members[0]!] }),
    ).toThrow();
    expect(() =>
      createStaffPoliticalAlliance({ ...alliance, coordinationScore: -1 }),
    ).toThrow();
    expect(() =>
      createStaffPoliticalAlliance({
        ...alliance,
        sharedAgendaWeights: { INVALID: 1 } as never,
      }),
    ).toThrow();
  });
});
