import './SystemBar.css'

import { evaluateSimulationBreakpoints, getContinueStopReason, type ContinueStopReason } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { SimulateUntilControl } from '@/ui-ng/system/SimulateUntilControl'
import { breakpointActionLabel, resolveBreakpointDestination } from '@/ui-ng/system/breakpointRouting'
import { syncWorkspaceAppQuery, type NgWorkspaceContext, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

/** The action the Continue control offers for the current stop. */
export interface ContinueAction {
  readonly label: string
  readonly app?: WorkspaceAppId
  /** Canonical context the resolver carries into the destination workspace (for example a trade negotiation). */
  readonly context?: NgWorkspaceContext
  readonly startNextSeason?: true
  /**
   * Set when the stop has no actionable destination: the bar surfaces this (with the breakpoint's own diagnostic)
   * instead of a resolver that would open nothing or the wrong surface.
   */
  readonly unresolvedDiagnostic?: string
}

/**
 * The canonical context a breakpoint already carries for its destination workspace. The breakpoint, not the bar,
 * owns these identifiers: this only forwards what `SimulationBreakpoint.actionTarget` published.
 */
function breakpointContext(actionTarget: Readonly<Record<string, string>> | undefined): NgWorkspaceContext | undefined {
  const negotiationId = actionTarget?.negotiationId
  return negotiationId === undefined ? undefined : { negotiationId }
}

/**
 * MX0.2 closure: the canonical Continue action for the current stop, using `SimulationBreakpoint.route` metadata.
 * A route is only turned into a resolver when it resolves to an *actionable* workspace destination; a route-less or
 * unregistered blocking breakpoint keeps its diagnostic visible and offers no resolver. Exported for its contract test.
 */
export function continueAction(stop: ContinueStopReason | undefined): ContinueAction {
  if (stop?.type === 'seasonComplete') return { label: 'Start next season', startNextSeason: true }
  if (stop?.type === 'userGame') return { label: 'Match', app: 'match' }
  if (stop?.type === 'mediaOpportunity') return { label: 'Press', app: 'media' }
  if (stop?.type === 'breakpoint') {
    const destination = resolveBreakpointDestination(stop.breakpoint.route)
    if (destination.actionable && destination.appId !== undefined) {
      const context = breakpointContext(stop.breakpoint.actionTarget)
      return { label: breakpointActionLabel(destination.route) ?? 'Continue', app: destination.appId, ...(context === undefined ? {} : { context }) }
    }
    const suggested = destination.appId === undefined ? undefined : breakpointActionLabel(destination.route) ?? destination.appId
    const diagnostic = [stop.breakpoint.diagnostic, suggested === undefined ? undefined : `Suggested destination: ${suggested}.`, destination.reasonUnavailable]
      .filter((part): part is string => part !== undefined)
      .join(' ')
    return { label: 'Continue', unresolvedDiagnostic: diagnostic }
  }
  return { label: 'Continue' }
}

export function SystemBar() {
  const world = useGameStore((state) => state.world)
  // ME-LOCK1.1: Continue simulates each day's matches in parallel workers.
  const continueGame = useGameStore((state) => state.continueGameAsync)
  const startNextSeason = useGameStore((state) => state.startNextSeason)
  const simulationBusy = useGameStore((state) => state.simulationBusy)
  const userTeam = world === null ? undefined : getUserTeam(world)
  const season = world === null ? undefined : world.seasons[world.currentSeasonId]
  const competition = season === undefined || world === null ? undefined : world.competitions[season.competitionId]
  const stop = world === null ? undefined : getContinueStopReason(world)
  const action = continueAction(stop)
  const contractAttention = world !== null && resolveBreakpointDestination('contracts').actionable && evaluateSimulationBreakpoints(world).candidates.some((item) => item.route === 'contracts')
  const busy = world === null || simulationBusy
  // A blocking stop without an actionable destination cannot be resolved through Continue: disabling the control is
  // honest where the previous behaviour offered a button that did nothing.
  const blocked = busy || action.unresolvedDiagnostic !== undefined

  return (
    <header className="ng-system-bar" data-ng-region="system-bar">
      <div className="ng-system-bar__left">
        <span className="ng-system-bar__mark">BDM</span>
        <span className="ng-system-bar__club">{userTeam?.name ?? 'No team loaded'}</span>
      </div>

      <div className="ng-system-bar__center">
        <span className="ng-system-bar__chip">{competition?.name ?? '—'}</span>
        <span className="ng-system-bar__chip">{season?.label ?? '—'}</span>
        <span className="ng-system-bar__date">
          {world === null ? '—' : formatGameDateLabel(world.currentDate)}
        </span>
      </div>

      <div className="ng-system-bar__right">
        {contractAttention && <button aria-label="Open contracts requiring attention" className="ng-btn ng-btn--ghost" onClick={() => syncWorkspaceAppQuery('contracts')} type="button">Contracts</button>}
        {action.unresolvedDiagnostic !== undefined && (
          <span className="ng-system-bar__diagnostic" data-ng-region="continue-diagnostic" role="status">{action.unresolvedDiagnostic}</span>
        )}
        <button
          aria-label={action.label}
          className="ng-btn ng-btn--primary"
          disabled={blocked}
          onClick={() => {
            if (world === null) return
            if (action.startNextSeason === true) {
              startNextSeason()
              return
            }
            if (action.app !== undefined) {
              syncWorkspaceAppQuery(action.app, 'replace', action.context)
              return
            }
            void continueGame()
          }}
          type="button"
        >
          {action.label}
        </button>
        {world !== null ? <SimulateUntilControl blocked={busy} world={world} /> : null}
        <svg aria-hidden className="ng-system-bar__orbit" viewBox="0 0 28 28">
          <circle cx="14" cy="14" fill="none" r="4.5" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="14" cy="14" fill="none" rx="11" ry="5" stroke="currentColor" strokeWidth="1" transform="rotate(-24 14 14)" />
          <ellipse cx="14" cy="14" fill="none" rx="11" ry="5" stroke="currentColor" strokeWidth="1" transform="rotate(28 14 14)" />
        </svg>
      </div>
    </header>
  )
}
