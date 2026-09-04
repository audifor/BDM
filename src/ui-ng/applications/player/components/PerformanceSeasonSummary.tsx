import type { PerformanceViewSnapshot } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

export function PerformanceSeasonSummary({
  snapshot,
}: {
  readonly snapshot: PerformanceViewSnapshot
}) {
  if (snapshot.status === 'empty') {
    return (
      <section className="pp-season pp-season--empty" data-ng-region="performance-season-summary">
        <header className="pp-season__head">
          <div className="pp-season__context">
            <span className="pp-season__season">{snapshot.seasonLabel}</span>
            <span className="pp-season__meta">{snapshot.contextLabel}</span>
          </div>
        </header>
        <p className="pp-season__empty-message">No appearances recorded this season.</p>
      </section>
    )
  }

  return (
    <section className="pp-season" data-ng-region="performance-season-summary">
      <header className="pp-season__head">
        <div className="pp-season__context">
          <span className="pp-season__season">{snapshot.seasonLabel}</span>
          <span className="pp-season__meta">{snapshot.contextLabel}</span>
        </div>
        <div className="pp-season__playing-time">
          {snapshot.playingTime.map((cell) => (
            <div className="pp-season__time-cell" key={cell.label}>
              <span className="pp-stat-label pp-stat-label--tertiary">{cell.label}</span>
              <span className="pp-stat-value pp-stat-value--tertiary ng-type-numeric">{cell.value}</span>
            </div>
          ))}
        </div>
      </header>
    </section>
  )
}
