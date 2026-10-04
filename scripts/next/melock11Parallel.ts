/** ME-LOCK1.1 benchmark: a real day resolved inline vs with a worker_threads pool (phases: prepare -> simulate -> apply in order).
 *  node <bundle> <prototype|acb> <workers> */
import { Worker } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { availableParallelism } from 'node:os'
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { applyDayResults, prepareDayGames, simulateDayGamesInline } from '@/app/game/matchResolution'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import type { MatchNextResult } from '@/app/matchNext'
import type { GameWorld } from '@/domain/world'
const which = process.argv[2] ?? 'acb'
const size = Number(process.argv[3] ?? availableParallelism())
const workerFile = process.argv[4]!
let world: GameWorld = which === 'acb' ? createAcbTestGame() : createNewGame()
while (getScheduledGamesToday(world).length === 0) world = advanceDay(world)
const games = getScheduledGamesToday(world)
const h = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 20)

let seed = 777
const t0 = performance.now(); const preparedA = prepareDayGames(world, games, () => seed++); const t1 = performance.now()
const inlineResults = simulateDayGamesInline(preparedA); const t2 = performance.now()
const inlineWorld = applyDayResults(world, preparedA, inlineResults); const t3 = performance.now()

seed = 777
const pool = Array.from({ length: Math.min(size, games.length) }, () => new Worker(workerFile))
await Promise.all(pool.map((worker) => new Promise((resolve) => worker.once('online', resolve))))
const p0 = performance.now(); const prepared = prepareDayGames(world, games, () => seed++); const p1 = performance.now()
const queue = prepared.map((item, id) => ({ id, setup: item.setup }))
const results: MatchNextResult[] = new Array(prepared.length)
const workerSim: number[] = []
await Promise.all(pool.map((worker) => new Promise<void>((resolve) => {
  const next = (): void => { const job = queue.shift(); if (job === undefined) { resolve(); return } worker.postMessage(job) }
  worker.on('message', (message: { id: number; result: MatchNextResult; simulateMs: number }) => { results[message.id] = message.result; workerSim.push(message.simulateMs); next() })
  next()
})))
const p2 = performance.now()
const parallelWorld = applyDayResults(world, prepared, results); const p3 = performance.now()
await Promise.all(pool.map((worker) => worker.terminate()))
const clone0 = performance.now(); structuredClone(inlineResults[0]); const clone1 = performance.now()
console.log(JSON.stringify({ which, games: games.length, workers: pool.length, cores: availableParallelism(),
  inline: { prepareMs: Math.round(t1 - t0), simulateMs: Math.round(t2 - t1), applyMs: Math.round(t3 - t2), totalMs: Math.round(t3 - t0) },
  parallel: { prepareMs: Math.round(p1 - p0), simulateMs: Math.round(p2 - p1), applyMs: Math.round(p3 - p2), totalMs: Math.round(p3 - p0), meanWorkerSimMs: Math.round(workerSim.reduce((a, b) => a + b, 0) / workerSim.length) },
  structuredCloneOneResultMs: Math.round(clone1 - clone0), resultJsonMb: +(JSON.stringify(inlineResults[0]).length / 1e6).toFixed(1), setupJsonKb: Math.round(JSON.stringify(prepared[0]!.setup).length / 1e3),
  identicalWorld: h(inlineWorld) === h(parallelWorld) }))
