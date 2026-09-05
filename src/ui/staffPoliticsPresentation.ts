import type { StaffPersonId, TeamId } from "@/domain/ids";
import type { GameWorld } from "@/domain/world";
import { deriveStaffPoliticalPowerBlocs } from "@/engine/staff";
import { buildStaffPoliticalRelevanceIndex } from "@/engine/staff/StaffPoliticalPositionEngine";

export interface StaffPoliticsCaseRow {
  readonly id: string;
  readonly agenda: string;
  readonly status: string;
  readonly openedOn: string;
  readonly actorCount: number;
  readonly actionCount: number;
  readonly latestActivity: string;
  readonly explanation: string;
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly resolution?: string;
  readonly resolvedOn?: string;
  readonly positions: readonly {
    readonly actorId: StaffPersonId;
    readonly actorName: string;
    readonly stance: string;
    readonly since: string;
  }[];
  readonly actions: readonly {
    readonly id: string;
    readonly actorIds: readonly StaffPersonId[];
    readonly kind: string;
    readonly stance: string;
    readonly actorNames: readonly string[];
    readonly performedOn: string;
    readonly consequences: readonly string[];
  }[];
}
export interface StaffPoliticsActorRow {
  readonly staffId: StaffPersonId;
  readonly name: string;
  readonly role: string;
  readonly influence: number;
  readonly credibility: number;
  readonly tenure: number;
  readonly activeCases: number;
  readonly groups: readonly string[];
  readonly activeCaseIds: readonly string[];
  readonly activeCaseSummaries: readonly {
    readonly id: string;
    readonly agenda: string;
    readonly stance: string;
  }[];
  readonly positions: readonly {
    readonly caseId: string;
    readonly agenda: string;
    readonly stance: string;
  }[];
  readonly recentActions: readonly {
    readonly caseId: string;
    readonly kind: string;
    readonly stance: string;
    readonly performedOn: string;
  }[];
  readonly allianceIds: readonly string[];
  readonly factionIds: readonly string[];
  readonly powerBlocIds: readonly string[];
  readonly agendas: readonly string[];
  readonly explanation: string;
}
export interface StaffPoliticsGroupRow {
  readonly id: string;
  readonly kind: "ALLIANCE" | "FACTION" | "POWER BLOC";
  readonly members: readonly StaffPersonId[];
  readonly memberNames: readonly string[];
  readonly leaderId?: StaffPersonId;
  readonly leaderName?: string;
  readonly agendas: readonly string[];
  readonly cohesion: number;
  readonly influence: number;
  readonly coordination?: number;
  readonly status: string;
  readonly formedOn?: string;
  readonly lastActivity?: string;
  readonly lastReinforcedOn?: string;
  readonly explanation: string;
  readonly sourceAllianceIds: readonly string[];
  readonly sourceFactionIds: readonly string[];
  readonly derived: boolean;
}
export interface StaffPoliticsActivityRow {
  readonly id: string;
  readonly date: string;
  readonly kind: "CASE OPENED" | "CASE RESOLVED" | "ACTION";
  readonly caseId: string;
  readonly summary: string;
  readonly actorNames: readonly string[];
  readonly consequences: readonly string[];
}
export interface StaffPoliticsOverview {
  readonly activeCases: number;
  readonly historicalCases: number;
  readonly activeAlliances: number;
  readonly activeFactions: number;
  readonly powerBlocs: number;
  readonly strongestActors: readonly StaffPoliticsActorRow[];
  readonly recentActivity: readonly StaffPoliticsActivityRow[];
}
export interface StaffPoliticsPresentation {
  readonly cases: readonly StaffPoliticsCaseRow[];
  readonly actors: readonly StaffPoliticsActorRow[];
  readonly groups: readonly StaffPoliticsGroupRow[];
  readonly activity: readonly StaffPoliticsActivityRow[];
  readonly overview: StaffPoliticsOverview;
}

function name(world: GameWorld, staffId: StaffPersonId): string {
  const person = world.staffPeopleById[staffId];
  return person === undefined
    ? staffId
    : `${person.identity.firstName} ${person.identity.lastName}`;
}

export function getStaffPoliticsCases(
  world: GameWorld,
  teamId: TeamId,
): readonly StaffPoliticsCaseRow[] {
  return Object.values(world.staffPoliticalCasesById)
    .filter((item) => item.teamId === teamId)
    .map((item) => {
      const actions = Object.values(world.staffPoliticalActionsById).filter(
        (action) => action.caseId === item.id,
      );
      const positions = item.positions ?? [];
      const latestActivity = [
        ...actions.map((action) => action.performedOn),
        item.lastEvaluatedOn,
      ]
        .sort()
        .at(-1)!;
      return {
        id: item.id,
        agenda: item.agenda,
        status: item.status,
        openedOn: item.openedOn,
        actorCount: positions.length,
        actionCount: actions.length,
        latestActivity,
        explanation: `${positions.length} recorded positions and ${actions.length} political actions on ${item.agenda.toLowerCase()}.`,
        sourceKind: item.sourceKind,
        sourceId: item.sourceId,
        resolution:
          item.resolution === undefined
            ? undefined
            : `${item.resolution.kind} · ${item.resolution.resolvedOn}`,
        resolvedOn: item.resolution?.resolvedOn,
        positions: positions.map((position) => ({
          actorId: position.actorId,
          actorName: name(world, position.actorId),
          stance: position.stance,
          since: position.since,
        })),
        actions: actions
          .sort(
            (left, right) =>
              right.performedOn.localeCompare(left.performedOn) ||
              left.id.localeCompare(right.id),
          )
          .map((action) => ({
            id: action.id,
            actorIds: action.actorIds,
            kind: action.kind,
            stance: action.stance,
            actorNames: action.actorIds.map((actor) => name(world, actor)),
            performedOn: action.performedOn,
            consequences: Object.values(world.memoriesById)
              .filter((memory) => memory.sourceId === action.id)
              .map((memory) => `Memory: ${memory.type}`),
          })),
      };
    })
    .sort(
      (left, right) =>
        right.latestActivity.localeCompare(left.latestActivity) ||
        left.id.localeCompare(right.id),
    );
}

export function getStaffPoliticsGroups(
  world: GameWorld,
  teamId: TeamId,
): readonly StaffPoliticsGroupRow[] {
  const alliances = Object.values(world.staffPoliticalAlliancesById)
    .filter((item) => item.teamId === teamId)
    .map((item) => ({
      id: item.id,
      kind: "ALLIANCE" as const,
      members: item.memberIds,
      memberNames: item.memberIds.map((member) => name(world, member)),
      agendas: Object.keys(item.sharedAgendaWeights),
      cohesion: item.cohesionScore,
      influence: item.coordinationScore,
      coordination: item.coordinationScore,
      status: item.status,
      formedOn: item.formedOn,
      lastActivity: item.lastReinforcedOn,
      lastReinforcedOn: item.lastReinforcedOn,
      explanation: `Coordinated evidence supports this alliance; last reinforced ${item.lastReinforcedOn}.`,
      sourceAllianceIds: [],
      sourceFactionIds: [],
      derived: false,
    }));
  const factions = Object.values(world.staffPoliticalFactionsById)
    .filter((item) => item.teamId === teamId)
    .map((item) => ({
      id: item.id,
      kind: "FACTION" as const,
      members: item.memberIds,
      memberNames: item.memberIds.map((member) => name(world, member)),
      leaderId: item.leaderId,
      leaderName: name(world, item.leaderId),
      agendas: item.dominantAgendas,
      cohesion: item.cohesionScore,
      influence: item.influenceScore,
      status: item.status,
      formedOn: item.formedOn,
      lastActivity: item.lastReinforcedOn,
      lastReinforcedOn: item.lastReinforcedOn,
      explanation: `Cohesive coordination selected ${name(world, item.leaderId)} as leader.`,
      sourceAllianceIds: [],
      sourceFactionIds: [],
      derived: false,
    }));
  const blocs = deriveStaffPoliticalPowerBlocs(world)
    .filter((item) => item.teamId === teamId)
    .map((item, index) => ({
      id: `power-bloc:${teamId}:${index}:${item.memberIds.join(":")}`,
      kind: "POWER BLOC" as const,
      members: item.memberIds,
      memberNames: item.memberIds.map((member) => name(world, member)),
      leaderId: item.leaderId,
      leaderName:
        item.leaderId === undefined ? undefined : name(world, item.leaderId),
      agendas: [],
      cohesion: item.cohesionScore,
      influence: item.influenceScore,
      status: "ACTIVE",
      explanation: `Derived from ${item.sourceFactionIds.length} factions and ${item.sourceAllianceIds.length} alliances.`,
      sourceAllianceIds: item.sourceAllianceIds,
      sourceFactionIds: item.sourceFactionIds,
      derived: true,
    }));
  return [...factions, ...alliances, ...blocs].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id),
  );
}

export function getStaffPoliticsActors(
  world: GameWorld,
  teamId: TeamId,
): readonly StaffPoliticsActorRow[] {
  return getStaffPoliticsPresentation(world, teamId).actors;
}

export function getStaffPoliticsOverview(
  world: GameWorld,
  teamId: TeamId,
): StaffPoliticsOverview {
  return getStaffPoliticsPresentation(world, teamId).overview;
}

/** One pure workspace projection: the React surface calls this once per render. */
export function getStaffPoliticsPresentation(
  world: GameWorld,
  teamId: TeamId,
): StaffPoliticsPresentation {
  const cases = getStaffPoliticsCases(world, teamId);
  const groups = getStaffPoliticsGroups(world, teamId);
  const influence =
    buildStaffPoliticalRelevanceIndex(world).politicalInfluenceByStaffId;
  const activeGroups = groups.filter((group) => group.status === "ACTIVE");
  const actors = Object.values(world.teamStaffAssignmentsById)
    .filter(
      (assignment) =>
        assignment.teamId === teamId &&
        world.staffEmploymentByStaffId[assignment.staffPersonId]?.status ===
          "employed",
    )
    .map((assignment) => {
      const value = influence[assignment.staffPersonId];
      const positions = cases.flatMap((politicalCase) =>
        politicalCase.positions
          .filter((position) => position.actorId === assignment.staffPersonId)
          .map((position) => ({
            caseId: politicalCase.id,
            agenda: politicalCase.agenda,
            stance: position.stance,
          })),
      );
      const recentActions = cases
        .flatMap((politicalCase) =>
          politicalCase.actions
            .filter((action) =>
              action.actorIds.includes(assignment.staffPersonId),
            )
            .map((action) => ({
              caseId: politicalCase.id,
              kind: action.kind,
              stance: action.stance,
              performedOn: action.performedOn,
            })),
        )
        .sort(
          (left, right) =>
            right.performedOn.localeCompare(left.performedOn) ||
            left.caseId.localeCompare(right.caseId),
        );
      const memberships = activeGroups.filter((group) =>
        group.members.includes(assignment.staffPersonId),
      );
      const activeCaseIds = cases
        .filter(
          (politicalCase) =>
            politicalCase.status === "OPEN" &&
            positions.some((position) => position.caseId === politicalCase.id),
        )
        .map((politicalCase) => politicalCase.id);
      return {
        staffId: assignment.staffPersonId,
        name: name(world, assignment.staffPersonId),
        role: assignment.role,
        influence: value?.overall ?? 0,
        credibility: value?.professionalCredibility ?? 0,
        tenure: value?.tenureWeight ?? 0,
        activeCases: activeCaseIds.length,
        groups: memberships.map((group) => group.kind),
        activeCaseIds,
        activeCaseSummaries: positions
          .filter((position) => activeCaseIds.includes(position.caseId))
          .map((position) => ({
            id: position.caseId,
            agenda: position.agenda,
            stance: position.stance,
          })),
        positions,
        recentActions,
        allianceIds: memberships
          .filter((group) => group.kind === "ALLIANCE")
          .map((group) => group.id),
        factionIds: memberships
          .filter((group) => group.kind === "FACTION")
          .map((group) => group.id),
        powerBlocIds: memberships
          .filter((group) => group.kind === "POWER BLOC")
          .map((group) => group.id),
        agendas: [...new Set(positions.map((position) => position.agenda))],
        explanation:
          positions.length === 0
            ? "No recorded political position."
            : `${positions.length} recorded political position${positions.length === 1 ? "" : "s"} across ${[...new Set(positions.map((position) => position.agenda))].join(", ")}.`,
      };
    })
    .sort(
      (left, right) =>
        right.influence - left.influence ||
        left.staffId.localeCompare(right.staffId),
    );
  const activity = [
    ...cases.map((politicalCase) => ({
      id: `case-opened:${politicalCase.id}`,
      date: politicalCase.openedOn,
      kind: "CASE OPENED" as const,
      caseId: politicalCase.id,
      summary: politicalCase.agenda,
      actorNames: [] as readonly string[],
      consequences: [] as readonly string[],
    })),
    ...cases.flatMap((politicalCase) => [
      ...(politicalCase.resolvedOn === undefined
        ? []
        : [
            {
              id: `case-resolved:${politicalCase.id}`,
              date: politicalCase.resolvedOn,
              kind: "CASE RESOLVED" as const,
              caseId: politicalCase.id,
              summary: politicalCase.resolution ?? politicalCase.agenda,
              actorNames: [] as readonly string[],
              consequences: [] as readonly string[],
            },
          ]),
      ...politicalCase.actions.map((action) => ({
        id: `action:${action.id}`,
        date: action.performedOn,
        kind: "ACTION" as const,
        caseId: politicalCase.id,
        summary: `${action.kind} · ${action.stance}`,
        actorNames: action.actorNames,
        consequences: action.consequences,
      })),
    ]),
  ].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.id.localeCompare(right.id),
  );
  const overview = {
    activeCases: cases.filter((item) => item.status === "OPEN").length,
    historicalCases: cases.filter((item) => item.status !== "OPEN").length,
    activeAlliances: groups.filter(
      (item) => item.kind === "ALLIANCE" && item.status === "ACTIVE",
    ).length,
    activeFactions: groups.filter(
      (item) => item.kind === "FACTION" && item.status === "ACTIVE",
    ).length,
    powerBlocs: groups.filter((item) => item.kind === "POWER BLOC").length,
    strongestActors: actors.slice(0, 5),
    recentActivity: activity.slice(0, 5),
  };
  return { cases, actors, groups, activity, overview };
}
