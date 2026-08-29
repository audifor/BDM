import React, { useMemo } from "react";
import DraggableSubnav from "../components/DraggableSubnav";

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
  renderMatchSim,
}) {
  if (!myTeam) return renderStart();

  const items = useMemo(
    () => [
      { id: "board", label: "Pizarra", active: tacticsView === "board", onClick: () => setTacticsView("board") },
      { id: "creator", label: "Diseñador", active: tacticsView === "creator", onClick: () => setTacticsView("creator") },
      { id: "matchups", label: "Emparejamientos", active: tacticsView === "matchups", onClick: () => setTacticsView("matchups") },
      { id: "rotation", label: "Rotaciones", active: tacticsView === "rotation", onClick: () => setTacticsView("rotation") },
      { id: "specials", label: "Jugadas", active: tacticsView === "specials", onClick: () => setTacticsView("specials") },
      { id: "match", label: "Partido", active: tacticsView === "match", onClick: () => setTacticsView("match") },
    ],
    [tacticsView, setTacticsView],
  );

  return (
    <>
      <DraggableSubnav storageKey="pcbasket.subnav.tactics" items={items} />
      {tacticsView === "board" && renderTacticsBoard()}
      {tacticsView === "creator" && renderTacticsCreator()}
      {tacticsView === "matchups" && renderDefensiveMatchups()}
      {tacticsView === "rotation" && renderRotationMatrix()}
      {tacticsView === "specials" && renderSpecialPlays()}
      {tacticsView === "match" && renderMatchSim()}
    </>
  );
}
