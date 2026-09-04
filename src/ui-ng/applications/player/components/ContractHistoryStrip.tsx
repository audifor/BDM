import type {
  ContractHistoryEntryModel,
  ContractRightsModel,
} from '@/ui-ng/applications/player/data/buildPlayerContractModel'

export function ContractHistoryStrip({
  entries,
}: {
  readonly entries: readonly ContractHistoryEntryModel[]
}) {
  if (entries.length === 0) return null

  return (
    <section className="pc-history" data-ng-region="contract-history">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Previous Agreements</span>
        <span className="pc-panel-head__meta">{entries.length}</span>
      </header>
      <ul className="pc-history__list">
        {entries.map((entry) => (
          <li className="pc-history__item" key={entry.id}>
            <span className="pc-history__team">{entry.teamName}</span>
            <span className="pc-history__term">{entry.termLabel}</span>
            <span className="pc-history__status">{entry.statusLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ContractRightsStrip({ rights }: { readonly rights: ContractRightsModel }) {
  if (rights.status === 'unavailable') return null

  return (
    <section className="pc-rights" data-ng-region="contract-rights">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Rights / Registration</span>
      </header>
      <dl className="pc-rights__grid">
        {rights.items.map((item) => (
          <div key={`${item.label}-${item.value}`}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
