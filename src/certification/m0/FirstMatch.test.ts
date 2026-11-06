import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGameDate } from '@/domain/date'
import type { Game } from '@/domain/game'
import { updateGameWorld, validateGameWorld, type GameWorld } from '@/domain/world'
import { getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { hashStringToSeed } from '@/engine/random'
import { generateWorld } from '@/engine/world'
import { advanceGameDayWithResult, assertSimulationMayAdvance, SimulationAdvanceBlockedError } from '@/app/game/advanceGameDay'
import { instantResult } from '@/app/game/matchResolution'
import { evaluateSimulationBreakpoints, type SimulationBreakpointResult } from '@/app/game/SimulationBreakpoints'
import { MatchNextEnginePort } from '@/app/matchNext/MatchNextEnginePort'

const ROOT_SEED = 20261106
const configuration = { seed: ROOT_SEED, gender: 'male', startDate: createGameDate(2032, 10, 1) } as const

function bootstrap(): GameWorld {
  const world = generateWorld(configuration)
  return updateGameWorld(world, { games: generateRoundRobinSchedule({ world, seasonId: world.currentSeasonId }) })
}

// All canonical JSON state is included; only object keys are sorted. Arrays retain order.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item !== null && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    : item)
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function seedFor(game: Game): number {
  return hashStringToSeed(`m0-match-v1:${ROOT_SEED}:${game.seasonId}:${game.competitionId}:${game.id}:${game.date}`)
}

function unresolved(decision: SimulationBreakpointResult) {
  // Never select only the highest-priority candidate: a userGame cannot hide another obligation.
  return decision.candidates.filter(item => (item.level === 'ACTION_REQUIRED' || item.level === 'BLOCKING') && item.reason !== 'userGame')
}

function certify(initial: GameWorld) {
  let world = initial
  const breakpoints: object[] = []
  const seeds: { gameId: string; seed: number }[] = []
  const observe = () => {
    const decision = evaluateSimulationBreakpoints(world)
    breakpoints.push(...decision.candidates.map(item => ({ date: world.currentDate, level: item.level, reason: item.reason,
      sourceKind: item.sourceKind, sourceId: item.sourceId, diagnostic: item.diagnostic,
      attemptedResolution: item.reason === 'userGame' ? 'instantResult with explicit seed' : 'none',
      resultingStatus: item.reason === 'userGame' ? 'PENDING' : item.level === 'ACTION_REQUIRED' || item.level === 'BLOCKING' ? 'BLOCKED' : 'OBSERVED' })))
    if (unresolved(decision).length > 0) throw new Error(`BLOCKED: ${canonical(breakpoints)}`)
    return decision
  }

  // The supported prototype schedules its opening round on day zero.
  const decision = observe()
  const userGame = decision.candidates.find(item => item.reason === 'userGame')
  expect(userGame).toBeDefined()
  const game = world.games[userGame!.sourceId as Game['id']]!
  expect(game.status).toBe('scheduled')
  expect(game.result).toBeNull()
  const seed = seedFor(game)
  seeds.push({ gameId: game.id, seed })
  world = instantResult(world, undefined, seed)
  expect(world.games[game.id]!.status).toBe('completed')
  expect(evaluateSimulationBreakpoints(world).candidates.some(item => item.reason === 'userGame')).toBe(false)
  Object.assign(breakpoints.find(item => 'sourceId' in item && item.sourceId === game.id)!, { resultingStatus: 'RESOLVED' })
  validateGameWorld(world)

  observe()
  const remaining = getScheduledGamesToday(world)
  let draw = 0
  // MatchSeedFactory has no Game parameter. Bind its draws to the production schedule order,
  // hashing each Game's stable identity rather than introducing a counter-based RNG authority.
  const day = advanceGameDayWithResult(world, () => {
    const scheduled = remaining[draw++]
    if (scheduled === undefined) throw new Error('Unexpected match seed draw')
    const nextSeed = seedFor(scheduled)
    seeds.push({ gameId: scheduled.id, seed: nextSeed })
    return nextSeed
  }, [])
  expect(day.failure).toBeUndefined()
  expect(['COMPLETED', 'BREAKPOINT_AFTER_PROCESSING']).toContain(day.status)
  expect(draw).toBe(remaining.length)
  world = day.world
  expect(world.currentDate).toBe('2032-10-02')
  observe()
  validateGameWorld(world)

  const completed = Object.values(world.games).filter(item => item.status === 'completed')
  expect(completed).toHaveLength(4)
  expect(Object.keys(world.matchStatLogsByGameId)).toHaveLength(completed.length)
  for (const match of completed) {
    expect(initial.games[match.id]!.status).toBe('scheduled')
    const log = world.matchStatLogsByGameId[match.id]!
    expect(log).toBeDefined()
    expect(log.resolution).toBe('FAST')
    expect(log.finalScore).toEqual({ home: match.result!.homeScore, away: match.result!.awayScore })
    expect(log.finalScore.home).not.toBe(log.finalScore.away)
    expect(log.playerLines.length).toBeGreaterThanOrEqual(10)
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      const lines = log.playerLines.filter(line => line.teamId === teamId)
      expect(lines.every(line => world.teams[teamId]!.rosterPlayerIds.includes(line.playerId))).toBe(true)
      expect(lines.reduce((sum, line) => sum + line.stats.points, 0)).toBe(teamId === match.homeTeamId ? log.finalScore.home : log.finalScore.away)
    }
  }
  return { world, completed, seeds, breakpoints, daysAdvanced: 1 }
}

describe('M0.1 deterministic headless first production match', () => {
  afterEach(() => vi.restoreAllMocks())

  it('bootstraps two canonical worlds and persists identical real Match Next results without bypassing decisions', () => {
    expect(typeof document).toBe('undefined')
    const simulate = vi.spyOn(MatchNextEnginePort.prototype, 'simulate') // Pass-through: the real engine runs.
    const first = bootstrap()
    const second = bootstrap()
    validateGameWorld(first)
    validateGameWorld(second)
    expect(canonical(first)).toBe(canonical(second))
    expect(first).toEqual(second)
    expect(Object.keys(first.teams)).toHaveLength(8)
    expect(Object.keys(first.players)).toHaveLength(96)
    expect(Object.keys(first.competitions)).toHaveLength(1)
    expect(first.seasons[first.currentSeasonId]).toBeDefined()
    expect(first.coaches[first.userCoachId]).toBeDefined()
    expect(getUserTeam(first)?.coachId).toBe(first.userCoachId)
    expect(Object.values(first.games)).toHaveLength(56)
    expect(new Set(Object.values(first.games).map(game => game.date)).size).toBe(14)
    const before = canonical(first)
    expect(() => assertSimulationMayAdvance(first, [])).toThrow(SimulationAdvanceBlockedError)
    const prevented = advanceGameDayWithResult(first, () => { throw new Error('Seed draw while blocked') }, [])
    expect(prevented.status).toBe('BREAKPOINT_PREVENTED')
    expect(prevented.world).toBe(first)
    expect(canonical(first)).toBe(before)
    expect(simulate).not.toHaveBeenCalled()

    const a = certify(first)
    const b = certify(second)
    expect(canonical(first)).toBe(before)
    expect(a.completed.map(game => game.id)).toEqual(b.completed.map(game => game.id))
    expect(a.completed.map(game => game.result)).toEqual(b.completed.map(game => game.result))
    expect(canonical(a.world.matchStatLogsByGameId)).toBe(canonical(b.world.matchStatLogsByGameId))
    expect(canonical(a.world)).toBe(canonical(b.world))
    expect(a.world).toEqual(b.world)
    expect(a.seeds).toEqual(b.seeds)
    expect(a.breakpoints).toEqual(b.breakpoints)
    expect(simulate).toHaveBeenCalledTimes(8)
    expect(simulate.mock.calls.map(([setup]) => ({ gameId: setup.gameId, seed: setup.matchSeed }))).toEqual([...a.seeds, ...b.seeds])
    for (const [index, call] of simulate.mock.calls.entries()) {
      expect(call[1]).toBe('FAST')
      const result = simulate.mock.results[index]!
      expect(result.type).toBe('return')
      expect(result.value.engine).toBe('match-next')
      expect(result.value.matchSeed).toBe(call[0].matchSeed)
      expect(result.value.finalState.isComplete).toBe(true)
      expect(result.value.events.some((event: { type: string }) => event.type === 'gameEnd')).toBe(true)
      expect(result.value.score).toEqual(a.world.matchStatLogsByGameId[result.value.gameId as Game['id']]!.finalScore)
    }
    console.log('M0.1 evidence', JSON.stringify({ status: 'PASS', configuration, initialHash: digest(first), finalHash: digest(a.world),
      daysAdvanced: a.daysAdvanced, seeds: a.seeds, completed: a.completed.map(game => ({ id: game.id, result: game.result })),
      statLogs: Object.keys(a.world.matchStatLogsByGameId).length, breakpoints: a.breakpoints, productionExecutions: simulate.mock.calls.length }))
  })

  it('detects every mandatory candidate, including one below the user-game priority', () => {
    const world = bootstrap()
    const decision = evaluateSimulationBreakpoints(world, { additionalCandidates: [
      { level: 'ACTION_REQUIRED', reason: 'm0UnresolvedDecision', sourceKind: 'CERTIFICATION_GUARD', sourceId: 'm0-required',
        ownership: { kind: 'SYSTEM' }, diagnostic: 'Guard coverage: no scripted resolution exists.' },
      { level: 'BLOCKING', reason: 'm0IntegrityBlocker', sourceKind: 'CERTIFICATION_GUARD', sourceId: 'm0-blocking',
        ownership: { kind: 'SYSTEM' }, diagnostic: 'Guard coverage: unresolved integrity blocker.' },
    ] })
    expect(decision.candidates.findIndex(item => item.reason === 'm0UnresolvedDecision')).toBeGreaterThan(decision.candidates.findIndex(item => item.reason === 'userGame'))
    expect(unresolved(decision).map(item => item.sourceId)).toEqual(['m0-blocking', 'm0-required'])
    expect(decision.mayAdvance).toBe(false)
  })
})
