import React, { useMemo } from "react";
import DraggableSubnav from "../components/DraggableSubnav";
import MarketPlayerSearch from "../components/market/MarketPlayerSearch";
import MarketShortlist from "../components/market/MarketShortlist";
import MarketNegotiations from "../components/market/MarketNegotiations";
import MarketAgencies from "../components/market/MarketAgencies";
import MarketIntelligence from "../components/market/MarketIntelligence";
import MarketHistory from "../components/market/MarketHistory";
import MarketOffer from "../components/market/MarketOffer";

export default function MercadoPage({
  marketView,
  setMarketView,
  selectedNegotiationId,
  currentDate,
  offerPlayer,
  offerInitial,
  offerScholarshipMode,
  contractCatalog,
  onReloadContractCatalog,
  onSubmitOffer,
  onBackFromOffer,
  onEditOffer,
  myTeam,
  myTeamId,
  allPlayers,
  allAgencies,
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
  onPlayerClick,
}) {
  const items = useMemo(
    () => [
      { id: "search", label: "Búsqueda", active: marketView === "search", onClick: () => setMarketView("search") },
      { id: "shortlist", label: "Objetivos", active: marketView === "shortlist", onClick: () => setMarketView("shortlist") },
      { id: "negotiations", label: "Negociaciones", active: marketView === "negotiations", onClick: () => setMarketView("negotiations") },
      { id: "agencies", label: "Agencias", active: marketView === "agencies", onClick: () => setMarketView("agencies") },
      { id: "intelligence", label: "Análisis", active: marketView === "intelligence", onClick: () => setMarketView("intelligence") },
      { id: "history", label: "Historial", active: marketView === "history", onClick: () => setMarketView("history") },
      { id: "offer", label: "Oferta", active: marketView === "offer", onClick: () => setMarketView("offer") },
    ],
    [marketView, setMarketView],
  );

  // Extract data from myTeam
  const teamData = myTeam?.data || {};
  const shortlist = teamData.shortlist || [];
  const activeNegotiations = teamData.active_negotiations || [];
  const agencyRelationships = teamData.agency_relationships || {};
  const transferHistory = teamData.transfer_history || [];
  const marketTrends = teamData.market_trends || {};

  return (
    <>
      <DraggableSubnav storageKey="pcbasket.subnav.market" items={items} />

      {marketView === "search" && (
        <MarketPlayerSearch
          allPlayers={allPlayers}
          myTeamId={myTeamId}
          shortlist={shortlist}
          onAddToShortlist={onAddToShortlist}
          onRemoveFromShortlist={onRemoveFromShortlist}
          onMakeOffer={onMakeOffer}
          onAssignScout={onAssignScout}
          onPlayerClick={onPlayerClick}
        />
      )}

      {marketView === "shortlist" && (
        <MarketShortlist
          shortlist={shortlist}
          allPlayers={allPlayers}
          myTeamId={myTeamId}
          onRemoveFromShortlist={onRemoveFromShortlist}
          onUpdateShortlist={onUpdateShortlist}
          onMakeOffer={onMakeOffer}
          onAssignScout={onAssignScout}
          onPlayerClick={onPlayerClick}
        />
      )}

      {marketView === "negotiations" && (
        <MarketNegotiations
          activeNegotiations={activeNegotiations}
          allPlayers={allPlayers}
          myTeamId={myTeamId}
          currentDate={currentDate}
          selectedNegotiationId={selectedNegotiationId}
          onImproveOffer={onImproveOffer}
          onWithdrawOffer={onWithdrawOffer}
          onAcceptOffer={onAcceptOffer}
          onRejectOffer={onRejectOffer}
          onEditOffer={onEditOffer}
          onPlayerClick={onPlayerClick}
        />
      )}

      {marketView === "agencies" && (
        <MarketAgencies
          agencies={allAgencies}
          agencyRelationships={agencyRelationships}
          allPlayers={allPlayers}
          myTeamId={myTeamId}
          onContactAgency={onContactAgency}
          onPlayerClick={onPlayerClick}
        />
      )}

      {marketView === "intelligence" && (
        <MarketIntelligence
          allPlayers={allPlayers}
          marketTrends={marketTrends}
          myTeam={myTeam}
          onPlayerClick={onPlayerClick}
        />
      )}

      {marketView === "history" && (
        <MarketHistory
          transferHistory={transferHistory}
          allPlayers={allPlayers}
          currentSeason={2024}
          onPlayerClick={onPlayerClick}
        />
      )}

      {marketView === "offer" && (
        <MarketOffer
          player={offerPlayer}
          myTeam={myTeam}
          leagueId={myTeam?.data?.league_id || myTeam?.data?.league || ""}
          contractCatalog={contractCatalog}
          initialOffer={offerInitial}
          scholarshipMode={offerScholarshipMode}
          onBack={onBackFromOffer}
          onSubmit={onSubmitOffer}
          onReloadCatalog={onReloadContractCatalog}
        />
      )}
    </>
  );
}
