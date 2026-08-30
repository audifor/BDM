import React, { useMemo, useState } from "react";
import DraggableSubnav from "../club/components/DraggableSubnav";
export default function CompetitionSectionPage({
  competitionView,
  setCompetitionView,
  renderCalendar,
  renderJornadas,
  renderStandings,
  upcomingFixtures = [],
  allTeams = [],
  allPlayers = [],
  cupBrackets = {},
  onTeamClick,
  onPlayerClick,
  onSimulateMatch,
}) {
  const [stat, setStat] = useState("scorers");
  const [simulated, setSimulated] = useState({});
  const items = useMemo(
    () =>
      [
        ["calendar", "Calendario"],
        ["next", "Próximos"],
        ["standings", "Clasificación"],
        ["results", "Resultados"],
        ["stats", "Estadísticas"],
        ["cups", "Copas"],
      ].map(([id, label]) => ({
        id,
        label,
        active: competitionView === id,
        onClick: () => setCompetitionView(id),
      })),
    [competitionView, setCompetitionView],
  );
  const team = (id) =>
    allTeams.find((x) => String(x.id) === String(id))?.name || "—";
  const statRows = [...allPlayers].sort(
    (a, b) =>
      Number(
        b.data?.stats?.[
          stat === "assists" ? "apg" : stat === "rebounds" ? "rpg" : "ppg"
        ],
      ) -
      Number(
        a.data?.stats?.[
          stat === "assists" ? "apg" : stat === "rebounds" ? "rpg" : "ppg"
        ],
      ),
  );
  const statKey = stat === "assists" ? "apg" : stat === "rebounds" ? "rpg" : "ppg";
  const statLabel = stat === "assists" ? "APG" : stat === "rebounds" ? "RPG" : "PPG";
  const matches = cupBrackets.copa?.matches || [];
  const simulate = (fixtureId) => {
    onSimulateMatch && onSimulateMatch(fixtureId);
    setSimulated((current) => ({ ...current, [fixtureId]: true }));
  };
  return (
    <section className="pcb-competition">
      <DraggableSubnav
        storageKey="pcbasket.subnav.competition"
        className="subnav club-subnav"
        items={items}
      />
      {competitionView === "calendar" && renderCalendar()}
      {competitionView === "next" && (
        <section className="bento competition-page">
          <div className="card competition-next">
            <h2>Próximos partidos</h2>
            <div className="table next-fixtures-table">
              {upcomingFixtures.map((f) => (
                <div className="row next-fixtures-table" key={f.id}>
                  <span>{f.date}</span>
                  <span>Liga</span>
                  <b className="next-fixtures-teams">
                    <button
                      className="link-button"
                      onClick={() => onTeamClick && onTeamClick(f.homeId)}
                      type="button"
                    >
                      {team(f.homeId)}
                    </button>{" "}
                    —{" "}
                    <button
                      className="link-button"
                      onClick={() => onTeamClick && onTeamClick(f.awayId)}
                      type="button"
                    >
                      {team(f.awayId)}
                    </button>
                  </b>
                  <span>Local</span>
                  <span>Forma: W W L</span>
                  {simulated[f.id] ? (
                    <span className="simulated-tag">Simulado</span>
                  ) : (
                    <button
                      className="subnav-item"
                      onClick={() => simulate(f.id)}
                      type="button"
                    >
                      Simular
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {competitionView === "standings" && renderStandings()}
      {competitionView === "results" && renderJornadas()}
      {competitionView === "stats" && (
        <section className="bento competition-page">
          <div className="card competition-stats">
            <h2>Estadísticas</h2>
            <div className="tabs-nav">
              {[
                ["scorers", "Anotadores"],
                ["assists", "Asistentes"],
                ["rebounds", "Rebotes"],
              ].map(([id, label]) => (
                <button
                  className={stat === id ? "active" : ""}
                  onClick={() => setStat(id)}
                  key={id}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="competition-stat-leaders" aria-label={`Top 3 ${statLabel}`}>
              {statRows.slice(0, 3).map((player, index) => (
                <button
                  className="competition-stat-leader"
                  key={player.id}
                  onClick={() => onPlayerClick && onPlayerClick(player.id)}
                  type="button"
                >
                  <b>TOP {index + 1}</b>
                  <span>{player.name}</span>
                  <strong>{player.data?.stats?.[statKey] ?? 0} {statLabel}</strong>
                </button>
              ))}
            </div>
            <div className="table stats-table">
              <div className="row head stats-table">
                <span>#</span>
                <span>Jugador</span>
                <span>Equipo</span>
                <span>Pos</span>
                <span>{statLabel}</span>
              </div>
              {statRows.map((p, i) => (
                <div className="row stats-table" key={p.id}>
                  <span>{i + 1}</span>
                  <button
                    className="link-button"
                    onClick={() => onPlayerClick && onPlayerClick(p.id)}
                    type="button"
                  >
                    <b>{p.name}</b>
                  </button>
                  <span>{team(p.data?.team_id)}</span>
                  <span>{p.data?.position}</span>
                  <strong>
                    {
                      p.data?.stats?.[statKey]
                    }
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {competitionView === "cups" && (
        <section className="bento competition-page">
          <div className="card competition-cups">
            <h2>Copas & Torneos</h2>
            <h3>Copa del Rey · Cuartos</h3>
            <div className="table cups-table">
              {matches.map((m) => (
                <div className="row cups-table" key={m.id}>
                  <span>{m.date}</span>
                  <b>{team(m.home)}</b>
                  <strong>—</strong>
                  <b>{team(m.away)}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
