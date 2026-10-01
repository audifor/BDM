import type { GameWorld } from '@/domain/world'
import type { WorldDbCompetitionPlanningContextV1 } from '@/engine/competition/WorldDbPhysicalGamePlanner'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'

import { advanceGameDayWithResult, type WorldDayAdvanceResult } from './advanceGameDay'
import {
  materializeWorldDbPhysicalGamesV1,
  type WorldDbGameMaterializationResultV1,
} from './WorldDbGameMaterialization'

export interface AdvanceWorldDbGameDayInputV1 {
  readonly beforeAsOf: string
  readonly afterAsOf: string
}

export interface AdvanceWorldDbGameDayResultV1 {
  readonly world: GameWorld
  readonly before: WorldDbGameMaterializationResultV1
  readonly after: WorldDbGameMaterializationResultV1
  readonly lifecycle: WorldDayAdvanceResult
}

/**
 * Executes one canonical game day with already-loaded World DB competition contexts.
 *
 * World DB physical Games are materialized before the daily simulation so today's
 * fixtures can be played, then materialized again afterwards so completed results
 * can rebuild B04 progression and expose downstream fixtures. The caller owns the
 * external World DB path/context lifecycle and supplies explicit as-of timestamps.
 */
export function advanceWorldDbGameDayV1(
  world: GameWorld,
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
  input: AdvanceWorldDbGameDayInputV1,
): AdvanceWorldDbGameDayResultV1 {
  requireAsOf(input.beforeAsOf, 'beforeAsOf')
  requireAsOf(input.afterAsOf, 'afterAsOf')

  const before = materializeWorldDbPhysicalGamesV1(world, contexts, input.beforeAsOf)
  const lifecycle = advanceGameDayWithResult(before.world)
  if (lifecycle.status === 'BREAKPOINT_PREVENTED' || lifecycle.status === 'FAILED') {
    return Object.freeze({ world: before.world, before, after: before, lifecycle })
  }
  const after = materializeWorldDbPhysicalGamesV1(lifecycle.world, contexts, input.afterAsOf)
  const rematerializationPhase = {
    phaseId: 'WORLD_DB_REMATERIALIZATION',
    order: lifecycle.phases.length + 1,
    date: after.world.currentDate,
    ran: true,
    worldChanged: after.world !== lifecycle.world,
    diagnostics: [],
    summary: 'World DB fixtures were reconciled after the canonical day lifecycle.',
  } as const
  const breakpointAfter = evaluateSimulationBreakpoints(after.world)
  const attention = breakpointAfter.candidates.filter((candidate) => candidate.level === 'ACTION_REQUIRED' || candidate.level === 'BLOCKING')
  const reconciliationPhase = {
    phaseId: 'WORLD_DB_BREAKPOINT_RECONCILIATION',
    order: lifecycle.phases.length + 2,
    date: after.world.currentDate,
    ran: true,
    worldChanged: false,
    diagnostics: attention.map((candidate) => ({ code: 'BREAKPOINT_AFTER_PROCESSING', message: candidate.diagnostic, sourceId: candidate.sourceId })),
    summary: attention.length === 0 ? 'No stopping breakpoint exists after World DB rematerialization.' : `${attention.length} action-required or blocking breakpoint(s) remain after World DB rematerialization.`,
  } as const
  const completedLifecycle: WorldDayAdvanceResult = {
    ...lifecycle,
    status: attention.length === 0 ? lifecycle.status : 'BREAKPOINT_AFTER_PROCESSING',
    world: after.world,
    phases: Object.freeze([...lifecycle.phases, rematerializationPhase, reconciliationPhase]),
    diagnostics: Object.freeze([...lifecycle.diagnostics, ...reconciliationPhase.diagnostics]),
    breakpointAfter,
  }

  return Object.freeze({
    world: after.world,
    before,
    after,
    lifecycle: completedLifecycle,
  })
}

function requireAsOf(value: string, field: 'beforeAsOf' | 'afterAsOf'): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`World DB ${field} must be a non-empty string`)
  }
}
