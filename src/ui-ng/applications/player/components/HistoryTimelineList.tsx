import type { PlayerHistoryItemModel } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'

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
          <table className="ph-timeline__table">
            <colgroup>
              <col className="ph-timeline__col--date" />
              <col className="ph-timeline__col--event" />
              <col className="ph-timeline__col--context" />
            </colgroup>
            <thead>
              <tr>
                <th className="ph-timeline__col--date" scope="col">
                  Date / Season
                </th>
                <th className="ph-timeline__col--event" scope="col">
                  Event
                </th>
                <th className="ph-timeline__col--context" scope="col">
                  Context
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const selected = selectedItemId === item.id
                return (
                  <tr
                    aria-selected={selected}
                    className={selected ? 'is-selected' : undefined}
                    key={item.id}
                    onClick={() => onSelectItem(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelectItem(item.id)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="ph-timeline__date">
                      <span>{item.dateLabel}</span>
                      {item.datePrecision === 'season' && (
                        <span className="ph-timeline__precision">Season</span>
                      )}
                    </td>
                    <td className="ph-timeline__event">
                      <span className="ph-timeline__title">{item.title}</span>
                      <span className="ph-timeline__detail">{item.detail}</span>
                    </td>
                    <td className="ph-timeline__context">{item.contextLabel ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
