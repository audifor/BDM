import './SystemBar.css'

import { evaluateSimulationBreakpoints, getContinueStopReason, type ContinueStopReason } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { SimulateUntilControl } from '@/ui-ng/system/SimulateUntilControl'
import { breakpointActionLabel, workspaceAppForBreakpointRoute } from '@/ui-ng/system/breakpointRouting'
import { syncWorkspaceAppQuery, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

/** MX0.2: the canonical Continue action for the current stop, using SimulationBreakpoint.route metadata. */
function continueAction(stop: ContinueStopReason | undefined): { readonly label: string; readonly app?: WorkspaceAppId; readonly startNextSeason?: true } {
  if (stop?.type === 'seasonComplete') return { label: 'Start next season', startNextSeason: true }
  if (stop?.type === 'userGame') return { label: 'Match', app: 'match' }
  if (stop?.type === 'mediaOpportunity') return { label: 'Press', app: 'media' }
  if (stop?.type === 'breakpoint') {
    const app = workspaceAppForBreakpointRoute(stop.breakpoint.route)
    if (app !== undefined) return { label: breakpointActionLabel(stop.breakpoint.route) ?? 'Continue', app }
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
  const contractAttention = world !== null && evaluateSimulationBreakpoints(world).candidates.some((item) => item.route === 'contracts')
  const blocked = world === null || simulationBusy

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
        <input aria-label="Search BDM" className="ng-system-bar__search" placeholder="Search" type="search" />
        <button className="ng-btn ng-btn--ghost" type="button">
          Inbox
        </button>
        {contractAttention && <button aria-label="Open contracts requiring attention" className="ng-btn ng-btn--ghost" onClick={() => syncWorkspaceAppQuery('contracts')} type="button">Contracts</button>}
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
              syncWorkspaceAppQuery(action.app)
              return
            }
            void continueGame()
          }}
          type="button"
        >
          {action.label}
        </button>
        {world !== null ? <SimulateUntilControl blocked={blocked} world={world} /> : null}
        <svg aria-hidden className="ng-system-bar__orbit" viewBox="0 0 28 28">
          <circle cx="14" cy="14" fill="none" r="4.5" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="14" cy="14" fill="none" rx="11" ry="5" stroke="currentColor" strokeWidth="1" transform="rotate(-24 14 14)" />
          <ellipse cx="14" cy="14" fill="none" rx="11" ry="5" stroke="currentColor" strokeWidth="1" transform="rotate(28 14 14)" />
        </svg>
      </div>
    </header>
  )
}
