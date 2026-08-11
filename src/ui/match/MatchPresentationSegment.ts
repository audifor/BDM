import type { LiveMatchStep } from '@/app/game'
import { calculateActiveLineups, type MatchEvent, type MatchLineups, type MatchSimulation } from '@/engine/match'

export interface MatchPresentationSegment {
  readonly period: number
  readonly startClockSeconds: number
  readonly endClockSeconds: number
  readonly gameSeconds: number
  readonly attackingTeamId: LiveMatchStep['attackingTeamId']
  readonly startLineups: MatchLineups
  readonly endLineups: MatchLineups
  readonly events: readonly MatchEvent[]
  readonly startScore: MatchSimulation['finalScore']
  readonly endScore: MatchSimulation['finalScore']
  readonly endSimulation: MatchSimulation
}

/** Presentation-only conversion of one already-resolved sporting step. */
export function createPresentationSegment(step: LiveMatchStep): MatchPresentationSegment {
  const startEvent = step.before.events.at(-1)
  const endEvent = step.after.events.at(-1)
  const period = endEvent?.period ?? startEvent?.period ?? 1
  const startClockSeconds = startEvent?.clockSecondsRemaining ?? 600
  const endClockSeconds = endEvent?.clockSecondsRemaining ?? startClockSeconds
  const events = step.after.events.slice(step.before.events.length)
  const samePeriod = period === (startEvent?.period ?? period)
  return {
    period,
    startClockSeconds,
    endClockSeconds,
    gameSeconds: samePeriod ? Math.max(0, startClockSeconds - endClockSeconds) : 0,
    attackingTeamId: step.attackingTeamId,
    startLineups: calculateActiveLineups(step.before.lineups, step.before.homeTeamId, step.before.awayTeamId, step.before.events),
    endLineups: calculateActiveLineups(step.after.lineups, step.after.homeTeamId, step.after.awayTeamId, step.after.events),
    events,
    startScore: scoreAt(step.before),
    endScore: scoreAt(step.after),
    endSimulation: step.after,
  }
}

export function displayClockAtProgress(segment: MatchPresentationSegment, progress: number): number {
  if (segment.gameSeconds === 0) return segment.endClockSeconds
  const elapsed = segment.gameSeconds * Math.min(1, Math.max(0, progress))
  return Math.max(segment.endClockSeconds, Math.ceil(segment.startClockSeconds - elapsed))
}

export function presentationDurationMs(gameSeconds: number, speed: number): number {
  return gameSeconds * 1000 / speed
}

export function visualDetailForSpeed(speed: number): 'full' | 'compressed' | 'compact' {
  return speed <= 2 ? 'full' : speed === 4 ? 'compressed' : 'compact'
}

function scoreAt(simulation: MatchSimulation): MatchSimulation['finalScore'] {
  const event = simulation.events.at(-1)
  return event === undefined ? { home: 0, away: 0 } : { home: event.homeScore, away: event.awayScore }
}
