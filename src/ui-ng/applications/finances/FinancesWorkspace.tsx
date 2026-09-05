import { getContractYearCompensation, getPlayerContractStatus } from '@/domain/contract'
import { getUserTeam } from '@/engine/calendar'
import { calculateTeamPayroll, calculateTeamSalaryStatus } from '@/engine/salary'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'

export function FinancesWorkspace() {
  const world = useGameStore((state) => state.world)
  if (world === null) {
    return <NgHoloShell appLabel="Finances" empty emptyMessage="No career loaded." region="finances-workspace" />
  }

  const team = getUserTeam(world)
  const rules = world.salaryRulesBySeasonId[world.currentSeasonId]
  if (team === undefined) {
    return <NgHoloShell appLabel="Finances" empty region="finances-workspace" />
  }
  if (rules === undefined) {
    return (
      <NgHoloShell
        appLabel="Finances"
        empty
        emptyMessage="No salary-cap rules for the active cycle."
        region="finances-workspace"
        teamId={team.id}
      />
    )
  }

  const contracts = Object.values(world.contractsById).filter(
    (contract) => contract.teamId === team.id && getPlayerContractStatus(contract, world.currentDate) === 'active',
  )
  const deadMoney = Object.values(world.deadMoneyChargesById)
    .filter((charge) => charge.teamId === team.id && charge.seasonId === rules.seasonId)
    .reduce((sum, charge) => sum + charge.amount, 0)
  const status = calculateTeamSalaryStatus(rules, calculateTeamPayroll(contracts, world.currentDate, deadMoney))
  const exceptions = Object.values(world.salaryExceptionsById).filter((item) => item.teamId === team.id)

  return (
    <NgHoloShell
      appLabel="Finances"
      meta={`${status.capSpace >= 0 ? 'Cap space' : 'Over cap'} ${formatMoney(Math.abs(status.capSpace))}`}
      region="finances-workspace"
      teamId={team.id}
      title={team.name}
    >
      <div className="ng-canon__overview">
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Cap</p>
          <h3 className="ng-canon__title">{formatMoney(status.payroll.totalCapHit)}</h3>
          <dl className="ng-canon__metrics">
            <NgMetric label="Cap" value={formatMoney(status.capAmount)} />
            <NgMetric label="Floor" value={status.salaryFloor === undefined ? '—' : formatMoney(status.salaryFloor)} />
            <NgMetric label="Tax" value={status.taxThreshold === undefined ? '—' : formatMoney(status.taxThreshold)} />
            <NgMetric label="Tax overage" value={formatMoney(status.taxOverage)} />
            <NgMetric label="Aprons" value={status.activeApronIds.length === 0 ? 'None' : status.activeApronIds.join(', ')} />
          </dl>
        </section>
      </div>
      <div className="ng-canon__panel ng-holo-panel" style={{ marginTop: 'var(--ng-spacing-12)' }}>
        <p className="ng-canon__eyebrow">Contracts</p>
        <NgPrecisionTable
          className="ng-canon__table"
          columns={[
            ngCol('player', 'Player', (row) =>
              row.player === undefined ? (
                row.playerId
              ) : (
                <button className="ng-canon__link" onClick={() => navigateToPlayer(row.player.id)} type="button">
                  {row.player.firstName} {row.player.lastName}
                </button>
              ), { value: (row) => row.player === undefined ? row.playerId : `${row.player.firstName} ${row.player.lastName}` }),
            ngCol('years', 'Years', (row) => row.years, { numeric: true, value: (row) => row.years }),
            ngCol('cash', 'Cash', (row) => formatMoney(row.cashSalary), { numeric: true, value: (row) => row.cashSalary }),
            ngCol('cap', 'Cap hit', (row) => formatMoney(row.capHit), { numeric: true, value: (row) => row.capHit }),
            ngCol('guaranteed', 'Guaranteed', (row) => formatMoney(row.guaranteedAmount), { numeric: true, value: (row) => row.guaranteedAmount }),
          ]}
          gridId="ng-finances-contracts"
          rows={contracts.map((contract) => {
            const player = world.players[contract.playerId]
            const compensation = getContractYearCompensation(contract, world.currentDate)
            return {
              id: contract.id,
              playerId: contract.playerId,
              player,
              years: contract.compensation.years?.length ?? 1,
              cashSalary: compensation.cashSalary,
              capHit: compensation.capHit,
              guaranteedAmount: compensation.guaranteedAmount,
            }
          })}
        />
      </div>
      <div className="ng-canon__panel ng-holo-panel" style={{ marginTop: 'var(--ng-spacing-12)' }}>
        <p className="ng-canon__eyebrow">Exceptions</p>
        {exceptions.length === 0 ? (
          <p className="ng-canon__empty">No salary exceptions.</p>
        ) : (
          <NgPrecisionTable
            className="ng-canon__table"
            columns={[
              ngCol('rule', 'Exception', (item) => item.ruleId, { value: (item) => item.ruleId }),
              ngCol('original', 'Original', (item) => formatMoney(item.originalAmount), { numeric: true, value: (item) => item.originalAmount }),
              ngCol('remaining', 'Remaining', (item) => formatMoney(item.remainingAmount), { numeric: true, value: (item) => item.remainingAmount }),
              ngCol('expiry', 'Expiry', (item) => item.expiresAfterSeasonId, { value: (item) => item.expiresAfterSeasonId }),
              ngCol('status', 'Status', (item) => item.status, { value: (item) => item.status }),
            ]}
            gridId="ng-finances-exceptions"
            rows={exceptions}
          />
        )}
      </div>
    </NgHoloShell>
  )
}
