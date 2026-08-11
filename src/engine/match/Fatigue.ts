import type { PlayerId, TeamId } from '@/domain/ids'

import { calculateActiveLineups, type MatchEvent, type MatchLineups, type MatchSquads, type TeamStrength } from './MatchEngine'

export const FATIGUE_GAIN_PER_SECOND = 0.04
export const FATIGUE_RECOVERY_PER_SECOND = 0.025
export const MAX_FATIGUE = 100
export const MAX_FATIGUE_STRENGTH_PENALTY = 0.20

export type FatigueByPlayerId = Readonly<Record<PlayerId, number>>

export function createInitialFatigue(squads: MatchSquads): FatigueByPlayerId {
  return Object.fromEntries([...squads.home, ...squads.away].map((playerId) => [playerId, 0])) as FatigueByPlayerId
}

/** Advances live fatigue for one elapsed game-clock interval. */
export function advanceFatigue(
  fatigueByPlayerId: FatigueByPlayerId,
  squads: MatchSquads,
  activeLineups: MatchLineups,
  elapsedSeconds: number,
): FatigueByPlayerId {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Fatigue elapsed seconds must be a finite non-negative number')
  const active = new Set([...activeLineups.home, ...activeLineups.away])
  const next: Record<PlayerId, number> = { ...fatigueByPlayerId }
  for (const playerId of [...squads.home, ...squads.away]) {
    const current = clampFatigue(next[playerId] ?? 0)
    const delta = active.has(playerId) ? elapsedSeconds * FATIGUE_GAIN_PER_SECOND : -elapsedSeconds * FATIGUE_RECOVERY_PER_SECOND
    next[playerId] = clampFatigue(current + delta)
  }
  return next
}

export function calculateFatigueAdjustedTeamStrength(
  baseStrength: TeamStrength,
  activeLineup: readonly PlayerId[],
  fatigueByPlayerId: FatigueByPlayerId,
): TeamStrength {
  const averageFatigue = activeLineup.length === 0 ? 0 : activeLineup.reduce((sum, playerId) => sum + clampFatigue(fatigueByPlayerId[playerId] ?? 0), 0) / activeLineup.length
  const penalty = (averageFatigue / MAX_FATIGUE) * MAX_FATIGUE_STRENGTH_PENALTY
  return { teamId: baseStrength.teamId, value: clampStrength(baseStrength.value * (1 - penalty)) }
}

/** Reconstructs live fatigue from the revealed event timeline without exposing future events. */
export function calculateFatigueAtEvents(
  initialLineups: MatchLineups,
  squads: MatchSquads,
  homeTeamId: TeamId,
  awayTeamId: TeamId,
  events: readonly MatchEvent[],
): FatigueByPlayerId {
  let fatigue = createInitialFatigue(squads)
  let activeLineups = initialLineups
  let currentPeriod: number | undefined
  let previousClock: number | undefined
  for (const event of events) {
    if (event.clockSecondsRemaining < 0) throw new Error('Match event clock cannot be negative')
    if (currentPeriod !== undefined && event.period < currentPeriod) throw new Error('Match event period cannot move backwards')
    if (event.type === 'periodStart') {
      if (currentPeriod !== undefined && event.period <= currentPeriod) throw new Error('Match event period must advance chronologically')
      currentPeriod = event.period
      previousClock = event.clockSecondsRemaining
      continue
    }
    if (currentPeriod !== undefined && event.period > currentPeriod) throw new Error('Match event period must start explicitly')
    if (currentPeriod === undefined) currentPeriod = event.period
    if (previousClock !== undefined && event.clockSecondsRemaining > previousClock) throw new Error('Match event clock cannot increase within a period')
    const elapsed = previousClock === undefined ? 0 : previousClock - event.clockSecondsRemaining
    fatigue = advanceFatigue(fatigue, squads, activeLineups, elapsed)
    previousClock = event.clockSecondsRemaining
    if (event.type === 'substitution') activeLineups = calculateActiveLineups(activeLineups, homeTeamId, awayTeamId, [event])
  }
  return fatigue
}

export function clampFatigue(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Fatigue must be finite')
  return Math.min(MAX_FATIGUE, Math.max(0, value))
}

function clampStrength(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Effective TeamStrength must be finite')
  return Math.min(100, Math.max(0, value))
}
