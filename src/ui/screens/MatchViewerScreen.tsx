import { useEffect, useRef, useState } from "react";

import { getPlayer, type GameWorld } from "@/domain/world";
import { getUserTeam } from "@/engine/calendar";
import { createEntityRef } from "@/app/entityActions/EntityRef";
import { useEntityActions } from "@/ui/entityActions/useEntityActions";
import { useGameStore } from "@/stores/gameStore";
import type { Player } from "@/domain/player";
import {
  calculateMatchPlayerStats,
  calculateTeamMatchStats,
  type ManualSubstitution,
  type MatchEvent,
  type MatchSimulation,
  type MatchTacticalPlan,
  type PlayerMatchStats,
  type TacticalLevel,
} from "@/engine/match";
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from "@/stores/matchViewerStore";
import {
  formatClock,
  formatMatchEvent,
  formatPeriod,
  resolveActiveMatchLineups,
  resolveMatchFatigue,
} from "../matchViewer";
import { ManualSubstitutionsPanel } from "./ManualSubstitutionsPanel";
import { MatchCourt } from "../match/MatchCourt";
import {
  createPresentationSegment,
  displayClockAtProgress,
  presentationDurationMs,
  visualDetailForSpeed,
  type MatchPresentationSegment,
} from "../match/MatchPresentationSegment";

interface MatchViewerScreenProps {
  readonly world: GameWorld;
  readonly simulation: MatchSimulation;
  readonly homeTeamName: string;
  readonly awayTeamName: string;
  readonly currentEventIndex: number;
  readonly isPlaying: boolean;
  readonly speed: PlaybackSpeed;
  readonly resultApplied: boolean;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onSpeedChange: (speed: PlaybackSpeed) => void;
  readonly onRevealNext: () => void;
  readonly onRequestPresentationSegment: () => ReturnType<
    typeof createPresentationSegment
  >;
  readonly onCompletePresentationSegment: (simulation: MatchSimulation) => void;
  readonly onSkipToEnd: () => void;
  readonly onApplyResult: () => void;
  readonly onContinue: () => void;
  readonly coachingPlan: MatchTacticalPlan;
  readonly onApplyCoaching: (plan: MatchTacticalPlan) => void;
  readonly coachingPlayers: readonly Player[];
  readonly coachingTeamId: MatchSimulation["homeTeamId"];
  readonly onApplyManualSubstitutions: (
    substitutions: readonly ManualSubstitution[],
  ) => void;
}

export function MatchViewerScreen(props: MatchViewerScreenProps) {
  const workspaceRef = useRef<HTMLElement>(null);
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [substitutionsOpen, setSubstitutionsOpen] = useState(false);
  const [playByPlayOpen, setPlayByPlayOpen] = useState(false);
  const [pendingSubstitution, setPendingSubstitution] =
    useState<ManualSubstitution | null>(null);
  const [draft, setDraft] = useState(props.coachingPlan);
  const [segment, setSegment] = useState<MatchPresentationSegment | null>(null);
  const [presentationProgress, setPresentationProgress] = useState(0);
  const requestingSegmentRef = useRef(false);
  const revealedEvents = props.simulation.events.slice(
    0,
    props.currentEventIndex,
  );
  const lastEvent = revealedEvents.at(-1);
  const isFinished = isMatchComplete(revealedEvents);
  const homeScore = lastEvent?.homeScore ?? 0;
  const awayScore = lastEvent?.awayScore ?? 0;
  const period = lastEvent?.period ?? 1;
  const clock =
    segment === null
      ? (lastEvent?.clockSecondsRemaining ?? 600)
      : displayClockAtProgress(segment, presentationProgress);
  const playerStats = calculateMatchPlayerStats(
    props.simulation,
    revealedEvents,
  );
  const activeLineups = resolveActiveMatchLineups(
    props.simulation,
    revealedEvents,
  );
  const fatigueByPlayerId = resolveMatchFatigue(
    props.world,
    props.simulation,
    revealedEvents,
  );
  const coachingActiveLineup =
    props.coachingTeamId === props.simulation.homeTeamId
      ? activeLineups.home
      : activeLineups.away;
  const homeStats = playerStats.filter((stat) =>
    props.simulation.squads.home.includes(stat.playerId),
  );
  const awayStats = playerStats.filter((stat) =>
    props.simulation.squads.away.includes(stat.playerId),
  );

  useEffect(() => {
    if (
      !props.isPlaying ||
      isFinished ||
      segment !== null ||
      requestingSegmentRef.current
    )
      return;
    requestingSegmentRef.current = true;
    setPresentationProgress(0);
    setSegment(props.onRequestPresentationSegment());
  }, [
    isFinished,
    props.isPlaying,
    props.onRequestPresentationSegment,
    segment,
  ]);
  useEffect(() => {
    if (!props.isPlaying || segment === null) return;
    if (segment.gameSeconds === 0) {
      props.onCompletePresentationSegment(segment.endSimulation);
      requestingSegmentRef.current = false;
      setSegment(null);
      return;
    }
    const duration = presentationDurationMs(segment.gameSeconds, props.speed);
    const startedAt = performance.now() - presentationProgress * duration;
    let frameId = 0;
    const frame = (now: number) => {
      const nextProgress = Math.min(1, (now - startedAt) / duration);
      setPresentationProgress(nextProgress);
      if (nextProgress === 1) {
        props.onCompletePresentationSegment(segment.endSimulation);
        requestingSegmentRef.current = false;
        setSegment(null);
        return;
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [
    presentationProgress,
    props.isPlaying,
    props.onCompletePresentationSegment,
    props.speed,
    segment,
  ]);
  useEffect(() => {
    if (isFinished && !props.resultApplied) props.onApplyResult();
  }, [isFinished, props.resultApplied, props.onApplyResult]);
  useEffect(() => {
    if (pendingSubstitution === null || segment !== null) return;
    props.onApplyManualSubstitutions([pendingSubstitution]);
    setPendingSubstitution(null);
  }, [pendingSubstitution, props.onApplyManualSubstitutions, segment]);
  useEffect(() => {
    workspaceRef.current?.focus();
  }, []);

  const scrollToSection = (sectionId: string) => {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(sectionId)
      ?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
  };
  const openCoaching = () => {
    props.onPause();
    setSubstitutionsOpen(false);
    setDraft(props.coachingPlan);
    setCoachingOpen(true);
    requestAnimationFrame(() => scrollToSection("match-coaching"));
  };
  const openSubstitutions = () => {
    props.onPause();
    setCoachingOpen(false);
    setSubstitutionsOpen(true);
    requestAnimationFrame(() => scrollToSection("match-substitutions"));
  };

  return (
    <main
      className={playByPlayOpen ? "match-viewer match-viewer--play-by-play" : "match-viewer"}
      data-testid="match-viewer-workspace"
      ref={workspaceRef}
      tabIndex={-1}
    >
      <header className="match-viewer__header" data-testid="sticky-scoreboard">
        <div className="viewer-header">
          <span>BDM MATCH CENTRE</span>
          <span>{isFinished ? "FINAL" : formatPeriod(period)}</span>
        </div>
        <section className="scoreboard">
          <div className="scoreboard__team scoreboard__team--home">
            <TeamMark name={props.homeTeamName} />
            <strong>{props.homeTeamName}</strong>
          </div>
          <div className="scoreboard__score">
            <b>
              {homeScore} - {awayScore}
            </b>
            <span>
              {isFinished
                ? "FINAL"
                : `${formatPeriod(period)} · ${formatClock(clock)}`}
            </span>
          </div>
          <div className="scoreboard__team scoreboard__team--away">
            <strong>{props.awayTeamName}</strong>
            <TeamMark name={props.awayTeamName} />
          </div>
        </section>
      </header>
      <div
        className="match-viewer__content"
        data-testid="match-viewer-scroll-container"
      >
        <section className="match-viewer__section" id="match-court">
          <MatchCourt
            world={props.world}
            gameId={props.simulation.gameId}
            homeTeamId={props.simulation.homeTeamId}
            awayTeamId={props.simulation.awayTeamId}
            lineups={segment?.startLineups ?? activeLineups}
            attackingTeamId={
              segment?.attackingTeamId ?? props.simulation.homeTeamId
            }
            period={segment?.period ?? period}
            events={segment?.events ?? []}
            progress={presentationProgress}
            detail={visualDetailForSpeed(props.speed)}
          />
        </section>
        <section className="boxscore match-viewer__section" id="match-stats">
          <AdvancedStatsTable
            title="HOME"
            stats={homeStats}
            world={props.world}
            fatigueByPlayerId={fatigueByPlayerId}
            activePlayerIds={activeLineups.home}
            canRequestSubstitution={
              props.coachingTeamId === props.simulation.homeTeamId
            }
            onRequestSubstitution={setPendingSubstitution}
          />
          <AdvancedStatsTable
            title="AWAY"
            stats={awayStats}
            world={props.world}
            fatigueByPlayerId={fatigueByPlayerId}
            activePlayerIds={activeLineups.away}
            canRequestSubstitution={
              props.coachingTeamId === props.simulation.awayTeamId
            }
            onRequestSubstitution={setPendingSubstitution}
          />
        </section>
        <section
          className="viewer-lower match-viewer__section"
          id="match-play-by-play"
        >
          <div className="event-feed">
            <p className="eyebrow">MATCH EVENTS</p>
            <div className="event-feed__scroll">
              {revealedEvents
                .slice(-10)
                .reverse()
                .map((event) => (
                  <EventLine
                    event={event}
                    key={event.sequence}
                    world={props.world}
                  />
                ))}
              {revealedEvents.length === 0 && (
                <p className="empty-events">Waiting for tip-off...</p>
              )}
            </div>
          </div>
        </section>
        {coachingOpen && (
          <CoachingPanel
            draft={draft}
            onApply={(plan) => {
              props.onApplyCoaching(plan);
              setCoachingOpen(false);
            }}
            onCancel={() => setCoachingOpen(false)}
            onChange={setDraft}
            players={props.coachingPlayers}
          />
        )}
        {substitutionsOpen && (
          <section className="match-viewer__section" id="match-substitutions">
            <ManualSubstitutionsPanel
              activeLineup={coachingActiveLineup}
              squadPlayers={props.coachingPlayers}
              playerStats={playerStats}
              fatigueByPlayerId={fatigueByPlayerId}
              canApply={segment === null}
              onApply={(substitutions) => {
                props.onApplyManualSubstitutions(substitutions);
                setSubstitutionsOpen(false);
              }}
              onCancel={() => setSubstitutionsOpen(false)}
            />
          </section>
        )}
      </div>
      <footer className="match-control-bar" data-testid="match-control-bar">
        {isFinished ? (
          <div className="viewer-controls final-controls">
            <strong>
              FINAL · {props.simulation.finalScore.home} -{" "}
              {props.simulation.finalScore.away}
            </strong>
            <button
              className="primary-button"
              onClick={props.onContinue}
              type="button"
            >
              CONTINUE
            </button>
          </div>
        ) : (
          <div className="viewer-controls">
            <button
              aria-label={props.isPlaying ? "Pause match" : "Resume match"}
              className="secondary-button"
              disabled={substitutionsOpen}
              onClick={props.isPlaying ? props.onPause : props.onResume}
              type="button"
            >
              {props.isPlaying ? "PAUSE" : "RESUME"}
            </button>
            <button
              className="secondary-button"
              disabled={segment !== null}
              onClick={openCoaching}
              type="button"
            >
              COACHING
            </button>
            <button
              className="secondary-button"
              disabled={segment !== null}
              onClick={openSubstitutions}
              type="button"
            >
              SUBSTITUTIONS
            </button>
            <div className="speed-controls">
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  aria-pressed={props.speed === speed}
                  className={props.speed === speed ? "speed active" : "speed"}
                  key={speed}
                  onClick={() => props.onSpeedChange(speed)}
                  type="button"
                >
                  x{speed}
                </button>
              ))}
            </div>
            <button
              className="primary-button"
              disabled={substitutionsOpen}
              onClick={() => {
                setSegment(null);
                props.onSkipToEnd();
              }}
              type="button"
            >
              SKIP TO END
            </button>
            <button
              aria-pressed={playByPlayOpen}
              className="secondary-button"
              onClick={() => setPlayByPlayOpen((open) => !open)}
              type="button"
            >
              {playByPlayOpen ? "COURT" : "PLAY-BY-PLAY"}
            </button>
          </div>
        )}
      </footer>
    </main>
  );
}

export function isMatchComplete(events: readonly MatchEvent[]): boolean {
  return events.some((event) => event.type === "gameEnd");
}

function TeamMark({ name }: { readonly name: string }) {
  return (
    <span aria-hidden="true" className="team-mark">
      {name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3)}
    </span>
  );
}

function CoachingPanel({
  draft,
  onApply,
  onCancel,
  onChange,
  players,
}: {
  readonly draft: MatchTacticalPlan;
  readonly onApply: (plan: MatchTacticalPlan) => void;
  readonly onCancel: () => void;
  readonly onChange: (plan: MatchTacticalPlan) => void;
  readonly players: readonly Player[];
}) {
  return (
    <section
      className="content-panel match-viewer__section"
      id="match-coaching"
    >
      <p className="eyebrow">LIVE COACHING · CURRENT PLAN</p>
      <label>
        PACE{" "}
        <LevelSelect
          value={draft.pace}
          onChange={(pace) => onChange({ ...draft, pace })}
        />
      </label>
      <label>
        RIM{" "}
        <LevelSelect
          value={draft.shotProfile.rim}
          onChange={(rim) =>
            onChange({ ...draft, shotProfile: { ...draft.shotProfile, rim } })
          }
        />
      </label>
      <label>
        MID{" "}
        <LevelSelect
          value={draft.shotProfile.midRange}
          onChange={(midRange) =>
            onChange({
              ...draft,
              shotProfile: { ...draft.shotProfile, midRange },
            })
          }
        />
      </label>
      <label>
        3PT{" "}
        <LevelSelect
          value={draft.shotProfile.threePoint}
          onChange={(threePoint) =>
            onChange({
              ...draft,
              shotProfile: { ...draft.shotProfile, threePoint },
            })
          }
        />
      </label>
      <label>
        DEFENSE{" "}
        <select
          value={`${draft.defense.interior}/${draft.defense.perimeter}`}
          onChange={(event) => {
            const [interior, perimeter] = event.target.value
              .split("/")
              .map(Number) as [TacticalLevel, TacticalLevel];
            onChange({ ...draft, defense: { interior, perimeter } });
          }}
        >
          <option value="0/0">Balanced</option>
          <option value="2/-1">Protect Paint</option>
          <option value="-1/2">Pressure Perimeter</option>
        </select>
      </label>
      <label>
        FEATURED PLAYER{" "}
        <select
          value={draft.featuredPlayerId ?? ""}
          onChange={(event) =>
            onChange({
              ...draft,
              ...(event.target.value === ""
                ? {}
                : { featuredPlayerId: event.target.value as Player["id"] }),
            })
          }
        >
          <option value="">None</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.firstName} {player.lastName} ·{" "}
              {player.basketball.primaryPosition}
            </option>
          ))}
        </select>
      </label>
      <div className="game-actions">
        <button
          className="primary-button"
          onClick={() => onApply(draft)}
          type="button"
        >
          APPLY CHANGES
        </button>
        <button className="secondary-button" onClick={onCancel} type="button">
          CANCEL
        </button>
      </div>
    </section>
  );
}
function LevelSelect({
  value,
  onChange,
}: {
  readonly value: TacticalLevel;
  readonly onChange: (value: TacticalLevel) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) =>
        onChange(Number(event.target.value) as TacticalLevel)
      }
    >
      {[-2, -1, 0, 1, 2].map((level) => (
        <option key={level} value={level}>
          {level > 0 ? `+${level}` : level}
        </option>
      ))}
    </select>
  );
}
function EventLine({
  event,
  world,
}: {
  readonly event: MatchEvent;
  readonly world: GameWorld;
}) {
  const className =
    event.type === "shotMade" || event.type === "freeThrowMade"
      ? "event-made"
      : event.type === "shotMissed" || event.type === "freeThrowMissed"
        ? "event-missed"
        : event.type === "turnover"
          ? "event-turnover"
          : event.type === "rebound"
            ? "event-rebound"
            : event.type === "foul"
              ? "event-foul"
              : event.type === "gameEnd"
                ? undefined
                : "event-period";
  return (
    <p className={className}>
      <time>
        {event.type === "gameEnd"
          ? "00:00"
          : formatClock(event.clockSecondsRemaining)}
      </time>{" "}
      {formatMatchEvent(event, world)}
    </p>
  );
}
function AdvancedStatsTable({
  title,
  stats,
  world,
  fatigueByPlayerId,
  activePlayerIds,
  canRequestSubstitution,
  onRequestSubstitution,
}: {
  readonly title: string;
  readonly stats: readonly PlayerMatchStats[];
  readonly world: GameWorld;
  readonly fatigueByPlayerId: Readonly<Record<string, number>>;
  readonly activePlayerIds: readonly string[];
  readonly canRequestSubstitution: boolean;
  readonly onRequestSubstitution: (substitution: ManualSubstitution) => void;
}) {
  const totals = calculateTeamMatchStats(
    stats,
    stats.map((stat) => stat.playerId),
  );
  const activeOrder = new Map(
    activePlayerIds.map((playerId, index) => [playerId, index]),
  );
  const orderedStats = [...stats].sort(
    (left, right) =>
      (activeOrder.get(left.playerId) ?? Number.MAX_SAFE_INTEGER) -
      (activeOrder.get(right.playerId) ?? Number.MAX_SAFE_INTEGER),
  );
  return (
    <section className="boxscore-team table-wrap">
      <p className="eyebrow">{title}</p>
      <table>
        <thead>
          <tr>
            <th>PLAYER</th>
            <th>MIN</th>
            <th>CON</th>
            <th>PTS</th>
            <th>2P</th>
            <th>3P</th>
            <th>FT</th>
            <th>OREB</th>
            <th>DREB</th>
            <th>REB</th>
            <th>AST</th>
            <th>STL</th>
            <th>BLK</th>
            <th>TO</th>
            <th>PF</th>
            <th>+/-</th>
          </tr>
        </thead>
        <tbody>
          {orderedStats.map((stat) => (
            <BoxScorePlayerRow
              fatigue={fatigueByPlayerId[stat.playerId] ?? 0}
              isOnCourt={activePlayerIds.includes(stat.playerId)}
              key={stat.playerId}
              canRequestSubstitution={canRequestSubstitution}
              onRequestSubstitution={onRequestSubstitution}
              stat={stat}
              world={world}
            />
          ))}
          <tr className="totals-row">
            <td>TOTAL</td>
            <td />
            <td />
            <td>{totals.points}</td>
            <td>
              {totals.twoPointMade}/{totals.twoPointAttempted}
            </td>
            <td>
              {totals.threePointMade}/{totals.threePointAttempted}
            </td>
            <td>
              {totals.freeThrowsMade}/{totals.freeThrowsAttempted}
            </td>
            <td>{totals.offensiveRebounds}</td>
            <td>{totals.defensiveRebounds}</td>
            <td>{totals.rebounds}</td>
            <td>{totals.assists}</td>
            <td>{totals.steals}</td>
            <td>{totals.blocks}</td>
            <td>{totals.turnovers}</td>
            <td>{totals.foulsCommitted}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function BoxScorePlayerRow({ canRequestSubstitution, fatigue, isOnCourt, onRequestSubstitution, stat, world }: { readonly canRequestSubstitution: boolean; readonly fatigue: number; readonly isOnCourt: boolean; readonly onRequestSubstitution: (substitution: ManualSubstitution) => void; readonly stat: PlayerMatchStats; readonly world: GameWorld }) {
  const player = getPlayer(world, stat.playerId)
  const activeMatchSession = useGameStore((state) => state.getActiveMatchSession())
  const target = useEntityActions(createEntityRef('player', stat.playerId), { world, controlledTeamId: getUserTeam(world)?.id, activeMatchSession: activeMatchSession ?? undefined })
  const canDrag = canRequestSubstitution && !isOnCourt;
  const canReceiveDrop = canRequestSubstitution && isOnCourt;
  return <tr {...target} className={`${isOnCourt ? "boxscore-player--active" : ""}${canDrag ? " boxscore-player--draggable" : ""}${canReceiveDrop ? " boxscore-player--drop-target" : ""}`} draggable={canDrag} onDragOver={canReceiveDrop ? (event) => event.preventDefault() : undefined} onDragStart={canDrag ? (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", stat.playerId); } : undefined} onDrop={canReceiveDrop ? (event) => { event.preventDefault(); const playerInId = event.dataTransfer.getData("text/plain"); if (playerInId !== "" && playerInId !== stat.playerId) onRequestSubstitution({ playerOutId: stat.playerId, playerInId: playerInId as Player["id"] }); } : undefined}><td>{player.lastName}</td><td>{formatMinutes(stat.secondsPlayed)}</td><td>{formatCondition(fatigue)}</td><td>{stat.points}</td><td>{stat.twoPointMade}/{stat.twoPointAttempted}</td><td>{stat.threePointMade}/{stat.threePointAttempted}</td><td>{stat.freeThrowsMade}/{stat.freeThrowsAttempted}</td><td>{stat.offensiveRebounds}</td><td>{stat.defensiveRebounds}</td><td>{stat.rebounds}</td><td>{stat.assists}</td><td>{stat.steals}</td><td>{stat.blocks}</td><td>{stat.turnovers}</td><td>{stat.foulsCommitted}</td><td>{formatPlusMinus(stat.plusMinus)}</td></tr>
}
function formatMinutes(secondsPlayed: number): string {
  return `${Math.floor(secondsPlayed / 60)
    .toString()
    .padStart(2, "0")}:${(secondsPlayed % 60).toString().padStart(2, "0")}`;
}
function formatCondition(fatigue: number): string {
  return `${Math.round(100 - Math.min(100, Math.max(0, fatigue)))}%`;
}
function formatPlusMinus(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
