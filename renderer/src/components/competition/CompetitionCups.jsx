import React, { useState } from "react";
import { Trophy, Calendar, Users, Target, Award, TrendingUp } from "lucide-react";

export default function CompetitionCups({
  cupBrackets = {},
  allTeams = [],
  onTeamClick,
}) {
  const [activeCup, setActiveCup] = useState("copa"); // copa | supercopa | playoff

  const getTeamById = (teamId) => {
    return allTeams.find(t => t.id === teamId);
  };

  const cupConfigs = {
    copa: {
      name: "Copa del Rey",
      icon: Trophy,
      color: "#ef4444",
      rounds: ["Dieciseisavos", "Octavos", "Cuartos", "Semifinales", "Final"],
    },
    supercopa: {
      name: "Supercopa",
      icon: Award,
      color: "#f59e0b",
      rounds: ["Semifinales", "Final"],
    },
    playoff: {
      name: "Playoff Ascenso",
      icon: TrendingUp,
      color: "#22c55e",
      rounds: ["Cuartos", "Semifinales", "Final"],
    },
  };

  const currentConfig = cupConfigs[activeCup];
  const currentBracket = cupBrackets[activeCup] || { current_round: "", matches: [] };

  const renderMatch = (match) => {
    const homeTeam = getTeamById(match.home);
    const awayTeam = getTeamById(match.away);

    const homeScore = match.result?.home;
    const awayScore = match.result?.away;
    const isPlayed = match.played;
    const winner = isPlayed && homeScore > awayScore ? match.home : isPlayed && awayScore > homeScore ? match.away : null;

    return (
      <div key={match.id} className={`bracket-match ${isPlayed ? "played" : "pending"}`}>
        <div className="match-date">
          <Calendar size={14} />
          {match.date || "Por definir"}
        </div>
        <div className={`match-team ${winner === match.home ? "winner" : ""}`}>
          <div
            className="team-name-bracket"
            onClick={() => homeTeam && onTeamClick && onTeamClick(match.home)}
          >
            {homeTeam?.name || "Por definir"}
          </div>
          <div className="team-score">
            {isPlayed ? homeScore : "-"}
          </div>
        </div>
        <div className={`match-team ${winner === match.away ? "winner" : ""}`}>
          <div
            className="team-name-bracket"
            onClick={() => awayTeam && onTeamClick && onTeamClick(match.away)}
          >
            {awayTeam?.name || "Por definir"}
          </div>
          <div className="team-score">
            {isPlayed ? awayScore : "-"}
          </div>
        </div>
      </div>
    );
  };

  const renderBracketByRound = () => {
    const matchesByRound = {};
    currentConfig.rounds.forEach(round => {
      matchesByRound[round] = currentBracket.matches?.filter(m => m.round === round) || [];
    });

    return (
      <div className="bracket-container">
        {currentConfig.rounds.map(round => {
          const matches = matchesByRound[round];
          if (matches.length === 0) return null;

          return (
            <div key={round} className="bracket-round">
              <div className="bracket-round-header">
                <h3>{round}</h3>
                <span className="bracket-round-count">{matches.length} partidos</span>
              </div>
              <div className="bracket-matches">
                {matches.map(match => renderMatch(match))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCupSummary = () => {
    const totalMatches = currentBracket.matches?.length || 0;
    const playedMatches = currentBracket.matches?.filter(m => m.played).length || 0;
    const currentRound = currentBracket.current_round || "No iniciado";

    return (
      <div className="cup-summary">
        <div className="summary-stat">
          <div className="summary-label">Ronda Actual</div>
          <div className="summary-value">{currentRound}</div>
        </div>
        <div className="summary-stat">
          <div className="summary-label">Partidos Jugados</div>
          <div className="summary-value">{playedMatches} / {totalMatches}</div>
        </div>
        <div className="summary-stat">
          <div className="summary-label">Equipos Restantes</div>
          <div className="summary-value">
            {currentBracket.matches?.filter(m => !m.played).length * 2 || 0}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="bento competition-cups">
      <div className="card hero modal-glass-tactical">
        <div className="card-header">
          <h2>Copas & Torneos</h2>
          <Trophy size={24} color="#f59e0b" />
        </div>
        <div className="desc">
          Brackets de competiciones eliminatorias. Sigue el progreso de las copas.
        </div>

        <div className="cups-nav">
          <button
            className={`cup-btn ${activeCup === "copa" ? "active" : ""}`}
            onClick={() => setActiveCup("copa")}
          >
            <Trophy size={18} color={cupConfigs.copa.color} />
            Copa del Rey
          </button>
          <button
            className={`cup-btn ${activeCup === "supercopa" ? "active" : ""}`}
            onClick={() => setActiveCup("supercopa")}
          >
            <Trophy size={18} color={cupConfigs.supercopa.color} />
            Supercopa
          </button>
          <button
            className={`cup-btn ${activeCup === "playoff" ? "active" : ""}`}
            onClick={() => setActiveCup("playoff")}
          >
            <Target size={18} color={cupConfigs.playoff.color} />
            Playoff Ascenso
          </button>
        </div>
      </div>

      <div className="cup-content" style={{ gridColumn: "1 / -1" }}>
        <div className="card modal-glass-tactical">
          <div className="cup-header">
            <h3>{currentConfig.name}</h3>
          </div>

          {renderCupSummary()}

          {currentBracket.matches && currentBracket.matches.length > 0 ? (
            renderBracketByRound()
          ) : (
            <div className="empty-state">
              <p>No hay datos de {currentConfig.name} disponibles.</p>
              <p className="hint">La competición aún no ha comenzado o no está configurada.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
