import type { ContractFinancialRowModel } from '@/ui-ng/applications/player/data/buildPlayerContractModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

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

  const maxSalary = Math.max(1, ...rows.map((row) => row.baseSalary.amount))
  const focusedRow = rows.find(row => row.id === selectedItemId) ?? rows.find(row => row.isCurrent) ?? rows[0]!
  return (
    <section className="pc-schedule" data-ng-region="contract-financial-schedule">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Financial Schedule</span>
        <span className="pc-panel-head__meta">{rows.length} seasons</span>
      </header>
      <div className="pc-schedule__trend" aria-label="Salary and guaranteed cash by season">
        <span className="pc-schedule__trend-legend">BASE SALARY <i /> GUARANTEED</span>
        <div className="pc-schedule__trend-bars">
          {rows.map((row) => (
            <button key={row.id} type="button"
              aria-label={`${row.seasonLabel}: base ${row.baseSalary.formatted}, guaranteed ${row.guaranteed.formatted}`}
              aria-pressed={selectedItemId === row.id}
              onClick={() => onSelectRow(row.id)}>
              <span className="pc-schedule__trend-track">
                <span className="pc-schedule__trend-salary"
                  style={{ height: `${row.baseSalary.amount / maxSalary * 100}%` }}>
                  <span className="pc-schedule__trend-guaranteed"
                    style={{ height: `${row.baseSalary.amount > 0 ? row.guaranteed.amount / row.baseSalary.amount * 100 : 0}%` }} />
                </span>
              </span>
              <small>{row.seasonLabel}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="pc-schedule__selected" data-ng-region="contract-selected-season"
        aria-live="polite">
        <span className="pc-schedule__selected-title">{focusedRow.seasonLabel}</span>
        <div><small>BASE</small><strong>{focusedRow.baseSalary.formatted}</strong></div>
        <div><small>GUARANTEED</small><strong>{focusedRow.guaranteed.formatted}</strong></div>
        <div><small>CAP HIT</small><strong>{focusedRow.capHit.formatted}</strong></div>
        <div><small>STATUS</small><strong>{focusedRow.guaranteeState}</strong></div>
      </div>
      <div className="pc-schedule__scroll">
        <NgPrecisionTable
          className="pc-schedule__table"
          columns={ngTableColumns(rows, [
            ngCol<ContractFinancialRowModel>('season', 'Season', (row) => row.seasonLabel, {
              responsivePriority: 1,
              value: (row) => row.seasonLabel,
            }),
            ngCol<ContractFinancialRowModel>('base', 'Base', (row) => row.baseSalary.formatted, {
              numeric: true,
              responsivePriority: 1,
              value: (row) => row.baseSalary.amount,
            }),
            ngCol<ContractFinancialRowModel>('guaranteed', 'Guaranteed', (row) => row.guaranteed.formatted, {
              numeric: true,
              responsivePriority: 1,
              value: (row) => row.guaranteed.amount,
            }),
            ngCol<ContractFinancialRowModel>('capHit', 'Cap hit', (row) => row.capHit.formatted, {
              numeric: true,
              responsivePriority: 1,
              value: (row) => row.capHit.amount,
            }),
            ngCol<ContractFinancialRowModel>('status', 'Status', (row) => row.guaranteeState, {
              responsivePriority: 2,
              value: (row) => row.guaranteeState,
            }),
          ])}
          gridId="ng-player-contract-schedule"
          onRowClick={(row) => onSelectRow(row.id)}
          onSelectionChange={(ids) => {
            if (ids[0]) onSelectRow(ids[0])
          }}
          rows={rows}
          selectedId={selectedItemId ?? undefined}
        />
      </div>
    </section>
  )
}
