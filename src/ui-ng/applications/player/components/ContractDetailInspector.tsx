import type { ContractInspectorSeasonDetail } from '@/ui-ng/applications/player/data/buildPlayerContractModel'

export function ContractDetailInspector({
  detail,
}: {
  readonly detail: ContractInspectorSeasonDetail | undefined
}) {
  if (detail === undefined) {
    return (
      <div className="pc-inspector pc-inspector--empty" data-ng-region="contract-inspector">
        <p className="pc-inspector__hint">
          Select a season from the financial schedule or term timeline to inspect compensation detail.
        </p>
      </div>
    )
  }

  return (
    <div className="pc-inspector" data-ng-region="contract-inspector">
      <header className="pc-inspector__head">
        <span className="pc-inspector__season">{detail.seasonLabel}</span>
        <span className="pc-inspector__meta">{detail.contractStatus}</span>
      </header>

      <div className="pc-inspector__grid">
        <div className="pc-inspector__cell">
          <span className="pc-stat-label pc-stat-label--primary">Base</span>
          <span className="pc-stat-value pc-stat-value--primary ng-type-numeric">{detail.baseSalary.formatted}</span>
        </div>
        <div className="pc-inspector__cell">
          <span className="pc-stat-label pc-stat-label--primary">Guaranteed</span>
          <span className="pc-stat-value pc-stat-value--primary ng-type-numeric">{detail.guaranteed.formatted}</span>
        </div>
        <div className="pc-inspector__cell">
          <span className="pc-stat-label pc-stat-label--secondary">Cap hit</span>
          <span className="pc-stat-value pc-stat-value--secondary ng-type-numeric">{detail.capHit.formatted}</span>
        </div>
      </div>

      <div className="pc-inspector__footer">
        <span className="pc-stat-label pc-stat-label--tertiary">Guarantee</span>
        <span className="pc-stat-value pc-stat-value--secondary">{detail.guaranteeState}</span>
      </div>
    </div>
  )
}
