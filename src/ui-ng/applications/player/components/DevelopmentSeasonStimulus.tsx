import type {
  DevelopmentSeasonStimulusModel,
  DevelopmentStimulusCategoryRowModel,
  DevelopmentStimulusRatingRowModel,
} from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

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
            <NgPrecisionTable
              className="pd-stimulus__table"
              columns={ngTableColumns(model.categories, [
                ngCol<DevelopmentStimulusCategoryRowModel>('category', 'Category', (row) => row.categoryLabel, {
                  value: (row) => row.categoryLabel,
                }),
                ngCol<DevelopmentStimulusCategoryRowModel>(
                  'stimulus',
                  'Stimulus',
                  (row) => row.stimulusTotal.toFixed(1),
                  { numeric: true, value: (row) => row.stimulusTotal },
                ),
              ])}
              gridId="ng-player-dev-stimulus-category"
              onRowClick={(row) => onSelectItem(row.id)}
              onSelectionChange={(ids) => {
                if (ids[0]) onSelectItem(ids[0])
              }}
              rows={model.categories}
              selectedId={selectedItemId ?? undefined}
            />
          </div>
        </div>
        {model.topRatings.length > 0 && (
          <div className="pd-stimulus__section">
            <span className="pd-stat-label pd-stat-label--secondary">Top rating focus</span>
            <div className="pd-stimulus__scroll pd-stimulus__scroll--compact">
              <NgPrecisionTable
                className="pd-stimulus__table"
                columns={ngTableColumns(model.topRatings, [
                  ngCol<DevelopmentStimulusRatingRowModel>(
                    'rating',
                    'Rating',
                    (row) => (
                      <>
                        <span className="pd-stimulus__rating">{row.ratingLabel}</span>
                        <span className="pd-stimulus__category">{row.categoryLabel}</span>
                      </>
                    ),
                    { value: (row) => row.ratingLabel },
                  ),
                  ngCol<DevelopmentStimulusRatingRowModel>('stimulus', 'Stimulus', (row) => row.stimulus.toFixed(1), {
                    numeric: true,
                    value: (row) => row.stimulus,
                  }),
                ])}
                gridId="ng-player-dev-stimulus-ratings"
                onRowClick={(row) => onSelectItem(row.id)}
                onSelectionChange={(ids) => {
                  if (ids[0]) onSelectItem(ids[0])
                }}
                rows={model.topRatings}
                selectedId={selectedItemId ?? undefined}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
