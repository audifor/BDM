import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

export function PerformanceStrip() {
  const { model } = usePlayerWorkspace()
  if (model === null) return null

  const { seasonPerformance } = model

  if (seasonPerformance.status === 'unavailable') {
    return (
      <section className="po-perf-strip po-perf-strip--empty">
        <header className="po-deck-head">
          <span className="po-lane-title">Season Performance</span>
          <span className="po-lane-meta">{seasonPerformance.metaLabel ?? 'Not available'}</span>
        </header>
        <p className="po-lane-empty">No season statistics recorded for this player yet.</p>
      </section>
    )
  }

  return (
    <section className="po-perf-strip">
      <header className="po-deck-head">
        <span className="po-lane-title">
          Season Performance
          {seasonPerformance.valuation === null ? null : (
            <span className="po-lane-val">
              <span className="ng-type-numeric">{seasonPerformance.valuation}</span>
              <small>VAL</small>
            </span>
          )}
        </span>
        <span className="po-lane-meta">{seasonPerformance.metaLabel ?? 'Current season'}</span>
      </header>
      <div className="po-perf-strip__body">
        <div className="po-perf-primary">
          {seasonPerformance.primary.map((stat) => (
            <div className="po-perf-primary__stat" key={stat.label}>
              <span className="po-perf-primary__label">{stat.label}</span>
              <div className="po-perf-primary__value-row">
                <span className="po-perf-primary__value ng-type-numeric">{stat.value}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="po-perf-secondary">
          {seasonPerformance.secondary.map((stat) => (
            <div className="po-perf-secondary__stat" key={stat.label}>
              <span className="po-perf-secondary__label">{stat.label}</span>
              <span className="po-perf-secondary__value ng-type-numeric">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function formBarClass(points: number, games: readonly { readonly points: number }[], seasonAverage?: number): string {
  const classes = ['po-form-game']
  const maxPoints = Math.max(...games.map((game) => game.points))
  const minPoints = Math.min(...games.map((game) => game.points))
  if (points === maxPoints) classes.push('is-best')
  if (points === minPoints) classes.push('is-worst')
  if (seasonAverage === undefined) return classes.join(' ')
  if (points >= seasonAverage) classes.push('is-above-avg')
  else classes.push('is-below-avg')
  return classes.join(' ')
}

export function FormTimeline() {
  const { model } = usePlayerWorkspace()
  if (model === null) return null

  const { recentForm } = model

  if (recentForm.status === 'unavailable' || recentForm.games.length === 0) {
    return (
      <section className="po-form po-form--empty">
        <header className="po-deck-head">
          <span className="po-lane-title">Recent Form</span>
          <span className="po-lane-meta">Not available</span>
        </header>
        <p className="po-lane-empty">Recent game logs are not available for this player yet.</p>
      </section>
    )
  }

  const formMaxPoints = Math.max(...recentForm.games.map((game) => game.points))

  return (
    <section className="po-form">
      <header className="po-deck-head">
        <span className="po-lane-title">Recent Form</span>
        <span className="po-lane-meta">Last {recentForm.games.length} appearances</span>
      </header>
      <div className="po-form__body">
        <div className="po-form__chart">
          {recentForm.games.map((game) => (
            <div className={formBarClass(game.points, recentForm.games, recentForm.seasonAveragePoints)} key={game.id}>
              <div className="po-form-game__meta">
                <span className="po-form-game__label">{game.label}</span>
                <span className="po-form-game__opp">{game.opponent}</span>
              </div>
              <span className="po-form-game__pts ng-type-numeric">{game.points}</span>
              <span
                className={`po-form-game__delta ng-type-numeric ${game.plusMinus >= 0 ? 'ng-text-positive' : 'ng-text-negative'}`}
              >
                {game.plusMinus >= 0 ? '+' : ''}{game.plusMinus}
              </span>
              <div className="po-form-game__bar-track">
                <span
                  className="po-form-game__bar-fill"
                  style={{ height: `${(game.points / formMaxPoints) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {recentForm.seasonAveragePoints !== undefined && (
          <div className="po-form__legend">
            <span className="po-form__legend-item">
              <span className="po-form__legend-mark po-form__legend-mark--avg" />
              Season avg {recentForm.seasonAveragePoints.toFixed(1)} PTS
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

