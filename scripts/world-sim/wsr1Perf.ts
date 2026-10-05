/**
 * WSR1 performance.
 *   node <bundle> bg <N>                         BACKGROUND batch: prepare / simulate / apply timed separately (one thread)
 *   node <bundle> mixed <copies> <budget> <workerFile> <poolSize>
 *                                                the real async day advance on the world-scale fixture: the user's Game and his competition
 *                                                exact, `budget` more exact Games, the rest BACKGROUND, exact Games on a worker pool
 */
import { Worker } from 'node:worker_threads'
import { availableParallelism } from 'node:os'
import { advanceGameDayWithResultAsync } from '@/app/game/advanceGameDay'
import { applyDayOutcomes, prepareDayGames, simulateDayOutcomesInline } from '@/app/game/matchResolution'
import { createWorkerPoolRunner, type MatchSimulationReply } from '@/app/matchNext/MatchSimulationRunner'
import { DEFAULT_SIMULATION_DETAIL } from '@/app/worldSim/SimulationResolutionPolicy'
import { getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { createWorldScaleFixture } from './wsr1WorldFixture'

const [mode = 'bg', a = '100', b = '12', workerFile, poolArg] = process.argv.slice(2)
const ms = (t: number) => Math.round(t)

if (mode === 'bg') {
  const n = Number(a)
  const t0 = performance.now()
  const { world } = createWorldScaleFixture(Math.ceil((n + 4) / 21))
  const fixtureMs = performance.now() - t0
  const user = getUserTeam(world)!
  const games = getScheduledGamesToday(world).filter((game) => game.homeTeamId !== user.id && game.awayTeamId !== user.id).slice(0, n)
  let seed = 1
  const p0 = performance.now()
  const prepared = prepareDayGames(world, games, () => seed++, undefined, { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' })
  const p1 = performance.now()
  const outcomes = simulateDayOutcomesInline(prepared)
  const p2 = performance.now()
  const after = applyDayOutcomes(world, prepared, outcomes)
  const p3 = performance.now()
  if (outcomes.some((o) => o.resolution !== 'BACKGROUND')) throw new Error('expected BACKGROUND only')
  console.log(JSON.stringify({ mode, matches: games.length, worldTeams: Object.keys(world.teams).length, fixtureMs: ms(fixtureMs), prepareMs: ms(p1 - p0), simulateMs: ms(p2 - p1), applyMs: ms(p3 - p2), totalMs: ms(p3 - p0),
    perMatch: { prepare: +((p1 - p0) / n).toFixed(2), simulate: +((p2 - p1) / n).toFixed(3), apply: +((p3 - p2) / n).toFixed(2) }, matchesPerSecondSimulateOnly: Math.round(n / ((p2 - p1) / 1000)), completed: Object.values(after.games).filter((g) => g.status === 'completed').length }))
} else {
  const copies = Number(a)
  const budget = Number(b)
  const pool = Number(poolArg ?? Math.min(8, availableParallelism() - 1))
  const { world, todayGames } = createWorldScaleFixture(copies)
  const runner = createWorkerPoolRunner(() => {
    const worker = new Worker(workerFile!)
    return { post: (job) => worker.postMessage(job), onReply: (listener) => worker.on('message', (reply: MatchSimulationReply) => listener(reply)), onFailure: (listener) => worker.on('error', (error) => listener(String(error))), terminate: () => { void worker.terminate() } }
  }, pool)
  const settings = { ...DEFAULT_SIMULATION_DETAIL, exactBudgetPerDay: budget }
  // Warm the pool (worker start-up is a one-off cost of a session, not of a day).
  await runner.simulate([])
  const t0 = performance.now()
  const result = await advanceGameDayWithResultAsync(world, runner, (() => { let s = 1; return () => s++ })(), ['userGame'], { simulationDetail: settings })
  const total = performance.now() - t0
  const logs = Object.values(result.world.matchStatLogsByGameId)
  const count = (r: string) => logs.filter((log) => log.resolution === r).length
  const matchPhase = result.phases.find((phase) => phase.phaseId === 'MATCH_RESOLUTION')
  console.log(JSON.stringify({ mode, copies, teams: Object.keys(world.teams).length, todayGames, pool, budget, status: result.status, totalMs: ms(total), matchResolutionMs: matchPhase?.elapsedMs, otherPhasesMs: ms(total - (matchPhase?.elapsedMs ?? 0)), resolutions: { FAST: count('FAST'), BACKGROUND: count('BACKGROUND') }, phases: result.phases.filter((phase) => (phase.elapsedMs ?? 0) >= 100).map((phase) => `${phase.phaseId}:${Math.round(phase.elapsedMs ?? 0)}`) }))
  process.exit(0)
}
