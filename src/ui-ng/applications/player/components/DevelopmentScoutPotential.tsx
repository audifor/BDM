import type {
  DevelopmentScoutPotentialModel,
  DevelopmentScoutPotentialRowModel,
} from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

export function DevelopmentScoutPotential({
  model,
  selectedItemId,
  onSelectItem,
}: {
  readonly model: DevelopmentScoutPotentialModel
  readonly selectedItemId: string | null
  readonly onSelectItem: (itemId: string) => void
}) {
  return (
    <section className="pd-potential" data-ng-region="development-scout-potential">
      <header className="pd-panel-head">
        <span className="pd-panel-head__title">Scout potential</span>
      </header>
      <p className="pd-panel-note">{model.contextNote}</p>
      {model.status === 'unavailable' ? (
        <p className="pd-panel-empty">{model.unavailableLabel ?? 'Potential evaluations unavailable.'}</p>
      ) : (
        <div className="pd-potential__scroll">
          <NgPrecisionTable
            className="pd-potential__table"
            columns={ngTableColumns(model.rows, [
              ngCol<DevelopmentScoutPotentialRowModel>('domain', 'Domain', (row) => row.domainLabel, {
                value: (row) => row.domainLabel,
              }),
              ngCol<DevelopmentScoutPotentialRowModel>('evaluation', 'Evaluation', (row) => row.evaluationLabel, {
                numeric: true,
                value: (row) => row.evaluationLabel,
              }),
            ])}
            gridId="ng-player-dev-scout-potential"
            onRowClick={(row) => onSelectItem(row.id)}
            onSelectionChange={(ids) => {
              if (ids[0]) onSelectItem(ids[0])
            }}
            rows={model.rows}
            selectedId={selectedItemId ?? undefined}
          />
        </div>
      )}
    </section>
  )
}
