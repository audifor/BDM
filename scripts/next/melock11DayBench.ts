/** ME-LOCK1.1 benchmark: end-to-end day advance (advanceGameDayWithResult[Async]) serial vs the production worker pool, and batches.
 *  node <bundle> <workerFile> <scenario> ; scenarios: day-prototype | day-acb | batch-<n> */
import { Worker } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { availableParallelism } from 'node:os'
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { advanceGameDayWithResult, advanceGameDayWithResultAsync } from '@/app/game/advanceGameDay'
import { createWorkerPoolRunner, type MatchSimulationReply } from '@/app/matchNext/MatchSimulationRunner'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import type { GameWorld } from '@/domain/world'
const [workerFile, scenario = 'day-acb', sizeArg] = process.argv.slice(2)
const size = Number(sizeArg ?? Math.min(8, availableParallelism() - 1))
const pool = createWorkerPoolRunner(() => {
  const worker = new Worker(workerFile!)
  return { post: (job) => worker.postMessage(job), onReply: (listener) => worker.on('message', (reply: MatchSimulationReply) => listener(reply)), onFailure: (listener) => worker.on('error', (error) => listener(String(error))), terminate: () => { void worker.terminate() } }
}, size)
const h = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 20)
const firstGameDay = (world: GameWorld): GameWorld => { let w = world; while (getScheduledGamesToday(w).length === 0) w = advanceDay(w); return w }
const out: Record<string, unknown> = { scenario, poolSize: size, cores: availableParallelism() }
if (scenario.startsWith('day-')) {
  const make = scenario === 'day-acb' ? createAcbTestGame : createNewGame
  const world = firstGameDay(make())
  const games = getScheduledGamesToday(world).length
  let a = 1, b = 1, c = 1
  const s0 = performance.now(); const serial = advanceGameDayWithResult(world, () => a++); const s1 = performance.now()
  const p0 = performance.now(); const cold = await advanceGameDayWithResultAsync(world, pool, () => b++); const p1 = performance.now()
  const w0 = performance.now(); const warm = await advanceGameDayWithResultAsync(world, pool, () => c++); const w1 = performance.now()
  Object.assign(out, { games, serialMs: Math.round(s1 - s0), parallelColdMs: Math.round(p1 - p0), parallelWarmMs: Math.round(w1 - w0), identical: h(serial.world) === h(cold.world) && h(serial.world) === h(warm.world), status: warm.status })
} else {
  const n = Number(scenario.split('-')[1] ?? 100)
  const world = createNewGame()
  const day = getScheduledGamesToday(world)
  const port = createMatchEnginePort('match-next')
  const setups = Array.from({ length: n }, (_, i) => port.prepare(world, day[i % day.length]!, 9000 + i))
  await pool.simulate(setups.slice(0, size)) // warm the pool
  const t0 = performance.now(); const results = await pool.simulate(setups); const t1 = performance.now()
  Object.assign(out, { matches: n, parallelMs: Math.round(t1 - t0), perMatchMs: Math.round((t1 - t0) / n), first: results[0]!.score, rssMb: Math.round(process.memoryUsage().rss / 1e6) })
}
pool.dispose()
console.log(JSON.stringify(out))
