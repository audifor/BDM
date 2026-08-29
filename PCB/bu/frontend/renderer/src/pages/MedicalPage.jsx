import React from "react";

export default function MedicalPage({
  myTeam,
  renderStart,
  medicalView,
  setMedicalView,
  renderMedicalOverview,
  renderMedicalInjuredList,
  renderMedicalHistory,
  renderMedicalFacilities,
  renderMedicalStaff,
  renderPreventionCenter,
}) {
  if (!myTeam) return renderStart();

  return (
    <>
      <div className="subnav">
        <button
          className={`subnav-item ${medicalView === "overview" ? "active" : ""}`}
          onClick={() => setMedicalView("overview")}
        >
          Overview
        </button>
        <button
          className={`subnav-item ${medicalView === "injured" ? "active" : ""}`}
          onClick={() => setMedicalView("injured")}
        >
          Injured List
        </button>
        <button
          className={`subnav-item ${medicalView === "history" ? "active" : ""}`}
          onClick={() => setMedicalView("history")}
        >
          Injury History
        </button>
        <button
          className={`subnav-item ${medicalView === "facilities" ? "active" : ""}`}
          onClick={() => setMedicalView("facilities")}
        >
          Facilities
        </button>
        <button
          className={`subnav-item ${medicalView === "staff" ? "active" : ""}`}
          onClick={() => setMedicalView("staff")}
        >
          Staff
        </button>
        <button
          className={`subnav-item ${medicalView === "prevention" ? "active" : ""}`}
          onClick={() => setMedicalView("prevention")}
        >
          Prevention
        </button>
      </div>
      {medicalView === "overview" && renderMedicalOverview()}
      {medicalView === "injured" && renderMedicalInjuredList()}
      {medicalView === "history" && renderMedicalHistory()}
      {medicalView === "facilities" && renderMedicalFacilities()}
      {medicalView === "staff" && renderMedicalStaff()}
      {medicalView === "prevention" && renderPreventionCenter()}
    </>
  );
}

