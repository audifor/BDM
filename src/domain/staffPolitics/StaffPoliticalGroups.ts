import { parseGameDate, type GameDate } from "@/domain/date";
import {
  type StaffPersonId,
  teamIdFromString,
  type TeamId,
} from "@/domain/ids";
import { POLITICAL_AGENDAS, type PoliticalAgenda } from "./StaffPolitics";

export const STAFF_POLITICAL_GROUP_STATUSES = [
  "ACTIVE",
  "DORMANT",
  "DISSOLVED",
] as const;
export type StaffPoliticalGroupStatus =
  (typeof STAFF_POLITICAL_GROUP_STATUSES)[number];
export interface StaffPoliticalAlliance {
  readonly id: string;
  readonly teamId: TeamId;
  readonly memberIds: readonly StaffPersonId[];
  readonly formedOn: GameDate;
  readonly lastReinforcedOn: GameDate;
  readonly status: StaffPoliticalGroupStatus;
  readonly sharedAgendaWeights: Readonly<
    Partial<Record<PoliticalAgenda, number>>
  >;
  readonly coordinationScore: number;
  readonly cohesionScore: number;
}
export interface StaffPoliticalFaction {
  readonly id: string;
  readonly teamId: TeamId;
  readonly memberIds: readonly StaffPersonId[];
  readonly leaderId: StaffPersonId;
  readonly formedOn: GameDate;
  readonly lastReinforcedOn: GameDate;
  readonly status: StaffPoliticalGroupStatus;
  readonly dominantAgendas: readonly PoliticalAgenda[];
  readonly cohesionScore: number;
  readonly influenceScore: number;
}
export interface StaffPoliticalPowerBloc {
  readonly teamId: TeamId;
  readonly memberIds: readonly StaffPersonId[];
  readonly sourceAllianceIds: readonly string[];
  readonly sourceFactionIds: readonly string[];
  readonly leaderId?: StaffPersonId;
  readonly influenceScore: number;
  readonly cohesionScore: number;
}
export function staffPoliticalAllianceIdFor(
  teamId: TeamId,
  memberIds: readonly StaffPersonId[],
): string {
  return `staff-political-alliance:${teamId}:${members(memberIds).join(":")}`;
}
export function staffPoliticalFactionIdFor(
  teamId: TeamId,
  memberIds: readonly StaffPersonId[],
): string {
  return `staff-political-faction:${teamId}:${members(memberIds).join(":")}`;
}
export function createStaffPoliticalAlliance(
  value: StaffPoliticalAlliance,
): StaffPoliticalAlliance {
  const memberIds = members(value.memberIds),
    teamId = teamIdFromString(value.teamId);
  if (
    memberIds.length < 2 ||
    memberIds.length > 4 ||
    value.id !== staffPoliticalAllianceIdFor(teamId, memberIds) ||
    !STAFF_POLITICAL_GROUP_STATUSES.includes(value.status) ||
    !score(value.coordinationScore) ||
    !score(value.cohesionScore)
  )
    throw new RangeError("Invalid Staff political alliance");
  return {
    ...value,
    teamId,
    memberIds,
    formedOn: parseGameDate(value.formedOn),
    lastReinforcedOn: parseGameDate(value.lastReinforcedOn),
    sharedAgendaWeights: weights(value.sharedAgendaWeights),
  };
}
export function createStaffPoliticalFaction(
  value: StaffPoliticalFaction,
): StaffPoliticalFaction {
  const memberIds = members(value.memberIds),
    teamId = teamIdFromString(value.teamId),
    dominantAgendas = [...value.dominantAgendas];
  if (
    memberIds.length < 3 ||
    value.id !== staffPoliticalFactionIdFor(teamId, memberIds) ||
    !memberIds.includes(value.leaderId) ||
    !STAFF_POLITICAL_GROUP_STATUSES.includes(value.status) ||
    !score(value.cohesionScore) ||
    !score(value.influenceScore) ||
    new Set(dominantAgendas).size !== dominantAgendas.length ||
    dominantAgendas.some((agenda) => !POLITICAL_AGENDAS.includes(agenda))
  )
    throw new RangeError("Invalid Staff political faction");
  return {
    ...value,
    teamId,
    memberIds,
    dominantAgendas,
    formedOn: parseGameDate(value.formedOn),
    lastReinforcedOn: parseGameDate(value.lastReinforcedOn),
  };
}
function members(value: readonly StaffPersonId[]): StaffPersonId[] {
  const result = [...value];
  if (
    result.some((id) => !id.trim()) ||
    new Set(result).size !== result.length ||
    result.some(
      (id, index) => index > 0 && result[index - 1]!.localeCompare(id) >= 0,
    )
  )
    throw new RangeError("Political group members must be sorted and unique");
  return result;
}
function score(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}
function weights(
  value: Readonly<Partial<Record<PoliticalAgenda, number>>>,
): Readonly<Partial<Record<PoliticalAgenda, number>>> {
  for (const [agenda, weight] of Object.entries(value))
    if (
      !POLITICAL_AGENDAS.includes(agenda as PoliticalAgenda) ||
      !score(weight)
    )
      throw new RangeError("Invalid political agenda weights");
  return { ...value };
}
