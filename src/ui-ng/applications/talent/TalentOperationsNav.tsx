import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'
import type { PlayerId } from '@/domain/ids'
import { navigateToTalentApp } from '@/ui-ng/workspace/workspaceApps'
import './talent-operations.css'

const items = [
  ['talent', 'Overview'],
  ['scouting', 'Scouting'],
  ['recruiting', 'Recruiting'],
  ['portal', 'Transfer Portal'],
  ['draft', 'Draft'],
  ['player', 'Player'],
] as const

export function TalentOperationsNav({ current }: { readonly current: WorkspaceAppId }) {
  const world = useGameStore((state) => state.world)
  const capabilities = world === null ? null : resolveGameCapabilities(world)
  const visibleItems = items.filter(([app]) =>
    (app !== 'recruiting' && app !== 'portal' || capabilities?.isNcaa === true) &&
    (app !== 'draft' || capabilities?.hasDraft === true),
  )
  return (
    <nav aria-label="Talent operations" className="talent-operations-nav">
      {visibleItems.map(([app, label]) => (
        <button
          aria-current={current === app ? 'page' : undefined}
          className={current === app ? 'is-active' : undefined}
          key={app}
          onClick={() => {
            const params = new URLSearchParams(window.location.search)
            const playerId = params.get('focusPlayerId') ?? params.get('playerId')
            navigateToTalentApp(app, playerId === null ? undefined : playerId as PlayerId)
          }}
          type="button"
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
import { resolveGameCapabilities } from '@/ui/gameContext'
import { useGameStore } from '@/stores/gameStore'
