import React from "react";

const RULESET_STYLES = {
  NBA: { color: "#3b82f6", label: "NBA" },
  WNBA: { color: "#f97316", label: "WNBA" },
  FIBA_M: { color: "#22c55e", label: "FIBA" },
  FIBA_W: { color: "#22c55e", label: "FIBA" },
  ACB: { color: "#ff7b39", label: "ACB" },
  FEB: { color: "#16a34a", label: "FEB" },
  NCAA_M: { color: "#f59e0b", label: "NCAA" },
  NCAA_W: { color: "#14b8a6", label: "NCAA" },
};

export function LiveScore({
  homeName,
  awayName,
  homeScore,
  awayScore,
  periodLabel,
  timeLabel,
  shotClockLabel,
  homeTimeoutsLeft,
  awayTimeoutsLeft,
  homeTeamFouls,
  awayTeamFouls,
  ruleset,
  inProgress,
}) {
  const style = RULESET_STYLES[ruleset] || RULESET_STYLES.FIBA_M;

  return (
    <div className="live-score-cyber">
      <div className="live-indicator">
        <div className="live-left">
          <span className={`live-dot ${inProgress ? "on" : ""}`} />
          <span className="live-text">LIVE</span>
        </div>
        <div className="ruleset-badge" style={{ background: style.color }}>
          {style.label}
        </div>
      </div>

      <div className="score-header">
        <div className="team-name">{homeName}</div>
        <div className="team-name right">{awayName}</div>
      </div>

      <div className="score-container">
        <div className="team-score-value">{homeScore ?? "--"}</div>
        <div className="score-separator">-</div>
        <div className="team-score-value">{awayScore ?? "--"}</div>
      </div>

      <div className="game-status-row">
        <div className="quarter-badge">{periodLabel || "Q1"}</div>
        <div className="time-remaining mono">{timeLabel || "10:00"}</div>
      </div>

      <div className="game-meta-row mono">
        <div className="game-meta-left">
          <span className="meta-pill">SC {shotClockLabel || "--"}</span>
          <span className="meta-pill">TF {Number.isFinite(Number(homeTeamFouls)) ? Number(homeTeamFouls) : "--"}-{Number.isFinite(Number(awayTeamFouls)) ? Number(awayTeamFouls) : "--"}</span>
        </div>
        <div className="game-meta-right">
          <span className="meta-pill">TO {Number.isFinite(Number(homeTimeoutsLeft)) ? Number(homeTimeoutsLeft) : "--"}-{Number.isFinite(Number(awayTimeoutsLeft)) ? Number(awayTimeoutsLeft) : "--"}</span>
        </div>
      </div>
    </div>
  );
}

export default LiveScore;
