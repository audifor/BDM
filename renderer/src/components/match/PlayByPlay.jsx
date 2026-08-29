import React from "react";

export function PlayByPlay({ actions }) {
  return (
    <div className="play-by-play-cyber">
      <div className="pbp-header">
        <h3>Play-by-Play</h3>
      </div>
      <div className="pbp-content custom-scrollbar">
        {actions.length === 0 ? (
          <div className="pbp-empty">Esperando acciones...</div>
        ) : (
          <>
            {actions.map((action) => (
              <div
                key={action.id}
                className={`pbp-action ${action.isScore ? "pbp-score" : ""} ${
                  action.team === "home" ? "pbp-home" : "pbp-away"
                }`}
              >
                <div className="pbp-time">
                  {action.periodLabel} {action.time}
                </div>
                <div className="pbp-description">{action.description}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default PlayByPlay;
