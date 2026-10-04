import type { MatchState } from '../state'
import type { MatchActionState } from './ActionState'

/**
 * ME-LOCK1: read-only views over the match action history. The history only grows (1,000+ actions per game) while the engine asks
 * about the few ACTIVE ones several times per tick; scanning the whole history made every tick slower as the game went on.
 * The views give exactly what the scans gave (same elements, same order), so no decision can change.
 */
const activeByHistory = new WeakMap<readonly MatchActionState[], readonly MatchActionState[]>()

/** The ACTIVE actions, in history order; computed once per (immutable) history array. */
export function activeActions(state: Pick<MatchState, 'actions'>): readonly MatchActionState[] {
  const cached = activeByHistory.get(state.actions)
  if (cached !== undefined) return cached
  const active = state.actions.filter((action) => action.status === 'ACTIVE')
  activeByHistory.set(state.actions, active)
  return active
}

/*
 * ME-LOCK1.1: the history arrays are rebuilt every tick (a drive is patched every tick), so recomputing the ACTIVE view from the whole
 * history on every new array was still proportional to the game played. The builders below create the new history array exactly as
 * before and derive its ACTIVE view from the previous one (same elements, same order as `filter(status === 'ACTIVE')`).
 */

/** `[...actions, action]`, carrying the ACTIVE view forward. */
export function appendAction(actions: readonly MatchActionState[], action: MatchActionState): MatchActionState[] {
  const next = [...actions, action]
  const previous = activeByHistory.get(actions)
  if (previous !== undefined) activeByHistory.set(next, action.status === 'ACTIVE' ? [...previous, action] : previous)
  return next
}

/** A copy of `actions` with `actions[index]` replaced by `value`, carrying the ACTIVE view forward. */
export function replaceActionAt(actions: readonly MatchActionState[], index: number, value: MatchActionState): MatchActionState[] {
  const next = actions.slice()
  next[index] = value
  const previous = activeByHistory.get(actions)
  if (previous !== undefined) {
    const old = actions[index]!
    if (old.status === 'ACTIVE') {
      const at = previous.indexOf(old)
      if (at >= 0) {
        const active = previous.slice()
        if (value.status === 'ACTIVE') active[at] = value
        else active.splice(at, 1)
        activeByHistory.set(next, active)
      }
    } else if (value.status !== 'ACTIVE') activeByHistory.set(next, previous)
    // An inactive action becoming ACTIVE again never happens; were it to, the view is simply recomputed on first use.
  }
  return next
}

/** A fresh copy of `actions` (same elements), sharing its ACTIVE view. */
export function copyActions(actions: readonly MatchActionState[]): MatchActionState[] {
  const next = actions.slice()
  const previous = activeByHistory.get(actions)
  if (previous !== undefined) activeByHistory.set(next, previous)
  return next
}

/** What the offense flow reads about a team's non-closeout actions over the whole game, summarised once per history array. */
export interface TeamOffensiveActions {
  /** Latest `resolvedT` (-1 when none resolved) and the first action, in history order, resolved at that tick. */
  readonly lastResolvedT: number
  readonly lastResolved: MatchActionState | undefined
  readonly anyActive: boolean
  /** Latest `resolvedT` of a COMPLETED drive that ended in ADVANTAGE or FINISH (-100 when none). */
  readonly lastAdvantageDriveT: number
}
const offensiveByHistory = new WeakMap<readonly MatchActionState[], Readonly<Record<string, TeamOffensiveActions>>>()

export function teamOffensiveActions(state: Pick<MatchState, 'actions'>, teamId: string): TeamOffensiveActions {
  let byTeam = offensiveByHistory.get(state.actions)
  if (byTeam === undefined) { byTeam = {}; offensiveByHistory.set(state.actions, byTeam) }
  const cached = byTeam[teamId]
  if (cached !== undefined) return cached
  let lastResolvedT = -1, lastResolved: MatchActionState | undefined, anyActive = false, lastAdvantageDriveT = -100
  for (const action of state.actions) {
    if (action.teamId !== teamId || action.kind === 'CLOSEOUT') continue
    const resolvedT = action.resolvedT ?? -1
    if (resolvedT > lastResolvedT) { lastResolvedT = resolvedT; lastResolved = action }
    if (action.status === 'ACTIVE') anyActive = true
    if (action.kind === 'DRIVE' && action.status === 'COMPLETED' && (action.outcome === 'ADVANTAGE' || action.outcome === 'FINISH')) lastAdvantageDriveT = Math.max(lastAdvantageDriveT, action.resolvedT ?? -100)
  }
  const summary = { lastResolvedT, lastResolved, anyActive, lastAdvantageDriveT }
  ;(byTeam as Record<string, TeamOffensiveActions>)[teamId] = summary
  return summary
}

/** `actions.some(test)` for actions that can only exist after `anchor` (created referencing it): scans back to the anchor. */
export function someActionAfter(state: Pick<MatchState, 'actions'>, anchor: MatchActionState, test: (action: MatchActionState) => boolean): boolean {
  for (let index = state.actions.length - 1; index >= 0 && state.actions[index] !== anchor; index -= 1) if (test(state.actions[index]!)) return true
  return false
}

/** Index of the action with this id (ids are unique), searching from the newest; -1 when absent. */
export function actionIndexById(state: Pick<MatchState, 'actions'>, actionId: string): number {
  for (let index = state.actions.length - 1; index >= 0; index -= 1) if (state.actions[index]!.id === actionId) return index
  return -1
}

/** Action ids are unique (`match-action-<sequence>`), so the last match is the only match; recent actions are found at once. */
export function actionById(state: Pick<MatchState, 'actions'>, actionId: string): MatchActionState | undefined {
  return findLastAction(state, (action) => action.id === actionId)
}

/** The most recent action satisfying `test` (what `[...actions].reverse().find(test)` returned, without copying the history). */
export function findLastAction(state: Pick<MatchState, 'actions'>, test: (action: MatchActionState) => boolean): MatchActionState | undefined {
  for (let index = state.actions.length - 1; index >= 0; index -= 1) if (test(state.actions[index]!)) return state.actions[index]
  return undefined
}
