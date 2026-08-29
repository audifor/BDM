import React from "react";
import LiveScore from "./LiveScore";
import MatchControls from "./MatchControls";
import PlayByPlay from "./PlayByPlay";
import BoxScore from "./BoxScore";
import CourtCanvas from "./CourtCanvas";
import SubstitutionModal from "./SubstitutionModal";

export function MatchViewer({
  homeName,
  awayName,
  scoreHome,
  scoreAway,
  periodLabel,
  timeLabel,
  shotClockLabel,
  homeTimeoutsLeft,
  awayTimeoutsLeft,
  homeTeamFouls,
  awayTeamFouls,
  ruleset,
  inProgress,
  actions,
  homeStats,
  awayStats,
  lastEvent,
  speed,
  onPlayPause,
  onSpeedChange,
  onSimQuarter,
  onSimMatch,
  onTimeout,
  timeoutOptions,
  timeoutKind,
  onTimeoutKindChange,
  onShout,
  onShoutChange,
  shoutOptions,
  selectedShout,
  defenseOptions,
  defenseType,
  onDefenseTypeChange,
  pnrDefenseOptions,
  pnrDefense,
  onPnrDefenseChange,
  paceOptions,
  pace,
  onPaceChange,
  focusOptions,
  focus,
  onFocusChange,
  spacingOptions,
  spacing,
  onSpacingChange,
  riskOptions,
  passingRisk,
  onPassingRiskChange,
  aggression,
  onAggressionChange,
  offRebound,
  onOffReboundChange,
  threePoint,
  onThreePointChange,
  pnrFrequency,
  onPnrFrequencyChange,
  freedomOptions,
  freedom,
  onFreedomChange,
  transitionOptions,
  transition,
  onTransitionChange,
  onApplyTactics,
  playbooks,
  selectedPlaybookId,
  onPlaybookChange,
  onSubstitute,
  actionTeam,
  onActionTeamChange,
  substitutionOpen,
  substitutionTeamName,
  substitutionLineup,
  substitutionBench,
  onSubstitutionConfirm,
  onSubstitutionClose,
  courtHome,
  courtAway,
  tickBuffer,
}) {
  return (
    <div className="match-viewer-cyber">
      <div className="match-top">
        <LiveScore
          homeName={homeName}
          awayName={awayName}
          homeScore={scoreHome}
          awayScore={scoreAway}
          periodLabel={periodLabel}
          timeLabel={timeLabel}
          shotClockLabel={shotClockLabel}
          homeTimeoutsLeft={homeTimeoutsLeft}
          awayTimeoutsLeft={awayTimeoutsLeft}
          homeTeamFouls={homeTeamFouls}
          awayTeamFouls={awayTeamFouls}
          ruleset={ruleset}
          inProgress={inProgress}
        />
        <MatchControls
          isPlaying={inProgress}
          speed={speed}
          onPlayPause={onPlayPause}
          onSpeedChange={onSpeedChange}
          onSimQuarter={onSimQuarter}
          onSimMatch={onSimMatch}
          onTimeout={onTimeout}
          timeoutOptions={timeoutOptions}
          timeoutKind={timeoutKind}
          onTimeoutKindChange={onTimeoutKindChange}
          onShout={onShout}
          onShoutChange={onShoutChange}
          shoutOptions={shoutOptions}
          selectedShout={selectedShout}
          defenseOptions={defenseOptions}
          defenseType={defenseType}
          onDefenseTypeChange={onDefenseTypeChange}
          pnrDefenseOptions={pnrDefenseOptions}
          pnrDefense={pnrDefense}
          onPnrDefenseChange={onPnrDefenseChange}
          paceOptions={paceOptions}
          pace={pace}
          onPaceChange={onPaceChange}
          focusOptions={focusOptions}
          focus={focus}
          onFocusChange={onFocusChange}
          spacingOptions={spacingOptions}
          spacing={spacing}
          onSpacingChange={onSpacingChange}
          riskOptions={riskOptions}
          passingRisk={passingRisk}
          onPassingRiskChange={onPassingRiskChange}
          aggression={aggression}
          onAggressionChange={onAggressionChange}
          offRebound={offRebound}
          onOffReboundChange={onOffReboundChange}
          threePoint={threePoint}
          onThreePointChange={onThreePointChange}
          pnrFrequency={pnrFrequency}
          onPnrFrequencyChange={onPnrFrequencyChange}
          freedomOptions={freedomOptions}
          freedom={freedom}
          onFreedomChange={onFreedomChange}
          transitionOptions={transitionOptions}
          transition={transition}
          onTransitionChange={onTransitionChange}
          onApplyTactics={onApplyTactics}
          playbooks={playbooks}
          selectedPlaybookId={selectedPlaybookId}
          onPlaybookChange={onPlaybookChange}
          onSubstitute={onSubstitute}
          actionTeam={actionTeam}
          onActionTeamChange={onActionTeamChange}
        />
      </div>

      <div className="match-main">
        <div className="match-left">
          <PlayByPlay actions={actions} />
        </div>
        <div className="match-center">
          <CourtCanvas
            homePlayers={courtHome}
            awayPlayers={courtAway}
            tickBuffer={tickBuffer}
            possessionTeam={lastEvent?.team}
            lastEvent={lastEvent}
          />
        </div>
        <div className="match-right">
          <BoxScore
            homeTeamName={homeName}
            awayTeamName={awayName}
            homeStats={homeStats}
            awayStats={awayStats}
          />
        </div>
      </div>

      <SubstitutionModal
        open={substitutionOpen}
        teamName={substitutionTeamName}
        lineup={substitutionLineup}
        bench={substitutionBench}
        onConfirm={onSubstitutionConfirm}
        onClose={onSubstitutionClose}
      />
    </div>
  );
}

export default MatchViewer;
