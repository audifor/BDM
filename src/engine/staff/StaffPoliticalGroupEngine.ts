import { addDays, compareGameDates } from "@/domain/date";
import {
  type PoliticalAgenda,
  createStaffPoliticalAlliance,
  createStaffPoliticalFaction,
  staffPoliticalAllianceIdFor,
  staffPoliticalFactionIdFor,
  type StaffPoliticalAlliance,
  type StaffPoliticalFaction,
  type StaffPoliticalPowerBloc,
} from "@/domain/staffPolitics";
import { updateGameWorld, type GameWorld } from "@/domain/world";
import { buildStaffPoliticalRelevanceIndex } from "./StaffPoliticalPositionEngine";

export const STAFF_POLITICAL_GROUP_TUNING = Object.freeze({
  coordinateScore: 20,
  sameSideScore: 4,
  oppositeSideScore: -8,
  allianceMinimumCoordinates: 2,
  allianceMinimumScore: 40,
  dormantDays: 180,
  dissolvedDays: 365,
  factionMinimumPairScore: 40,
});
export interface StaffPoliticalCoordinationEvidence {
  readonly teamId: string;
  readonly staffAId: string;
  readonly staffBId: string;
  readonly coordinatedActionCount: number;
  readonly sameSideCaseCount: number;
  readonly oppositeSideCaseCount: number;
  readonly lastCoordinatedOn?: string;
  readonly agendaEvidence: Readonly<Partial<Record<PoliticalAgenda, number>>>;
  readonly score: number;
  readonly caseCount: number;
}

export function buildStaffPoliticalCoordinationEvidence(
  world: GameWorld,
): readonly StaffPoliticalCoordinationEvidence[] {
  const rows = new Map<
    string,
    {
      teamId: string;
      a: string;
      b: string;
      coordinated: number;
      same: number;
      opposite: number;
      last?: string;
      agendas: Record<string, number>;
      cases: Set<string>;
    }
  >();
  const actionsByCase = new Map<
    string,
    (typeof world.staffPoliticalActionsById)[string][]
  >();
  const touch = (
    teamId: string,
    first: string,
    second: string,
    caseId: string,
    agenda: PoliticalAgenda,
  ) => {
    const [a, b] = [first, second].sort();
    const key = `${teamId}:${a}:${b}`;
    const row = rows.get(key) ?? {
      teamId,
      a,
      b,
      coordinated: 0,
      same: 0,
      opposite: 0,
      agendas: {},
      cases: new Set<string>(),
    };
    row.cases.add(caseId);
    row.agendas[agenda] = (row.agendas[agenda] ?? 0) + 1;
    rows.set(key, row);
    return row;
  };
  for (const action of Object.values(world.staffPoliticalActionsById)) {
    const politicalCase = world.staffPoliticalCasesById[action.caseId];
    if (politicalCase === undefined) continue;
    const list = actionsByCase.get(action.caseId) ?? [];
    list.push(action);
    actionsByCase.set(action.caseId, list);
    if (action.kind === "COORDINATE")
      for (let i = 0; i < action.actorIds.length; i += 1)
        for (let j = i + 1; j < action.actorIds.length; j += 1) {
          const row = touch(
            action.teamId,
            action.actorIds[i]!,
            action.actorIds[j]!,
            action.caseId,
            politicalCase.agenda,
          );
          row.coordinated += 1;
          if (row.last === undefined || row.last < action.performedOn)
            row.last = action.performedOn;
        }
  }
  for (const [caseId, actions] of actionsByCase)
    for (let i = 0; i < actions.length; i += 1)
      for (let j = i + 1; j < actions.length; j += 1) {
        const left = actions[i]!,
          right = actions[j]!;
        const politicalCase = world.staffPoliticalCasesById[caseId]!;
        for (const a of left.actorIds)
          for (const b of right.actorIds)
            if (a !== b) {
              const row = touch(
                left.teamId,
                a,
                b,
                caseId,
                politicalCase.agenda,
              );
              if (left.stance === right.stance) row.same += 1;
              else row.opposite += 1;
            }
      }
  return [...rows.values()]
    .map((row) => ({
      teamId: row.teamId,
      staffAId: row.a,
      staffBId: row.b,
      coordinatedActionCount: row.coordinated,
      sameSideCaseCount: row.same,
      oppositeSideCaseCount: row.opposite,
      ...(row.last === undefined ? {} : { lastCoordinatedOn: row.last }),
      agendaEvidence: row.agendas,
      score: Math.max(
        0,
        Math.min(
          100,
          row.coordinated * STAFF_POLITICAL_GROUP_TUNING.coordinateScore +
            row.same * STAFF_POLITICAL_GROUP_TUNING.sameSideScore +
            row.opposite * STAFF_POLITICAL_GROUP_TUNING.oppositeSideScore,
        ),
      ),
      caseCount: row.cases.size,
    }))
    .sort(compareEvidence);
}

export function reconcileStaffPoliticalGroups(world: GameWorld): GameWorld {
  const evidence = buildStaffPoliticalCoordinationEvidence(world);
  const active = activeStaffByTeam(world);
  const relevance =
    buildStaffPoliticalRelevanceIndex(world).politicalInfluenceByStaffId;
  const allianceCandidates = evidence.filter(
    (item) =>
      isActivePair(active, item) &&
      (item.coordinatedActionCount >=
        STAFF_POLITICAL_GROUP_TUNING.allianceMinimumCoordinates ||
        item.score >= STAFF_POLITICAL_GROUP_TUNING.allianceMinimumScore),
  );
  const alliances = reconcileAlliances(world, allianceCandidates, active);
  const factions = reconcileFactions(world, evidence, active, relevance);
  const same =
    JSON.stringify(Object.values(world.staffPoliticalAlliancesById)) ===
      JSON.stringify(alliances) &&
    JSON.stringify(Object.values(world.staffPoliticalFactionsById)) ===
      JSON.stringify(factions);
  return same
    ? world
    : updateGameWorld(world, {
        staffPoliticalAlliances: alliances,
        staffPoliticalFactions: factions,
      });
}

export function deriveStaffPoliticalPowerBlocs(
  world: GameWorld,
): readonly StaffPoliticalPowerBloc[] {
  const activeAlliances = Object.values(
    world.staffPoliticalAlliancesById,
  ).filter((item) => item.status === "ACTIVE");
  const factions = Object.values(world.staffPoliticalFactionsById).filter(
    (item) => item.status === "ACTIVE",
  );
  const blocs: StaffPoliticalPowerBloc[] = factions.map((faction) => {
    const alliances = activeAlliances.filter(
      (alliance) =>
        alliance.teamId === faction.teamId &&
        alliance.memberIds.some((member) => faction.memberIds.includes(member)),
    );
    const memberIds = [
      ...new Set([
        ...faction.memberIds,
        ...alliances.flatMap((item) => item.memberIds),
      ]),
    ].sort();
    return {
      teamId: faction.teamId,
      memberIds,
      sourceAllianceIds: alliances.map((item) => item.id).sort(),
      sourceFactionIds: [faction.id],
      leaderId: faction.leaderId,
      influenceScore: faction.influenceScore,
      cohesionScore: faction.cohesionScore,
    };
  });
  for (const alliance of activeAlliances)
    if (!blocs.some((bloc) => bloc.sourceAllianceIds.includes(alliance.id)))
      blocs.push({
        teamId: alliance.teamId,
        memberIds: alliance.memberIds,
        sourceAllianceIds: [alliance.id],
        sourceFactionIds: [],
        influenceScore: alliance.coordinationScore,
        cohesionScore: alliance.cohesionScore,
      });
  return blocs.sort(
    (a, b) =>
      a.teamId.localeCompare(b.teamId) ||
      a.memberIds.join(":").localeCompare(b.memberIds.join(":")),
  );
}

function reconcileAlliances(
  world: GameWorld,
  candidates: readonly StaffPoliticalCoordinationEvidence[],
  active: Readonly<Record<string, ReadonlySet<string>>>,
): StaffPoliticalAlliance[] {
  const result = new Map(Object.entries(world.staffPoliticalAlliancesById));
  const supported = new Set<string>();
  for (const evidence of candidates) {
    const memberIds = [evidence.staffAId, evidence.staffBId].sort() as never;
    const id = staffPoliticalAllianceIdFor(evidence.teamId as never, memberIds);
    const prior = result.get(id);
    const last = evidence.lastCoordinatedOn ?? world.currentDate;
    supported.add(id);
    result.set(
      id,
      createStaffPoliticalAlliance({
        id,
        teamId: evidence.teamId as never,
        memberIds,
        formedOn: prior?.formedOn ?? (last as never),
        lastReinforcedOn: last as never,
        status: "ACTIVE",
        sharedAgendaWeights: evidence.agendaEvidence,
        coordinationScore: evidence.score,
        cohesionScore: Math.min(100, evidence.score),
      }),
    );
  }
  return [...result.values()]
    .map((item) =>
      supported.has(item.id) &&
      item.memberIds.every((member) => active[item.teamId]?.has(member))
        ? item
        : statusFor(item, false, world.currentDate),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/* A faction is a complete qualifying-evidence component of at least three active staff.
 * For a non-complete component, graph bridges are removed first; remaining ambiguity removes
 * the weakest edge (staff-id tie-break) and repeats. Thus an incidental bridge cannot merge
 * cohesive camps, while a K4 (or larger clique) reconciles to exactly one faction. */
function reconcileFactions(
  world: GameWorld,
  evidence: readonly StaffPoliticalCoordinationEvidence[],
  active: Readonly<Record<string, ReadonlySet<string>>>,
  influence: ReturnType<
    typeof buildStaffPoliticalRelevanceIndex
  >["politicalInfluenceByStaffId"],
): StaffPoliticalFaction[] {
  const result = new Map(Object.entries(world.staffPoliticalFactionsById));
  const supported = new Set<string>();
  for (const [teamId, teamActive] of Object.entries(active)) {
    const rows = evidence.filter(
      (item) =>
        item.teamId === teamId &&
        isActivePair(active, item) &&
        item.score >= STAFF_POLITICAL_GROUP_TUNING.factionMinimumPairScore,
    );
    for (const members of cohesiveFactionGroups([...teamActive].sort(), rows)) {
      const memberSet = new Set(members);
      const groupRows = rows.filter(
        (row) => memberSet.has(row.staffAId) && memberSet.has(row.staffBId),
      );
      const id = staffPoliticalFactionIdFor(teamId as never, members as never);
      const prior = result.get(id);
      const last = groupRows
        .map((row) => row.lastCoordinatedOn ?? world.currentDate)
        .sort()
        .at(-1)!;
      const agendas = dominantAgendas(groupRows);
      const cohesion = Math.round(
        groupRows.reduce((sum, row) => sum + row.score, 0) / groupRows.length,
      );
      const leaderId = leaderFor(members, groupRows, influence);
      const influenceScore = Math.round(
        members.reduce(
          (sum, member) => sum + (influence[member]?.overall ?? 0),
          0,
        ) / members.length,
      );
      supported.add(id);
      result.set(
        id,
        createStaffPoliticalFaction({
          id,
          teamId: teamId as never,
          memberIds: members as never,
          leaderId: leaderId as never,
          formedOn: prior?.formedOn ?? (last as never),
          lastReinforcedOn: last as never,
          status: "ACTIVE",
          dominantAgendas: agendas,
          cohesionScore: cohesion,
          influenceScore,
        }),
      );
    }
  }
  return [...result.values()]
    .map((item) =>
      supported.has(item.id) &&
      item.memberIds.every((member) => active[item.teamId]?.has(member))
        ? item
        : statusFor(item, false, world.currentDate),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function deriveStaffPoliticalFactionMemberGroups(
  nodes: readonly string[],
  rows: readonly StaffPoliticalCoordinationEvidence[],
): readonly string[][] {
  const groups: string[][] = [];
  const visit = (
    members: readonly string[],
    edges: readonly StaffPoliticalCoordinationEvidence[],
  ): void => {
    const components = connectedComponents(members, edges);
    if (components.length > 1) {
      for (const component of components)
        visit(
          component,
          edges.filter(
            (edge) =>
              component.includes(edge.staffAId) &&
              component.includes(edge.staffBId),
          ),
        );
      return;
    }
    if (members.length < 3) return;
    const expected = (members.length * (members.length - 1)) / 2;
    if (edges.length === expected) {
      groups.push([...members].sort());
      return;
    }
    const bridges = bridgeKeys(members, edges);
    const weakest = edges
      .slice()
      .sort(
        (left, right) =>
          left.score - right.score ||
          pairKey(left.staffAId, left.staffBId).localeCompare(
            pairKey(right.staffAId, right.staffBId),
          ),
      )[0]!;
    const remove =
      bridges.size > 0
        ? bridges
        : new Set([pairKey(weakest.staffAId, weakest.staffBId)]);
    visit(
      members,
      edges.filter(
        (edge) => !remove.has(pairKey(edge.staffAId, edge.staffBId)),
      ),
    );
  };
  visit([...nodes].sort(), rows);
  return groups.sort((a, b) => a.join(":").localeCompare(b.join(":")));
}
function connectedComponents(
  nodes: readonly string[],
  edges: readonly StaffPoliticalCoordinationEvidence[],
): string[][] {
  const adjacent = new Map(nodes.map((node) => [node, new Set<string>()]));
  for (const edge of edges) {
    adjacent.get(edge.staffAId)?.add(edge.staffBId);
    adjacent.get(edge.staffBId)?.add(edge.staffAId);
  }
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const node of nodes)
    if (!seen.has(node)) {
      const group: string[] = [];
      const todo = [node];
      seen.add(node);
      while (todo.length > 0) {
        const current = todo.pop()!;
        group.push(current);
        for (const next of adjacent.get(current) ?? [])
          if (!seen.has(next)) {
            seen.add(next);
            todo.push(next);
          }
      }
      groups.push(group.sort());
    }
  return groups;
}
function cohesiveFactionGroups(
  nodes: readonly string[],
  rows: readonly StaffPoliticalCoordinationEvidence[],
): readonly string[][] {
  return deriveStaffPoliticalFactionMemberGroups(nodes, rows);
}
function bridgeKeys(
  nodes: readonly string[],
  edges: readonly StaffPoliticalCoordinationEvidence[],
): Set<string> {
  const bridges = new Set<string>();
  for (const edge of edges)
    if (
      connectedComponents(
        nodes,
        edges.filter((candidate) => candidate !== edge),
      ).length > 1
    )
      bridges.add(pairKey(edge.staffAId, edge.staffBId));
  return bridges;
}
function dominantAgendas(
  rows: readonly StaffPoliticalCoordinationEvidence[],
): PoliticalAgenda[] {
  return Object.entries(
    rows.reduce(
      (all, row) => {
        for (const [agenda, score] of Object.entries(row.agendaEvidence))
          all[agenda] = (all[agenda] ?? 0) + score;
        return all;
      },
      {} as Record<string, number>,
    ),
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([agenda]) => agenda as PoliticalAgenda);
}
function statusFor<T extends StaffPoliticalAlliance | StaffPoliticalFaction>(
  item: T,
  supported: boolean,
  date: string,
): T {
  const dissolved =
    compareGameDates(
      date as never,
      addDays(
        item.lastReinforcedOn,
        STAFF_POLITICAL_GROUP_TUNING.dissolvedDays,
      ),
    ) > 0;
  return {
    ...item,
    status: supported ? "ACTIVE" : dissolved ? "DISSOLVED" : "DORMANT",
  };
}
function activeStaffByTeam(
  world: GameWorld,
): Readonly<Record<string, ReadonlySet<string>>> {
  const result: Record<string, Set<string>> = {};
  for (const assignment of Object.values(world.teamStaffAssignmentsById)) {
    const employment = world.staffEmploymentByStaffId[assignment.staffPersonId];
    if (
      employment?.status === "employed" &&
      employment.teamId === assignment.teamId
    )
      (result[assignment.teamId] ??= new Set()).add(assignment.staffPersonId);
  }
  return result;
}
function leaderFor(
  members: readonly string[],
  rows: readonly StaffPoliticalCoordinationEvidence[],
  influence: ReturnType<
    typeof buildStaffPoliticalRelevanceIndex
  >["politicalInfluenceByStaffId"],
): string {
  return [...members].sort((left, right) => {
    const score = (id: string) => {
      const value = influence[id];
      const centrality =
        rows
          .filter((row) => row.staffAId === id || row.staffBId === id)
          .reduce((sum, row) => sum + row.score, 0) /
        Math.max(1, members.length - 1);
      return (
        (value?.overall ?? 0) * 0.4 +
        centrality * 0.35 +
        (value?.professionalCredibility ?? 0) * 0.1 +
        (value?.tenureWeight ?? 0) * 0.15
      );
    };
    return score(right) - score(left) || left.localeCompare(right);
  })[0]!;
}
function isActivePair(
  active: Readonly<Record<string, ReadonlySet<string>>>,
  item: StaffPoliticalCoordinationEvidence,
): boolean {
  return (
    active[item.teamId]?.has(item.staffAId) === true &&
    active[item.teamId]?.has(item.staffBId) === true
  );
}
function pairKey(left: string, right: string): string {
  return [left, right].sort().join(":");
}
function compareEvidence(
  left: StaffPoliticalCoordinationEvidence,
  right: StaffPoliticalCoordinationEvidence,
): number {
  return (
    left.teamId.localeCompare(right.teamId) ||
    left.staffAId.localeCompare(right.staffAId) ||
    left.staffBId.localeCompare(right.staffBId)
  );
}
