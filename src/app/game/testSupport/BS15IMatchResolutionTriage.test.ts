import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Session } from 'node:inspector'
import { it, vi } from 'vitest'
import { addDays } from '@/domain/date'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { SeededRandomSource } from '@/engine/random'
import { getScheduledGamesToday } from '@/engine/calendar'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { advanceGameDayWithResult } from '@/app/game/advanceGameDay'
import { updateGameWorld, type GameWorld } from '@/domain/world'

const measurements = vi.hoisted(() => ({
  insideMatch: false,
  timings: {} as Record<string, { ms: number; calls: number; maxMs: number }>,
  gameIds: [] as string[],
  injuryValidationCalls: 0,
  injuryValidationCaller: '',
}))

vi.mock('@/domain/injury', async (loadActual) => {
  const actual = await loadActual<typeof import('@/domain/injury')>()
  return { ...actual, createInjury: (...args: Parameters<typeof actual.createInjury>) => {
    if (measurements.insideMatch && process.env.BS15I_MATCH_TRIAGE_COUNT_INJURIES === '1') {
      const stack = new Error().stack ?? ''
      if (stack.includes('validateInjury')) {
        measurements.injuryValidationCalls += 1
        if (!measurements.injuryValidationCaller) measurements.injuryValidationCaller = stack.split('\n').slice(1, 8).join('\n')
      }
    }
    return actual.createInjury(...args)
  } }
})

vi.mock('@/app/game/playUserGame', async (loadActual) => {
  const actual = await loadActual<typeof import('@/app/game/playUserGame')>()
  return { ...actual, simulateAndApplyGame: (...args: Parameters<typeof actual.simulateAndApplyGame>) => {
    const wasInside = measurements.insideMatch
    measurements.insideMatch = true
    measurements.gameIds.push(args[1].id)
    return timed('SIMULATE_AND_APPLY_GAME', () => actual.simulateAndApplyGame(...args), true, () => { measurements.insideMatch = wasInside })
  } }
})

vi.mock('@/engine/match', async (loadActual) => {
  const actual = await loadActual<typeof import('@/engine/match')>()
  return {
    ...actual,
    simulateMatchWithRotations: (...args: Parameters<typeof actual.simulateMatchWithRotations>) => timed('MATCH_ENGINE', () => actual.simulateMatchWithRotations(...args)),
    applyCompletedMatch: (...args: Parameters<typeof actual.applyCompletedMatch>) => timed('RESULT_AND_HISTORY_APPLICATION', () => actual.applyCompletedMatch(...args)),
  }
})

vi.mock('@/app/game/PlayerMatchConsequences', async (loadActual) => {
  const actual = await loadActual<typeof import('@/app/game/PlayerMatchConsequences')>()
  return { ...actual, applyPlayerMatchConsequences: (...args: Parameters<typeof actual.applyPlayerMatchConsequences>) => timed('PLAYER_STATS_TRAINING_FATIGUE_CONSEQUENCES', () => actual.applyPlayerMatchConsequences(...args)) }
})

vi.mock('@/engine/injury', async (loadActual) => {
  const actual = await loadActual<typeof import('@/engine/injury')>()
  return { ...actual, applyPostMatchInjuries: (...args: Parameters<typeof actual.applyPostMatchInjuries>) => timed('INJURY_GENERATION_AND_INSERTION', () => actual.applyPostMatchInjuries(...args)) }
})

vi.mock('@/app/gmPlanning', async (loadActual) => {
  const actual = await loadActual<typeof import('@/app/gmPlanning')>()
  return { ...actual, reviewMajorInjuryChanges: (...args: Parameters<typeof actual.reviewMajorInjuryChanges>) => timed('POST_MATCH_INJURY_AND_ROSTER_REVIEW', () => actual.reviewMajorInjuryChanges(...args)) }
})

vi.mock('@/domain/world', async (loadActual) => {
  const actual = await loadActual<typeof import('@/domain/world')>()
  return {
    ...actual,
    updateGameWorld: (...args: Parameters<typeof actual.updateGameWorld>) => timed('UPDATE_GAME_WORLD_AND_VALIDATION', () => actual.updateGameWorld(...args)),
    updateGameWorldBatch: (world: GameWorld, execute: Parameters<typeof actual.updateGameWorldBatch>[1]) => timed('UPDATE_GAME_WORLD_BATCH_AND_VALIDATION', () => actual.updateGameWorldBatch(world, execute)),
  }
})

it('BS15I profiles the first mature-world match day and injury validation', async () => {
  if (process.env.BS15I_MATCH_TRIAGE_PROFILE !== '1') return
  const savePath = process.env.BS15I_FAST_TRIAGE_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'
  let world = deserializeGameWorldV4(JSON.parse(readFileSync(savePath, 'utf8')))
  const initialDate = world.currentDate
  const seed = seededFromCompletedGames(world)
  const matchDate = '2035-10-05' as GameWorld['currentDate']
  const warmup = simulateUntilDate(world, addDays(matchDate, -1), () => seed.nextInt(0, 0xffff_ffff))
  world = warmup.world
  world = advanceGameDayWithResult(world, () => seed.nextInt(0, 0xffff_ffff)).world
  if (world.currentDate !== matchDate) throw new Error(`Expected first match date ${matchDate}, got ${world.currentDate}; stop=${warmup.stopReason.type}`)
  const scheduled = getScheduledGamesToday(world)
  if (scheduled.length !== 4) throw new Error(`Expected four games on ${matchDate}, got ${scheduled.length}`)

  measurements.gameIds.length = 0
  measurements.timings = {}
  measurements.injuryValidationCalls = 0
  measurements.injuryValidationCaller = ''
  const session = new Session()
  session.connect()
  const post = (method: string, params = {}) => new Promise<any>((resolve, reject) => session.post(method as any, params, (error, value) => error ? reject(error) : resolve(value)))
  await post('Profiler.enable')
  await post('Profiler.setSamplingInterval', { interval: 1000 })
  await post('Profiler.start')
  await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true })
  const started = performance.now()
  try {
    const day = advanceGameDayWithResult(world, () => seed.nextInt(0, 0xffff_ffff))
    const matchPhase = day.phases.find((phase) => phase.phaseId === 'MATCH_RESOLUTION')
    if (matchPhase?.ran !== true) throw new Error('The target match day did not run MATCH_RESOLUTION')
    world = day.world
    if (world.currentDate !== addDays(matchDate, 1)) throw new Error(`Match-day boundary ended at ${world.currentDate}`)
    const wallMs = performance.now() - started
    const profileResult = await post('Profiler.stop')
    const coverage = await post('Profiler.takePreciseCoverage')
    const topFunctions = aggregateProfile(profileResult.profile)
    const validateInjuryCalls = functionCallCount(coverage, 'validateInjury', 'GameWorld.ts')
    const callCounts = Object.fromEntries(['validateWorld', 'validateUpdatedGameWorld', 'buildGameWorldUpdate', 'validateInjury', 'validateScheduledTrainingHistory', 'validateDevelopmentStimulusHistory', 'assertTrainingSessionsAppendOnly', 'assertImmutableCollection', 'indexById'].map(name => [name, functionCallCount(coverage, name, 'GameWorld.ts')]))
    const report = {
      source: savePath,
      initialDate,
      matchDate,
      endDate: world.currentDate,
      daysAdvancedToMatchDate: warmup.daysAdvanced,
      gamesScheduled: scheduled.length,
      gamesResolved: measurements.gameIds.length,
      gameIds: measurements.gameIds,
      matchResolution: { ms: matchPhase.elapsedMs ?? 0, calls: 1, meanMs: matchPhase.elapsedMs ?? 0, maxMs: matchPhase.elapsedMs ?? 0 },
      instrumentedMatchOperations: Object.fromEntries(Object.entries(measurements.timings).map(([name, timing]) => [name, { ...timing, meanMs: timing.ms / timing.calls, percentMatchResolution: (timing.ms * 100) / (matchPhase.elapsedMs || 1), inclusive: ['SIMULATE_AND_APPLY_GAME', 'RESULT_AND_HISTORY_APPLICATION'].includes(name) }])),
      validateInjury: {
        calls: validateInjuryCalls,
      instrumentedCalls: measurements.injuryValidationCalls,
      firstObservedStack: measurements.injuryValidationCaller,
        cpuSelfMs: topFunctions.find(item => item.function === 'validateInjury' && item.file.endsWith('GameWorld.ts'))?.selfMs ?? 0,
        meanCpuSelfMs: validateInjuryCalls === 0 ? 0 : (topFunctions.find(item => item.function === 'validateInjury' && item.file.endsWith('GameWorld.ts'))?.selfMs ?? 0) / validateInjuryCalls,
        injuryCollectionSize: Object.keys(world.injuriesById).length,
        callCounts,
        callerPaths: callerPaths(profileResult.profile, 'validateInjury', 'GameWorld.ts'),
      },
      updateGameWorld: { calls: measurements.timings.UPDATE_GAME_WORLD_AND_VALIDATION?.calls ?? 0, inclusiveMs: measurements.timings.UPDATE_GAME_WORLD_AND_VALIDATION?.ms ?? 0, maxMs: measurements.timings.UPDATE_GAME_WORLD_AND_VALIDATION?.maxMs ?? 0 },
      finalState: semanticFingerprints(world, measurements.gameIds),
      topFunctions,
      wallMs,
    }
    const outputPath = process.env.BS15I_MATCH_TRIAGE_OUTPUT ?? 'C:/Temp/BS15I-match-day-before.json'
    writeFileSync(outputPath, JSON.stringify(report, null, 2))
    writeFileSync(outputPath.replace(/\.json$/i, '.cpuprofile'), JSON.stringify(profileResult.profile))
    process.stdout.write(`[BS15I match day profile] ${JSON.stringify(report)}\n`)
  } finally {
    session.disconnect()
  }
}, 30 * 60 * 1000)

it('BS15I microbenchmarks unchanged Y3 world validation without calendar advance', () => {
  if (process.env.BS15I_MATCH_TRIAGE_BENCHMARK !== '1') return
  const savePath = process.env.BS15I_FAST_TRIAGE_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'
  let world = deserializeGameWorldV4(JSON.parse(readFileSync(savePath, 'utf8')))
  const iterations = 12
  for (let index = 0; index < 2; index += 1) world = updateGameWorld(world, { currentDate: world.currentDate })
  const started = performance.now()
  let updateMs = 0
  let updateCalls = 0
  for (let index = 0; index < iterations; index += 1) {
    const updateStarted = performance.now()
    world = updateGameWorld(world, { currentDate: world.currentDate })
    updateMs += performance.now() - updateStarted
    updateCalls += 1
  }
  const report = { source: savePath, date: world.currentDate, injuryCount: Object.keys(world.injuriesById).length, iterations, elapsedMs: performance.now() - started, updateMs, updateCalls }
  const outputPath = process.env.BS15I_MATCH_TRIAGE_BENCH_OUTPUT ?? 'C:/Temp/BS15I-injury-validation-microbench.json'
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I injury validation microbenchmark] ${JSON.stringify(report)}\n`)
}, 30 * 60 * 1000)

function timed<T>(name: string, action: () => T, force = false, after?: () => void): T {
  if (!force && !measurements.insideMatch) return action()
  const started = performance.now()
  try { return action() }
  finally {
    const elapsed = performance.now() - started
    const current = measurements.timings[name] ?? { ms: 0, calls: 0, maxMs: 0 }
    current.ms += elapsed
    current.calls += 1
    current.maxMs = Math.max(current.maxMs, elapsed)
    measurements.timings[name] = current
    after?.()
  }
}

function seededFromCompletedGames(world: GameWorld) {
  const seed = new SeededRandomSource(15015)
  for (let count = 0; count < Object.values(world.games).filter(game => game.status === 'completed').length; count += 1) seed.nextInt(0, 0xffff_ffff)
  return seed
}

function aggregateProfile(profile: any) {
  const nodes = new Map<number, any>(profile.nodes.map((node: any) => [node.id, node]))
  const times = new Map<number, number>()
  for (let index = 0; index < profile.samples.length; index += 1) times.set(profile.samples[index], (times.get(profile.samples[index]) ?? 0) + (profile.timeDeltas[index] ?? 0))
  const grouped = new Map<string, { function: string; file: string; line: number; selfMs: number; samples: number }>()
  for (const [id, micros] of times) {
    const node = nodes.get(id)
    const frame = node?.callFrame ?? {}
    const file = String(frame.url ?? '')
    const functionName = String(frame.functionName || '(anonymous)')
    const line = Number(frame.lineNumber ?? -1) + 1
    const key = `${functionName}|${file}|${line}`
    const current = grouped.get(key) ?? { function: functionName, file, line, selfMs: 0, samples: 0 }
    current.selfMs += micros / 1000
    current.samples += node?.hitCount ?? 0
    grouped.set(key, current)
  }
  return [...grouped.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 70)
}

function functionCallCount(coverage: any, functionName: string, fileFragment: string): number {
  return coverage.result.filter((script: any) => String(script.url).includes(fileFragment))
    .flatMap((script: any) => script.functions)
    .filter((fn: any) => fn.functionName === functionName)
    .reduce((sum: number, fn: any) => sum + (fn.ranges?.[0]?.count ?? 0), 0)
}

function callerPaths(profile: any, functionName: string, fileFragment: string): string[][] {
  const byId = new Map<number, any>(profile.nodes.map((node: any) => [node.id, node]))
  const parents = new Map<number, number>()
  for (const node of profile.nodes) for (const childId of node.children ?? []) parents.set(childId, node.id)
  const paths = new Set<string>()
  for (const node of profile.nodes) {
    const frame = node.callFrame ?? {}
    if (frame.functionName !== functionName || !String(frame.url).includes(fileFragment)) continue
    const path: string[] = []
    let current = node.id
    while (current !== undefined) {
      const item = byId.get(current)
      if (item === undefined) break
      const currentFrame = item.callFrame ?? {}
      path.unshift(`${currentFrame.functionName || '(anonymous)'}${currentFrame.url ? ` (${String(currentFrame.url).split('/').pop()}:${(currentFrame.lineNumber ?? -1) + 1})` : ''}`)
      current = parents.get(current) as number
    }
    paths.add(path.slice(-7).join(' ← '))
  }
  return [...paths].slice(0, 12).map(path => path.split(' ← '))
}

function semanticFingerprints(world: GameWorld, gameIds: readonly string[]) {
  const sortRecord = (value: object) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
  const onlyMatchStats = Object.fromEntries(gameIds.map(id => [id, world.matchStatLogsByGameId[id as keyof typeof world.matchStatLogsByGameId]]))
  const state: Record<string, unknown> = {
    date: world.currentDate,
    games: sortRecord(Object.fromEntries(gameIds.map(id => [id, world.games[id as keyof typeof world.games]]))),
    boxscores: sortRecord(onlyMatchStats),
    playerStats: sortRecord(world.players),
    fatigue: sortRecord(world.careerFatigueByPlayerId),
    injuries: sortRecord(world.injuriesById),
    rosters: sortRecord(Object.fromEntries(Object.entries(world.teams).map(([id, team]) => [id, team.rosterPlayerIds]))),
    contracts: sortRecord(world.contractsById),
    histories: { matchStats: sortRecord(onlyMatchStats), coachCareer: sortRecord(world.coachCareerHistoryByCoachId), stimulusEvents: sortRecord(world.developmentStimulusEventsById) },
    identities: { players: Object.values(world.players).map(player => [player.id, player.personId ?? player.id]).sort(([a], [b]) => String(a).localeCompare(String(b))), persons: Object.keys(world.personsById).sort() },
    eligibility: { registrations: sortRecord(world.playerRegistrationsById), assessments: sortRecord(world.collegeEligibilityAssessmentsById), enrollments: sortRecord(world.playerEnrollmentsById), profiles: sortRecord(world.eligibilityProfilesById) },
  }
  return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, createHash('sha256').update(JSON.stringify(value)).digest('hex')]))
}
