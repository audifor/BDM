import type { PlayerHistoryItemModel } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

export function HistoryTimelineList({
  items,
  emptyMessage,
  selectedItemId,
  onSelectItem,
}: {
  readonly items: readonly PlayerHistoryItemModel[]
  readonly emptyMessage: string | null
  readonly selectedItemId: string | null
  readonly onSelectItem: (itemId: string) => void
}) {
  return (
    <section className="ph-timeline" data-ng-region="history-timeline">
      <header className="ph-panel-head">
        <span className="ph-panel-head__title">Career chronology</span>
        <span className="ph-panel-head__meta">{items.length} events</span>
      </header>
      {items.length === 0 ? (
        <p className="ph-panel-empty">{emptyMessage ?? 'No history available.'}</p>
      ) : (
        <div className="ph-timeline__scroll">
          <NgPrecisionTable
            className="ph-timeline__table"
            columns={ngTableColumns(items, [
              ngCol<PlayerHistoryItemModel>(
                'date',
                'Date / Season',
                (item) => (
                  <span className="ph-timeline__date">
                    <span>{item.dateLabel}</span>
                    {item.datePrecision === 'season' && <span className="ph-timeline__precision">Season</span>}
                  </span>
                ),
                { value: (item) => item.sortDate },
              ),
              ngCol<PlayerHistoryItemModel>(
                'event',
                'Event',
                (item) => (
                  <span className="ph-timeline__event">
                    <span className="ph-timeline__title">{item.title}</span>
                    <span className="ph-timeline__detail">{item.detail}</span>
                  </span>
                ),
                { value: (item) => item.title },
              ),
              ngCol<PlayerHistoryItemModel>('context', 'Context', (item) => item.contextLabel ?? '—', {
                value: (item) => item.contextLabel ?? '—',
              }),
            ])}
            gridId="ng-player-history-timeline"
            onRowClick={(item) => onSelectItem(item.id)}
            onSelectionChange={(ids) => {
              if (ids[0]) onSelectItem(ids[0])
            }}
            rows={items}
            selectedId={selectedItemId ?? undefined}
          />
        </div>
      )}
    </section>
  )
}
