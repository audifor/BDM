import React from "react";
import PlantillaPage from "./PlantillaPage";
import EntrenamientoPage from "./EntrenamientoPage";
import TacticasPage from "./TacticasPage";
import ClubPage from "./ClubPage";
import MedicalPage from "./MedicalPage";
import MercadoPage from "./MercadoPage";

export default function SectionRouter({
  section,
  myTeamId,
  myTeam,
  renderStart,
  renderHub,
  renderEquipo,
  trainingView,
  setTrainingView,
  renderTeamTraining,
  renderPersonalTraining,
  renderLoadManagement,
  renderStaffAssignments,
  renderTrainingModule,
  tacticsView,
  setTacticsView,
  renderTacticsBoard,
  renderTacticsCreator,
  renderDefensiveMatchups,
  renderRotationMatrix,
  renderSpecialPlays,
  clubView,
  setClubView,
  renderClubProfile,
  renderStaff,
  renderDirectiva,
  renderClubEconomy,
  medicalView,
  setMedicalView,
  renderMedicalOverview,
  renderMedicalInjuredList,
  renderMedicalHistory,
  renderMedicalFacilities,
  renderMedicalStaff,
  renderPreventionCenter,
  marketView,
  setMarketView,
  renderScouting,
  renderAgencias,
  renderAgentes,
}) {
  if (!myTeamId) return renderStart();

  if (section === "Hub") {
    return renderHub();
  }

  if (section === "Plantilla") {
    return <PlantillaPage myTeam={myTeam} renderStart={renderStart} renderEquipo={renderEquipo} />;
  }

  if (section === "Entrenamiento") {
    return (
      <EntrenamientoPage
        myTeam={myTeam}
        renderStart={renderStart}
        trainingView={trainingView}
        setTrainingView={setTrainingView}
        renderTeamTraining={renderTeamTraining}
        renderPersonalTraining={renderPersonalTraining}
        renderLoadManagement={renderLoadManagement}
        renderStaffAssignments={renderStaffAssignments}
        renderTrainingModule={renderTrainingModule}
      />
    );
  }

  if (section === "Tacticas") {
    return (
      <TacticasPage
        myTeam={myTeam}
        renderStart={renderStart}
        tacticsView={tacticsView}
        setTacticsView={setTacticsView}
        renderTacticsBoard={renderTacticsBoard}
        renderTacticsCreator={renderTacticsCreator}
        renderDefensiveMatchups={renderDefensiveMatchups}
        renderRotationMatrix={renderRotationMatrix}
        renderSpecialPlays={renderSpecialPlays}
      />
    );
  }

  if (section === "Club") {
    return (
      <ClubPage
        myTeam={myTeam}
        renderStart={renderStart}
        clubView={clubView}
        setClubView={setClubView}
        renderClubProfile={renderClubProfile}
        renderStaff={renderStaff}
        renderDirectiva={renderDirectiva}
        renderClubEconomy={renderClubEconomy}
      />
    );
  }

  if (section === "Medical") {
    return (
      <MedicalPage
        myTeam={myTeam}
        renderStart={renderStart}
        medicalView={medicalView}
        setMedicalView={setMedicalView}
        renderMedicalOverview={renderMedicalOverview}
        renderMedicalInjuredList={renderMedicalInjuredList}
        renderMedicalHistory={renderMedicalHistory}
        renderMedicalFacilities={renderMedicalFacilities}
        renderMedicalStaff={renderMedicalStaff}
        renderPreventionCenter={renderPreventionCenter}
      />
    );
  }

  if (section === "Mercado") {
    return (
      <MercadoPage
        marketView={marketView}
        setMarketView={setMarketView}
        renderScouting={renderScouting}
        renderAgencias={renderAgencias}
        renderAgentes={renderAgentes}
      />
    );
  }

  return renderHub();
}
