import type { ContractFinancialRowModel } from '@/ui-ng/applications/player/data/buildPlayerContractModel'

export function ContractFinancialSchedule({
  rows,
  selectedItemId,
  onSelectRow,
}: {
  readonly rows: readonly ContractFinancialRowModel[]
  readonly selectedItemId: string | null
  readonly onSelectRow: (rowId: string) => void
}) {
  if (rows.length === 0) {
    return (
      <section className="pc-schedule pc-schedule--empty" data-ng-region="contract-financial-schedule">
        <header className="pc-panel-head">
          <span className="pc-panel-head__title">Financial Schedule</span>
        </header>
        <p className="pc-panel-empty">No financial schedule available.</p>
      </section>
    )
  }

  return (
    <section className="pc-schedule" data-ng-region="contract-financial-schedule">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Financial Schedule</span>
        <span className="pc-panel-head__meta">{rows.length} seasons</span>
      </header>
      <div className="pc-schedule__scroll">
        <table className="pc-schedule__table">
          <colgroup>
            <col className="pc-schedule__col--season" />
            <col className="pc-schedule__col--num" span={3} />
            <col className="pc-schedule__col--status" />
          </colgroup>
          <thead>
            <tr>
              <th className="pc-schedule__col--season" scope="col">
                Season
              </th>
              <th className="pc-schedule__num" scope="col">
                Base
              </th>
              <th className="pc-schedule__num" scope="col">
                Guaranteed
              </th>
              <th className="pc-schedule__num" scope="col">
                Cap hit
              </th>
              <th className="pc-schedule__col--status" scope="col">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedItemId === row.id
              return (
                <tr
                  aria-selected={selected}
                  className={`${row.isCurrent ? 'is-current' : ''}${selected ? ' is-selected' : ''}`.trim()}
                  key={row.id}
                  onClick={() => onSelectRow(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectRow(row.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td className="pc-schedule__col--season">{row.seasonLabel}</td>
                  <td className="pc-schedule__num ng-type-numeric">{row.baseSalary.formatted}</td>
                  <td className="pc-schedule__num ng-type-numeric">{row.guaranteed.formatted}</td>
                  <td className="pc-schedule__num ng-type-numeric">{row.capHit.formatted}</td>
                  <td className="pc-schedule__col--status">{row.guaranteeState}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
