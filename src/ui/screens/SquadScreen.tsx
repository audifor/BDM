import { useMemo, useState } from "react";

import {
  BASKETBALL_RATING_KEYS,
  getPlayerAge,
  type BasketballRatingKey,
  type Player,
} from "@/domain/player";
import {
  getCareerFatigueForPlayer,
  getDevelopmentStimulusForPlayer,
  getTeamRoster,
} from "@/domain/world";
import { getUserTeam } from "@/engine/calendar";
import { evaluatePlayerEligibility } from "@/engine/eligibility";
import { evaluateAcademicEligibility } from "@/engine/academic";
import { createEntityRef } from "@/app/entityActions/EntityRef";
import { useEntityActions } from "@/ui/entityActions/useEntityActions";
import { useGameStore } from "@/stores/gameStore";
import { Progress, Tooltip } from "@/ui/components/primitives";
import { ATTRIBUTE_LABELS } from "@/ui/attributeLabels";

type PositionFilter = "ALL" | Player["basketball"]["primaryPosition"];
type SortKey = "name" | "position" | "age" | "fatigue" | BasketballRatingKey;
type SortDirection = "ascending" | "descending";
const labels: Record<BasketballRatingKey, [string, string]> = {
  finishing: ["FIN", ATTRIBUTE_LABELS.finishing],
  shooting: ["SHO", ATTRIBUTE_LABELS.shooting],
  playmaking: ["PLA", ATTRIBUTE_LABELS.playmaking],
  perimeterDefense: ["PDE", ATTRIBUTE_LABELS.perimeterDefense],
  interiorDefense: ["IDE", ATTRIBUTE_LABELS.interiorDefense],
  rebounding: ["REB", ATTRIBUTE_LABELS.rebounding],
  athleticism: ["ATH", ATTRIBUTE_LABELS.athleticism],
};

export function filterAndSortRoster(
  world: Parameters<typeof getUserTeam>[0],
  players: readonly Player[],
  query: string,
  position: PositionFilter,
  sortKey: SortKey,
  direction: SortDirection,
) {
  const search = query.trim().toLocaleLowerCase();
  const multiplier = direction === "ascending" ? 1 : -1;
  return players
    .filter(
      (player) =>
        (position === "ALL" ||
          player.basketball.primaryPosition === position) &&
        `${player.firstName} ${player.lastName}`
          .toLocaleLowerCase()
          .includes(search),
    )
    .slice()
    .sort((left, right) => {
      const a = value(world, left, sortKey);
      const b = value(world, right, sortKey);
      return (
        (typeof a === "string"
          ? a.localeCompare(b as string)
          : a - (b as number)) * multiplier || left.id.localeCompare(right.id)
      );
    });
}

export function SquadScreen({
  world,
  selectedPlayerId: initialSelected,
}: {
  readonly world: Parameters<typeof getUserTeam>[0];
  readonly selectedPlayerId?: Player["id"];
}) {
  const team = getUserTeam(world);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [direction, setDirection] = useState<SortDirection>("ascending");
  const [selectedId, setSelectedId] = useState<Player["id"] | undefined>(
    () =>
      initialSelected ??
      (team === undefined ? undefined : getTeamRoster(world, team.id)[0]?.id),
  );
  const roster = team === undefined ? [] : getTeamRoster(world, team.id);
  const visible = useMemo(
    () =>
      filterAndSortRoster(world, roster, query, position, sortKey, direction),
    [world, roster, query, position, sortKey, direction],
  );
  const selected = visible.find((player) => player.id === selectedId);
  const sort = (key: SortKey) => {
    if (key === sortKey)
      setDirection((current) =>
        current === "ascending" ? "descending" : "ascending",
      );
    else {
      setSortKey(key);
      setDirection("ascending");
    }
  };
  if (team === undefined)
    return (
      <section className="squad-app squad-app--empty">
        No team assigned to the user coach.
      </section>
    );
  return (
    <section className="squad-app">
      <div className="squad-app__tools">
        <TeamActionHeader teamId={team.id} teamName={team.name} world={world} />
        <label>
          Search players
          <input
            aria-label="Search players"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
            type="search"
            value={query}
          />
        </label>
        <label>
          Position
          <select
            aria-label="Filter by position"
            onChange={(event) =>
              setPosition(event.target.value as PositionFilter)
            }
            value={position}
          >
            {(["ALL", "PG", "SG", "SF", "PF", "C"] as const).map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "All positions" : item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="squad-app__layout">
        <div className="squad-app__table-wrap">
          <table className="squad-app__table">
            <thead>
              <tr>
                <Header
                  active={sortKey === "position"}
                  direction={direction}
                  label="POS"
                  onClick={() => sort("position")}
                />
                <Header
                  active={sortKey === "name"}
                  direction={direction}
                  label="PLAYER"
                  onClick={() => sort("name")}
                />
                <Header
                  active={sortKey === "age"}
                  direction={direction}
                  label="AGE"
                  onClick={() => sort("age")}
                />
                {BASKETBALL_RATING_KEYS.map((key) => (
                  <th
                    aria-sort={sortKey === key ? direction : "none"}
                    key={key}
                  >
                    <Tooltip content={labels[key][1]}>
                      <button
                        aria-label={`Sort by ${labels[key][1]}`}
                        onClick={() => sort(key)}
                        type="button"
                      >
                        {labels[key][0]}
                        {sortKey === key
                          ? direction === "ascending"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </button>
                    </Tooltip>
                  </th>
                ))}
                <Header
                  active={sortKey === "fatigue"}
                  direction={direction}
                  label="FAT"
                  onClick={() => sort("fatigue")}
                />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={11}>No players match the current filters.</td>
                </tr>
              ) : (
                visible.map((player) => <PlayerRow key={player.id} player={player} selected={player.id === selectedId} onSelect={() => setSelectedId(player.id)} world={world} />)
              )}
            </tbody>
          </table>
        </div>
        <Inspector player={selected} world={world} />
      </div>
    </section>
  );
}

function TeamActionHeader({ teamId, teamName, world }: { readonly teamId: string; readonly teamName: string; readonly world: Parameters<typeof getUserTeam>[0] }) {
  const target = useEntityActions(createEntityRef('team', teamId), { world, controlledTeamId: getUserTeam(world)?.id })
  return <div {...target}><p className="eyebrow">ROSTER</p><h1>{teamName}</h1></div>
}

function PlayerRow({ player, selected, onSelect, world }: { readonly player: Player; readonly selected: boolean; readonly onSelect: () => void; readonly world: Parameters<typeof getUserTeam>[0] }) {
  const activeMatchSession = useGameStore((state) => state.getActiveMatchSession())
  const target = useEntityActions(createEntityRef('player', player.id), { world, controlledTeamId: getUserTeam(world)?.id, activeMatchSession: activeMatchSession ?? undefined })
  return <tr {...target} aria-selected={selected} className={selected ? "is-selected" : ""} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect() } }} tabIndex={0}>
    <td>{player.basketball.primaryPosition}</td><td><span className="squad-app__initials">{player.firstName[0]}{player.lastName[0]}</span>{player.firstName} {player.lastName}</td><td>{getPlayerAge(world, player.id)}</td>{BASKETBALL_RATING_KEYS.map((key) => <td className={ratingClass(player.basketball.ratings[key])} key={key}>{player.basketball.ratings[key]}</td>)}<td>{getCareerFatigueForPlayer(world, player.id)}</td>
  </tr>
}

function Header({
  active,
  direction,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly direction: SortDirection;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <th aria-sort={active ? direction : "none"}>
      <button onClick={onClick} type="button">
        {label}
        {active ? (direction === "ascending" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}
function Inspector({
  player,
  world,
}: {
  readonly player: Player | undefined;
  readonly world: Parameters<typeof getUserTeam>[0];
}) {
  if (player === undefined)
    return (
      <aside className="squad-app__inspector">
        <p className="eyebrow">PLAYER INSPECTOR</p>
        <p>
          Select a player to inspect real ratings, fatigue and development
          stimulus.
        </p>
      </aside>
    );
  const stimulus = getDevelopmentStimulusForPlayer(world, player.id);
  const fatigue = getCareerFatigueForPlayer(world, player.id);
  const team = getUserTeam(world);
  const season = Object.values(world.seasons).find((candidate) => candidate.id === world.currentSeasonId);
  const eligibility = team === undefined || season === undefined ? undefined : evaluatePlayerEligibility(world, { playerId: player.id, teamId: team.id, competitionId: season.competitionId, seasonId: season.id });
  const profile = eligibility === undefined ? undefined : Object.values(world.eligibilityProfilesById).find((item) => item.playerId === player.id && item.programTeamId === team?.id);
  const academic = Object.values(world.academicProfilesById).find((item) => item.playerId === player.id && item.programTeamId === team?.id);
  const academicEligibility = academic === undefined ? undefined : evaluateAcademicEligibility(world, player.id);
  const currentTeam = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(player.id));
  const currentCompetition = currentTeam === undefined ? undefined : Object.values(world.competitions).find((candidate) => candidate.participantTeamIds.includes(currentTeam.id));
  const currentEcosystem = currentCompetition === undefined ? undefined : world.ecosystems[currentCompetition.ecosystemId];
  const transitions = Object.values(world.ecosystemTransitionsById).filter((transition) => transition.playerId === player.id).sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate) || left.id.localeCompare(right.id));
  return (
    <aside className="squad-app__inspector">
      <p className="eyebrow">PLAYER INSPECTOR</p>
      <h2>
        {player.firstName} {player.lastName}
      </h2>
      <p>
        {player.basketball.primaryPosition} · Age{" "}
        {getPlayerAge(world, player.id)}
      </p>
      <section><h3>Cross-ecosystem career</h3><p>Current ecosystem: {currentEcosystem?.name ?? "Free agent"}</p><p>Current team: {currentTeam?.name ?? "None"}</p>{transitions.length === 0 ? <p>No cross-ecosystem moves.</p> : <ul>{transitions.map((transition) => <li key={transition.id}>{transition.effectiveDate} · {world.ecosystems[transition.fromEcosystemId]?.name} to {world.ecosystems[transition.toEcosystemId]?.name} · {transition.transitionType}</li>)}</ul>}</section>
      <dl>
        {BASKETBALL_RATING_KEYS.map((key) => (
          <div key={key}>
            <dt>{labels[key][0]}</dt>
            <dd className={ratingClass(player.basketball.ratings[key])}>
              {player.basketball.ratings[key]}
            </dd>
          </div>
        ))}
      </dl>
      <section>
        <h3>Career Fatigue</h3>
        <strong>{fatigue} / 100</strong>
        <Progress label="Career Fatigue" value={fatigue} />
      </section>
      <section>
        <h3>Development stimulus</h3>
        <p>Accumulated development stimulus, not a rating.</p>
        {stimulus === undefined ? (
          <p>No accumulated stimulus.</p>
        ) : (
          <dl>
            {BASKETBALL_RATING_KEYS.map((key) => (
              <div key={key}>
                <dt>{labels[key][0]}</dt>
                <dd>{stimulus.byRating[key].toFixed(1)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      {profile !== undefined && eligibility !== undefined && (
        <section>
          <h3>Eligibility</h3>
          <p>{eligibility.status.toUpperCase()} · {profile.seasonsUsed} used · {eligibility.seasonsRemaining} remaining</p>
          {eligibility.reasons.length > 0 && <p>{eligibility.reasons.join(", ")}</p>}
          {season !== undefined && <p>Current season: {profile.seasonRecordsBySeasonId[season.id]?.gamesParticipated ?? 0} games · {profile.seasonRecordsBySeasonId[season.id]?.resolved ? "resolved" : "unresolved"}</p>}
        </section>
      )}
      {academic !== undefined && academicEligibility !== undefined && <section><h3>Academics</h3><p>Academic Performance: {academic.performance} · Academic Progress: {academic.progress}</p><p>{academicEligibility.standing.toUpperCase()} · Risk: {academicEligibility.risk.toUpperCase()}</p><p>Academic Eligibility: {academicEligibility.academicallyEligible ? 'ELIGIBLE' : 'INELIGIBLE'}</p><p>Current Support: {Object.values(world.academicSupportPlansById).find((item) => item.playerId === player.id)?.level ?? 'None'}</p><p>Next Evaluation: January 1 or July 1</p></section>}
    </aside>
  );
}
function value(
  world: Parameters<typeof getUserTeam>[0],
  player: Player,
  key: SortKey,
): string | number {
  if (key === "name") return `${player.lastName} ${player.firstName}`;
  if (key === "position") return player.basketball.primaryPosition;
  if (key === "age") return getPlayerAge(world, player.id);
  if (key === "fatigue") return getCareerFatigueForPlayer(world, player.id);
  return player.basketball.ratings[key];
}
function ratingClass(rating: number) {
  return rating >= 80
    ? "rating rating--elite"
    : rating >= 65
      ? "rating rating--strong"
      : rating < 45
        ? "rating rating--weak"
        : "rating";
}
