import React from "react";

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

  return (
    <>
      <div className="subnav">
        <button
          className={`subnav-item ${trainingView === "team" ? "active" : ""}`}
          onClick={() => setTrainingView("team")}
        >
          Team Training
        </button>
        <button
          className={`subnav-item ${trainingView === "personal" ? "active" : ""}`}
          onClick={() => setTrainingView("personal")}
        >
          Personal Train
        </button>
        <button
          className={`subnav-item ${trainingView === "load" ? "active" : ""}`}
          onClick={() => setTrainingView("load")}
        >
          Load Management
        </button>
        <button
          className={`subnav-item ${trainingView === "staff" ? "active" : ""}`}
          onClick={() => setTrainingView("staff")}
        >
          Staff Assignments
        </button>
        <button
          className={`subnav-item ${trainingView === "modules" ? "active" : ""}`}
          onClick={() => setTrainingView("modules")}
        >
          Training Module
        </button>
      </div>
      {trainingView === "team" && renderTeamTraining()}
      {trainingView === "personal" && renderPersonalTraining()}
      {trainingView === "load" && renderLoadManagement()}
      {trainingView === "staff" && renderStaffAssignments()}
      {trainingView === "modules" && renderTrainingModule()}
    </>
  );
}

