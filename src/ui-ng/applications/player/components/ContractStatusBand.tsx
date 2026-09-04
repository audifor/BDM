import type { ContractStatusBandModel } from '@/ui-ng/applications/player/data/buildPlayerContractModel'

export function ContractStatusBand({
  band,
  emptyMessage,
  compensationContextNote,
}: {
  readonly band: ContractStatusBandModel | null
  readonly emptyMessage: string | null
  readonly compensationContextNote: 'Currency not tracked' | null
}) {
  if (band === null) return null

  if (emptyMessage !== null) {
    return (
      <section className="pc-status pc-status--empty" data-ng-region="contract-status-band">
        <div className="pc-status__context">
          <span className="pc-status__team">{band.teamName}</span>
          <span className={`pc-status__pill pc-status__pill--${band.statusTone}`}>{band.statusLabel}</span>
        </div>
        <p className="pc-status__empty-message">{emptyMessage}</p>
        {band.currentSeasonLabel !== null && (
          <span className="pc-status__meta">Current season · {band.currentSeasonLabel}</span>
        )}
      </section>
    )
  }

  return (
    <section className="pc-status" data-ng-region="contract-status-band">
      <div className="pc-status__primary">
        <div className="pc-status__context">
          <span className="pc-status__team">{band.teamName}</span>
          <span className={`pc-status__pill pc-status__pill--${band.statusTone}`}>{band.statusLabel}</span>
        </div>
        <div className="pc-status__facts">
          <div className="pc-status__fact">
            <span className="pc-stat-label pc-stat-label--tertiary">Type</span>
            <span className="pc-stat-value pc-stat-value--secondary">{band.contractType}</span>
          </div>
          <div className="pc-status__fact">
            <span className="pc-stat-label pc-stat-label--tertiary">Start</span>
            <span className="pc-stat-value pc-stat-value--secondary">{band.startDate}</span>
          </div>
          <div className="pc-status__fact">
            <span className="pc-stat-label pc-stat-label--tertiary">End</span>
            <span className="pc-stat-value pc-stat-value--secondary">{band.endDate}</span>
          </div>
          {band.seasonsRemaining !== null && (
            <div className="pc-status__fact">
              <span className="pc-stat-label pc-stat-label--tertiary">Remaining</span>
              <span className="pc-stat-value pc-stat-value--secondary">{band.seasonsRemaining}</span>
            </div>
          )}
        </div>
      </div>
      <div className="pc-status__meta-row">
        {band.currentSeasonLabel !== null && <span>Current season · {band.currentSeasonLabel}</span>}
        {compensationContextNote !== null && <span>{compensationContextNote}</span>}
      </div>
    </section>
  )
}
