import type { PerformanceViewSnapshot } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

export function PerformanceShootingPanel({
  snapshot,
}: {
  readonly snapshot: PerformanceViewSnapshot
}) {
  if (snapshot.status === 'empty') {
    return (
      <section className="pp-shooting pp-shooting--empty" data-ng-region="performance-shooting">
        <header className="pp-panel-head">
          <span className="pp-panel-head__title">Shooting</span>
        </header>
        <p className="pp-panel-empty">No shooting data recorded.</p>
      </section>
    )
  }

  return (
    <section className="pp-shooting" data-ng-region="performance-shooting">
      <header className="pp-panel-head">
        <span className="pp-panel-head__title">Shooting</span>
        <span className="pp-panel-head__meta">Per game · season</span>
      </header>
      <div className="pp-shooting__lines">
        {snapshot.shooting.map((line) => (
          <div className="pp-shooting__line" key={line.label}>
            <span className="pp-shooting__label">{line.label}</span>
            <span className="pp-shooting__attempts ng-type-numeric">
              {line.madePerGame} / {line.attemptedPerGame}
            </span>
            <span className="pp-shooting__pct ng-type-numeric">
              {line.percentage === null ? '—' : `${line.percentage}%`}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
