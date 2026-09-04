import type {
  HistoryFilterId,
  HistoryFilterModel,
} from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'

export function HistoryFilters({
  filters,
  activeFilter,
  onSelectFilter,
}: {
  readonly filters: readonly HistoryFilterModel[]
  readonly activeFilter: HistoryFilterId
  readonly onSelectFilter: (filterId: HistoryFilterId) => void
}) {
  if (filters.length <= 1) return null

  return (
    <div className="ph-filters" data-ng-region="history-filters" role="tablist">
      {filters.map((filter) => {
        const active = activeFilter === filter.id
        return (
          <button
            aria-selected={active}
            className={active ? 'is-active' : undefined}
            key={filter.id}
            onClick={() => onSelectFilter(filter.id)}
            role="tab"
            type="button"
          >
            {filter.label}
            <span className="ph-filters__count">{filter.count}</span>
          </button>
        )
      })}
    </div>
  )
}
