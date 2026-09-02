import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { StaffCultureState } from '@/domain/staffCulture'
import type { StaffHumanState } from '@/domain/staffHumanState'
import type { StaffUnitCohesionState } from '@/domain/staffUnitCohesion'

import {
  applyCultureFitPressure,
  calculateStaffCultureFit,
  deriveStaffCultureTarget,
  initializeStaffCultureState,
  progressStaffCultureState,
} from './StaffCultureEngine'
import {
  buildStaffUnitRuntimeViews,
  deriveStaffUnitCohesionTarget,
  initializeStaffUnitCohesionState,
  progressStaffUnitCohesionState,
} from './StaffUnitCohesionEngine'

/**
 * Wave 5C — the single canonical periodic authority for Organizational Culture and Staff Unit
 * Cohesion, structured exactly like `StaffHumanStatePipeline.progressStaffHumanState`:
 *  1. Ensure a `StaffCultureState` exists per organization scope and a `StaffUnitCohesionState`
 *     exists per resolved runtime unit (both idempotent — keys are deterministic).
 *  2. On the weekly cadence only, recompute every target and move `current` toward it.
 *  3. On the same weekly tick, apply the bounded Culture-Fit pressure into the two existing Human
 *     State dimensions it speaks to.
 *
 * It NEVER touches `world.teamCohesionByTeamId` — that is the separate tactical/training cohesion
 * scalar and is entirely out of this system's scope.
 *
 * Batching: every mutation for a tick is collected into arrays and written through AT MOST ONE
 * `updateGameWorld` call, because `updateGameWorld` re-runs the O(world) validator on every call.
 */
export function progressStaffCultureAndCohesion(world: GameWorld): GameWorld {
  const weekly = shouldRunWeeklyCultureTick(world)

  const cultureByScope = new Map<string, StaffCultureState>(Object.entries(world.staffCultureStatesByScopeKey))
  const cohesionByUnit = new Map<string, StaffUnitCohesionState>(Object.entries(world.staffUnitCohesionStatesByUnitKey))
  let changed = false

  for (const team of Object.values(world.teams)) {
    const scopeKey = team.id as string
    if (!cultureByScope.has(scopeKey)) {
      cultureByScope.set(scopeKey, initializeStaffCultureState(world, scopeKey))
      changed = true
    }
    for (const unitView of buildStaffUnitRuntimeViews(world, team.id)) {
      if (!cohesionByUnit.has(unitView.unitKey)) {
        cohesionByUnit.set(unitView.unitKey, initializeStaffUnitCohesionState(world, unitView))
        changed = true
      }
    }
  }

  const humanStates: StaffHumanState[] = []

  if (weekly) {
    for (const [scopeKey, state] of cultureByScope) {
      cultureByScope.set(scopeKey, progressStaffCultureState(state, deriveStaffCultureTarget(world, scopeKey), world.currentDate))
      changed = true
    }

    // Cohesion targets need the unit membership, so re-resolve the views once per team and match by key.
    for (const team of Object.values(world.teams)) {
      for (const unitView of buildStaffUnitRuntimeViews(world, team.id)) {
        const state = cohesionByUnit.get(unitView.unitKey)
        if (state === undefined) continue
        cohesionByUnit.set(unitView.unitKey, progressStaffUnitCohesionState(state, deriveStaffUnitCohesionTarget(world, unitView), world.currentDate))
        changed = true
      }
    }

    // Culture Fit pressure into the canonical Human State dimensions the PER-DIMENSION mismatch
    // legitimately speaks to (see `applyCultureFitPressure`). Matches `runWeeklyAppraisal`'s
    // live-context filter, so an ended employment stage is never re-pressured.
    for (const context of Object.values(world.staffHumanContextsById)) {
      if (context.endedOn !== undefined) continue
      const state = world.staffHumanStatesByContextId[context.id]
      if (state === undefined) continue
      const cultureState = cultureByScope.get(context.teamId as string)
      if (cultureState === undefined) continue
      const fit = calculateStaffCultureFit(world, context.staffId, cultureState)
      const pressured = applyCultureFitPressure(state, fit)
      if (pressured !== state) {
        humanStates.push(pressured)
        changed = true
      }
    }
  }

  if (!changed) return world

  const pressuredByContextId = new Map(humanStates.map((state) => [state.contextId, state]))
  return updateGameWorld(world, {
    staffCultureStates: [...cultureByScope.values()],
    staffUnitCohesionStates: [...cohesionByUnit.values()],
    ...(pressuredByContextId.size === 0 ? {} : {
      staffHumanStates: Object.values(world.staffHumanStatesByContextId).map((state) => pressuredByContextId.get(state.contextId) ?? state),
    }),
  })
}

/** Weekly cadence: the ISO weekday of `currentDate` is Monday (1). Matches the Wave 5A pipeline's convention. */
function shouldRunWeeklyCultureTick(world: GameWorld): boolean {
  return isoWeekday(world.currentDate) === 1
}

function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}
