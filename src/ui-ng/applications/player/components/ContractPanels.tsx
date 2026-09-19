import { GapList } from '@/ui-ng/applications/player/components/DeclaredGaps'
import type {
  ContractIntelligenceModel,
  ContractMoneySnapshotModel,
  ContractStatusBandModel,
} from '@/ui-ng/applications/player/data/buildPlayerContractModel'
import type { OverviewGapModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'

/** CONTRACT SUMMARY: club, type, status and the two dates that define the term. */
export function ContractSummaryPanel({
  band,
  emptyMessage,
  compensationNote = null,
}: {
  readonly band: ContractStatusBandModel | null
  readonly emptyMessage: string | null
  readonly compensationNote?: string | null
}) {
  if (band === null) {
    return (
      <section className="pc-summary" data-ng-region="contract-summary">
        <header className="pc-panel-head">
          <span className="pc-panel-head__title">Contract summary</span>
        </header>
        <p className="pc-panel-empty">{emptyMessage ?? 'No contract recorded.'}</p>
      </section>
    )
  }

  const rows: readonly { readonly label: string; readonly value: string }[] = [
    { label: 'Contract type', value: band.contractType },
    { label: 'Status', value: band.statusLabel },
    { label: 'Start date', value: band.startDate },
    { label: 'End date', value: band.endDate },
    { label: 'Remaining seasons', value: band.seasonsRemaining ?? '—' },
  ]

  return (
    <section className="pc-summary" data-ng-region="contract-summary">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Contract summary</span>
      </header>
      <div className={`pc-summary__club is-${band.statusTone}`}>
        <span className="pc-summary__crest" aria-hidden>
          {band.teamName.slice(0, 2).toUpperCase()}
        </span>
        <span className="pc-summary__team">{band.teamName}</span>
        <span className="pc-summary__competition">{band.currentSeasonLabel ?? '—'}</span>
      </div>
      <dl className="pc-summary__facts">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {compensationNote !== null && <span className="pc-panel-note">{compensationNote}</span>}
    </section>
  )
}

/** FINANCIAL SNAPSHOT: the three money figures of the anchored season. */
export function ContractFinancialSnapshotPanel({
  snapshot,
}: {
  readonly snapshot: ContractMoneySnapshotModel
}) {
  const cells: readonly { readonly id: string; readonly label: string; readonly value: string | null }[] = [
    { id: 'base', label: 'Base salary', value: snapshot.baseSalary },
    { id: 'guaranteed', label: 'Guaranteed money', value: snapshot.guaranteed },
    { id: 'cap', label: 'Cap hit', value: snapshot.capHit },
  ]

  return (
    <section className="pc-snapshot" data-ng-region="contract-financial-snapshot">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Financial snapshot</span>
        <span className="pc-panel-head__meta">{snapshot.seasonLabel ?? 'No season'}</span>
      </header>
      <div className="pc-snapshot__grid">
        {cells.map((cell) => (
          <div className="pc-snapshot__cell" key={cell.id}>
            <span className="pc-snapshot__label">{cell.label}</span>
            <span className="pc-snapshot__value ng-type-numeric">{cell.value ?? '—'}</span>
          </div>
        ))}
      </div>
      <span className="pc-panel-note">{snapshot.note}</span>
    </section>
  )
}

/** CONTRACT INTELLIGENCE: the dated readings and the decision they imply. */
export function ContractIntelligencePanel({
  intelligence,
}: {
  readonly intelligence: ContractIntelligenceModel
}) {
  return (
    <section className="pc-intel" data-ng-region="contract-intelligence">
      <header className="pc-panel-head">
        <span className="pc-panel-head__title">Contract intelligence</span>
      </header>
      <dl className="pc-intel__facts">
        <div>
          <dt>Next key date</dt>
          <dd>
            <span className="ng-type-numeric">{intelligence.nextKeyDateLabel}</span>
            <span className="pc-intel__note">{intelligence.nextKeyDateNote}</span>
          </dd>
        </div>
        <div>
          <dt>Expiry risk</dt>
          <dd>
            <span className={`pc-intel__risk is-${intelligence.expiryRiskTone}`}>
              {intelligence.expiryRiskLabel}
            </span>
            <span className="pc-intel__note">{intelligence.expiryRiskNote}</span>
          </dd>
        </div>
        <div>
          <dt>Decision required</dt>
          <dd>
            <span className="ng-type-numeric">{intelligence.decisionLabel}</span>
            <span className="pc-intel__note">{intelligence.decisionNote}</span>
          </dd>
        </div>
      </dl>

      <span className="pc-intel__section">Recent contract events</span>
      {intelligence.events.length === 0 ? (
        <p className="pc-panel-empty">No contract activity recorded.</p>
      ) : (
        <ul className="pc-intel__events">
          {intelligence.events.map((event) => (
            <li className={`is-${event.tone}`} key={event.id}>
              <span aria-hidden className="pc-intel__dot" />
              <span className="pc-intel__event-label">{event.label}</span>
              <span className="pc-intel__event-date ng-type-numeric">{event.dateLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The five reference panels the save has no data for. Rendering them as declared gaps keeps the
 * mockup's shape without inventing clauses, market values or negotiation state.
 */
export function ContractClosingPanels({
  gaps,
}: {
  readonly gaps: readonly OverviewGapModel[]
}) {
  const titles: Record<string, string> = {
    clauses: 'Clauses & options',
    registration: 'Rights / registration',
    negotiation: 'Negotiation intelligence',
    market: 'Market context',
    'decision-center': 'Decision center',
  }

  return (
    <div className="pc-closing" data-ng-region="contract-closing">
      {gaps
        .filter((gap) => titles[gap.id] !== undefined)
        .map((gap) => (
          <section className="pc-gap-panel" key={gap.id}>
            <header className="pc-panel-head">
              <span className="pc-panel-head__title">{titles[gap.id]}</span>
            </header>
            <GapList gaps={[gap]} />
          </section>
        ))}
    </div>
  )
}
