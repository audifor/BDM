import './SystemBar.css'

import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { useGameStore } from '@/stores/gameStore'
import { getUserTeam } from '@/engine/calendar'

export function SystemBar() {
  const world = useGameStore((state) => state.world)
  const userTeam = world === null ? undefined : getUserTeam(world)
  const season = world === null ? undefined : world.seasons[world.currentSeasonId]
  const competition = season === undefined || world === null ? undefined : world.competitions[season.competitionId]

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
        <button className="ng-btn ng-btn--ghost" type="button">Inbox</button>
        <button className="ng-btn ng-btn--primary" type="button">Continue</button>
      </div>
    </header>
  )
}
