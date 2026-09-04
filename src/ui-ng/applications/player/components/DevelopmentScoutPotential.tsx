import type { DevelopmentScoutPotentialModel } from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'

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
          <table className="pd-potential__table">
            <thead>
              <tr>
                <th scope="col">Domain</th>
                <th className="pd-potential__num" scope="col">
                  Evaluation
                </th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => {
                const selected = selectedItemId === row.id
                return (
                  <tr
                    aria-selected={selected}
                    className={selected ? 'is-selected' : undefined}
                    key={row.id}
                    onClick={() => onSelectItem(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelectItem(row.id)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td>{row.domainLabel}</td>
                    <td className="pd-potential__num">{row.evaluationLabel}</td>
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
