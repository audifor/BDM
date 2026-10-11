import { snapshot, collectLongevityMetrics, assertAnnualIntegrity, assertNcaaMinimum, semanticDigest, verifyPersistedSave, memoryAfterGc, generationalReplacement, cohortJourneyExamples, assertKnowledgeRankingFairness, assertEffectiveRules, recruitingForecasts, rollingFiveYearFlows, requiredEnv, dayDifference } from './LongHorizonCheckpointAudit'
import { assessCollegeEligibility } from '@/engine/eligibility/EligibilityEngine'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { calculateAge } from '@/domain/player'
import { addYears, parseGameDate, type GameDate } from '@/domain/date'
import { getPlayerContractStatus } from '@/domain/contract'
import { deriveCollegeEligibilityClock, resolveCollegeRuleset } from '@/engine/eligibility'
import { rankNcaaWalkOnCandidates } from '@/engine/recruiting/NcaaWalkOnIntake'
import { evaluateAiDraftProspect } from '@/engine/draft/DraftEngine'
import { getRecruitingPlanningRoster } from '@/engine/recruiting/RecruitingRosterPlanning'
import { nbaDraftRulesForYear } from '@/domain/draft'
import type { PlayerId } from '@/domain/ids'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { validateGameWorld, getWorldValidationReport, type GameWorld } from '@/domain/world'
import { assertLongHorizonIntegrity, runTalentLongHorizonCertification, stableStringify } from './TalentLongHorizonCertification'
import { readLargeSaveV4File, writeLargeSaveV4File } from './LargeSaveV4File'
import { createLongHorizonMutationGuard } from './LongHorizonMutationGuard'
import { collectNcaaContinuity } from './NcaaContinuityCertification'
import { scaleWorldIdentity } from './ScaleSaveCertification'
import { resolveSimulationDetail } from '@/app/worldSim/SimulationResolutionPolicy'

const scaleTiers = vi.hoisted(() => ({ FULL: 0, STANDARD: 0, BACKGROUND: 0 }))
vi.mock('@/app/game/playUserGame', async original => {
  const actual = await original<typeof import('@/app/game/playUserGame')>()
  return { ...actual, simulateAndApplyGame: (...args: Parameters<typeof actual.simulateAndApplyGame>) => {
    scaleTiers[resolveSimulationDetail(args[0], args[1], args[4])] += 1
    return actual.simulateAndApplyGame(...args)
  } }
})

const MIN_PLAYABLE_ROSTER = 5
const CATASTROPHIC_PLAYER_LIMIT = 100_000

it('runs the BS15I long-horizon block with bounded checkpoint certification overhead', async () => {
  if (process.env.BS15I_LONG_HORIZON === '1') {
    if (typeof (globalThis as typeof globalThis & { gc?: () => void }).gc !== 'function') throw new Error('Longevity worker must expose GC for retained-heap certification')
    const startPath = requiredEnv('BS15I_LONG_START_SAVE_PATH')
    const targetDate = parseGameDate(requiredEnv('BS15I_LONG_TARGET_DATE'))
    const outputDir = requiredEnv('BS15I_LONG_OUTPUT_DIR')
    const metricsPath = requiredEnv('BS15I_LONG_METRICS_PATH')
    let world = deserializeGameWorldV4(readLargeSaveV4File(startPath))
    const startDate = world.currentDate
    const scaleClosure = process.env.BS15I_WORLD_SIM_SCALE === '1'
    const finalValidationClosure = process.env.BS15I_FINAL_VALIDATION_CLOSURE === '1'
    const scalePrefix = finalValidationClosure ? 'BS15I-final-y7' : 'BS15I-clean-y7'
    const validationBlocks: Record<string, { ms: number; calls: number; reused: number }> = {}
    const sourceMemoryAfterGc = memoryAfterGc()
    if (scaleClosure && (startDate !== '2038-10-01' || targetDate !== '2039-10-01')) throw new Error('Scale closure must run exactly Y7 from certified Y6')
    const scalePhases: Record<string, { ms: number; calls: number; maxMs: number }> = {}
    const initialCompletedGames = Object.values(world.games).filter(game => game.status === 'completed').length
    const targetYear = Number(targetDate.slice(0, 4))
    const checkpointDates: GameDate[] = []
    for (let year = Number(startDate.slice(0, 4)) + 1; year <= targetYear; year += 1) {
      const date = addYears(startDate, year - Number(startDate.slice(0, 4)))
      if (date <= targetDate) checkpointDates.push(date)
    }
    const deepDates = checkpointDates.filter(date => scaleClosure || [10, 20, 30].includes(Number(date.slice(0, 4)) - 2032))
    const baselineSnapshot = snapshot(world)
    const rows: unknown[] = [collectLongevityMetrics(world, baselineSnapshot, baselineSnapshot, 0, undefined, true)]
    let previous = baselineSnapshot
    const mutationGuard = createLongHorizonMutationGuard(world)
    let previousElapsedMs = 0
    let simulationBatchMs = 0
    let observerMs = 0
    let previousWorld = world
    let lastHeartbeat = world.currentDate
    if (process.env.BS15I_LONG_BASELINE_ONLY === '1') {
      Object.assign(rows[0] as object, { aiFairness: assertKnowledgeRankingFairness(world), generationalReplacement: generationalReplacement(world), cohortJourneyExamples: cohortJourneyExamples(world), recruitingForecasts: recruitingForecasts(world) })
      writeFileSync(metricsPath, JSON.stringify({ startPath, startDate, targetDate, checkpoints: rows }, null, 2))
      process.stdout.write(`[BS15I longevity baseline] ${JSON.stringify(rows[0])}\n`)
      return
    }
    process.stdout.write(`[BS15I longevity start] ${JSON.stringify({ startDate, targetDate, players: Object.keys(world.players).length, checkpoints: checkpointDates, deepDates, initialCompletedGames })}\n`)
    const simulationStarted = performance.now()

    const result = await runTalentLongHorizonCertification({
      world,
      targetDate,
      seed: 15015,
      initialSeedDraws: initialCompletedGames,
      checkpointDates,
      saveReloadDates: [],
      deepIntegrityDates: deepDates,
      maximumRuntimeMs: scaleClosure ? 10 * 60 * 1000 : 12 * 60 * 60 * 1000,
      onSimulationBatch: ms => { simulationBatchMs += ms },
      onSeasonLifecycle: ms => {
        const total = scalePhases.SEASON_LIFECYCLE ?? { ms: 0, calls: 0, maxMs: 0 }
        total.ms += ms
        total.calls += 1
        total.maxMs = Math.max(total.maxMs, ms)
        scalePhases.SEASON_LIFECYCLE = total
      },
      onDayAdvance: advance => {
        const observerStarted = performance.now()
        if (advance.status === 'FAILED') throw new Error(`Canonical day failed: ${JSON.stringify(advance.failure)}`)
        mutationGuard(advance.world)
        if (finalValidationClosure) for (const [key, block] of Object.entries(getWorldValidationReport(advance.world)?.blocks ?? {})) {
          const total = validationBlocks[key] ?? { ms: 0, calls: 0, reused: 0 }
          total.ms += block.elapsedMs; total.calls++; total.reused += Number(block.reused); validationBlocks[key] = total
        }
        for (const phase of advance.phases) if (phase.ran && phase.elapsedMs !== undefined) {
          const total = scalePhases[phase.phaseId] ?? { ms: 0, calls: 0, maxMs: 0 }
          total.ms += phase.elapsedMs
          total.calls += 1
          total.maxMs = Math.max(total.maxMs, phase.elapsedMs)
          scalePhases[phase.phaseId] = total
        }
        const teamId = 'generated-team-0017' as keyof GameWorld['teams']
        const before = previousWorld.teams[teamId]?.rosterPlayerIds ?? []
        const after = advance.world.teams[teamId]?.rosterPlayerIds ?? []
        const departed = before.filter(id => !after.includes(id))
        if (departed.length || after.some(id => !before.includes(id))) {
          const trace = { resumeSource: startPath, revision: 'permanentNcaaEligibilityExit', date: advance.world.currentDate, before, after, departed: departed.map(playerId => ({ playerId, transactions: Object.values(advance.world.playerTransactionsById).filter(item => item.playerId === playerId), transitions: Object.values(advance.world.ecosystemTransitionsById).filter(item => item.playerId === playerId), enrollments: Object.values(advance.world.playerEnrollmentsById).filter(item => item.playerId === playerId) })), repair: advance.repairReports.filter(item => item.targetEntity === teamId) }
          appendFileSync(`${outputDir}/${scaleClosure ? `${scalePrefix}-departure-trace` : 'BS15I-long-departure-trace'}.jsonl`, `${JSON.stringify(trace)}\n`)
          process.stdout.write(`[BS15I departure] ${JSON.stringify(trace)}\n`)
        }
        previousWorld = advance.world
        const daysSinceHeartbeat = dayDifference(lastHeartbeat, advance.world.currentDate)
        if (daysSinceHeartbeat >= 30) {
          lastHeartbeat = advance.world.currentDate
          process.stdout.write(`[BS15I longevity progress] ${JSON.stringify({ date: lastHeartbeat, players: Object.keys(advance.world.players).length, rssBytes: process.memoryUsage().rss, ...(scaleClosure ? { elapsedMs: performance.now() - simulationStarted, gamesByTier: scaleTiers, phases: scalePhases } : {}) })}\n`)
        }
        observerMs += performance.now() - observerStarted
      },
      onProgress: (checkpoint, checkpointWorld) => {
        if (scaleClosure) writeFileSync(`${outputDir}/${scalePrefix}-runtime.json`, JSON.stringify({ date: checkpoint.date, days: dayDifference(startDate, checkpoint.date), TOTAL_WORLD_ANNUAL_MS: simulationBatchMs - observerMs, CERTIFICATION_DRIVER_OBSERVER_MS: observerMs, DRIVER_ELAPSED_BEFORE_SAVE_MS: checkpoint.elapsedMs, gamesByTier: scaleTiers, phases: scalePhases }, null, 2))
        const checkpointValidationStarted = performance.now()
        if (finalValidationClosure) validateGameWorld(checkpointWorld)
        const fullCheckpointValidationMs = performance.now() - checkpointValidationStarted
        const preSaveMemory = memoryAfterGc()
        const next = snapshot(checkpointWorld)
        assertAnnualIntegrity(checkpointWorld)
        const ncaaBeforeSave = collectNcaaContinuity(checkpointWorld)
        assertNcaaMinimum(checkpointWorld, ncaaBeforeSave)
        const deep = deepDates.includes(checkpoint.date)
        let save: ReturnType<typeof verifyPersistedSave> | undefined
        if (deep) {
          assertLongHorizonIntegrity(checkpointWorld)
          assertEffectiveRules(checkpointWorld)
        }
        {
          const year = Number(checkpoint.date.slice(0, 4)) - 2032
          const savePath = scaleClosure ? `${outputDir}/${finalValidationClosure ? 'BS15I-final-y7' : 'BS15I-fast-y7'}-save-v4.json` : year === 30 ? `${outputDir}/BS15I-final-y30-save-v4.json` : `${outputDir}/BS15I-long-y${year}-save-v4.json`
          const beforeDigest = deep ? semanticDigest(checkpointWorld) : undefined
          const serializeStart = performance.now()
          writeLargeSaveV4File(savePath, serializeGameWorldV4(checkpointWorld, `${checkpoint.date}T00:00:00.000Z`))
          const bytes = statSync(savePath).size
          const serializeMs = performance.now() - serializeStart
          save = verifyPersistedSave(checkpointWorld, savePath, bytes, serializeMs, deep, beforeDigest)
        }
        if (deep && !save?.semanticRoundTrip) throw new Error(`Semantic roundtrip failure at ${checkpoint.date}`)
        const annualRuntimeMs = checkpoint.elapsedMs - previousElapsedMs
        previousElapsedMs = checkpoint.elapsedMs
        const metrics = { ...collectLongevityMetrics(checkpointWorld, previous, next, annualRuntimeMs, checkpoint, deep), ...(save === undefined ? {} : { save }) }
        if (scaleClosure) Object.assign(metrics, { gamesByTier: { ...scaleTiers }, phaseReport: scalePhases, TOTAL_WORLD_ANNUAL_MS: simulationBatchMs - observerMs, CERTIFICATION_DRIVER_OBSERVER_MS: observerMs, preSaveMemory, sourceMemoryAfterGc, fullCheckpointValidationMs, validationBlocks, afterReloadReleasedMemory: memoryAfterGc() })
        if ((Number(checkpoint.date.slice(0, 4)) - 2032) % 5 === 0) Object.assign(metrics, { rollingFiveYearFlows: rollingFiveYearFlows(outputDir, metrics) })
        if (deep) Object.assign(metrics, { generationalReplacement: generationalReplacement(checkpointWorld), cohortJourneyExamples: cohortJourneyExamples(checkpointWorld), aiFairness: assertKnowledgeRankingFairness(checkpointWorld), recruitingForecasts: recruitingForecasts(checkpointWorld), effectiveRules: Object.values(checkpointWorld.ecosystems).filter(item => item.kind === 'ncaaLike').map(item => resolveCollegeRuleset(checkpointWorld, item.id, checkpointWorld.currentDate)), ncaaContinuity: ncaaBeforeSave })
        previous = next
        rows.push(metrics)
        writeFileSync(metricsPath, JSON.stringify({ startPath, startDate, targetDate, checkpoints: rows }, null, 2))
        process.stdout.write(`[BS15I longevity checkpoint] ${JSON.stringify(metrics)}\n`)
      },
    })

    if (result.timedOutAt !== undefined) throw new Error(`Longevity watchdog reached at ${result.timedOutAt}`)
    if (result.stopReason !== undefined) throw new Error(`Canonical simulation stopped: ${JSON.stringify(result.stopReason)}`)
    if (result.world.currentDate !== targetDate) throw new Error(`Ended at ${result.world.currentDate}, expected ${targetDate}`)
    expect(result.checkpoints).toHaveLength(checkpointDates.length)
    process.stdout.write(`[BS15I longevity block complete] ${JSON.stringify({ startDate, targetDate, elapsedMs: result.elapsedMs, checkpoints: result.checkpoints.length })}\n`)
  }
}, 12 * 60 * 60 * 1000)
