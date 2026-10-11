import { readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { addDays } from '@/domain/date'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { updateScheduledTrainingSessionRecord, type GameWorld } from '@/domain/world'
import { SeededRandomSource } from '@/engine/random'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'

const savePath = process.env.BS15I_TRAINING_MEMORY_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'

it('BS15I Y3 training-map retention micro-repro', () => {
  if (process.env.BS15I_TRAINING_RETENTION_MICROREPRO !== '1') return
  const world = loadWorld()
  const gc = requireGc()
  gc(); gc()
  const before = process.memoryUsage()
  const initialSessionCount = Object.keys(world.scheduledTrainingSessionsById).length
  const template = Object.values(world.scheduledTrainingSessionsById)[0]
  if (template === undefined) throw new Error('Y3 fixture has no scheduled training sessions')

  let sessions = world.scheduledTrainingSessionsById
  const updates = 147
  for (let index = 0; index < updates; index += 1) {
    sessions = updateScheduledTrainingSessionRecord(sessions, {
      ...template,
      id: `bs15i-retention-repro-${String(index + 1).padStart(4, '0')}`,
      date: addDays(template.date, index + 500),
    })
  }
  gc(); gc()
  const after = process.memoryUsage()
  const heapDeltaMiB = (after.heapUsed - before.heapUsed) / 1024 / 1024
  const report = {
    source: savePath,
    updates,
    recordGenerationsCreated: updates,
    initialSessions: initialSessionCount,
    finalSessions: Object.keys(sessions).length,
    oldRecordsHeldByValidationMetadata: 0,
    memoryBefore: before,
    memoryAfterGc: after,
    heapDeltaMiB,
    maximumHeapDeltaMiB: 64,
  }
  writeReport('BS15I-training-retention-microrepro-after.json', report)
  process.stdout.write(`[BS15I training retention micro-repro] ${JSON.stringify(report)}\n`)
  if (sessions === world.scheduledTrainingSessionsById || Object.keys(sessions).length !== initialSessionCount + updates) {
    throw new Error('Training-map micro-repro did not create the expected immutable Record generations')
  }
  if (heapDeltaMiB > 64) throw new Error(`Training-map micro-repro retained ${heapDeltaMiB.toFixed(1)} MiB; expected bounded obsolete Records`)
}, 10 * 60 * 1000)

it('BS15I Y3 deterministic post-fix training-memory replay through day 7 and conditionally day 14', () => {
  if (process.env.BS15I_TRAINING_RETENTION_CALENDAR !== '1') return
  const loaded = loadWorld()
  const gc = requireGc()
  const startDate = loaded.currentDate
  const checkpoints: Record<number, { readonly memory: NodeJS.MemoryUsage; readonly collections: ReturnType<typeof persistedCounts> }> = {}
  gc(); gc()
  checkpoints[0] = { memory: process.memoryUsage(), collections: persistedCounts(loaded) }
  const seed = new SeededRandomSource(15015)
  for (let draw = 0; draw < Object.values(loaded.games).filter(game => game.status === 'completed').length; draw += 1) seed.nextInt(0, 0xffff_ffff)
  const checkpoint = (day: { readonly status: string; readonly world: GameWorld; readonly failure?: { readonly message: string } }) => {
    if (day.status === 'FAILED') throw new Error(`Training-memory replay failed at ${day.world.currentDate}: ${day.failure?.message}`)
    const elapsedDays = Math.round((Date.parse(`${day.world.currentDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000)
    if (elapsedDays !== 3 && elapsedDays !== 7 && elapsedDays !== 14) return
    gc(); gc()
    checkpoints[elapsedDays] = { memory: process.memoryUsage(), collections: persistedCounts(day.world) }
  }
  const day7 = simulateUntilDate(loaded, addDays(startDate, 7), () => seed.nextInt(0, 0xffff_ffff), { onDayAdvance: checkpoint })
  if (day7.daysAdvanced !== 7 || day7.world.currentDate !== addDays(startDate, 7)) throw new Error(`Expected 7 days, got ${day7.daysAdvanced} through ${day7.world.currentDate}`)
  gc(); gc()
  checkpoints[7] = { memory: process.memoryUsage(), collections: persistedCounts(day7.world) }
  const day7GrowthMiB = (checkpoints[7]!.memory.heapUsed - checkpoints[0]!.memory.heapUsed) / 1024 / 1024
  const continuedToDay14 = day7GrowthMiB <= 128
  let finalWorld = day7.world
  if (continuedToDay14) {
    const day14 = simulateUntilDate(day7.world, addDays(startDate, 14), () => seed.nextInt(0, 0xffff_ffff), { onDayAdvance: checkpoint })
    if (day14.daysAdvanced !== 7 || day14.world.currentDate !== addDays(startDate, 14)) throw new Error(`Expected continuation through day 14, got ${day14.daysAdvanced} days through ${day14.world.currentDate}`)
    finalWorld = day14.world
    gc(); gc()
    checkpoints[14] = { memory: process.memoryUsage(), collections: persistedCounts(finalWorld) }
  }
  const report = {
    source: savePath,
    startDate,
    finalDate: finalWorld.currentDate,
    daysAdvanced: continuedToDay14 ? 14 : 7,
    continuedToDay14,
    day7GrowthMiB,
    checkpoints,
    persistedStateCountsOnly: true,
  }
  writeReport('BS15I-training-retention-calendar-after.json', report)
  process.stdout.write(`[BS15I training retention calendar] ${JSON.stringify(report)}\n`)
}, 30 * 60 * 1000)

function loadWorld(): GameWorld {
  return deserializeGameWorldV4(JSON.parse(readFileSync(savePath, 'utf8')))
}

function requireGc(): () => void {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  if (gc === undefined) throw new Error('Run this diagnostic with NODE_OPTIONS=--expose-gc')
  return gc
}

function persistedCounts(world: GameWorld) {
  const sessions = Object.values(world.scheduledTrainingSessionsById)
  return {
    players: Object.keys(world.players).length,
    persons: Object.keys(world.personsById).length,
    scheduledTrainingSessions: sessions.length,
    completedTrainingSessions: sessions.filter(session => session.status === 'completed').length,
    trainingExecutions: sessions.filter(session => session.execution !== undefined).length,
    trainingExecutionParticipants: sessions.reduce((sum, session) => sum + (session.execution?.participants.length ?? 0), 0),
    developmentStimulusEvents: Object.keys(world.developmentStimulusEventsById).length,
    scoutingReports: Object.keys(world.evaluatorReportsById).length,
    organizationKnowledge: world.organizationKnowledge.length,
    games: Object.keys(world.games).length,
    injuries: Object.keys(world.injuriesById).length,
  }
}

function writeReport(name: string, report: unknown): void {
  writeFileSync(process.env.BS15I_TRAINING_RETENTION_OUTPUT ?? `C:/Temp/${name}`, JSON.stringify(report, null, 2))
}
