import { describe, expect, it } from "vitest";
import { createNewGame } from "@/app/game";
import {
  staffPoliticalActionIdFor,
  staffPoliticalCaseIdFor,
} from "@/domain/staffPolitics";
import { updateGameWorld } from "@/domain/world";
import {
  deriveStaffPoliticalPowerBlocs,
  reconcileStaffPoliticalGroups,
} from "@/engine/staff/StaffPoliticalGroupEngine";
import { getStaffPoliticsPresentation } from "./staffPoliticsPresentation";

function runtimeWorld() {
  const base = createNewGame();
  const teamId = Object.values(base.teams)[0]!.id;
  const staff = Object.values(base.teamStaffAssignmentsById)
    .filter((x) => x.teamId === teamId)
    .map((x) => x.staffPersonId)
    .sort();
  const pairs = staff.flatMap((left, index) =>
    staff.slice(index + 1).map((right) => [left, right] as const),
  );
  const rows = pairs.flatMap(([left, right], pair) =>
    [0, 1].map((round) => {
      const sourceId = `ui-runtime-${pair}-${round}`;
      const caseId = staffPoliticalCaseIdFor(
        teamId,
        "CAREER_REQUEST",
        sourceId,
      );
      return {
        politicalCase: {
          id: caseId,
          scopeKey: teamId,
          teamId,
          sourceKind: "CAREER_REQUEST" as const,
          sourceId,
          agenda: "CAREER" as const,
          openedOn: "2032-10-05" as never,
          lastEvaluatedOn: "2032-10-05" as never,
          status: "OPEN" as const,
          positions: [],
        },
        action: {
          id: staffPoliticalActionIdFor(caseId, "COORDINATE", "SUPPORT", [
            left,
            right,
          ]),
          caseId,
          teamId,
          kind: "COORDINATE" as const,
          stance: "SUPPORT" as const,
          actorIds: [left, right],
          performedOn: "2032-10-05" as never,
        },
      };
    }),
  );
  return {
    teamId,
    staff,
    world: updateGameWorld(base, {
      currentDate: "2032-10-06" as never,
      staffPoliticalCases: rows.map((x) => x.politicalCase),
      staffPoliticalActions: rows.map((x) => x.action),
    }),
  };
}

describe("Staff Politics 5F4 runtime presentation integration", () => {
  it("flows real coordination evidence through reconciled alliances, faction and derived PowerBloc", () => {
    const value = runtimeWorld();
    const reconciled = reconcileStaffPoliticalGroups(value.world);
    const presentation = getStaffPoliticsPresentation(reconciled, value.teamId);
    expect(
      Object.values(reconciled.staffPoliticalAlliancesById).every(
        (x) => x.status === "ACTIVE",
      ),
    ).toBe(true);
    expect(Object.values(reconciled.staffPoliticalFactionsById)).toHaveLength(
      1,
    );
    const faction = Object.values(reconciled.staffPoliticalFactionsById)[0]!;
    expect(faction.leaderId).toBe(value.staff[0]);
    const bloc = presentation.groups.find((x) => x.kind === "POWER BLOC")!;
    expect(bloc).toMatchObject({
      derived: true,
      leaderId: faction.leaderId,
      sourceFactionIds: [faction.id],
    });
    expect(bloc.members).toEqual(value.staff);
    expect(
      presentation.actors.find((x) => x.staffId === value.staff[0])!.factionIds,
    ).toEqual([faction.id]);
    expect(presentation.overview.powerBlocs).toBe(1);
  });

  it("removes stale active memberships and derived blocs after real reconciliation loses support", () => {
    const value = runtimeWorld();
    const active = reconcileStaffPoliticalGroups(value.world);
    const inactive = reconcileStaffPoliticalGroups(
      updateGameWorld(active, {
        staffPoliticalCases: [],
        staffPoliticalActions: [],
      }),
    );
    const presentation = getStaffPoliticsPresentation(inactive, value.teamId);
    expect(
      Object.values(inactive.staffPoliticalAlliancesById).every(
        (x) => x.status !== "ACTIVE",
      ),
    ).toBe(true);
    expect(
      Object.values(inactive.staffPoliticalFactionsById).every(
        (x) => x.status !== "ACTIVE",
      ),
    ).toBe(true);
    expect(deriveStaffPoliticalPowerBlocs(inactive)).toEqual([]);
    expect(presentation.actors.every((x) => x.groups.length === 0)).toBe(true);
    expect(
      presentation.groups.some(
        (x) => x.status === "DORMANT" || x.status === "DISSOLVED",
      ),
    ).toBe(true);
  });
});
