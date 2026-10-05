import { useMemo } from 'react'

import {
  HistoryCareerTotalsStrip,
  HistoryContractPanel,
  HistoryDetailPanel,
  HistoryHonoursPanel,
  HistoryInternationalPanel,
  HistoryMilestoneTable,
  HistoryTeamPanel,
  HistoryTimelinePanel,
} from '@/ui-ng/applications/player/components/HistoryBoardPanels'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { findHistoryInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'
import { useGameStore } from '@/stores/gameStore'
import { resolveTalentHistoryDestination } from '@/ui-ng/applications/talent/TalentHistoryRouteResolver'
import { navigateToTalentDestination } from '@/ui-ng/workspace/workspaceApps'

export function PlayerHistoryView() {
  const { model, playerId, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const { selectedItemId, setSelectedItemId } = session.history

  const detail = useMemo(() => {
    if (model === null || world === null || playerId === null) return undefined
    return findHistoryInspectorDetail(world, playerId, model.history, selectedItemId)
  }, [model, playerId, selectedItemId, world])

  if (model === null) return null

  const history = model.history
  const onSelect = (selectionId: string): void => setSelectedItemId(selectionId)

  return (
    <div className="po-hs-board" data-ng-region="player-history">
      <div className="po-hs-main">
        {playerId ? (() => {
          const actions = history.items.flatMap((item) => { const destination = resolveTalentHistoryDestination(item, playerId); return destination ? [{ item, destination }] : [] })
          return actions.length > 0 ? <section aria-label="Pathway navigation" className="ng-canon__panel ng-holo-panel"><h2 className="ng-canon__title">Pathway destinations</h2><ul>{actions.map(({ item, destination }) => <li key={item.id}>{item.dateLabel} · {item.title} <button className="ng-canon__link" onClick={() => navigateToTalentDestination(destination)} type="button">Open {destination.app === 'player' ? `Player ${destination.playerView ?? 'overview'}` : destination.app}</button></li>)}</ul></section> : null
        })() : null}
        <HistoryTimelinePanel
          events={history.timeline}
          onSelect={onSelect}
          selectedSelectionId={selectedItemId}
        />

        <div className="po-hs-row--middle">
          <HistoryTeamPanel
            onSelect={onSelect}
            rows={history.teamHistory}
            selectedSelectionId={selectedItemId}
          />
          <div className="po-hs-row--stack">
            <HistoryContractPanel
              onSelect={onSelect}
              rows={history.contractHistory}
              selectedSelectionId={selectedItemId}
            />
            <HistoryHonoursPanel
              honours={history.honours}
              note={history.honoursNote}
              onSelect={onSelect}
              selectedSelectionId={selectedItemId}
            />
          </div>
        </div>

        <div className="po-hs-row--milestones">
          <HistoryMilestoneTable
            columns={['Date', 'Event', 'Value']}
            emptyMessage="No game has been recorded yet, so there is no performance milestone."
            onSelect={onSelect}
            region="history-performance-milestones"
            rows={history.performanceMilestones}
            selectedSelectionId={selectedItemId}
            title="Performance milestones"
            withValue
          />
          <HistoryInternationalPanel gap={history.gaps.find((gap) => gap.id === 'international')} />
          <HistoryMilestoneTable
            columns={['Season', 'Event']}
            emptyMessage="No development transition has been recorded yet."
            onSelect={onSelect}
            region="history-development-milestones"
            rows={history.developmentMilestones}
            selectedSelectionId={selectedItemId}
            title="Development milestones"
            withValue={false}
          />
          <HistoryMilestoneTable
            columns={['Date', 'Event']}
            emptyMessage="No transfer, draft or loan is recorded in this save."
            onSelect={onSelect}
            region="history-transactions"
            rows={history.transactions}
            selectedSelectionId={selectedItemId}
            title="Transactions"
            withValue={false}
          />
        </div>

        <HistoryCareerTotalsStrip totals={history.careerTotals} />
      </div>

      <HistoryDetailPanel detail={detail} onClose={() => setSelectedItemId(null)} />
    </div>
  )
}
