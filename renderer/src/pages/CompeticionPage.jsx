import React, { useMemo } from "react";
import DraggableSubnav from "../components/DraggableSubnav";
import CompetitionNextMatches from "../components/competition/CompetitionNextMatches";
import CompetitionStats from "../components/competition/CompetitionStats";
import CompetitionCups from "../components/competition/CompetitionCups";

export default function CompeticionPage({
  renderStart,
  competitionView,
  setCompetitionView,
  renderCalendar,
  renderJornadas,
  renderStandings,
  // New props
  upcomingFixtures,
  myTeamId,
  allTeams,
  allPlayers,
  cupBrackets,
  leagueId,
  onTeamClick,
  onPlayerClick,
  onSimulateMatch,
}) {
  const items = useMemo(
    () => [
      {
        id: "calendar",
        label: "Calendario",
        active: competitionView === "calendar",
        onClick: () => setCompetitionView("calendar"),
      },
      {
        id: "next",
        label: "Próximos",
        active: competitionView === "next",
        onClick: () => setCompetitionView("next"),
      },
      {
        id: "standings",
        label: "Clasificación",
        active: competitionView === "standings",
        onClick: () => setCompetitionView("standings"),
      },
      {
        id: "results",
        label: "Resultados",
        active: competitionView === "results",
        onClick: () => setCompetitionView("results"),
      },
      {
        id: "stats",
        label: "Estadísticas",
        active: competitionView === "stats",
        onClick: () => setCompetitionView("stats"),
      },
      {
        id: "cups",
        label: "Copas",
        active: competitionView === "cups",
        onClick: () => setCompetitionView("cups"),
      },
    ],
    [competitionView, setCompetitionView],
  );

  if (!renderCalendar) return renderStart();

  return (
    <>
      <DraggableSubnav
        storageKey="pcbasket.subnav.competition"
        className="subnav club-subnav"
        items={items}
      />

      {competitionView === "calendar" && renderCalendar()}

      {competitionView === "next" && (
        <CompetitionNextMatches
          upcomingFixtures={upcomingFixtures || []}
          myTeamId={myTeamId}
          allTeams={allTeams || []}
          allPlayers={allPlayers || []}
          onTeamClick={onTeamClick}
          onSimulateMatch={onSimulateMatch}
        />
      )}

      {competitionView === "standings" && renderStandings?.()}

      {competitionView === "results" && renderJornadas?.()}

      {competitionView === "stats" && (
        <CompetitionStats
          allPlayers={allPlayers || []}
          allTeams={allTeams || []}
          leagueId={leagueId}
          onPlayerClick={onPlayerClick}
          onTeamClick={onTeamClick}
        />
      )}

      {competitionView === "cups" && (
        <CompetitionCups
          cupBrackets={cupBrackets || {}}
          allTeams={allTeams || []}
          onTeamClick={onTeamClick}
        />
      )}

      {!competitionView && renderStart()}
    </>
  );
}
