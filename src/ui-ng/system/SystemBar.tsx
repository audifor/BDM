import './SystemBar.css'

import { getContinueStopReason, type ContinueStopReason } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { SimulateUntilControl } from '@/ui-ng/system/SimulateUntilControl'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

function continueButtonLabel(stopType: ContinueStopReason['type'] | undefined): string {
  if (stopType === 'userGame') return 'Match'
  if (stopType === 'mediaOpportunity') return 'Press'
  return 'Continue'
}

export function SystemBar() {
  const world = useGameStore((state) => state.world)
  const continueGame = useGameStore((state) => state.continueGame)
  const userTeam = world === null ? undefined : getUserTeam(world)
  const season = world === null ? undefined : world.seasons[world.currentSeasonId]
  const competition = season === undefined || world === null ? undefined : world.competitions[season.competitionId]
  const stop = world === null ? undefined : getContinueStopReason(world)
  const blocked = world === null || stop?.type === 'seasonComplete'

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
        <button
          aria-label={continueButtonLabel(stop?.type)}
          className="ng-btn ng-btn--primary"
          disabled={blocked}
          onClick={() => {
            if (world === null) return
            if (stop?.type === 'userGame') {
              syncWorkspaceAppQuery('match')
              return
            }
            if (stop?.type === 'mediaOpportunity') {
              syncWorkspaceAppQuery('media')
              return
            }
            if (stop?.type === 'seasonComplete') return
            continueGame()
          }}
          type="button"
        >
          {continueButtonLabel(stop?.type)}
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
