import type { GameId } from '@/domain/ids'

import type { PerformanceViewSnapshot } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

function formBarClass(
  points: number,
  games: readonly { readonly points: number }[],
  seasonAverage: number | undefined,
): string {
  const classes = ['pp-form-game']
  if (games.length === 0) return classes.join(' ')
  const maxPoints = Math.max(...games.map((game) => game.points))
  const minPoints = Math.min(...games.map((game) => game.points))
  if (points === maxPoints) classes.push('is-best')
  if (points === minPoints) classes.push('is-worst')
  if (seasonAverage === undefined) return classes.join(' ')
  if (points >= seasonAverage) classes.push('is-above-avg')
  else classes.push('is-below-avg')
  return classes.join(' ')
}

export function PerformanceRecentForm({
  snapshot,
  selectedGameId,
  onSelectGame,
}: {
  readonly snapshot: PerformanceViewSnapshot
  readonly selectedGameId: GameId | null
  readonly onSelectGame: (gameId: GameId) => void
}) {
  if (snapshot.status === 'empty' || snapshot.recentForm.length === 0) {
    return (
      <section className="pp-form pp-form--empty" data-ng-region="performance-recent-form">
        <header className="pp-panel-head">
          <span className="pp-panel-head__title">Recent Form</span>
        </header>
        <p className="pp-panel-empty">No recent games to display.</p>
      </section>
    )
  }

  const maxPoints = Math.max(...snapshot.recentForm.map((game) => game.points), 1)

  return (
    <section className="pp-form" data-ng-region="performance-recent-form">
      <header className="pp-panel-head">
        <span className="pp-panel-head__title">Recent Form</span>
        <span className="pp-panel-head__meta">Points per game</span>
      </header>
      <div className="pp-form__track" role="list">
        {[...snapshot.recentForm].reverse().map((game) => {
          const height = Math.max(12, Math.round((game.points / maxPoints) * 100))
          const isSelected = selectedGameId === game.gameId
          return (
            <button
              aria-pressed={isSelected}
              className={formBarClass(game.points, snapshot.recentForm, snapshot.seasonAveragePoints)}
              key={game.gameId}
              onClick={() => onSelectGame(game.gameId)}
              role="listitem"
              title={`${game.date} vs ${game.opponent}: ${game.points} PTS`}
              type="button"
            >
              <span className="pp-form-game__bar-wrap">
                <span className="pp-form-game__bar" style={{ height: `${height}%` }} />
              </span>
              <span className="pp-form-game__pts ng-type-numeric">{game.points}</span>
              <span className="pp-form-game__opp">{game.opponent}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
