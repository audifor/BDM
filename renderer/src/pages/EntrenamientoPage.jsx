import React, { useMemo } from "react";
import DraggableSubnav from "../components/DraggableSubnav";

export default function EntrenamientoPage({
  myTeam,
  renderStart,
  trainingView,
  setTrainingView,
  renderTeamTraining,
  renderPersonalTraining,
  renderLoadManagement,
  renderStaffAssignments,
  renderTrainingModule,
}) {
  if (!myTeam) return renderStart();

  const items = useMemo(
    () => [
      { id: "team", label: "Equipo", active: trainingView === "team", onClick: () => setTrainingView("team") },
      {
        id: "personal",
        label: "Individual",
        active: trainingView === "personal",
        onClick: () => setTrainingView("personal"),
      },
      { id: "load", label: "Carga", active: trainingView === "load", onClick: () => setTrainingView("load") },
      { id: "staff", label: "Staff", active: trainingView === "staff", onClick: () => setTrainingView("staff") },
      {
        id: "modules",
        label: "Módulos",
        active: trainingView === "modules",
        onClick: () => setTrainingView("modules"),
      },
    ],
    [trainingView, setTrainingView],
  );

  return (
    <>
      <DraggableSubnav storageKey="pcbasket.subnav.training" items={items} />
      {trainingView === "team" && renderTeamTraining()}
      {trainingView === "personal" && renderPersonalTraining()}
      {trainingView === "load" && renderLoadManagement()}
      {trainingView === "staff" && renderStaffAssignments()}
      {trainingView === "modules" && renderTrainingModule()}
    </>
  );
}
