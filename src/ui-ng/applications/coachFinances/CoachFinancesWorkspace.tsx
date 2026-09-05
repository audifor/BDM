import { useState } from 'react'

import {
  getCoachFinancialPosition,
  getCoachMonthlyExpenses,
  getCoachMonthlyExternalIncome,
  getCoachNetWorth,
  LIFESTYLE_MONTHLY_COST,
  type Lifestyle,
} from '@/domain/coachFinances'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'assets', label: 'Wealth' },
  { id: 'income', label: 'Income' },
  { id: 'history', label: 'History' },
] as const

export function CoachFinancesWorkspace() {
  const world = useGameStore((state) => state.world)
  const setUserCoachLifestyle = useGameStore((state) => state.setUserCoachLifestyle)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('summary')

  if (world === null) {
    return <NgHoloShell appLabel="Wealth" empty emptyMessage="No career loaded." region="coach-finances-workspace" />
  }

  const profile = world.coachFinancesByCoachId[world.userCoachId]
  if (profile === undefined) {
    return <NgHoloShell appLabel="Wealth" empty emptyMessage="Coach finances are unavailable." region="coach-finances-workspace" />
  }

  const position = getCoachFinancialPosition(profile)

  return (
    <NgHoloShell
      activeTabId={tab}
      appLabel="Wealth"
      meta={position.security}
      onTabSelect={(id) => setTab(id as (typeof TABS)[number]['id'])}
      region="coach-finances-workspace"
      tabs={TABS}
      title="Coach finances"
    >
      {tab === 'summary' ? (
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Position</p>
          <h3 className="ng-canon__title">{position.security}</h3>
          <dl className="ng-canon__metrics">
            <NgMetric label="Net worth" value={formatMoney(getCoachNetWorth(profile))} />
            <NgMetric label="Cash" value={formatMoney(profile.cash)} />
            <NgMetric label="Salary" value={formatMoney(profile.annualSalary)} />
            <NgMetric label="Monthly spend" value={formatMoney(getCoachMonthlyExpenses(profile))} />
            <NgMetric label="Other income" value={formatMoney(getCoachMonthlyExternalIncome(profile))} />
            <NgMetric
              label="Runway"
              value={Number.isFinite(position.runwayMonths) ? `${position.runwayMonths.toFixed(1)} months` : 'Unlimited'}
            />
          </dl>
        </section>
      ) : null}
      {tab === 'lifestyle' ? (
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__note">Structural cost {formatMoney(LIFESTYLE_MONTHLY_COST[profile.lifestyle])} / month</p>
          <div className="ng-canon__actions">
            {(Object.keys(LIFESTYLE_MONTHLY_COST) as Lifestyle[]).map((lifestyle) => (
              <button
                className="ng-canon__action"
                key={lifestyle}
                onClick={() => setUserCoachLifestyle(lifestyle)}
                type="button"
              >
                {lifestyle}
                {lifestyle === profile.lifestyle ? ' · current' : ''}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {tab === 'assets' ? (
        <section className="ng-canon__card ng-holo-panel">
          {profile.assets.length === 0 && profile.investments.length === 0 && profile.debts.length === 0 ? (
            <p className="ng-canon__empty">No active positions.</p>
          ) : (
            <ul className="ng-canon__list">
              {profile.assets.map((item) => (
                <li key={item.id}>
                  {item.name}: {formatMoney(item.marketValue)} · {item.kind}
                </li>
              ))}
              {profile.investments.map((item) => (
                <li key={item.id}>
                  {item.name}: {formatMoney(item.value)} · {item.status}
                </li>
              ))}
              {profile.debts.map((item) => (
                <li key={item.id}>
                  {item.name}: -{formatMoney(item.principalRemaining)} · {item.status}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {tab === 'income' ? (
        <section className="ng-canon__card ng-holo-panel">
          {profile.externalIncomes.length === 0 ? (
            <p className="ng-canon__empty">No sponsorships or external income.</p>
          ) : (
            <ul className="ng-canon__list">
              {profile.externalIncomes.map((item) => (
                <li key={item.id}>
                  {item.name}: {formatMoney(item.monthlyGrossAmount)} / month · {item.kind}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {tab === 'history' ? (
        <section className="ng-canon__card ng-holo-panel">
          {profile.movements.length === 0 ? (
            <p className="ng-canon__empty">Salary, expenses and relevant decisions will appear here.</p>
          ) : (
            <ul className="ng-canon__list">
              {profile.movements
                .slice(-12)
                .reverse()
                .map((movement) => (
                  <li key={movement.id}>
                    {movement.date} · {movement.description} · {formatMoney(movement.amount)}
                  </li>
                ))}
            </ul>
          )}
        </section>
      ) : null}
    </NgHoloShell>
  )
}
