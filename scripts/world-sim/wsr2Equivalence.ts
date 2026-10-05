/**
 * WSR2 equivalence checks on the world-scale fixture (the indexes are ephemeral; nothing here may depend on them being warm):
 *   node <bundle> <copies> <days> <workerFile> <poolSize>
 * 1. save/load: advance `days`, save (V4 envelope through JSON), load, advance `days` more from the reloaded world (cold indexes).
 *    Prints the domains the round trip does not preserve (a property of the save format, the same at e75bbcf) and the hash of every
 *    reloaded day, to compare between commits.
 * 2. async: the same `days` advanced inline and on the worker pool at STANDARD detail (exact Games on workers, the rest BACKGROUND);
 *    every day's world must be identical.
 */
import { Worker } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { advanceGameDayWithResult, advanceGameDayWithResultAsync, type WorldDayAdvanceResult } from '@/app/game/advanceGameDay'
import { createWorkerPoolRunner, type MatchSimulationReply } from '@/app/matchNext/MatchSimulationRunner'
import { DEFAULT_SIMULATION_DETAIL } from '@/app/worldSim/SimulationResolutionPolicy'
import type { GameWorld } from '@/domain/world'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { canonicalJson } from '../next/melock12Corpus'
import { createWorldScaleFixture } from './wsr1WorldFixture'

const [copiesArg = '3', daysArg = '2', workerFile = './worker.mjs', poolArg = '6'] = process.argv.slice(2)
const copies = Number(copiesArg)
const days = Number(daysArg)
const hash = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 16)
const done = (result: WorldDayAdvanceResult): GameWorld => {
  if (result.status === 'FAILED' || result.status === 'BREAKPOINT_PREVENTED') throw new Error(`${result.status} ${result.failure?.message ?? ''}`)
  return result.world
}
const minimal = { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' as const }
const standard = { ...DEFAULT_SIMULATION_DETAIL, exactBudgetPerDay: 12 }
const seeds = (start: number) => { let s = start; return () => s++ }

// 1. save/load continuity.
let live = createWorldScaleFixture(copies).world
const nextSeed = seeds(51_000)
for (let day = 0; day < days; day += 1) live = done(advanceGameDayWithResult(live, nextSeed, ['userGame'], { simulationDetail: minimal }))
const saved = JSON.parse(JSON.stringify(serializeGameWorldV4(live, '2026-10-05T00:00:00.000Z')))
let reloaded = deserializeGameWorldSaveV4(saved)
const notPreserved = Object.keys({ ...live, ...reloaded }).sort().filter((key) => hash((live as unknown as Record<string, unknown>)[key]) !== hash((reloaded as unknown as Record<string, unknown>)[key]))
const reloadedSeed = seeds(52_000)
const reloadedDays: string[] = []
for (let day = 0; day < days; day += 1) {
  reloaded = done(advanceGameDayWithResult(reloaded, reloadedSeed, ['userGame'], { simulationDetail: minimal }))
  reloadedDays.push(hash(reloaded))
}
console.log(JSON.stringify({ check: 'save/load', copies, teams: Object.keys(live.teams).length, days, notPreserved, reloadedDays }))

// 2. inline vs worker pool.
const runner = createWorkerPoolRunner(() => {
  const worker = new Worker(workerFile)
  return { post: (job) => worker.postMessage(job), onReply: (listener) => worker.on('message', (reply: MatchSimulationReply) => listener(reply)), onFailure: (listener) => worker.on('error', (error) => listener(String(error))), terminate: () => { void worker.terminate() } }
}, Number(poolArg))
let inline = createWorldScaleFixture(copies).world
let pooled = inline
const inlineSeed = seeds(53_000)
const pooledSeed = seeds(53_000)
const sameDays: boolean[] = []
const exactGames: number[] = []
for (let day = 0; day < days; day += 1) {
  inline = done(advanceGameDayWithResult(inline, inlineSeed, ['userGame'], { simulationDetail: standard }))
  pooled = done(await advanceGameDayWithResultAsync(pooled, runner, pooledSeed, ['userGame'], { simulationDetail: standard }))
  sameDays.push(hash(inline) === hash(pooled))
  exactGames.push(Object.values(pooled.matchStatLogsByGameId).filter((log) => log.resolution === 'FAST').length)
}
console.log(JSON.stringify({ check: 'inline/pool', copies, days, sameDays, cumulativeExactGames: exactGames }))
process.exit(sameDays.every(Boolean) ? 0 : 1)
