import type { MatchState } from '../state'
import type { MatchActionState } from './ActionState'
import { executionInvariant, fullExecutionDiagnostics } from '../execution/Diagnostics'

/**
 * ME-LOCK1: read-only views over the match action history. The history only grows (1,000+ actions per game) while the engine asks
 * about the few ACTIVE ones several times per tick; scanning the whole history made every tick slower as the game went on.
 * The views give exactly what the scans gave (same elements, same order), so no decision can change.
 */
const activeByHistory = new WeakMap<readonly MatchActionState[], readonly MatchActionState[]>()

/** The ACTIVE actions, in history order; computed once per (immutable) history array. */
export function activeActions(state: Pick<MatchState, 'actions'>): readonly MatchActionState[] {
  const cached = activeByHistory.get(state.actions)
  if (cached !== undefined) {
    if (fullExecutionDiagnostics()) {
      const scanned = state.actions.filter((action) => action.status === 'ACTIVE')
      executionInvariant(scanned.length === cached.length && scanned.every((action, index) => action === cached[index]), () => 'carried ACTIVE view differs from the history filter')
    }
    return cached
  }
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
  carryOffensive(actions, next, (team, summary) => offensiveIsRelevant(action, team) ? foldOffensive(summary, action, next.length - 1) : summary)
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
  const old = actions[index]!
  const nextActive = activeByHistory.get(next)
  carryOffensive(actions, next, (team, summary) => !offensiveIsRelevant(old, team) && !offensiveIsRelevant(value, team) ? summary : replaceOffensive(summary, team, index, old, value, nextActive))
  return next
}

/** A fresh copy of `actions` (same elements), sharing its ACTIVE view. */
export function copyActions(actions: readonly MatchActionState[]): MatchActionState[] {
  const next = actions.slice()
  const previous = activeByHistory.get(actions)
  if (previous !== undefined) activeByHistory.set(next, previous)
  carryOffensive(actions, next, (_team, summary) => summary)
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
/** Internal: the summary plus the history index of `lastResolved` (-1 when none), needed to carry it across a replacement. */
interface OffensiveSummary extends TeamOffensiveActions { readonly lastResolvedIndex: number }
const offensiveByHistory = new WeakMap<readonly MatchActionState[], Readonly<Record<string, OffensiveSummary>>>()

export function teamOffensiveActions(state: Pick<MatchState, 'actions'>, teamId: string): TeamOffensiveActions {
  let byTeam = offensiveByHistory.get(state.actions)
  if (byTeam === undefined) { byTeam = {}; offensiveByHistory.set(state.actions, byTeam) }
  const cached = byTeam[teamId]
  if (cached !== undefined) {
    if (fullExecutionDiagnostics()) {
      const scanned = scanOffensive(state.actions, teamId)
      executionInvariant(scanned.lastResolvedT === cached.lastResolvedT && scanned.lastResolved === cached.lastResolved && scanned.anyActive === cached.anyActive
        && scanned.lastAdvantageDriveT === cached.lastAdvantageDriveT && scanned.lastResolvedIndex === cached.lastResolvedIndex, () => `carried offensive summary of ${teamId} differs from the history scan`)
    }
    return cached
  }
  const summary = scanOffensive(state.actions, teamId)
  ;(byTeam as Record<string, OffensiveSummary>)[teamId] = summary
  return summary
}

function scanOffensive(actions: readonly MatchActionState[], teamId: string): OffensiveSummary {
  let summary = EMPTY_OFFENSIVE
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!
    if (offensiveIsRelevant(action, teamId)) summary = foldOffensive(summary, action, index)
  }
  return summary
}

/*
 * ME-LOCK1.2: the history array is rebuilt every tick, so the summary above was a whole-history scan per tick. It is now carried from
 * the previous array through the same builders as the ACTIVE view: appending folds one more element exactly as the scan would; a
 * replacement updates the summary when the answer provably follows from the old one, and otherwise leaves it to the scan on first use.
 * Either way the summary equals the scan of the new array.
 */
const EMPTY_OFFENSIVE: OffensiveSummary = { lastResolvedT: -1, lastResolved: undefined, anyActive: false, lastAdvantageDriveT: -100, lastResolvedIndex: -1 }

function offensiveIsRelevant(action: MatchActionState, teamId: string): boolean {
  return action.teamId === teamId && action.kind !== 'CLOSEOUT'
}

function isAdvantageDrive(action: MatchActionState): boolean {
  return action.kind === 'DRIVE' && action.status === 'COMPLETED' && (action.outcome === 'ADVANTAGE' || action.outcome === 'FINISH')
}

/** One step of the scan: `action` (relevant to the team) seen after every element already folded into `summary`. */
function foldOffensive(summary: OffensiveSummary, action: MatchActionState, index: number): OffensiveSummary {
  const resolvedT = action.resolvedT ?? -1
  const newest = resolvedT > summary.lastResolvedT
  const anyActive = summary.anyActive || action.status === 'ACTIVE'
  const lastAdvantageDriveT = isAdvantageDrive(action) ? Math.max(summary.lastAdvantageDriveT, action.resolvedT ?? -100) : summary.lastAdvantageDriveT
  if (!newest && anyActive === summary.anyActive && lastAdvantageDriveT === summary.lastAdvantageDriveT) return summary
  return {
    lastResolvedT: newest ? resolvedT : summary.lastResolvedT, lastResolved: newest ? action : summary.lastResolved, anyActive, lastAdvantageDriveT,
    lastResolvedIndex: newest ? index : summary.lastResolvedIndex,
  }
}

/** The summary once `old` (at `index`) is replaced by `value`, or undefined when only the scan can tell. */
function replaceOffensive(summary: OffensiveSummary, teamId: string, index: number, old: MatchActionState, value: MatchActionState, nextActive: readonly MatchActionState[] | undefined): OffensiveSummary | undefined {
  // Is any ACTIVE action of the team (not a closeout) left? The ACTIVE view of the new array answers it exactly.
  if (nextActive === undefined) return undefined
  const anyActive = nextActive.some((action) => offensiveIsRelevant(action, teamId))
  const oldRelevant = offensiveIsRelevant(old, teamId)
  const valueRelevant = offensiveIsRelevant(value, teamId)
  // Latest resolution: the maximum resolvedT (-1 when unresolved), held by the first element in history order reaching it.
  let lastResolvedT = summary.lastResolvedT
  let lastResolved = summary.lastResolved
  let lastResolvedIndex = summary.lastResolvedIndex
  const valueT = valueRelevant ? value.resolvedT ?? -1 : -1
  if (valueRelevant && valueT > lastResolvedT) {
    lastResolvedT = valueT; lastResolved = value; lastResolvedIndex = index
  } else if (index === lastResolvedIndex) {
    // The holder of the maximum changes: it still holds it only with the same value.
    if (!valueRelevant || valueT !== lastResolvedT) return undefined
    lastResolved = value
  } else if (valueRelevant && valueT === lastResolvedT && lastResolvedT > -1 && index < lastResolvedIndex) {
    lastResolved = value; lastResolvedIndex = index
  }
  // Latest advantage drive: a maximum, which a replacement can only lower when the old element held it.
  let lastAdvantageDriveT = summary.lastAdvantageDriveT
  if (oldRelevant && isAdvantageDrive(old) && lastAdvantageDriveT > -100 && (old.resolvedT ?? -100) === lastAdvantageDriveT
    && !(valueRelevant && isAdvantageDrive(value) && (value.resolvedT ?? -100) >= lastAdvantageDriveT)) return undefined
  if (valueRelevant && isAdvantageDrive(value)) lastAdvantageDriveT = Math.max(lastAdvantageDriveT, value.resolvedT ?? -100)
  return { lastResolvedT, lastResolved, anyActive, lastAdvantageDriveT, lastResolvedIndex }
}

/** Gives `next` every summary of `previous` that `derive` can carry; the others are scanned on first use. */
function carryOffensive(previous: readonly MatchActionState[], next: readonly MatchActionState[], derive: (teamId: string, summary: OffensiveSummary) => OffensiveSummary | undefined): void {
  const byTeam = offensiveByHistory.get(previous)
  if (byTeam === undefined) return
  const carried: Record<string, OffensiveSummary> = {}
  for (const teamId in byTeam) {
    const summary = derive(teamId, byTeam[teamId]!)
    if (summary !== undefined) carried[teamId] = summary
  }
  offensiveByHistory.set(next, carried)
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
