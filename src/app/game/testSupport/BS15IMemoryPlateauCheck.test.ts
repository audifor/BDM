import { readFileSync, writeFileSync } from 'node:fs'
import { writeHeapSnapshot } from 'node:v8'
import { it } from 'vitest'
import { addDays } from '@/domain/date'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { SeededRandomSource } from '@/engine/random'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import type { GameWorld } from '@/domain/world'

it('BS15I Y3 mature-world retained-memory plateau check', () => {
  if (process.env.BS15I_MEMORY_PLATEAU_CHECK !== '1') return
  const savePath = process.env.BS15I_MEMORY_PLATEAU_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'
  const world = deserializeGameWorldV4(JSON.parse(readFileSync(savePath, 'utf8')))
  const startDate = world.currentDate
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  if (gc === undefined) throw new Error('Run this diagnostic with --expose-gc in the test process')
  const checkpointDays = new Set([0, 1, 3, 7, 14, 21])
  const checkpoints: Record<number, { memory: NodeJS.MemoryUsage; collections: ReturnType<typeof persistedCounts> }> = {}
  const phases: Record<string, { ms: number; calls: number; maxMs: number }> = {}
  if (gc) { gc(); gc() }
  checkpoints[0] = { memory: process.memoryUsage(), collections: persistedCounts(world) }
  const seed = new SeededRandomSource(15015)
  for (let draw = 0; draw < Object.values(world.games).filter(game => game.status === 'completed').length; draw += 1) seed.nextInt(0, 0xffff_ffff)
  const started = performance.now()
  const result = simulateUntilDate(world, addDays(startDate, 21), () => seed.nextInt(0, 0xffff_ffff), {
    onDayAdvance: (day) => {
      if (day.status === 'FAILED') throw new Error(`21-day memory check failed at ${day.world.currentDate}: ${day.failure?.message}`)
      for (const phase of day.phases) if (phase.ran && phase.elapsedMs !== undefined) {
        const total = phases[phase.phaseId] ?? { ms: 0, calls: 0, maxMs: 0 }
        total.ms += phase.elapsedMs
        total.calls += 1
        total.maxMs = Math.max(total.maxMs, phase.elapsedMs)
        phases[phase.phaseId] = total
      }
      const elapsedDays = Math.round((Date.parse(`${day.world.currentDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000)
      if (!checkpointDays.has(elapsedDays)) return
      gc()
      gc()
      checkpoints[elapsedDays] = { memory: process.memoryUsage(), collections: persistedCounts(day.world) }
      if (elapsedDays === 7 || elapsedDays === 21) {
        const snapshotPath = `C:/Temp/BS15I-memory-plateau-day${elapsedDays}.heapsnapshot`
        writeHeapSnapshot(snapshotPath)
        process.stdout.write(`[BS15I memory snapshot] day=${elapsedDays} path=${snapshotPath}\n`)
      }
    },
  })
  const wallMs = performance.now() - started
  if (result.daysAdvanced !== 21 || result.world.currentDate !== addDays(startDate, 21)) throw new Error(`Expected 21 days, got ${result.daysAdvanced} through ${result.world.currentDate}`)
  const heapSlopeMiBPerWeek = (fromDay: number, toDay: number) => (checkpoints[toDay]!.memory.heapUsed - checkpoints[fromDay]!.memory.heapUsed) / 1024 / 1024
  const report = {
    source: savePath,
    startDate,
    endDate: result.world.currentDate,
    daysAdvanced: result.daysAdvanced,
    gcCallsPerCheckpoint: 2,
    wallMs,
    checkpoints,
    heapDeltaMiB: {
      day7To14: heapSlopeMiBPerWeek(7, 14),
      day14To21: heapSlopeMiBPerWeek(14, 21),
    },
    phaseMs: Object.fromEntries(Object.entries(phases).sort(([, left], [, right]) => right.ms - left.ms).map(([name, value]) => [name, { ...value, meanMs: value.ms / value.calls }])),
  }
  const outputPath = process.env.BS15I_MEMORY_PLATEAU_OUTPUT ?? 'C:/Temp/BS15I-memory-plateau-day21.json'
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I memory plateau] ${JSON.stringify(report)}\n`)
}, 30 * 60 * 1000)

function persistedCounts(world: GameWorld) {
  return Object.fromEntries(Object.entries(world).flatMap(([key, collection]) => {
    if (Array.isArray(collection)) return [[key, collection.length]]
    if (collection !== null && typeof collection === 'object') return [[key, Object.keys(collection).length]]
    return []
  })) as Record<string, number>
}
