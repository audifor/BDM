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

  return (
    <section className="pc-schedule" data-ng-region="contract-financial-schedule">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Financial Schedule</span>
        <span className="pc-panel-head__meta">{rows.length} seasons</span>
      </header>
      <div className="pc-schedule__scroll">
        <NgPrecisionTable
          className="pc-schedule__table"
          columns={ngTableColumns(rows, [
            ngCol<ContractFinancialRowModel>('season', 'Season', (row) => row.seasonLabel, {
              value: (row) => row.seasonLabel,
            }),
            ngCol<ContractFinancialRowModel>('base', 'Base', (row) => row.baseSalary.formatted, {
              numeric: true,
              value: (row) => row.baseSalary.amount,
            }),
            ngCol<ContractFinancialRowModel>('guaranteed', 'Guaranteed', (row) => row.guaranteed.formatted, {
              numeric: true,
              value: (row) => row.guaranteed.amount,
            }),
            ngCol<ContractFinancialRowModel>('capHit', 'Cap hit', (row) => row.capHit.formatted, {
              numeric: true,
              value: (row) => row.capHit.amount,
            }),
            ngCol<ContractFinancialRowModel>('status', 'Status', (row) => row.guaranteeState, {
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
