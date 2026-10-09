// Test-only evidence. Nothing in this module is an authority persisted in GameWorld.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, renameSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GameWorld } from '@/domain/world'
import { serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { getExplicitAdvanceStopReason } from './ContinueFlow'
import type { WorldDayAdvanceResult } from './advanceGameDay'
import type { SimulateUntilResult } from './simulateUntilDate'

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** Proposed test acceptance, not a new production ContinueFlow policy. */
export function classifyContinueEvidence(result: Pick<SimulateUntilResult, 'world' | 'finalDate' | 'stopReason'>, target: string): 'ARRIVED' | 'CANONICAL_DECISION' | 'SIMULATION_ERROR' {
  if (result.finalDate !== result.world.currentDate || result.finalDate > target) return 'SIMULATION_ERROR'
  const required = evaluateSimulationBreakpoints(result.world).candidates.filter(item => item.level === 'ACTION_REQUIRED' || item.level === 'BLOCKING')
  if (result.stopReason.type === 'arrived') return result.finalDate === target && required.length === 0 ? 'ARRIVED' : 'SIMULATION_ERROR'
  const reason = result.stopReason
  if ('breakpoint' in reason) {
    const coherent = reason.type === 'userGame' ? reason.breakpoint.reason === 'userGame' && reason.gameId === reason.breakpoint.sourceId
      : reason.type === 'mediaOpportunity' ? reason.breakpoint.reason === 'mediaOpportunity' && reason.opportunityId === reason.breakpoint.sourceId
      : reason.type === 'seasonComplete' ? reason.breakpoint.reason === 'seasonComplete' : true
    if (coherent && required.some(item => fingerprint(item) === fingerprint(reason.breakpoint))) return 'CANONICAL_DECISION'
  }
  return 'SIMULATION_ERROR'
}

export function createLongitudinalEvidence(initial: GameWorld, target: string, source: unknown, seed: number, initialCommand = 'simulateUntilDate') {
  const directory = resolve(process.env.BDM_WORLD_DB_EVIDENCE ?? 'node_modules/.cache/bs15-bs16-bs17-certification/v2-longitudinal', `${Date.now()}-${process.pid}`)
  mkdirSync(directory, { recursive: true })
  let current = initial
  let lastPhase = 'INITIAL_STATE'
  let lastCheckpoint = ''
  let seedCalls = 0
  let lastStopReason: unknown = null
  const write = (name: string, value: unknown) => {
    writeFileSync(resolve(directory, `${name}.tmp`), JSON.stringify(value, null, 2))
    renameSync(resolve(directory, `${name}.tmp`), resolve(directory, name))
  }
  const checkpoint = () => {
    lastCheckpoint = `checkpoint-${current.currentDate}.json`
    write(lastCheckpoint, serializeGameWorldV4(current, '2025-10-01T00:00:00.000Z'))
  }
  const record = (result: string, stopReason: unknown = null, error: unknown = null) => {
    write('diagnostic.json', {
      schemaVersion: 1, seed, seedCalls, sourceFingerprint: fingerprint(source),
      initialDate: initial.currentDate, finalDate: current.currentDate, target, stopReason,
      lastPhase, pendingDecisions: evaluateSimulationBreakpoints(current).candidates.filter(item => item.level === 'ACTION_REQUIRED' || item.level === 'BLOCKING'),
      ids: { userCoachId: current.userCoachId, currentSeasonId: current.currentSeasonId, lastCompletedGames: Object.values(current.games).filter(game => game.status === 'completed' && game.date === current.currentDate).map(game => game.id) },
      lastCheckpoint, checkpointSchema: 'GameWorldSaveV4', decisionJournal: 'decisions.jsonl', result, error,
      historical2029Cause: 'UNRESOLVED_HISTORICAL_CAUSE',
    })
  }
  writeFileSync(resolve(directory, 'decisions.jsonl'), `${JSON.stringify({ kind: 'FIXTURE_ORDER', command: initialCommand, target, automaticDecisionResolution: false })}\n`)
  writeFileSync(resolve(directory, 'seeds.jsonl'), '')
  checkpoint()
  write('source.json', source)
  record('RUNNING')
  return {
    directory,
    createSeed: () => { appendFileSync(resolve(directory, 'seeds.jsonl'), `${JSON.stringify({ call: ++seedCalls, seed })}\n`); return seed },
    observeWorld: (world: GameWorld, phase: string, command: unknown) => {
      current = world
      lastPhase = phase
      appendFileSync(resolve(directory, 'decisions.jsonl'), `${JSON.stringify({ date: current.currentDate, command })}\n`)
      checkpoint()
      record('RUNNING')
    },
    onDayAdvance: (day: WorldDayAdvanceResult) => {
      current = day.world
      lastPhase = day.phases.at(-1)?.phaseId ?? lastPhase
      if (current.currentDate.endsWith('-10-01')) checkpoint()
      record(day.failure ? 'SIMULATION_ERROR' : 'RUNNING', null, day.failure ?? null)
    },
    finish: (result: SimulateUntilResult) => { current = result.world; lastStopReason = result.stopReason; checkpoint(); record(classifyContinueEvidence(result, target), result.stopReason) },
    fail: (error: unknown) => { checkpoint(); record('FAIL', lastStopReason ?? getExplicitAdvanceStopReason(current) ?? null, error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error)) },
  }
}
