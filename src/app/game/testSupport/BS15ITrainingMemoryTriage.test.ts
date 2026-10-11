import { createHash } from 'node:crypto'
import { Session } from 'node:inspector'
import { readFileSync, writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'
import { addDays } from '@/domain/date'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { SeededRandomSource } from '@/engine/random'
import { executeScheduledTrainingSessionsWithEvidence } from '@/engine/training/ScheduledTrainingEngine'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import type { GameWorld } from '@/domain/world'

const trainingMeasurements = vi.hoisted(() => ({
  operations: {} as Record<string, { ms: number; calls: number; maxMs: number }>,
}))

function recordTrainingMeasurement(name: string, ms: number): void {
  const current = trainingMeasurements.operations[name] ?? { ms: 0, calls: 0, maxMs: 0 }
  current.ms += ms
  current.calls += 1
  current.maxMs = Math.max(current.maxMs, ms)
  trainingMeasurements.operations[name] = current
}

vi.mock('@/domain/world', async (loadActual) => {
  const actual = await loadActual<typeof import('@/domain/world')>()
  return {
    ...actual,
    updateScheduledTrainingSessionRecord: (sessionsById: Parameters<typeof actual.updateScheduledTrainingSessionRecord>[0], session: Parameters<typeof actual.updateScheduledTrainingSessionRecord>[1]) => {
      const started = performance.now()
      const result = actual.updateScheduledTrainingSessionRecord(sessionsById, session)
      recordTrainingMeasurement('recordClone', performance.now() - started)
      recordTrainingMeasurement('recordEntriesCopied', Object.keys(sessionsById).length)
      return result
    },
    updateScheduledTrainingSessionRecords: (sessionsById: Parameters<typeof actual.updateScheduledTrainingSessionRecords>[0], sessions: Parameters<typeof actual.updateScheduledTrainingSessionRecords>[1]) => {
      const started = performance.now()
      const result = actual.updateScheduledTrainingSessionRecords(sessionsById, sessions)
      recordTrainingMeasurement('recordClone', performance.now() - started)
      recordTrainingMeasurement('recordEntriesCopied', Object.keys(sessionsById).length)
      return result
    },
    updateGameWorldBatch: (world: Parameters<typeof actual.updateGameWorldBatch>[0], execute: Parameters<typeof actual.updateGameWorldBatch>[1]) =>
      actual.updateGameWorldBatch(world, (initial, update) => execute(initial, (current, patch) => {
        const started = performance.now()
        const result = update(current, patch)
        recordTrainingMeasurement('gameWorldUpdate', performance.now() - started)
        return result
      })),
  }
})

vi.mock('@/domain/training', async (loadActual) => {
  const actual = await loadActual<typeof import('@/domain/training')>()
  const timed = <A extends unknown[], R>(name: string, fn: (...args: A) => R) => (...args: A): R => {
    const started = performance.now()
    try { return fn(...args) }
    finally { recordTrainingMeasurement(name, performance.now() - started) }
  }
  return {
    ...actual,
    createScheduledTrainingSession: timed('sessionConstruction', actual.createScheduledTrainingSession),
    findCollidingSession: timed('collisionLookup', actual.findCollidingSession),
  }
})

vi.mock('@/engine/training/ScheduledTrainingEngine', async (loadActual) => {
  const actual = await loadActual<typeof import('@/engine/training/ScheduledTrainingEngine')>()
  const timed = <A extends unknown[], R>(name: string, fn: (...args: A) => R) => (...args: A): R => {
    const started = performance.now()
    try { return fn(...args) }
    finally {
      const ms = performance.now() - started
      const current = trainingMeasurements.operations[name] ?? { ms: 0, calls: 0, maxMs: 0 }
      current.ms += ms
      current.calls += 1
      current.maxMs = Math.max(current.maxMs, ms)
      trainingMeasurements.operations[name] = current
    }
  }
  return {
    ...actual,
    executeScheduledTrainingSessionsWithEvidence: timed('executeScheduledTrainingSessionsWithEvidence', actual.executeScheduledTrainingSessionsWithEvidence),
    dailyScheduledLoad: timed('dailyScheduledLoad', actual.dailyScheduledLoad),
    scheduledTrainingSessionsOnDate: timed('scheduledTrainingSessionsOnDate', actual.scheduledTrainingSessionsOnDate),
    scheduleTrainingSession: timed('scheduleTrainingSession', actual.scheduleTrainingSession),
    scheduleTrainingSessionsBatch: timed('scheduleTrainingSessionsBatch', actual.scheduleTrainingSessionsBatch),
  }
})

vi.mock('@/engine/training/TrainingPlanning', async (loadActual) => {
  const actual = await loadActual<typeof import('@/engine/training/TrainingPlanning')>()
  const timed = <A extends unknown[], R>(name: string, fn: (...args: A) => R) => (...args: A): R => {
    const started = performance.now()
    try { return fn(...args) }
    finally {
      const ms = performance.now() - started
      const current = trainingMeasurements.operations[name] ?? { ms: 0, calls: 0, maxMs: 0 }
      current.ms += ms
      current.calls += 1
      current.maxMs = Math.max(current.maxMs, ms)
      trainingMeasurements.operations[name] = current
    }
  }
  return {
    ...actual,
    buildTrainingPlanningContext: timed('buildTrainingPlanningContext', actual.buildTrainingPlanningContext),
    progressAiTrainingPlanning: timed('progressAiTrainingPlanning', actual.progressAiTrainingPlanning),
  }
})

it('BS15I retained-memory and collection growth checkpoints from Y3 Save V4', () => {
  if (process.env.BS15I_TRAINING_MEMORY_TRIAGE !== '1') return
  const savePath = process.env.BS15I_TRAINING_MEMORY_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'
  const world = deserializeGameWorldV4(JSON.parse(readFileSync(savePath, 'utf8')))
  const startDate = world.currentDate
  const checkpointDays = new Set(process.env.BS15I_TRAINING_BATCH_CONFIRMATION === '1' ? [0, 7] : [0, 1, 3, 7])
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  const collectGarbage = () => { if (gc !== undefined) { gc(); gc() } }
  const checkpoints: Record<number, ReturnType<typeof memoryAndCollections>> = {}
  const phases: Record<string, { ms: number; calls: number; maxMs: number }> = {}
  const dailyPhases: Record<string, Record<string, number>> = {}
  collectGarbage()
  checkpoints[0] = memoryAndCollections(world)
  const seed = new SeededRandomSource(15015)
  for (let draw = 0; draw < Object.values(world.games).filter(game => game.status === 'completed').length; draw += 1) seed.nextInt(0, 0xffff_ffff)
  const started = performance.now()
  const result = simulateUntilDate(world, addDays(startDate, 7), () => seed.nextInt(0, 0xffff_ffff), {
    onDayAdvance: (day) => {
      if (day.status === 'FAILED') throw new Error(`Memory triage failed at ${day.world.currentDate}: ${day.failure?.message}`)
      const phaseDay: Record<string, number> = {}
      for (const phase of day.phases) if (phase.ran && phase.elapsedMs !== undefined) {
        phaseDay[phase.phaseId] = phase.elapsedMs
        const total = phases[phase.phaseId] ?? { ms: 0, calls: 0, maxMs: 0 }
        total.ms += phase.elapsedMs
        total.calls += 1
        total.maxMs = Math.max(total.maxMs, phase.elapsedMs)
        phases[phase.phaseId] = total
      }
      dailyPhases[day.world.currentDate] = phaseDay
      const elapsedDays = Math.round((Date.parse(`${day.world.currentDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000)
      if (!checkpointDays.has(elapsedDays)) return
      collectGarbage()
      checkpoints[elapsedDays] = memoryAndCollections(day.world)
    },
  })
  const wallMs = performance.now() - started
  if (result.daysAdvanced !== 7 || result.world.currentDate !== addDays(startDate, 7)) throw new Error(`Expected 7 days, got ${result.daysAdvanced} through ${result.world.currentDate}`)
  const report = {
    source: savePath,
    startDate,
    endDate: result.world.currentDate,
    daysAdvanced: result.daysAdvanced,
    wallMs,
    totalPhaseMs: Object.values(phases).reduce((sum, phase) => sum + phase.ms, 0),
    phases: Object.fromEntries(Object.entries(phases).map(([name, phase]) => [name, { ...phase, meanMs: phase.ms / phase.calls }])),
    dailyPhases,
    forcedGcAvailable: gc !== undefined,
    checkpoints,
    semanticFingerprints: semanticFingerprints(result.world),
  }
  const outputPath = process.env.BS15I_TRAINING_MEMORY_OUTPUT ?? 'C:/Temp/BS15I-training-memory-checkpoints.json'
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I training memory] ${JSON.stringify(report)}\n`)
}, 30 * 60 * 1000)

it('BS15I focused training and AI planning profile from Y3 Save V4', async () => {
  if (process.env.BS15I_TRAINING_PROFILE !== '1') return
  const { progressAiTrainingPlanning } = await import('@/engine/training/TrainingPlanning')
  const savePath = process.env.BS15I_TRAINING_MEMORY_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'
  const loaded = deserializeGameWorldV4(JSON.parse(readFileSync(savePath, 'utf8')))
  const startDate = loaded.currentDate
  const seed = new SeededRandomSource(15015)
  for (let draw = 0; draw < Object.values(loaded.games).filter(game => game.status === 'completed').length; draw += 1) seed.nextInt(0, 0xffff_ffff)
  const days = Number(process.env.BS15I_TRAINING_PROFILE_DAYS ?? 3)
  if (!Number.isInteger(days) || days < 1 || days > 3) throw new Error(`Focused training profile must be 1–3 days, got ${days}`)
  const session = new Session()
  session.connect()
  const post = (method: string, params = {}) => new Promise<any>((resolve, reject) => session.post(method as any, params, (error, value) => error ? reject(error) : resolve(value)))
  await post('Profiler.enable')
  await post('Profiler.setSamplingInterval', { interval: 1000 })
  await post('Profiler.start')
  await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true })
  const planningWorld = { ...loaded, currentDate: addDays(startDate, 7) }
  const planningStarted = performance.now()
  const planningResult = progressAiTrainingPlanning(planningWorld)
  const plannerDirectMs = performance.now() - planningStarted
  const plannerDecisionCount = planningResult.decisions.length
  const plannerNewSessions = Object.keys(planningResult.world.scheduledTrainingSessionsById).length - Object.keys(planningWorld.scheduledTrainingSessionsById).length
  const phases: Record<string, number> = {}
  const dailyPhases: Record<string, Record<string, number>> = {}
  const simulated = simulateUntilDate(loaded, addDays(startDate, days), () => seed.nextInt(0, 0xffff_ffff), {
    onDayAdvance: (day) => {
      if (day.status === 'FAILED') throw new Error(`Training profile failed at ${day.world.currentDate}: ${day.failure?.message}`)
      const current: Record<string, number> = {}
      for (const phase of day.phases) if (phase.ran && phase.elapsedMs !== undefined) {
        current[phase.phaseId] = phase.elapsedMs
        phases[phase.phaseId] = (phases[phase.phaseId] ?? 0) + phase.elapsedMs
      }
      dailyPhases[day.world.currentDate] = current
    },
  })
  const coverage = await post('Profiler.takePreciseCoverage')
  const profileResult = await post('Profiler.stop')
  await post('Profiler.stopPreciseCoverage')
  session.disconnect()
  const report = {
    source: savePath,
    startDate,
    endDate: simulated.world.currentDate,
    daysAdvanced: simulated.daysAdvanced,
    plannerAtWeeklyCheckpoint: { date: planningWorld.currentDate, ms: plannerDirectMs, decisions: plannerDecisionCount, sessionsAdded: plannerNewSessions },
    internalOperationTimings: trainingMeasurements.operations,
    phaseMs: phases,
    dailyPhases,
    functionCounts: functionCounts(coverage, 'TrainingPlanning.ts', ['createTrainingPlanningIndexes', 'buildTrainingPlanningContext', 'progressAiTrainingPlanning', 'eligibleTrainingDates']),
    scheduledTrainingFunctionCounts: functionCounts(coverage, 'ScheduledTrainingEngine.ts', ['executeScheduledTrainingSessionsWithEvidence', 'executeScheduledSession', 'dailyScheduledLoad', 'scheduledTrainingSessionsOnDate', 'scheduleTrainingSession']),
    validationFunctionCounts: functionCounts(coverage, 'GameWorld.ts', ['assertTrainingSessionsAppendOnly', 'validateScheduledTrainingHistory', 'validateWorld', 'buildGameWorldUpdate']),
    topFunctions: topSelfTime(profileResult.profile),
    finalState: semanticFingerprints(simulated.world),
  }
  const outputPath = process.env.BS15I_TRAINING_PROFILE_OUTPUT ?? 'C:/Temp/BS15I-training-day-profile-before.json'
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  writeFileSync(outputPath.replace(/\.json$/i, '.cpuprofile'), JSON.stringify(profileResult.profile))
  process.stdout.write(`[BS15I focused training profile] ${JSON.stringify(report)}\n`)
}, 30 * 60 * 1000)

it('BS15I isolated training execution microbenchmark on loaded Y3 world', () => {
  if (process.env.BS15I_TRAINING_MICROBENCH !== '1') return
  const savePath = process.env.BS15I_TRAINING_MEMORY_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'
  const loaded = deserializeGameWorldV4(JSON.parse(readFileSync(savePath, 'utf8')))
  const executionDate = addDays(loaded.currentDate, 1)
  const world = { ...loaded, currentDate: executionDate }
  const due = Object.values(world.scheduledTrainingSessionsById).filter(session => session.date === executionDate && session.status === 'scheduled').length
  const started = performance.now()
  const result = executeScheduledTrainingSessionsWithEvidence(world)
  const elapsedMs = performance.now() - started
  const report = {
    source: savePath,
    initialDate: loaded.currentDate,
    executionDate,
    worldDateAfter: result.world.currentDate,
    dueSessions: due,
    executedSessions: Object.values(result.world.scheduledTrainingSessionsById).filter(session => session.date === executionDate && session.status === 'completed').length,
    elapsedMs,
    state: semanticFingerprints(result.world),
  }
  const outputPath = process.env.BS15I_TRAINING_MICROBENCH_OUTPUT ?? 'C:/Temp/BS15I-training-execution-microbench-before.json'
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I training execution microbenchmark] ${JSON.stringify(report)}\n`)
}, 30 * 60 * 1000)

it('BS15I isolated AI training planning microbenchmark on loaded Y3 world', async () => {
  if (process.env.BS15I_PLANNING_MICROBENCH !== '1') return
  const { progressAiTrainingPlanning } = await import('@/engine/training/TrainingPlanning')
  const savePath = process.env.BS15I_TRAINING_MEMORY_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'
  const loaded = deserializeGameWorldV4(JSON.parse(readFileSync(savePath, 'utf8')))
  const world = { ...loaded, currentDate: addDays(loaded.currentDate, 7) }
  const inputState = semanticFingerprints(world)
  const sessionsBefore = Object.keys(world.scheduledTrainingSessionsById).length
  trainingMeasurements.operations = {}
  const started = performance.now()
  const result = progressAiTrainingPlanning(world)
  const elapsedMs = performance.now() - started
  const report = {
    source: savePath,
    initialDate: loaded.currentDate,
    planningDate: world.currentDate,
    worldDateAfter: result.world.currentDate,
    decisions: result.decisions.length,
    decisionFingerprint: createHash('sha256').update(JSON.stringify(result.decisions)).digest('hex'),
    sessionsAdded: Object.keys(result.world.scheduledTrainingSessionsById).length - sessionsBefore,
    recordCopies: trainingMeasurements.operations.recordClone?.calls ?? 0,
    recordEntriesCopied: Array.from({ length: trainingMeasurements.operations.recordClone?.calls ?? 0 }, (_, index) => sessionsBefore + index).reduce((sum, count) => sum + count, 0),
    elapsedMs,
    operations: trainingMeasurements.operations,
    inputState,
    state: semanticFingerprints(result.world),
  }
  const outputPath = process.env.BS15I_PLANNING_MICROBENCH_OUTPUT ?? 'C:/Temp/BS15I-ai-planning-microbench-before.json'
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I AI planning microbenchmark] ${JSON.stringify(report)}\n`)
}, 30 * 60 * 1000)

function memoryAndCollections(world: GameWorld) {
  const sessions = Object.values(world.scheduledTrainingSessionsById)
  const players = Object.values(world.players)
  return {
    memory: process.memoryUsage(),
    collections: {
      players: players.length,
      activePlayers: players.filter(player => player.careerEnd === undefined).length,
      persons: Object.keys(world.personsById).length,
      completedTrainingSessions: sessions.filter(session => session.status === 'completed').length,
      scheduledTrainingSessions: sessions.length,
      trainingExecutions: sessions.filter(session => session.execution !== undefined).length,
      trainingExecutionParticipants: sessions.reduce((sum, session) => sum + (session.execution?.participants.length ?? 0), 0),
      trainingRatingHistoryPlayers: Object.keys(world.playerRatingHistoryByPlayerId).length,
      recruitProfiles: Object.keys(world.recruitProfilesById).length,
      scoutingAssignments: Object.keys(world.scoutingAssignmentsById).length,
      scoutingReports: Object.keys(world.evaluatorReportsById).length,
      organizationKnowledge: world.organizationKnowledge.length,
      games: Object.keys(world.games).length,
      completedGames: Object.values(world.games).filter(game => game.status === 'completed').length,
      injuries: Object.keys(world.injuriesById).length,
      academicRecords: Object.keys(world.academicTermRecordsById).length,
      portalEntries: Object.keys(world.transferPortalEntriesById).length,
      drafts: Object.keys(world.draftsById).length,
      contracts: Object.keys(world.contractsById).length,
      developmentStimulusEvents: Object.keys(world.developmentStimulusEventsById).length,
      matchHistory: Object.keys(world.matchStatLogsByGameId).length,
      recruitingActionHistory: Object.keys(world.recruitingActionHistoryById).length,
      playerPathwayHistoryRecords: players.reduce((sum, player) => sum + (player.pathwayHistory?.length ?? 0), 0),
    },
  }
}

function semanticFingerprints(world: GameWorld) {
  const sorted = (value: object) => Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
  const categories: Record<string, unknown> = {
    date: world.currentDate,
    rosters: sorted(Object.fromEntries(Object.entries(world.teams).map(([id, team]) => [id, team.rosterPlayerIds]))),
    games: sorted(world.games),
    matchHistory: sorted(world.matchStatLogsByGameId),
    training: sorted(world.scheduledTrainingSessionsById),
    playerState: sorted(world.players),
    fatigue: sorted(world.careerFatigueByPlayerId),
    injuries: sorted(world.injuriesById),
    aiPlans: sorted(world.trainingPlansByTeamId),
    recruiting: { cycles: sorted(world.recruitingCyclesById), profiles: sorted(world.recruitProfilesById), actions: sorted(world.recruitingActionHistoryById), offers: sorted(world.recruitingOffersById), visits: sorted(world.recruitingVisitsById), commitments: sorted(world.recruitingCommitmentsById), signings: sorted(world.recruitSigningsById) },
    talent: { cohorts: sorted(world.talentCohortsById), materializations: sorted(world.talentMaterializationsByCandidateKey) },
    eligibility: { registrations: sorted(world.playerRegistrationsById), enrollments: sorted(world.playerEnrollmentsById), assessments: sorted(world.collegeEligibilityAssessmentsById), restrictions: sorted(world.eligibilityRestrictionsById), academics: sorted(world.academicTermRecordsById) },
    portal: { rules: sorted(world.transferPortalRulesetsById), entries: sorted(world.transferPortalEntriesById) },
    draft: { drafts: sorted(world.draftsById), picks: sorted(world.draftPicksById) },
    contracts: sorted(world.contractsById),
    identities: { players: Object.values(world.players).map(player => [player.id, player.personId ?? player.id]).sort(([left], [right]) => String(left).localeCompare(String(right))), persons: Object.keys(world.personsById).sort() },
  }
  return Object.fromEntries(Object.entries(categories).map(([name, value]) => [name, createHash('sha256').update(JSON.stringify(value)).digest('hex')]))
}

function functionCounts(coverage: any, fileFragment: string, names: readonly string[]) {
  const counts = Object.fromEntries(names.map(name => [name, 0])) as Record<string, number>
  for (const script of coverage.result ?? []) {
    if (!String(script.url).includes(fileFragment)) continue
    for (const fn of script.functions ?? []) if (fn.functionName in counts) counts[fn.functionName] += fn.ranges?.[0]?.count ?? 0
  }
  return counts
}

function topSelfTime(profile: any) {
  const byId = new Map<number, any>(profile.nodes.map((node: any) => [node.id, node]))
  const microsById = new Map<number, number>()
  for (let index = 0; index < profile.samples.length; index += 1) microsById.set(profile.samples[index], (microsById.get(profile.samples[index]) ?? 0) + (profile.timeDeltas[index] ?? 0))
  return [...microsById].map(([id, micros]) => {
    const frame = byId.get(id)?.callFrame ?? {}
    return { function: frame.functionName || '(anonymous)', url: frame.url, line: frame.lineNumber === undefined ? undefined : frame.lineNumber + 1, selfMs: micros / 1000 }
  }).sort((left, right) => right.selfMs - left.selfMs).slice(0, 30)
}
