import React from "react";

export default function TacticasPage({
  myTeam,
  renderStart,
  tacticsView,
  setTacticsView,
  renderTacticsBoard,
  renderTacticsCreator,
  renderDefensiveMatchups,
  renderRotationMatrix,
  renderSpecialPlays,
}) {
  if (!myTeam) return renderStart();

  return (
    <>
      <div className="subnav">
        <button
          className={`subnav-item ${tacticsView === "board" ? "active" : ""}`}
          onClick={() => setTacticsView("board")}
        >
          Pizarra
        </button>
        <button
          className={`subnav-item ${tacticsView === "creator" ? "active" : ""}`}
          onClick={() => setTacticsView("creator")}
        >
          Creator
        </button>
        <button
          className={`subnav-item ${tacticsView === "matchups" ? "active" : ""}`}
          onClick={() => setTacticsView("matchups")}
        >
          Matchups
        </button>
        <button
          className={`subnav-item ${tacticsView === "rotation" ? "active" : ""}`}
          onClick={() => setTacticsView("rotation")}
        >
          Rotaciones
        </button>
        <button
          className={`subnav-item ${tacticsView === "specials" ? "active" : ""}`}
          onClick={() => setTacticsView("specials")}
        >
          Specials
        </button>
      </div>
      {tacticsView === "board" && renderTacticsBoard()}
      {tacticsView === "creator" && renderTacticsCreator()}
      {tacticsView === "matchups" && renderDefensiveMatchups()}
      {tacticsView === "rotation" && renderRotationMatrix()}
      {tacticsView === "specials" && renderSpecialPlays()}
    </>
  );
}

