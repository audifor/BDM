import type {
  DevelopmentSeasonStimulusModel,
  DevelopmentStimulusCategoryRowModel,
  DevelopmentStimulusRatingRowModel,
} from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'

export function DevelopmentSeasonStimulus({
  model,
  selectedItemId,
  onSelectItem,
}: {
  readonly model: DevelopmentSeasonStimulusModel
  readonly selectedItemId: string | null
  readonly onSelectItem: (itemId: string) => void
}) {
  return (
    <section className="pd-stimulus" data-ng-region="development-season-stimulus">
      <header className="pd-panel-head">
        <span className="pd-panel-head__title">Season stimulus</span>
        <span className="pd-panel-head__meta ng-type-numeric">{model.totalStimulus.toFixed(1)} total</span>
      </header>
      <p className="pd-panel-note">{model.contextNote}</p>
      <div className="pd-stimulus__body">
        <div className="pd-stimulus__section">
          <span className="pd-stat-label pd-stat-label--secondary">By category</span>
          <div className="pd-stimulus__scroll">
            <table className="pd-stimulus__table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th className="pd-stimulus__num" scope="col">
                    Stimulus
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.categories.map((row) => (
                  <StimulusCategoryRow
                    key={row.id}
                    onSelect={onSelectItem}
                    row={row}
                    selected={selectedItemId === row.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {model.topRatings.length > 0 && (
          <div className="pd-stimulus__section">
            <span className="pd-stat-label pd-stat-label--secondary">Top rating focus</span>
            <div className="pd-stimulus__scroll pd-stimulus__scroll--compact">
              <table className="pd-stimulus__table">
                <thead>
                  <tr>
                    <th scope="col">Rating</th>
                    <th className="pd-stimulus__num" scope="col">
                      Stimulus
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {model.topRatings.map((row) => (
                    <StimulusRatingRow
                      key={row.id}
                      onSelect={onSelectItem}
                      row={row}
                      selected={selectedItemId === row.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function StimulusCategoryRow({
  row,
  selected,
  onSelect,
}: {
  readonly row: DevelopmentStimulusCategoryRowModel
  readonly selected: boolean
  readonly onSelect: (itemId: string) => void
}) {
  return (
    <tr
      aria-selected={selected}
      className={selected ? 'is-selected' : undefined}
      onClick={() => onSelect(row.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(row.id)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <td>{row.categoryLabel}</td>
      <td className="pd-stimulus__num ng-type-numeric">{row.stimulusTotal.toFixed(1)}</td>
    </tr>
  )
}

function StimulusRatingRow({
  row,
  selected,
  onSelect,
}: {
  readonly row: DevelopmentStimulusRatingRowModel
  readonly selected: boolean
  readonly onSelect: (itemId: string) => void
}) {
  return (
    <tr
      aria-selected={selected}
      className={selected ? 'is-selected' : undefined}
      onClick={() => onSelect(row.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(row.id)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <td>
        <span className="pd-stimulus__rating">{row.ratingLabel}</span>
        <span className="pd-stimulus__category">{row.categoryLabel}</span>
      </td>
      <td className="pd-stimulus__num ng-type-numeric">{row.stimulus.toFixed(1)}</td>
    </tr>
  )
}
