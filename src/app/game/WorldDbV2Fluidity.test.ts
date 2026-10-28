import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { advanceGameDayWithResultAsync } from './advanceGameDay'
import { createUniverseAcceptanceRunner } from './testSupport/WorldDbV2UniverseRunner'
import * as resolution from './matchResolution'
import * as dynamics from '@/app/matchNext/MatchNextDynamicConsequences'
import * as statistics from '@/app/matchNext/MatchNextResult'
import * as facilities from '@/app/facilities/ClubFacilitiesReadModel'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { useGameStore } from '@/stores/gameStore'

const enabled = process.env.BDM_V206_PROFILE === '1'
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value
function payloadHash(payload: ReturnType<typeof serializeGameWorldV4>['payload']): string {
  const copy = structuredClone(payload)
  const events = copy.staffCareerRuntime.governanceDecisionEvents as { readonly id: string }[]
  events.sort((a, b) => a.id.localeCompare(b.id))
  return createHash('sha256').update(JSON.stringify(canonical(copy))).digest('hex')
}

it.skipIf(!enabled)('profiles the certified four-league day and next week without changing any simulation authority', async () => {
  const label = process.env.BDM_V206_LABEL ?? 'source-baseline'
  const out = resolve('.worlddb-v2/v2-06', label); mkdirSync(out, { recursive: true })
  const opening = readFileSync('.worlddb-v2/v2-06/opening.json', 'utf8')
  const repository = { save: async (_json: string) => {}, load: async () => opening, getInfo: async () => ({ savedAt: '2026-10-27T12:00:00Z' }) }
  let world = await loadSavedGame(repository)
  useGameStore.getState().replaceWorld(world); world = useGameStore.getState().world!
  const measured: Record<string, { calls: number; elapsedMs: number }> = {}
  const authorityInputs = new WeakMap<object, Set<string>>()
  let repeatedAuthorityQueries = 0
  const time = <T,>(name: string, action: () => T): T => {
    const start = performance.now()
    try { return action() } finally { const entry = measured[name] ??= { calls: 0, elapsedMs: 0 }; entry.calls++; entry.elapsedMs += performance.now() - start }
  }
  const prepare = resolution.prepareDayGames, apply = resolution.applyDayOutcomes
  const dynamic = dynamics.deriveMatchNextDynamicConsequences, stat = statistics.createMatchStatLogFromMatchNext
  const authority = facilities.resolveClubFacilityAuthority
  vi.spyOn(resolution, 'prepareDayGames').mockImplementation((...args) => time('preparation', () => {
    const prepared = prepare(...args)
    if (prepared.length) writeFileSync(resolve(out, 'setups.json'), JSON.stringify(prepared.map(item => item.setup)))
    return prepared
  }))
  vi.spyOn(resolution, 'applyDayOutcomes').mockImplementation((...args) => time('applicationIncludingConsequences', () => apply(...args)))
  vi.spyOn(dynamics, 'deriveMatchNextDynamicConsequences').mockImplementation((...args) => time('fatigueAndLearningProjectionNested', () => dynamic(...args)))
  vi.spyOn(statistics, 'createMatchStatLogFromMatchNext').mockImplementation((...args) => time('statisticsNested', () => stat(...args)))
  vi.spyOn(facilities, 'resolveClubFacilityAuthority').mockImplementation((...args) => time('facilityAuthorityNested', () => {
    let teams = authorityInputs.get(args[0])
    if (!teams) { teams = new Set(); authorityInputs.set(args[0], teams) }
    if (teams.has(args[1])) repeatedAuthorityQueries++
    teams.add(args[1])
    return authority(...args)
  }))
  const runner = createUniverseAcceptanceRunner()
  const workerRunner = { ...runner, simulate: async (setups: Parameters<typeof runner.simulate>[0]) => {
    const start = performance.now()
    try { return await runner.simulate(setups) } finally { const entry = measured.workers ??= { calls: 0, elapsedMs: 0 }; entry.calls++; entry.elapsedMs += performance.now() - start }
  } }
  const days = [], decisions = []
  let nativeComparison: { nodePayloadSha256: string; nativePayloadSha256: string; identical: boolean; preparedInputsIdentical: boolean } | undefined
  try {
    for (let day = 0; day < 7; day++) {
      useGameStore.getState().replaceWorld(world)
      for (const breakpoint of evaluateSimulationBreakpoints(world).candidates.filter(b => b.level === 'ACTION_REQUIRED' || b.level === 'BLOCKING')) {
        const store = useGameStore.getState()
        if (breakpoint.reason === 'userGame') continue
        if (breakpoint.reason === 'mediaOpportunity') store.skipMedia(breakpoint.sourceId)
        else if (breakpoint.reason === 'coachJobOffer') store.declineUserCoachOffer(breakpoint.sourceId)
        else if (breakpoint.reason === 'returnToPlayReview') store.reviewReturnToPlay(breakpoint.sourceId as never, 'CONTINUE_RECOVERY')
        else throw new Error('Unresolved required decision: ' + JSON.stringify(breakpoint))
        decisions.push({ date: world.currentDate, reason: breakpoint.reason, sourceId: breakpoint.sourceId })
      }
      world = useGameStore.getState().world!
      let seed = 151617
      const start = performance.now()
      const result = await advanceGameDayWithResultAsync(world, workerRunner, () => seed++)
      expect(result.status, JSON.stringify(result.failure ?? result.breakpointBefore.breakpoint)).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
      world = result.world
      const payload = serializeGameWorldV4(world, '2026-10-27T12:00:00Z').payload
      days.push({ day: day + 1, date: world.currentDate, elapsedMs: performance.now() - start, phases: result.phases.map(p => ({ phaseId: p.phaseId, elapsedMs: p.elapsedMs })), payloadSha256: payloadHash(payload) })
      if (day === 0) {
        writeFileSync(resolve(out, 'world-day-1.json'), JSON.stringify(serializeGameWorldV4(world, '2026-10-27T12:00:00Z')))
        const native = JSON.parse(readFileSync('.worlddb-v2/v2-06/baseline-profiled-8/benchmark.json', 'utf8'))
        const inputs = JSON.parse(readFileSync(resolve(out, 'setups.json'), 'utf8'))
        const nativeInputs = JSON.parse(readFileSync('.worlddb-v2/v2-06/native-input-audit/setups-1.json', 'utf8'))
        expect(inputs).toEqual(nativeInputs)
        // Baseline audit proves different V8 math implementations can diverge. Each runtime is certified against its own baseline.
        nativeComparison = { nodePayloadSha256: days[0]!.payloadSha256, nativePayloadSha256: native.runs[0].payloadSha256,
          identical: days[0]!.payloadSha256 === native.runs[0].payloadSha256, preparedInputsIdentical: true }
      }
    }
    let saved = ''
    const saveStart = performance.now()
    await saveCurrentGame(world, { ...repository, save: async json => { saved = json } }, '2026-10-27T12:00:00Z')
    const saveMs = performance.now() - saveStart
    const restored = await loadSavedGame({ ...repository, load: async () => saved })
    expect(payloadHash(serializeGameWorldV4(restored, '2026-10-27T12:00:00Z').payload)).toBe(days.at(-1)!.payloadSha256)
    expect(Object.keys(world.teams)).toHaveLength(70)
    expect(Object.keys(world.competitions)).toHaveLength(4)
    writeFileSync(resolve(out, 'world-week.json'), saved)
    const reference = process.env.BDM_V206_REFERENCE
    if (reference && existsSync(reference)) expect(payloadHash(JSON.parse(saved).payload)).toBe(payloadHash(JSON.parse(readFileSync(reference, 'utf8')).payload))
    writeFileSync(resolve(out, 'profile.json'), JSON.stringify({ passed: true, measured, repeatedAuthorityQueries, days, decisions, saveMs, nativeComparison,
      note: 'Nested timings overlap their parent. Node and WebView baseline math differ; candidate equality is checked separately within each runtime.' }, null, 2))
  } finally { runner.dispose(); vi.restoreAllMocks() }
}, 600_000)
