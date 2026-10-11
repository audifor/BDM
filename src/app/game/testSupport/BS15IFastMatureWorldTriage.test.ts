import { expect, it, vi } from 'vitest'
import { Session } from 'node:inspector'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { SeededRandomSource } from '@/engine/random'
import { simulateUntilDate } from '@/app/game/simulateUntilDate'
import { addDays, parseGameDate } from '@/domain/date'
import { findCollidingSession } from '@/domain/training'
import { scheduledTrainingSessionsOnDate } from '@/engine/training/ScheduledTrainingEngine'
import { assertLongHorizonIntegrity } from './TalentLongHorizonCertification'
import { readLargeSaveV4File, writeLargeSaveV4File } from './LargeSaveV4File'
import { scalePayloadFingerprints } from './ScaleSaveCertification'
import { createLongHorizonMutationGuard } from './LongHorizonMutationGuard'
import { collectNcaaContinuity } from './NcaaContinuityCertification'
import { resolveSimulationDetail } from '@/app/worldSim/SimulationResolutionPolicy'
import { getWorldValidationReport } from '@/domain/world'
import type { GameWorld } from '@/domain/world'

const tiers = vi.hoisted(() => ({ FULL: 0, STANDARD: 0, BACKGROUND: 0 }))
vi.mock('@/app/game/playUserGame', async original => {
  const actual = await original<typeof import('@/app/game/playUserGame')>()
  return { ...actual, simulateAndApplyGame: (...args: Parameters<typeof actual.simulateAndApplyGame>) => {
    tiers[resolveSimulationDetail(args[0], args[1], args[4])] += 1
    return actual.simulateAndApplyGame(...args)
  } }
})

const measured = vi.hoisted(() => ({ updateMs: 0, updateCalls: 0, updateMaxMs: 0, batchMs: 0, batchCalls: 0, batchUpdateCalls: 0, batchMaxMs: 0, portalMs: 0, portalCalls: 0, portalMaxMs: 0 }))
vi.mock('@/domain/world', async (original) => {
  const actual = await original<typeof import('@/domain/world')>()
  return {
    ...actual,
    updateGameWorld: (...args: Parameters<typeof actual.updateGameWorld>) => {
      const started = performance.now()
      try { return actual.updateGameWorld(...args) }
      finally { const ms = performance.now() - started; measured.updateMs += ms; measured.updateCalls += 1; measured.updateMaxMs = Math.max(measured.updateMaxMs, ms) }
    },
    updateGameWorldBatch: (world: GameWorld, execute: Parameters<typeof actual.updateGameWorldBatch>[1]) => {
      const started = performance.now()
      try { return actual.updateGameWorldBatch(world, (initial, update) => execute(initial, (current, patch) => { measured.batchUpdateCalls += 1; return update(current, patch) })) }
      finally { const ms = performance.now() - started; measured.batchMs += ms; measured.batchCalls += 1; measured.batchMaxMs = Math.max(measured.batchMaxMs, ms) }
    },
  }
})
vi.mock('@/engine/eligibility/CollegeTransferAI', async (original) => {
  const actual = await original<typeof import('@/engine/eligibility/CollegeTransferAI')>()
  return { ...actual, runCollegeRosterContinuationAndTransferAI: (...args: Parameters<typeof actual.runCollegeRosterContinuationAndTransferAI>) => {
    const started = performance.now()
    try { return actual.runCollegeRosterContinuationAndTransferAI(...args) }
    finally { const ms = performance.now() - started; measured.portalMs += ms; measured.portalCalls += 1; measured.portalMaxMs = Math.max(measured.portalMaxMs, ms) }
  } }
})

it('BS15I deterministic mature-world profile from canonical Save V4', async () => {
  if (process.env.BS15I_FAST_TRIAGE_7D !== '1') return
  const savePath = process.env.BS15I_FAST_TRIAGE_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'
  let world = deserializeGameWorldV4(readLargeSaveV4File(savePath))
  const days = Number(process.env.BS15I_FAST_TRIAGE_DAYS ?? 7)
  if (!Number.isInteger(days) || days <= 0) throw new Error(`Invalid triage day count: ${days}`)
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  const seed = new SeededRandomSource(15015)
  for (let draw = 0; draw < Object.values(world.games).filter(game => game.status === 'completed').length; draw += 1) seed.nextInt(0, 0xffff_ffff)
  const warmupStarted = performance.now()
  const warmupTarget = process.env.BS15I_FAST_TRIAGE_WARMUP_TARGET
  if (warmupTarget) {
    const prepared = simulateUntilDate(world, parseGameDate(warmupTarget), () => seed.nextInt(0, 0xffff_ffff))
    world = prepared.world
    expect(world.currentDate).toBe(warmupTarget)
    const fixturePath = process.env.BS15I_FAST_TRIAGE_WARMUP_SAVE
    if (fixturePath) writeLargeSaveV4File(fixturePath, serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`))
  }
  const warmupMs = performance.now() - warmupStarted
  for (const key of Object.keys(measured)) measured[key as keyof typeof measured] = 0
  tiers.FULL = 0; tiers.STANDARD = 0; tiers.BACKGROUND = 0
  const startDate = world.currentDate
  gc?.()
  const start = snapshot(world)
  const mutationGuard = createLongHorizonMutationGuard(world)
  const session = new Session()
  session.connect()
  const post = (method: string, params = {}) => new Promise<any>((resolve, reject) => session.post(method as any, params, (error, value) => error ? reject(error) : resolve(value)))
  const cpuProfileEnabled = process.env.BS15I_FAST_TRIAGE_CPU_PROFILE !== '0'
  if (cpuProfileEnabled) {
    await post('Profiler.enable')
    await post('Profiler.setSamplingInterval', { interval: 1000 })
    await post('Profiler.start')
  }
  const validationBlocks: Record<string, { ms: number; calls: number; reused: number }> = {}
  const dirtyCollections: Record<string, number> = {}
  const phases: Record<string, { ms: number; calls: number; maxMs: number }> = {}
  const dailyMemory: { date: string; rss: number; heapUsed: number }[] = []
  const startedAt = performance.now()
  const cpuStarted = process.cpuUsage()
  try {
    const result = simulateUntilDate(world, addDays(startDate, days), () => seed.nextInt(0, 0xffff_ffff), {
      simulationContext: { ...(process.env.BS15I_SCALE_FORCE_FULL === '1' ? { forceDetail: 'FULL' as const } : {}), dailyValidationMode: process.env.BS15I_DAILY_VALIDATION_REFERENCE === '1' ? 'full' : 'incremental' },
      onSeasonLifecycle: (ms) => record('SEASON_LIFECYCLE', ms),
      onDayAdvance: (day) => {
        if (day.status === 'FAILED') throw new Error(`${days}-day profile failed at ${day.world.currentDate}: ${day.failure?.message}`)
        const validation = getWorldValidationReport(day.world)
        for (const [key, block] of Object.entries(validation?.blocks ?? {})) {
          const total = validationBlocks[key] ?? { ms: 0, calls: 0, reused: 0 }
          total.ms += block.elapsedMs; total.calls++; total.reused += Number(block.reused); validationBlocks[key] = total
        }
        for (const key of validation?.dirtyCollections ?? []) dirtyCollections[key] = (dirtyCollections[key] ?? 0) + 1
        mutationGuard(day.world)
        for (const phase of day.phases) if (phase.ran && phase.elapsedMs !== undefined) record(phase.phaseId, phase.elapsedMs)
        const memory = process.memoryUsage()
        dailyMemory.push({ date: day.world.currentDate, rss: memory.rss, heapUsed: memory.heapUsed })
      },
    })
    world = result.world
    if (world.currentDate !== addDays(startDate, days)) throw new Error(`${days}-day profile ended at ${world.currentDate}; stop=${result.stopReason.type}`)
    const wallMs = performance.now() - startedAt
    const cpu = process.cpuUsage(cpuStarted)
    const profileResult = cpuProfileEnabled ? await post('Profiler.stop') : undefined
    assertLongHorizonIntegrity(world)
    const ncaa = collectNcaaContinuity(world)
    expect(ncaa.teams.filter(team => team.deficit > 0)).toEqual([])
    gc?.()
    const after = snapshot(world)
    for (const phase of Object.values(phases)) (phase as { meanMs?: number }).meanMs = phase.ms / phase.calls
    const totalPhaseMs = Object.values(phases).reduce((sum, phase) => sum + phase.ms, 0)
    const phaseReport = Object.fromEntries(Object.entries(phases).map(([key, phase]) => [key, { ...phase, percentTotal: totalPhaseMs ? phase.ms * 100 / totalPhaseMs : 0 }]))
    const topFunctions = profileResult === undefined ? [] : topSelfTime(profileResult.profile)
    const report = { validationBlocks, dirtyCollections, validationMode: process.env.BS15I_DAILY_VALIDATION_REFERENCE === '1' ? 'full' : 'incremental', warmupMs, payloadFingerprints: scalePayloadFingerprints(serializeGameWorldV4(world, `${world.currentDate}T00:00:00.000Z`)), startDate, endDate: world.currentDate, daysAdvanced: result.daysAdvanced, wallMs, cpuMs: (cpu.user + cpu.system) / 1000, totalPhaseMs, start, after, dailyMemory, semanticFingerprints: semanticFingerprints(world), phaseReport, wrappedFunctions: { ...measured }, gamesByTier: tiers, postGc: gc !== undefined, integrity: true, ncaa, topFunctions }
    const outputPath = process.env.BS15I_FAST_TRIAGE_OUTPUT ?? `C:/Temp/BS15I-y3-${days}day-profile.json`
    writeFileSync(outputPath, JSON.stringify(report, null, 2))
    if (profileResult !== undefined) writeFileSync(outputPath.replace(/\.json$/i, '.cpuprofile'), JSON.stringify(profileResult.profile))
    process.stdout.write(`[BS15I mature ${days}d profile] ${JSON.stringify({wallMs, gamesByTier: tiers, memory: after.memory, integrity: true})}\n`)
  } finally {
    session.disconnect()
  }

  function record(id: string, ms: number) {
    const current = phases[id] ?? { ms: 0, calls: 0, maxMs: 0 }
    current.ms += ms
    current.calls += 1
    current.maxMs = Math.max(current.maxMs, ms)
    phases[id] = current
  }
}, 30 * 60 * 1000)

it('BS15I measured immutable history copy alternatives', () => {
  if (process.env.BS15I_COPY_PROFILE !== '1') return
  const world = deserializeGameWorldV4(JSON.parse(readFileSync(process.env.BS15I_FAST_TRIAGE_SAVE!, 'utf8')))
  const source = world.developmentStimulusEventsById
  const report: Record<string, number> = { records: Object.keys(source).length }
  for (const [name, copy] of Object.entries({
    spread: () => ({ ...source }),
    assign: () => Object.assign({}, source),
    keys: () => { const next: Record<string, unknown> = {}; for (const key of Object.keys(source)) next[key] = source[key]; return next },
  })) {
    const started = performance.now()
    for (let run = 0; run < 5; run++) expect(Object.keys(copy()).length).toBe(report.records)
    report[name] = (performance.now() - started) / 5
  }
  writeFileSync('C:/Temp/BS15I-history-copy-profile.json', JSON.stringify(report, null, 2))
  console.log(report)
}, 120_000)

it('BS15I scheduled-session lookup microbenchmark on canonical Save V4', () => {
  if (process.env.BS15I_FAST_TRIAGE_BENCHMARK !== '1') return
  const savePath = process.env.BS15I_FAST_TRIAGE_SAVE ?? 'C:/Temp/BS15I-five-year-integrated-save-v4.2035-10-01.json'
  const world = deserializeGameWorldV4(readLargeSaveV4File(savePath))
  const all = Object.values(world.scheduledTrainingSessionsById)
  const exemplar = all[0]!
  const candidate = { ...exemplar, id: 'triage-benchmark-session', date: addDays(world.currentDate, 3650) }
  const iterations = 1000
  const beforeStarted = performance.now()
  for (let i = 0; i < iterations; i += 1) findCollidingSession(candidate, Object.values(world.scheduledTrainingSessionsById))
  const beforeMs = performance.now() - beforeStarted
  const afterStarted = performance.now()
  for (let i = 0; i < iterations; i += 1) findCollidingSession(candidate, scheduledTrainingSessionsOnDate(world.scheduledTrainingSessionsById, candidate.date))
  const afterMs = performance.now() - afterStarted
  const report = { source: savePath, sessions: all.length, iterations, beforeMs, afterMs, speedup: beforeMs / afterMs }
  const outputPath = process.env.BS15I_FAST_TRIAGE_BENCH_OUTPUT ?? 'C:/Temp/BS15I-y3-session-lookup-microbench.json'
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I lookup microbenchmark] ${JSON.stringify(report)}\n`)
}, 30 * 60 * 1000)

function topSelfTime(profile: any) {
  const byId = new Map(profile.nodes.map((node: any) => [node.id, node]))
  const samples = new Map<number, number>()
  for (let index = 0; index < profile.samples.length; index += 1) samples.set(profile.samples[index], (samples.get(profile.samples[index]) ?? 0) + (profile.timeDeltas[index] ?? 0))
  return [...samples].map(([id, micros]) => {
    const node = byId.get(id) as any
    const frame = node?.callFrame ?? {}
    return { function: frame.functionName || '(anonymous)', url: frame.url, line: frame.lineNumber === undefined ? undefined : frame.lineNumber + 1, selfMs: micros / 1000, hitCount: node?.hitCount ?? 0 }
  }).sort((a, b) => b.selfMs - a.selfMs).slice(0, 40)
}

function snapshot(world: GameWorld) {
  const rosteredIds = new Set(Object.values(world.teams).flatMap(team => team.rosterPlayerIds))
  const activePlayers = Object.values(world.players).filter(player => player.careerEnd === undefined)
  const collections = Object.fromEntries(Object.entries(world).filter(([key]) => /scouting|report|awareness|knowledge|training|history|games|contracts|transferPortal|drafts|pathway/i.test(key)).map(([key, value]) => [key, Array.isArray(value) ? value.length : value !== null && typeof value === 'object' ? Object.keys(value).length : 0]))
  return {
    players: Object.keys(world.players).length, activePlayers: activePlayers.length, rosteredPlayers: rosteredIds.size, unrosteredActivePlayers: activePlayers.filter(player => !rosteredIds.has(player.id)).length,
    recruitProfiles: Object.keys(world.recruitProfilesById).length, talentMaterializations: Object.keys(world.talentMaterializationsByCandidateKey).length,
    organizationKnowledge: world.organizationKnowledge.length, evaluatorReports: Object.keys(world.evaluatorReportsById).length, scoutingAssignments: Object.keys(world.scoutingAssignmentsById).length,
    trainingSessions: Object.keys(world.scheduledTrainingSessionsById).length, trainingHistory: Object.keys(world.playerRatingHistoryByPlayerId).length,
    games: Object.keys(world.games).length, completedGames: Object.values(world.games).filter(game => game.status === 'completed').length, matchHistory: Object.keys(world.matchStatLogsByGameId).length,
    contracts: Object.keys(world.contractsById).length, portal: Object.keys(world.transferPortalEntriesById).length, drafts: Object.keys(world.draftsById).length,
    pathwayHistoryRecords: Object.values(world.players).reduce((sum, player) => sum + (player.pathwayHistory?.length ?? 0), 0), collectionSizes: collections, memory: process.memoryUsage(),
  }
}

function semanticFingerprints(world: GameWorld) {
  const sortedRecord = (record: object) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
  const categories: Record<string, unknown> = {
    date: world.currentDate,
    rosters: sortedRecord(Object.fromEntries(Object.entries(world.teams).map(([id, team]) => [id, team.rosterPlayerIds]))),
    games: sortedRecord(world.games),
    matchHistory: sortedRecord(world.matchStatLogsByGameId),
    training: sortedRecord(world.scheduledTrainingSessionsById),
    recruiting: { cycles: sortedRecord(world.recruitingCyclesById), profiles: sortedRecord(world.recruitProfilesById), actions: sortedRecord(world.recruitingActionHistoryById), offers: sortedRecord(world.recruitingOffersById), visits: sortedRecord(world.recruitingVisitsById), commitments: sortedRecord(world.recruitingCommitmentsById), signings: sortedRecord(world.recruitSigningsById) },
    talent: { cohorts: sortedRecord(world.talentCohortsById), materializations: sortedRecord(world.talentMaterializationsByCandidateKey) },
    eligibility: { registrations: sortedRecord(world.playerRegistrationsById), enrollments: sortedRecord(world.playerEnrollmentsById), assessments: sortedRecord(world.collegeEligibilityAssessmentsById), restrictions: sortedRecord(world.eligibilityRestrictionsById), academics: sortedRecord(world.academicTermRecordsById) },
    portal: { rules: sortedRecord(world.transferPortalRulesetsById), entries: sortedRecord(world.transferPortalEntriesById) },
    draft: { drafts: sortedRecord(world.draftsById), picks: sortedRecord(world.draftPicksById) },
    contracts: sortedRecord(world.contractsById),
    identities: { players: Object.values(world.players).map(player => [player.id, player.personId ?? player.id]).sort(([a], [b]) => String(a).localeCompare(String(b))), persons: Object.keys(world.personsById).sort() },
  }
  return Object.fromEntries(Object.entries(categories).map(([name, value]) => [name, createHash('sha256').update(JSON.stringify(value)).digest('hex')]))
}
