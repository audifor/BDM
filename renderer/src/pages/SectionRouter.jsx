import React from "react";
import PlantillaPage from "./PlantillaPage";
import EntrenamientoPage from "./EntrenamientoPage";
import TacticasPage from "./TacticasPage";
import CompeticionPage from "./CompeticionPage";
import ClubPage from "./ClubPage";
import MedicalPage from "./MedicalPage";
import MercadoPage from "./MercadoPage";

export default function SectionRouter({
  section,
  myTeamId,
  myTeam,
  currentDate,
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
  renderMatchSim,
  competitionView,
  setCompetitionView,
  renderCalendar,
  renderJornadas,
  renderStandings,
  clubView,
  setClubView,
  gmState,
  gmEvents,
  analyticsSnapshot,
  renderClubProfile,
  renderStaff,
  renderDirectiva,
  renderClubEconomy,
  onUpgradeFacility,
  onAssignStaff,
  onAssignPlayerToCoach,
  onHireStaff,
  onNegotiateObjectives,
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
  marketSelectedNegotiationId,
  marketOfferPlayer,
  marketOfferInitial,
  marketOfferScholarshipMode,
  contractCatalog,
  onReloadContractCatalog,
  onSubmitOffer,
  onBackFromOffer,
  onEditOffer,
  renderScouting,
  renderAgencias,
  renderAgentes,
  // Market handlers
  onAddToShortlist,
  onRemoveFromShortlist,
  onUpdateShortlist,
  onMakeOffer,
  onImproveOffer,
  onWithdrawOffer,
  onAcceptOffer,
  onRejectOffer,
  onAssignScout,
  onContactAgency,
  // Data
  allPlayers,
  allAgencies,
  onPlayerClick,
  // Competition data
  upcomingFixtures,
  cupBrackets,
  leagueId,
  allTeams,
  onTeamClick,
  onSimulateMatch,
}) {
  if (!myTeamId) return renderStart();

  if (section === "Hub") {
    return renderHub();
  }

  if (section === "Scouting") {
    return renderScouting();
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
        renderMatchSim={renderMatchSim}
      />
    );
  }

  if (section === "Competicion") {
    return (
      <CompeticionPage
        renderStart={renderStart}
        competitionView={competitionView}
        setCompetitionView={setCompetitionView}
        renderCalendar={renderCalendar}
        renderJornadas={renderJornadas}
        renderStandings={renderStandings}
        upcomingFixtures={upcomingFixtures}
        myTeamId={myTeamId}
        allTeams={allTeams}
        allPlayers={allPlayers}
        cupBrackets={cupBrackets}
        leagueId={leagueId}
        onTeamClick={onTeamClick}
        onPlayerClick={onPlayerClick}
        onSimulateMatch={onSimulateMatch}
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
        gmState={gmState}
        gmEvents={gmEvents}
        analyticsSnapshot={analyticsSnapshot}
        onUpgradeFacility={onUpgradeFacility}
        onAssignStaff={onAssignStaff}
        onAssignPlayerToCoach={onAssignPlayerToCoach}
        onHireStaff={onHireStaff}
        onNegotiateObjectives={onNegotiateObjectives}
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
        selectedNegotiationId={marketSelectedNegotiationId}
        currentDate={currentDate}
        offerPlayer={marketOfferPlayer}
        offerInitial={marketOfferInitial}
        offerScholarshipMode={marketOfferScholarshipMode}
        contractCatalog={contractCatalog}
        onReloadContractCatalog={onReloadContractCatalog}
        onSubmitOffer={onSubmitOffer}
        onBackFromOffer={onBackFromOffer}
        onEditOffer={onEditOffer}
        myTeam={myTeam}
        myTeamId={myTeamId}
        allPlayers={allPlayers}
        allAgencies={allAgencies}
        onAddToShortlist={onAddToShortlist}
        onRemoveFromShortlist={onRemoveFromShortlist}
        onUpdateShortlist={onUpdateShortlist}
        onMakeOffer={onMakeOffer}
        onImproveOffer={onImproveOffer}
        onWithdrawOffer={onWithdrawOffer}
        onAcceptOffer={onAcceptOffer}
        onRejectOffer={onRejectOffer}
        onAssignScout={onAssignScout}
        onContactAgency={onContactAgency}
        onPlayerClick={onPlayerClick}
      />
    );
  }

  return renderHub();
}
