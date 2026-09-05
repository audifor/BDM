import { describe, expect, it } from "vitest";

import { createNewGame } from "@/app/game";
import type { GameDate } from "@/domain/date";
import { createMemory } from "@/domain/memory";
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
  deserializeGameWorldV3,
  serializeGameWorldV3,
} from "@/save/GameWorldSaveV3";

import { getStaffPoliticsPresentation } from "./staffPoliticsPresentation";

const date = (value: string) => value as GameDate;

function fixture() {
  const base = createNewGame();
  const teamId = Object.values(base.teams)[0]!.id;
  const staffIds = Object.values(base.teamStaffAssignmentsById)
    .filter((item) => item.teamId === teamId)
    .map((item) => item.staffPersonId)
    .sort();
  const [a, b, c] = staffIds;
  const subject = c;
  if (a === undefined || b === undefined || c === undefined)
    throw new Error("Expected three team staff");
  const openId = staffPoliticalCaseIdFor(
    teamId,
    "CAREER_REQUEST",
    "presentation-open",
  );
  const resolvedId = staffPoliticalCaseIdFor(
    teamId,
    "CAREER_REQUEST",
    "presentation-resolved",
  );
  const actionId = staffPoliticalActionIdFor(openId, "LOBBY", "SUPPORT", [a], {
    kind: "COACH",
    id: base.teams[teamId]!.coachId!,
  });
  const allianceMembers = [a, b].sort() as typeof staffIds;
  const factionMembers = [a, b, c].sort() as typeof staffIds;
  const alliance = createStaffPoliticalAlliance({
    id: staffPoliticalAllianceIdFor(teamId, allianceMembers),
    teamId,
    memberIds: allianceMembers,
    formedOn: date("2032-10-02"),
    lastReinforcedOn: date("2032-10-04"),
    status: "ACTIVE",
    sharedAgendaWeights: { CAREER: 80 },
    coordinationScore: 70,
    cohesionScore: 60,
  });
  const faction = createStaffPoliticalFaction({
    id: staffPoliticalFactionIdFor(teamId, factionMembers),
    teamId,
    memberIds: factionMembers,
    leaderId: a,
    formedOn: date("2032-10-02"),
    lastReinforcedOn: date("2032-10-05"),
    status: "ACTIVE",
    dominantAgendas: ["CAREER"],
    cohesionScore: 75,
    influenceScore: 80,
  });
  const world = updateGameWorld(base, {
    currentDate: date("2032-10-08"),
    staffPoliticalCases: [
      {
        id: openId,
        scopeKey: teamId,
        teamId,
        sourceKind: "CAREER_REQUEST",
        sourceId: "presentation-open",
        agenda: "CAREER",
        subjectStaffId: subject,
        openedOn: date("2032-10-02"),
        lastEvaluatedOn: date("2032-10-06"),
        status: "OPEN",
        positions: [
          {
            actorId: a,
            stance: "SUPPORT",
            since: date("2032-10-03"),
            lastEvaluatedOn: date("2032-10-03"),
          },
          {
            actorId: b,
            stance: "OPPOSE",
            since: date("2032-10-04"),
            lastEvaluatedOn: date("2032-10-04"),
          },
        ],
      },
      {
        id: resolvedId,
        scopeKey: teamId,
        teamId,
        sourceKind: "CAREER_REQUEST",
        sourceId: "presentation-resolved",
        agenda: "CAREER",
        openedOn: date("2032-10-01"),
        lastEvaluatedOn: date("2032-10-07"),
        status: "RESOLVED",
        resolution: { kind: "APPROVED", resolvedOn: date("2032-10-07") },
        positions: [],
      },
    ],
    staffPoliticalActions: [
      {
        id: actionId,
        caseId: openId,
        teamId,
        kind: "LOBBY",
        stance: "SUPPORT",
        actorIds: [a],
        target: { kind: "COACH", id: base.teams[teamId]!.coachId! },
        performedOn: date("2032-10-06"),
      },
    ],
    staffPoliticalAlliances: [alliance],
    staffPoliticalFactions: [faction],
    memories: [
      createMemory({
        id: "memory:linked",
        owner: { kind: "staff", id: subject },
        type: "support",
        occurredOn: date("2032-10-06"),
        sourceId: actionId,
        semanticKey: "linked",
        importance: "notable",
        valence: 10,
        intensity: 10,
        decayPerMonth: 1,
        permanent: false,
        tags: [],
        entityRefs: [],
        context: {},
      }),
      createMemory({
        id: "memory:unrelated",
        owner: { kind: "staff", id: subject },
        type: "trust",
        occurredOn: date("2032-10-06"),
        sourceId: "elsewhere",
        semanticKey: "unrelated",
        importance: "minor",
        valence: 1,
        intensity: 1,
        decayPerMonth: 1,
        permanent: false,
        tags: [],
        entityRefs: [],
        context: {},
      }),
    ],
  });
  return { world, teamId, a, actionId, openId, resolvedId, alliance, faction };
}

describe("staffPoliticsPresentation", () => {
  it("projects coherent isolated canonical politics with deterministic ordering", () => {
    const value = fixture();
    const first = getStaffPoliticsPresentation(value.world, value.teamId);
    const second = getStaffPoliticsPresentation(value.world, value.teamId);
    expect(first).toEqual(second);
    expect(first.cases).toHaveLength(2);
    expect(first.overview.activeCases).toBe(1);
    expect(first.overview.historicalCases).toBe(1);
    expect(first.actors.length).toBeGreaterThan(0);
    expect(first.groups.map((item) => item.id)).toEqual(
      [...first.groups.map((item) => item.id)].sort(
        (a, b) =>
          first.groups
            .find((x) => x.id === a)!
            .kind.localeCompare(first.groups.find((x) => x.id === b)!.kind) ||
          a.localeCompare(b),
      ),
    );
  });

  it("projects case source, lifecycle, positions, actions, and only canonically linked memories", () => {
    const value = fixture();
    const row = getStaffPoliticsPresentation(
      value.world,
      value.teamId,
    ).cases.find((item) => item.id === value.openId)!;
    const resolved = getStaffPoliticsPresentation(
      value.world,
      value.teamId,
    ).cases.find((item) => item.id === value.resolvedId)!;
    expect(row).toMatchObject({
      sourceKind: "CAREER_REQUEST",
      sourceId: "presentation-open",
      openedOn: "2032-10-02",
      status: "OPEN",
    });
    expect(row.positions.map((item) => item.stance)).toEqual([
      "SUPPORT",
      "OPPOSE",
    ]);
    expect(row.actions[0]).toMatchObject({
      id: value.actionId,
      performedOn: "2032-10-06",
    });
    expect(row.actions[0]!.consequences).toEqual(["Memory: support"]);
    expect(resolved).toMatchObject({
      status: "RESOLVED",
      resolvedOn: "2032-10-07",
    });
  });

  it("never infers a consequence from an unrelated relationship-style id containing the action id", () => {
    const value = fixture();
    const withUnrelated = updateGameWorld(value.world, {
      memories: [
        ...Object.values(value.world.memoriesById),
        createMemory({
          id: `relationship:${value.actionId}:not-causal`,
          owner: { kind: "staff", id: value.a },
          type: "trust",
          occurredOn: date("2032-10-06"),
          sourceId: "not-causal",
          semanticKey: "not-causal",
          importance: "minor",
          valence: 1,
          intensity: 1,
          decayPerMonth: 1,
          permanent: false,
          tags: [],
          entityRefs: [],
          context: {},
        }),
      ],
    });
    expect(
      getStaffPoliticsPresentation(withUnrelated, value.teamId).cases.find(
        (item) => item.id === value.openId,
      )!.actions[0]!.consequences,
    ).toEqual(["Memory: support"]);
  });

  it("projects actor relevance, positions, actions, active group memberships and agendas", () => {
    const value = fixture();
    const actor = getStaffPoliticsPresentation(
      value.world,
      value.teamId,
    ).actors.find((item) => item.staffId === value.a)!;
    expect(actor).toMatchObject({
      activeCases: 1,
      allianceIds: [value.alliance.id],
      factionIds: [value.faction.id],
      agendas: ["CAREER"],
    });
    expect(actor.positions).toHaveLength(1);
    expect(actor.recentActions).toHaveLength(1);
    expect(actor.powerBlocIds).toHaveLength(1);
    expect(actor.explanation).toContain("recorded political position");
  });

  it("projects persisted groups and derived-only power blocs with sources", () => {
    const value = fixture();
    const groups = getStaffPoliticsPresentation(
      value.world,
      value.teamId,
    ).groups;
    const alliance = groups.find((item) => item.id === value.alliance.id)!;
    const faction = groups.find((item) => item.id === value.faction.id)!;
    const bloc = groups.find((item) => item.kind === "POWER BLOC")!;
    expect(alliance).toMatchObject({
      coordination: 70,
      cohesion: 60,
      formedOn: "2032-10-02",
      lastReinforcedOn: "2032-10-04",
      derived: false,
    });
    expect(faction).toMatchObject({
      leaderId: value.a,
      influence: 80,
      derived: false,
    });
    expect(bloc).toMatchObject({
      derived: true,
      sourceAllianceIds: [value.alliance.id],
      sourceFactionIds: [value.faction.id],
    });
    expect(bloc.formedOn).toBeUndefined();
  });

  it("builds dated activity in reverse chronological stable-id order and round-trips it through V3 without persisting blocs", () => {
    const value = fixture();
    const before = getStaffPoliticsPresentation(value.world, value.teamId);
    const loaded = deserializeGameWorldV3(
      serializeGameWorldV3(value.world, "2032-10-08T00:00:00.000Z"),
    );
    const after = getStaffPoliticsPresentation(loaded, value.teamId);
    expect(before.activity.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["CASE OPENED", "CASE RESOLVED", "ACTION"]),
    );
    expect(before.activity).toEqual(
      [...before.activity].sort(
        (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
      ),
    );
    expect(after).toEqual(before);
    expect(
      JSON.stringify(
        serializeGameWorldV3(value.world, "2032-10-08T00:00:00.000Z"),
      ),
    ).not.toContain("power-bloc:");
  });
});
