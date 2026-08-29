import React, { useMemo, useState } from "react";

export default function CompetitionStats({
  allPlayers = [],
  allTeams = [],
  leagueId,
  onPlayerClick,
  onTeamClick,
}) {
  const [activeTab, setActiveTab] = useState("scorers"); // scorers | assists | rebounds | teams

  const teamById = useMemo(() => {
    const map = new Map();
    (allTeams || []).forEach((t) => map.set(String(t.id), t));
    return map;
  }, [allTeams]);

  const leaguePlayers = useMemo(() => {
    return (allPlayers || []).filter((p) => {
      const team = teamById.get(String(p.data?.team_id));
      return team?.data?.league_id === leagueId;
    });
  }, [allPlayers, leagueId, teamById]);

  const parseStat = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const withGames = (player) => {
    const games = parseStat(player.data?.stats?.games_played);
    return { ...player, games };
  };

  const topScorers = useMemo(() => {
    return leaguePlayers
      .map((p) => ({ ...withGames(p), stat: parseStat(p.data?.stats?.ppg) }))
      .filter((p) => p.stat !== null)
      .sort((a, b) => (b.stat || 0) - (a.stat || 0))
      .slice(0, 30);
  }, [leaguePlayers]);

  const topAssisters = useMemo(() => {
    return leaguePlayers
      .map((p) => ({ ...withGames(p), stat: parseStat(p.data?.stats?.apg) }))
      .filter((p) => p.stat !== null)
      .sort((a, b) => (b.stat || 0) - (a.stat || 0))
      .slice(0, 30);
  }, [leaguePlayers]);

  const topRebounders = useMemo(() => {
    return leaguePlayers
      .map((p) => ({ ...withGames(p), stat: parseStat(p.data?.stats?.rpg) }))
      .filter((p) => p.stat !== null)
      .sort((a, b) => (b.stat || 0) - (a.stat || 0))
      .slice(0, 30);
  }, [leaguePlayers]);

  const teamStats = useMemo(() => {
    const leagueTeams = (allTeams || []).filter((t) => t.data?.league_id === leagueId);
    return leagueTeams
      .map((team) => {
        const stats = team.data?.stats || {};
        return {
          ...team,
          ppg: parseStat(stats.ppg),
          papg: parseStat(stats.papg),
          rpg: parseStat(stats.rpg),
          apg: parseStat(stats.apg),
          fg_pct: parseStat(stats.fg_pct),
          three_pct: parseStat(stats.three_pct),
        };
      })
      .filter((t) => [t.ppg, t.papg, t.rpg, t.apg, t.fg_pct, t.three_pct].some((v) => v !== null))
      .sort((a, b) => (b.ppg || 0) - (a.ppg || 0))
      .slice(0, 30);
  }, [allTeams, leagueId]);

  const title =
    activeTab === "scorers"
      ? "Top anotadores"
      : activeTab === "assists"
        ? "Top asistentes"
        : activeTab === "rebounds"
          ? "Top reboteadores"
          : "Estadísticas de equipos";

  const statLabel = activeTab === "scorers" ? "PPG" : activeTab === "assists" ? "APG" : "RPG";

  const renderPlayerTable = (rows) => {
    return (
      <div className="table competition-stats-table scroll-x">
        <div className="row head competition-stats-table">
          <div className="market-center">#</div>
          <div>Jugador</div>
          <div>Equipo</div>
          <div className="market-center">Pos</div>
          <div className="market-num">{statLabel}</div>
          <div className="market-center">PJ</div>
        </div>
        {rows.map((p, idx) => {
          const team = teamById.get(String(p.data?.team_id));
          return (
            <div key={p.id} className="row competition-stats-table">
              <div className="market-center mono">{idx + 1}</div>
              <button type="button" className="shortlist-player-btn" onClick={() => onPlayerClick && onPlayerClick(p)}>
                {p.name}
              </button>
              <button
                type="button"
                className="shortlist-player-btn"
                onClick={() => team && onTeamClick && onTeamClick(String(team.id))}
                disabled={!team || !onTeamClick}
              >
                {team?.name || "—"}
              </button>
              <div className="market-center">{p.data?.position || "—"}</div>
              <div className="market-num mono">{p.stat !== null ? p.stat.toFixed(1) : "—"}</div>
              <div className="market-center mono">{p.games !== null ? p.games : "—"}</div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="row empty">
            <div style={{ gridColumn: "1 / -1" }}>No hay datos disponibles.</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="bento competition-stats">
      <div className="card hero modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h2>Estadísticas</h2>
          <span className="pill">{leagueId || "—"}</span>
        </div>
        <div className="desc">Rankings densos tipo FM (sin tarjetas).</div>

        <div className="tabs-nav fm-tabs">
          <button className={`tab-btn ${activeTab === "scorers" ? "active" : ""}`} onClick={() => setActiveTab("scorers")}>
            Anotadores
          </button>
          <button className={`tab-btn ${activeTab === "assists" ? "active" : ""}`} onClick={() => setActiveTab("assists")}>
            Asistentes
          </button>
          <button className={`tab-btn ${activeTab === "rebounds" ? "active" : ""}`} onClick={() => setActiveTab("rebounds")}>
            Rebotes
          </button>
          <button className={`tab-btn ${activeTab === "teams" ? "active" : ""}`} onClick={() => setActiveTab("teams")}>
            Equipos
          </button>
        </div>
      </div>

      <div className="card results-table modal-glass-tactical" style={{ gridColumn: "1 / -1" }}>
        <div className="card-header">
          <h3>{title}</h3>
        </div>

        {activeTab === "scorers" && renderPlayerTable(topScorers)}
        {activeTab === "assists" && renderPlayerTable(topAssisters)}
        {activeTab === "rebounds" && renderPlayerTable(topRebounders)}

        {activeTab === "teams" && (
          <div className="table competition-team-stats-table scroll-x">
            <div className="row head competition-team-stats-table">
              <div className="market-center">#</div>
              <div>Equipo</div>
              <div className="market-num">PPG</div>
              <div className="market-num">PAPG</div>
              <div className="market-num">RPG</div>
              <div className="market-num">APG</div>
              <div className="market-num">TC%</div>
              <div className="market-num">3P%</div>
            </div>
            {teamStats.map((t, idx) => (
              <div key={t.id} className="row competition-team-stats-table">
                <div className="market-center mono">{idx + 1}</div>
                <button type="button" className="shortlist-player-btn" onClick={() => onTeamClick && onTeamClick(String(t.id))}>
                  {t.name}
                </button>
                <div className="market-num mono">{t.ppg !== null ? t.ppg.toFixed(1) : "—"}</div>
                <div className="market-num mono">{t.papg !== null ? t.papg.toFixed(1) : "—"}</div>
                <div className="market-num mono">{t.rpg !== null ? t.rpg.toFixed(1) : "—"}</div>
                <div className="market-num mono">{t.apg !== null ? t.apg.toFixed(1) : "—"}</div>
                <div className="market-num mono">{t.fg_pct !== null ? `${t.fg_pct.toFixed(1)}%` : "—"}</div>
                <div className="market-num mono">{t.three_pct !== null ? `${t.three_pct.toFixed(1)}%` : "—"}</div>
              </div>
            ))}
            {teamStats.length === 0 && (
              <div className="row empty">
                <div style={{ gridColumn: "1 / -1" }}>No hay datos disponibles.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

