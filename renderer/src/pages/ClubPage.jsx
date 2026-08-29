import React, { useMemo } from "react";
import DraggableSubnav from "../components/DraggableSubnav";
import ClubDashboard from "../components/club/ClubDashboard";
import ClubFacilities from "../components/club/ClubFacilities";
import ClubStaffAssignments from "../components/club/ClubStaffAssignments";
import ClubBoard from "../components/club/ClubBoard";
import ClubFinances from "../components/club/ClubFinances";
import ClubHistory from "../components/club/ClubHistory";
import ClubAnalytics from "../components/club/ClubAnalytics";

export default function ClubPage({
  myTeam,
  renderStart,
  clubView,
  setClubView,
  gmState,
  gmEvents,
  analyticsSnapshot,
  // New handlers for new components
  onUpgradeFacility,
  onAssignStaff,
  onAssignPlayerToCoach,
  onHireStaff,
  onNegotiateObjectives,
}) {
  if (!myTeam) return renderStart();

  const items = useMemo(
    () => [
      { id: "dashboard", label: "Visión General", active: clubView === "dashboard", onClick: () => setClubView("dashboard") },
      { id: "facilities", label: "Instalaciones", active: clubView === "facilities", onClick: () => setClubView("facilities") },
      { id: "staff", label: "Staff & Roles", active: clubView === "staff", onClick: () => setClubView("staff") },
      { id: "board", label: "Junta Directiva", active: clubView === "board", onClick: () => setClubView("board") },
      { id: "finances", label: "Finanzas", active: clubView === "finances", onClick: () => setClubView("finances") },
      { id: "analytics", label: "Analitica", active: clubView === "analytics", onClick: () => setClubView("analytics") },
      { id: "history", label: "Historia", active: clubView === "history", onClick: () => setClubView("history") },
    ],
    [clubView, setClubView],
  );

  // Extract real data from myTeam.data (backend JSON)
  const teamData = myTeam.data || {};
  const gmSnapshot = gmState || {};

  // Facilities data
  const facilities = teamData.facilities || {};
  const budget = teamData.budget || 1000000;
  const teamLevel = teamData.level || 1;

  // Staff data
  const staffMembers = myTeam.staff || [];
  const staffAssignments = teamData.staff_assignments || {};

  // Players data
  const players = myTeam.players || [];

  // Board & Objectives data
  const objectives = gmSnapshot.objectives || teamData.objectives || {};
  const metrics = {
    league_position: teamData.league_position || 0,
    cup_round: teamData.cup_round || 0,
    youth_promoted: teamData.youth_promoted || 0,
    year_balance: teamData.year_balance || 0,
    payroll_percentage: teamData.payroll_percentage || 0,
    attendance_percentage: teamData.attendance_percentage || 0,
  };
  const confidence = gmSnapshot.board_confidence ?? teamData.board_confidence ?? 70;
  const reputation = gmSnapshot.reputation ?? teamData.reputation ?? 0;
  const jobSecurity = gmSnapshot.job_security ?? teamData.job_security ?? 70;
  const season = teamData.season || 1;

  // Financial data
  const balance = teamData.balance || 500000;
  const transactions = teamData.transactions || [];
  const projectedIncome = teamData.projected_income || {
    ticket_sales: teamData.ticket_income || 200000,
    sponsorships: teamData.sponsors_income || 150000,
    tv_rights: teamData.media_income || 100000,
  };
  const projectedExpenses = teamData.projected_expenses || {
    wages: teamData.wages || 300000,
    facilities: 50000,
    operations: 100000,
  };
  const seasonBudget = teamData.season_budget || budget;
  const fiscalYear = teamData.fiscal_year || 1;

  // History data
  const trophies = teamData.trophies || [];
  const records = teamData.records || {};
  const hallOfFame = teamData.hall_of_fame || [];
  const milestones = teamData.milestones || [];
  const seasonHistory = teamData.season_history || [];
  const clubFounded = teamData.founded || myTeam.founded || 1990;

  return (
    <>
      <DraggableSubnav storageKey="pcbasket.subnav.club" className="subnav club-subnav" items={items} />

      {clubView === "dashboard" && (
        <ClubDashboard
          teamName={myTeam.name}
          teamDivision={myTeam.division}
          leaguePosition={metrics.league_position}
          nextOpponent={teamData.next_opponent || ""}
          balance={balance}
          objectives={objectives}
          topPlayers={players.slice(0, 6)}
          upcomingMatches={teamData.upcoming_matches || []}
          reputation={reputation}
          boardConfidence={confidence}
          jobSecurity={jobSecurity}
          alerts={gmEvents || []}
        />
      )}

      {clubView === "facilities" && (
        <ClubFacilities
          teamFacilities={facilities}
          teamBudget={budget}
          teamLevel={teamLevel}
          onUpgradeFacility={onUpgradeFacility}
        />
      )}

      {clubView === "staff" && (
        <ClubStaffAssignments
          staffMembers={staffMembers}
          teamPlayers={players}
          assignments={staffAssignments}
          onAssignStaff={onAssignStaff}
          onAssignPlayerToCoach={onAssignPlayerToCoach}
          onHireStaff={onHireStaff}
        />
      )}

      {clubView === "board" && (
        <ClubBoard
          currentObjectives={objectives}
          currentMetrics={metrics}
          confidence={confidence}
          season={season}
          onNegotiateObjectives={onNegotiateObjectives}
        />
      )}

      {clubView === "finances" && (
        <ClubFinances
          currentBalance={balance}
          transactions={transactions}
          projectedIncome={projectedIncome}
          projectedExpenses={projectedExpenses}
          seasonBudget={seasonBudget}
          fiscalYear={fiscalYear}
        />
      )}

      {clubView === "analytics" && (
        <ClubAnalytics
          teamName={myTeam.name}
          analytics={analyticsSnapshot}
        />
      )}

      {clubView === "history" && (
        <ClubHistory
          trophies={trophies}
          records={records}
          hallOfFame={hallOfFame}
          milestones={milestones}
          seasonHistory={seasonHistory}
          clubFounded={clubFounded}
        />
      )}
    </>
  );
}
