import React, { useMemo } from "react";
import DraggableSubnav from "../components/DraggableSubnav";

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

  const items = useMemo(
    () => [
      { id: "overview", label: "Resumen", active: medicalView === "overview", onClick: () => setMedicalView("overview") },
      { id: "injured", label: "Lesionados", active: medicalView === "injured", onClick: () => setMedicalView("injured") },
      { id: "history", label: "Historial", active: medicalView === "history", onClick: () => setMedicalView("history") },
      { id: "facilities", label: "Instalaciones", active: medicalView === "facilities", onClick: () => setMedicalView("facilities") },
      { id: "staff", label: "Staff", active: medicalView === "staff", onClick: () => setMedicalView("staff") },
      { id: "prevention", label: "Prevención", active: medicalView === "prevention", onClick: () => setMedicalView("prevention") },
    ],
    [medicalView, setMedicalView],
  );

  return (
    <>
      <DraggableSubnav storageKey="pcbasket.subnav.medical" items={items} />
      {medicalView === "overview" && renderMedicalOverview()}
      {medicalView === "injured" && renderMedicalInjuredList()}
      {medicalView === "history" && renderMedicalHistory()}
      {medicalView === "facilities" && renderMedicalFacilities()}
      {medicalView === "staff" && renderMedicalStaff()}
      {medicalView === "prevention" && renderPreventionCenter()}
    </>
  );
}
