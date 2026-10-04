import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { createMatchEnginePort } from '@/app/matchNext'
import { calculateStandings } from '@/engine/competition/standings'
import { getGamesToday, getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { advanceGameDayWithResult, advanceGameDayWithResultAsync, simulateRemainingGamesToday } from './advanceGameDay'
import { createInlineMatchRunner, createWorkerPoolRunner, type MatchSimulationJob, type MatchSimulationReply } from '@/app/matchNext/MatchSimulationRunner'
import { withShortGameFormat } from './testFixtures'
import { createNewGame } from './createNewGame'
import { instantResult, simulateAndApplyGame } from './matchResolution'

/** ME-LOCK1: every production Game without a viewer resolves through Match Next FAST, the same engine and result contract as Live. */

const shortRules = (setup: ReturnType<ReturnType<typeof createMatchEnginePort>['prepare']>) => ({ ...setup, clockRules: { ...setup.clockRules, periodCount: 2, periodSeconds: 60, overtimeSeconds: 30 } })
let seedCounter = 0
const seeds = () => 91_000 + (seedCounter += 1)

describe('Match Next execution modes', () => {
  it('FAST is deterministic: same setup, same mode, same result', () => {
    const world = createNewGame()
    const game = getScheduledGamesToday(world)[0]!
    const port = createMatchEnginePort('match-next')
    const setup = shortRules(port.prepare(world, game, 4242))
    expect(JSON.stringify(port.simulate(setup, 'FAST'))).toBe(JSON.stringify(port.simulate(setup, 'FAST')))
  }, 120_000)

  it('FULL (a frame every tick) and FAST produce the identical result for the same setup', () => {
    const world = createNewGame()
    const game = getScheduledGamesToday(world)[0]!
    const port = createMatchEnginePort('match-next')
    const setup = shortRules(port.prepare(world, game, 7))
    expect(JSON.stringify(port.simulate(setup, 'FULL'))).toBe(JSON.stringify(port.simulate(setup, 'FAST')))
  }, 120_000)
})

describe('world simulation through Match Next FAST', () => {
  it('simulates a whole day: every game completes once, standings and Player state update, the calendar can continue', () => {
    const world = createNewGame()
    const today = getScheduledGamesToday(world)
    expect(today.length).toBeGreaterThan(1)
    const seasonIds = [...new Set(today.map((game) => game.seasonId))]
    const before = seasonIds.map((seasonId) => calculateStandings(world, seasonId).reduce((sum, line) => sum + line.played, 0))

    const after = simulateRemainingGamesToday(world, seeds)

    expect(getScheduledGamesToday(after)).toHaveLength(0)
    for (const game of today) {
      expect(after.games[game.id]?.status).toBe('completed')
      const log = after.matchStatLogsByGameId[game.id]!
      expect(log).toBeDefined()
      const result = after.games[game.id]!.result!
      expect(log.playerLines.filter((line) => line.isHome).reduce((sum, line) => sum + line.stats.points, 0)).toBe(result.homeScore)
      expect(log.playerLines.filter((line) => !line.isHome).reduce((sum, line) => sum + line.stats.points, 0)).toBe(result.awayScore)
      expect(log.playerLines.every((line) => Number.isInteger(line.stats.secondsPlayed))).toBe(true)
      // one shared consequence path: whoever played carries the match load into career fatigue
      const played = log.playerLines.filter((line) => line.stats.secondsPlayed > 0)
      expect(played.some((line) => (after.careerFatigueByPlayerId[line.playerId] ?? 0) > (world.careerFatigueByPlayerId[line.playerId] ?? 0))).toBe(true)
    }
    seasonIds.forEach((seasonId, index) => {
      const games = today.filter((game) => game.seasonId === seasonId).length
      expect(calculateStandings(after, seasonId).reduce((sum, line) => sum + line.played, 0)).toBe(before[index]! + 2 * games)
    })
    expect(Object.keys(after.matchStatLogsByGameId)).toHaveLength(Object.keys(world.matchStatLogsByGameId).length + today.length)
    // applying any of them again fails closed
    expect(() => simulateAndApplyGame(after, { ...today[0]!, status: 'scheduled' } as typeof today[0], 5)).toThrow()

    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(after, '2032-10-02T00:00:00.000Z'))
    for (const game of today) {
      expect(reloaded.games[game.id]?.status).toBe('completed')
      expect(reloaded.matchStatLogsByGameId[game.id]).toEqual(after.matchStatLogsByGameId[game.id])
    }
    expect(reloaded.careerFatigueByPlayerId).toEqual(after.careerFatigueByPlayerId)
    seasonIds.forEach((seasonId) => expect(calculateStandings(reloaded, seasonId)).toEqual(calculateStandings(after, seasonId)))
  }, 900_000)

  it('mixes a user Live game (FULL path) with FAST world games into one competition state', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const userGame = getGamesToday(world).find((game) => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)!
    const port = createMatchEnginePort('match-next')
    const live = port.createLiveSession(port.prepare(world, userGame, 1234))
    while (!live.matchState.isComplete) live.advanceTicks(200) // the Live viewer's presentation cadence
    const afterUser = port.complete(world, live.result())
    const afterDay = simulateRemainingGamesToday(afterUser, seeds)

    const today = getGamesToday(world)
    expect(today.every((game) => afterDay.games[game.id]?.status === 'completed' && afterDay.matchStatLogsByGameId[game.id] !== undefined)).toBe(true)
    const userLog = afterDay.matchStatLogsByGameId[userGame.id]!
    const otherLog = afterDay.matchStatLogsByGameId[today.find((game) => game.id !== userGame.id)!.id]!
    // the same canonical result contract, whichever mode produced the game
    expect(Object.keys(userLog).sort()).toEqual(Object.keys(otherLog).sort())
    expect(Object.keys(userLog.playerLines[0]!.stats).sort()).toEqual(Object.keys(otherLog.playerLines[0]!.stats).sort())
    expect(calculateStandings(afterDay, userGame.seasonId).reduce((sum, line) => sum + line.played, 0))
      .toBe(2 * today.filter((game) => game.seasonId === userGame.seasonId).length + calculateStandings(world, userGame.seasonId).reduce((sum, line) => sum + line.played, 0))
  }, 900_000)

  it('the user Instant result goes through Match Next FAST with the same contract', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const userGame = getGamesToday(world).find((game) => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)!
    const after = instantResult(world, undefined, 2026)
    const port = createMatchEnginePort('match-next')
    const expected = port.complete(world, port.simulate(port.prepare(world, userGame, 2026), 'FAST'))
    expect(after.matchStatLogsByGameId[userGame.id]).toEqual(expected.matchStatLogsByGameId[userGame.id])
    expect(after.games[userGame.id]).toEqual(expected.games[userGame.id])
  }, 300_000)

  it('a Game that cannot be prepared fails without touching the world (no partial standings or Player state)', () => {
    const world = createNewGame()
    const game = getScheduledGamesToday(world)[0]!
    const roster = world.teams[game.homeTeamId]!.rosterPlayerIds
    const broken: GameWorld = updateGameWorld(world, { teams: Object.values(world.teams).map((team) => team.id === game.homeTeamId ? { ...team, rosterPlayerIds: roster.slice(0, 4) } : team) })
    const snapshot = JSON.stringify(broken)
    expect(() => simulateAndApplyGame(broken, game, 3)).toThrow()
    expect(JSON.stringify(broken)).toBe(snapshot)
  }, 120_000)
})

describe('foul-out with no eligible substitute', () => {
  it('keeps five on the court and says so explicitly (foulOutNoReplacement), never silently', () => {
    const world = createNewGame()
    const game = getScheduledGamesToday(world)[0]!
    const port = createMatchEnginePort('match-next')
    const base = port.prepare(world, game, 77)
    const homeFive = base.initialLineups.home
    const setup = { ...shortRules(base), homeSquad: homeFive, players: base.players.filter((player) => player.teamId !== base.homeTeamId || homeFive.includes(player.playerId)),
      clockRules: { ...base.clockRules, periodCount: 2, periodSeconds: 300, overtimeSeconds: 60, foulRules: { personalFoulLimit: 1, teamFoulPenaltyFrom: 5, teamFoulOneAndOneFrom: null } } }
    const state = port.simulate(setup, 'FAST').finalState
    const homeFoulOuts = state.events.filter((event) => event.type === 'foulOut' && event.teamId === base.homeTeamId)
    expect(homeFoulOuts.length).toBeGreaterThan(0)
    const announced = state.events.filter((event) => event.type === 'foulOutNoReplacement' && event.teamId === base.homeTeamId).map((event) => event.playerId)
    expect(announced).toEqual(homeFoulOuts.map((event) => event.playerId))
    expect(state.players.filter((player) => player.teamId === base.homeTeamId && player.active)).toHaveLength(5)
  }, 120_000)
})

describe('day simulation in parallel workers (ME-LOCK1.1)', () => {
  /** In-process stand-ins for workers that answer out of order (last job first), to prove the applied world ignores completion order. */
  function reversedReplyPool() {
    const port = createMatchEnginePort('match-next')
    const pending: { readonly job: MatchSimulationJob; readonly reply: (reply: MatchSimulationReply) => void }[] = []
    let flushScheduled = false
    const flush = (): void => { flushScheduled = false; for (const item of pending.splice(0).reverse()) item.reply({ jobId: item.job.jobId, result: port.simulate(item.job.setup, 'FAST') }) }
    return createWorkerPoolRunner(() => {
      let listener: (reply: MatchSimulationReply) => void = () => {}
      return {
        post: (job) => { pending.push({ job, reply: (reply) => listener(reply) }); if (!flushScheduled) { flushScheduled = true; setTimeout(flush, 5) } },
        onReply: (next) => { listener = next },
        onFailure: () => {},
        terminate: () => {},
      }
    }, 8)
  }

  it('applies the identical world whatever runner simulated the day and in whatever order the results arrived', async () => {
    const world = withShortGameFormat(createNewGame())
    let a = 100, b = 100, c = 100
    const sync = advanceGameDayWithResult(world, () => a++)
    const inline = await advanceGameDayWithResultAsync(world, createInlineMatchRunner(), () => b++)
    const reversed = await advanceGameDayWithResultAsync(world, reversedReplyPool(), () => c++)
    expect(sync.status).toBe('COMPLETED')
    expect(JSON.stringify(inline.world)).toBe(JSON.stringify(sync.world))
    expect(JSON.stringify(reversed.world)).toBe(JSON.stringify(sync.world))
    expect(reversed.phases.map((phase) => phase.phaseId)).toEqual(sync.phases.map((phase) => phase.phaseId))
  }, 600_000)

  it('a failed simulation ends the day as FAILED with the world untouched (nothing applied)', async () => {
    const world = withShortGameFormat(createNewGame())
    const failing = createWorkerPoolRunner(() => {
      let listener: (reply: MatchSimulationReply) => void = () => {}
      return { post: (job) => setTimeout(() => listener({ jobId: job.jobId, error: 'worker crashed' }), 1), onReply: (next) => { listener = next }, onFailure: () => {}, terminate: () => {} }
    }, 4)
    const result = await advanceGameDayWithResultAsync(world, failing, () => 1)
    expect(result.status).toBe('FAILED')
    expect(result.world).toBe(world)
    expect(result.failure?.message).toMatch(/worker crashed/)
  }, 120_000)
})

describe('production guard', () => {
  it('no production module resolves games with the legacy MatchEngine outside the declared compatibility surface', () => {
    const root = join(process.cwd(), 'src')
    const files: string[] = []
    const walk = (dir: string): void => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) files.push(path) } }
    walk(root)
    // Legacy simulation entry points: the legacy engine itself and the application wrappers around it.
    const legacy = /\b(simulateMatchWithRotations|simulateMatch|createMatchSession|stepMatchSession|LegacyMatchEnginePort|LiveMatchController|createLiveUserMatch|prepareUserMatch|completeMatch)\b/
    // Compatibility surface (documented in ME_LOCK1_LEGACY_ENGINE_RETIREMENT.md): the engine, its application wrappers, the legacy UI
    // (`?ui=legacy`) and its store actions, and the remnant legacy viewer branch of the NG match workspace.
    const allowed = [
      /^engine[\\/]match[\\/]/,
      /^app[\\/]game[\\/](playUserGame|LiveMatchController|index)\.ts$/,
      /^app[\\/]matchNext[\\/](LegacyMatchEnginePort|MatchEnginePortFactory|index)\.ts$/,
      /^stores[\\/]gameStore\.ts$/,
      /^ui[\\/]/,
      /^ui-ng[\\/]applications[\\/]match[\\/](NgMatchViewer|MatchWorkspace)\.tsx$/,
      /^presentation[\\/]/,
    ]
    const offenders = files.map((path) => relative(root, path)).filter((path) => !allowed.some((pattern) => pattern.test(path)) && legacy.test(readFileSync(join(root, path), 'utf8')))
    expect(offenders).toEqual([])
    // and the world routes import the Match Next resolution, never the legacy one
    for (const path of ['app/game/advanceGameDay.ts', 'app/game/matchResolution.ts']) {
      const source = readFileSync(join(root, path), 'utf8')
      expect(source).not.toMatch(legacy)
    }
    expect(readFileSync(join(root, 'app/game/advanceGameDay.ts'), 'utf8')).toMatch(/from '\.\/matchResolution'/)
  })
})
