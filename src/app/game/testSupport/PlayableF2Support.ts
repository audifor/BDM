import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import type { GameDate } from '@/domain/date'
import type { Game } from '@/domain/game'
import type { GameId } from '@/domain/ids'
import type { TeamId } from '@/domain/ids'
import { CANONICAL_RATING_KEYS } from '@/domain/player'
import { getTeamRoster, isPlayerAvailable, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { hashStringToSeed } from '@/engine/random'
import { createInlineMatchRunner } from '@/app/matchNext/MatchSimulationRunner'
import { useGameStore } from '@/stores/gameStore'
import { advanceGameDay } from '../advanceGameDay'
import { evaluateSimulationBreakpoints } from '../SimulationBreakpoints'
import type { InjuryId } from '@/domain/ids'
import { continueGameAsync } from '../ContinueFlow'
import { createConfiguredGameAsync } from '../createConfiguredGame'
import { instantResult } from '../matchResolution'

/**
 * F2 harness. One real ACB 2026/27 career (UCAM Murcia) is cloned into two identical worlds; each is advanced day by day through the
 * production day boundary (`advanceGameDay`) and the user's games through `instantResult`, exactly the commands the Courtside Home
 * buttons run. Every decision of the managed arm is a call to a `gameStore` action (the same ones the Training, Staff, Roster and
 * Tactics screens call), recorded in a decision log. Seeds are a pure function of (salt, game id / date), so both arms draw the same
 * random stream for the same fixture and any difference comes from the state the decisions produced.
 */
export const F2_COACH = {
  firstName: 'Elena', lastName: 'Piloto', dateOfBirth: '1990-01-01', gender: 'female', nationalityCountryCode: 'ESP', background: 'rookie',
  ambition: 'firstTitle', coachingStyle: 'balanced', disposition: 'balanced', biography: 'F2 synthetic test coach.',
} as const

export const F2_WINDOW_DAYS = 30

export type F2Store = ReturnType<typeof useGameStore.getState>
export interface F2Decision { readonly day: number; readonly date: GameDate; readonly action: string; readonly detail: string }
export interface F2Policy { readonly id: string; decide(context: F2DayContext): void }
export interface F2DayContext {
  readonly day: number
  readonly date: GameDate
  readonly world: GameWorld
  readonly store: F2Store
  readonly teamId: TeamId
  readonly record: (action: string, detail: string) => void
}
export interface F2DaySnapshot {
  readonly day: number
  readonly date: GameDate
  readonly avgFatigue: number
  readonly maxFatigue: number
  readonly available: number
  readonly completedSessions: number
  readonly cohesion: number
}
export interface F2GameLine { readonly preMatchWorld: GameWorld; readonly gameId: GameId; readonly date: GameDate; readonly opponentId: TeamId; readonly isHome: boolean; readonly pointsFor: number; readonly pointsAgainst: number; readonly minutes: Readonly<Record<string, number>>; readonly preMatchFatigue: Readonly<Record<string, number>> }
export interface F2RunResult {
  readonly policyId: string
  readonly world: GameWorld
  readonly decisions: readonly F2Decision[]
  readonly snapshots: readonly F2DaySnapshot[]
  readonly games: readonly F2GameLine[]
  /** The world at the end of each requested day (a Save V4 checkpoint for the save/load continuity proof). */
  readonly checkpoints: Readonly<Record<number, GameWorld>>
}

/**
 * A Return-to-Play review that is due blocks the day until the coach decides (Medical). The same minimal rule applies to every arm:
 * run the required fitness test when there is one, clear the player if it is passed, otherwise continue the recovery.
 */
function resolveDueMedicalReviews(store: F2Store, record: (action: string, detail: string) => void): void {
  for (const candidate of evaluateSimulationBreakpoints(store.world!).candidates.filter((item) => item.reason === 'returnToPlayReview')) {
    const injuryId = candidate.sourceId as InjuryId
    let result = store.reviewReturnToPlay(injuryId, 'CLEAR_FOR_PLAY')
    if (!result.ok && result.reason === 'FITNESS_TEST_REQUIRED') {
      const test = store.conductFitnessTest(injuryId)
      record('conductFitnessTest', `${injuryId} -> ${test.ok ? test.record.result : test.reason}`)
      result = store.reviewReturnToPlay(injuryId, test.ok && test.record.result === 'PASS' ? 'CLEAR_FOR_PLAY' : 'CONTINUE_RECOVERY')
      record('reviewReturnToPlay', `${injuryId} -> ${test.ok && test.record.result === 'PASS' ? 'CLEAR_FOR_PLAY' : 'CONTINUE_RECOVERY'} (${result.ok ? 'ok' : result.reason})`)
    } else record('reviewReturnToPlay', `${injuryId} -> CLEAR_FOR_PLAY (${result.ok ? 'ok' : result.reason})`)
  }
}

export const matchSeedFor = (salt: number, gameId: string): number => hashStringToSeed(`f2-match:${salt}:${gameId}`)

/** Career creation → first user game (2026-09-26) played with a fixed seed → day 0 of the managed window (2026-09-27). */
export async function createF2Day0(): Promise<GameWorld> {
  const initial = await createConfiguredGameAsync({ universeId: ACB_TEST_UNIVERSE_ID, userTeamKey: 'ucm', userCoachCreation: F2_COACH })
  let counter = 5000
  const arrived = (await continueGameAsync(initial, createInlineMatchRunner(), 120, () => counter++)).world
  return advanceGameDay(instantResult(arrived, undefined, matchSeedFor(0, userGameToday(arrived)!.id)), dayRunSeedFactory(0, arrived.currentDate))
}

export function userGameToday(world: GameWorld): Game | undefined {
  const team = getUserTeam(world)
  return team === undefined ? undefined : Object.values(world.games).find((game) => game.status === 'scheduled' && game.date === world.currentDate && (game.homeTeamId === team.id || game.awayTeamId === team.id))
}

function dayRunSeedFactory(salt: number, date: GameDate): () => number {
  let index = 0
  return () => hashStringToSeed(`f2-day:${salt}:${date}:${index++}`)
}

export function teamSnapshot(world: GameWorld, teamId: TeamId, day: number): F2DaySnapshot {
  const roster = getTeamRoster(world, teamId)
  const fatigue = roster.map((player) => world.careerFatigueByPlayerId[player.id] ?? 0)
  return {
    day, date: world.currentDate,
    avgFatigue: fatigue.reduce((sum, value) => sum + value, 0) / Math.max(1, fatigue.length),
    maxFatigue: Math.max(0, ...fatigue),
    available: roster.filter((player) => isPlayerAvailable(world, player.id, world.currentDate)).length,
    completedSessions: Object.values(world.scheduledTrainingSessionsById).filter((session) => session.teamId === teamId && session.status === 'completed').length,
    cohesion: world.teamCohesionByTeamId[teamId] ?? 50,
  }
}

/** Sum over the roster of every canonical rating's accumulated development stimulus, plus the per-rating totals. */
export function stimulusTotals(world: GameWorld, teamId: TeamId): { readonly total: number; readonly byRating: Readonly<Record<string, number>> } {
  const byRating: Record<string, number> = {}
  let total = 0
  for (const player of getTeamRoster(world, teamId)) {
    const stimulus = world.developmentStimulusByPlayerId[player.id]
    if (stimulus === undefined) continue
    for (const key of CANONICAL_RATING_KEYS) {
      const value = stimulus.byRating[key] ?? 0
      byRating[key] = (byRating[key] ?? 0) + value
      total += value
    }
  }
  return { total, byRating }
}

/** Runs `days` consecutive days from `day0` under `policy`; deterministic for the same (day0, policy, salt). */
export function runF2Window(day0: GameWorld, policy: F2Policy, salt: number, days = F2_WINDOW_DAYS, firstDay = 1, checkpointDays: readonly number[] = []): F2RunResult {
  const store = useGameStore.getState()
  store.replaceWorld(day0)
  const teamId = getUserTeam(day0)!.id
  const decisions: F2Decision[] = []
  const snapshots: F2DaySnapshot[] = [teamSnapshot(day0, teamId, firstDay - 1)]
  const games: F2GameLine[] = []
  const checkpoints: Record<number, GameWorld> = {}
  for (let day = firstDay; day <= days; day += 1) {
    const world = useGameStore.getState().world!
    // The coach decides in the morning of `world.currentDate`, before the day boundary runs.
    policy.decide({ day, date: world.currentDate, world, store: useGameStore.getState(), teamId, record: (action, detail) => decisions.push({ day, date: world.currentDate, action, detail }) })
    resolveDueMedicalReviews(useGameStore.getState(), (action, detail) => decisions.push({ day, date: world.currentDate, action, detail }))
    let current = useGameStore.getState().world!
    const todaysGame = userGameToday(current)
    if (todaysGame !== undefined) {
      const preMatchWorld = current
      const preMatchFatigue = Object.fromEntries(getTeamRoster(current, teamId).map((player) => [player.id, current.careerFatigueByPlayerId[player.id] ?? 0]))
      current = instantResult(current, undefined, matchSeedFor(salt, todaysGame.id))
      const completed = current.games[todaysGame.id]!
      const log = current.matchStatLogsByGameId[todaysGame.id]
      const isHome = completed.homeTeamId === teamId
      const rosterIds = new Set<string>(getTeamRoster(current, teamId).map((player) => player.id))
      const minutes = Object.fromEntries((log?.playerLines ?? []).filter((line) => rosterIds.has(line.playerId)).map((line) => [line.playerId, line.stats.secondsPlayed / 60]))
      games.push({
        preMatchWorld, gameId: todaysGame.id, date: todaysGame.date, opponentId: isHome ? completed.awayTeamId : completed.homeTeamId, isHome,
        pointsFor: isHome ? completed.result!.homeScore : completed.result!.awayScore, pointsAgainst: isHome ? completed.result!.awayScore : completed.result!.homeScore, minutes, preMatchFatigue,
      })
    }
    current = advanceGameDay(current, dayRunSeedFactory(salt, current.currentDate))
    useGameStore.getState().replaceWorld(current)
    snapshots.push(teamSnapshot(current, teamId, day))
    if (checkpointDays.includes(day)) checkpoints[day] = current
  }
  return { policyId: policy.id, world: useGameStore.getState().world!, decisions, snapshots, games, checkpoints }
}

