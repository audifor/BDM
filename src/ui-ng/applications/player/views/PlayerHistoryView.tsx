import { useMemo } from 'react'

import { HistoryDetailInspector } from '@/ui-ng/applications/player/components/HistoryDetailInspector'
import { HistoryFilters } from '@/ui-ng/applications/player/components/HistoryFilters'
import { HistoryScopeBand } from '@/ui-ng/applications/player/components/HistoryScopeBand'
import { HistoryTimelineList } from '@/ui-ng/applications/player/components/HistoryTimelineList'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import {
  filterHistoryItems,
  findHistoryInspectorDetail,
} from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'
import { useGameStore } from '@/stores/gameStore'

export function PlayerHistoryView() {
  const { model, session } = usePlayerWorkspace()
  const { selectedItemId, setSelectedItemId, activeFilter, setActiveFilter } = session.history

  const history = model?.history
  const visibleItems = useMemo(
    () => (history === undefined ? [] : filterHistoryItems(history.items, activeFilter)),
    [activeFilter, history],
  )

  if (model === null || history === undefined) return null

  return (
    <div className="ph-root" data-ng-region="player-history">
      <HistoryScopeBand scope={history.scope} summary={history.summary} />
      <HistoryFilters
        activeFilter={activeFilter}
        filters={history.filters}
        onSelectFilter={setActiveFilter}
      />
      <HistoryTimelineList
        emptyMessage={history.emptyMessage}
        items={visibleItems}
        onSelectItem={setSelectedItemId}
        selectedItemId={selectedItemId}
      />
    </div>
  )
}

export function HistoryInspectorContent() {
  const { model, session, playerId } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const { selectedItemId } = session.history

  const detail = useMemo(() => {
    if (model === null || world === null || playerId === null) return undefined
    return findHistoryInspectorDetail(world, playerId, model.history, selectedItemId)
  }, [model, playerId, selectedItemId, world])

  return <HistoryDetailInspector detail={detail} />
}
