import React from "react";

export default function ClubPage({
  myTeam,
  renderStart,
  clubView,
  setClubView,
  renderClubProfile,
  renderStaff,
  renderDirectiva,
  renderClubEconomy,
}) {
  if (!myTeam) return renderStart();

  return (
    <>
      <div className="subnav club-subnav">
        <button
          className={`subnav-item ${clubView === "vision" ? "active" : ""}`}
          onClick={() => setClubView("vision")}
        >
          Visión general
        </button>
        <button
          className={`subnav-item ${clubView === "staff" ? "active" : ""}`}
          onClick={() => setClubView("staff")}
        >
          Staff
        </button>
        <button
          className={`subnav-item ${clubView === "directiva" ? "active" : ""}`}
          onClick={() => setClubView("directiva")}
        >
          Directiva
        </button>
        <button
          className={`subnav-item ${clubView === "economia" ? "active" : ""}`}
          onClick={() => setClubView("economia")}
        >
          Economía
        </button>
      </div>
      {clubView === "vision" && renderClubProfile()}
      {clubView === "staff" && renderStaff()}
      {clubView === "directiva" && renderDirectiva()}
      {clubView === "economia" && renderClubEconomy()}
    </>
  );
}

