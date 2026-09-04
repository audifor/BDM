import type { HistoryScopeModel, HistorySummaryModel } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'

export function HistoryScopeBand({
  scope,
  summary,
}: {
  readonly scope: HistoryScopeModel
  readonly summary: HistorySummaryModel
}) {
  return (
    <section className="ph-scope" data-ng-region="history-scope-band">
      <div className="ph-scope__primary">
        <span className="ph-scope__title">{scope.headline}</span>
        <div className="ph-scope__counts">
          <span className="ph-scope__count">Contracts {summary.contractCount}</span>
          <span className="ph-scope__count">Medical {summary.medicalCount}</span>
          <span className="ph-scope__count">Seasons {summary.seasonCount}</span>
          <span className="ph-scope__count">Games {summary.gameCount}</span>
        </div>
      </div>
      <p className="ph-scope__note">{scope.scopeNote}</p>
      <p className="ph-scope__gaps">{scope.gapsNote}</p>
    </section>
  )
}
