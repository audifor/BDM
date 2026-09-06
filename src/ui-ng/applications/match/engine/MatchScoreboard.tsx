import type { ReactNode } from 'react'

export function MatchScoreboard({
  home,
  away,
  score,
  controls,
  meta,
}: {
  readonly home: ReactNode
  readonly away: ReactNode
  readonly score: ReactNode
  readonly controls: ReactNode
  readonly meta: ReactNode
}) {
  return (
    <header className="me-scoreboard" data-me-region="scoreboard">
      <div className="me-scoreboard__match">
        <div className="me-scoreboard__team is-home">{home}</div>
        <div className="me-scoreboard__center">{score}</div>
        <div className="me-scoreboard__team is-away">{away}</div>
      </div>
      <div className="me-scoreboard__ops">
        <div className="me-scoreboard__controls">{controls}</div>
        <div className="me-scoreboard__meta">{meta}</div>
      </div>
    </header>
  )
}

export function TeamScoreSummary({
  mark,
  name,
  record,
  fouls,
  timeouts,
  side,
  onOpen,
}: {
  readonly mark: string
  readonly name: string
  readonly record: string
  readonly fouls: number | null
  readonly timeouts: number | null
  readonly side: 'home' | 'away'
  readonly onOpen?: () => void
}) {
  const identity =
    onOpen === undefined ? (
      <>
        {side === 'home' ? <span className="me-team-summary__mark">{mark}</span> : null}
        <div className="me-team-summary__copy">
          <strong title={name}>{name}</strong>
          <em>{record}</em>
          <div className="me-team-summary__chips">
            <span>
              FALTAS <b>{fouls === null ? '—' : fouls}</b>
            </span>
            <span>
              TO <b>{timeouts === null ? '—' : timeouts}</b>
            </span>
          </div>
        </div>
        {side === 'away' ? <span className="me-team-summary__mark is-away">{mark}</span> : null}
      </>
    ) : (
      <button className="me-team-summary__open" onClick={onOpen} type="button">
        {side === 'home' ? <span className="me-team-summary__mark">{mark}</span> : null}
        <div className="me-team-summary__copy">
          <strong title={name}>{name}</strong>
          <em>{record}</em>
          <div className="me-team-summary__chips">
            <span>
              FALTAS <b>{fouls === null ? '—' : fouls}</b>
            </span>
            <span>
              TO <b>{timeouts === null ? '—' : timeouts}</b>
            </span>
          </div>
        </div>
        {side === 'away' ? <span className="me-team-summary__mark is-away">{mark}</span> : null}
      </button>
    )

  return <div className={`me-team-summary is-${side}`}>{identity}</div>
}

export function GameClock({
  homeScore,
  awayScore,
  periodLabel,
  clockLabel,
  shotClock,
  finished,
  arena,
  location,
  attendance,
}: {
  readonly homeScore: number
  readonly awayScore: number
  readonly periodLabel: string
  readonly clockLabel: string
  readonly shotClock: number | null
  readonly finished: boolean
  readonly arena?: string
  readonly location?: string
  readonly attendance?: string | null
}) {
  return (
    <div className="me-game-clock-stack">
      <div className="me-game-clock">
        <b className="me-game-clock__score">{homeScore}</b>
        <div className="me-game-clock__core">
          <em>{finished ? 'FINAL' : periodLabel}</em>
          <strong>{finished ? '00:00' : clockLabel}</strong>
          <span className="me-game-clock__shot" title={shotClock === null ? 'Shot clock no modelado en el engine' : 'Shot clock'}>
            {shotClock === null ? '—' : shotClock}
          </span>
        </div>
        <b className="me-game-clock__score">{awayScore}</b>
      </div>
      {arena === undefined ? null : (
        <div className="me-game-clock__venue">
          <span className="me-game-clock__venue-icon" aria-hidden>
            ▣
          </span>
          <div>
            <strong>{arena}</strong>
            {location === undefined || location === '' ? null : <em>{location}</em>}
          </div>
          {attendance === undefined || attendance === null ? null : (
            <span className="me-game-clock__attendance">
              Asistencia <b>{attendance}</b>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function MatchQuickControls({
  isPlaying,
  speed,
  speeds,
  finished,
  canContinue,
  onTogglePlay,
  onSetSpeed,
  onNextPossession,
  onTimeout,
  onSubs,
  onSkipPeriod,
  onSkipEnd,
  onContinue,
}: {
  readonly isPlaying: boolean
  readonly speed: number
  readonly speeds: readonly number[]
  readonly finished: boolean
  readonly canContinue: boolean
  readonly onTogglePlay: () => void
  readonly onSetSpeed: (speed: number) => void
  readonly onNextPossession: () => void
  readonly onTimeout: () => void
  readonly onSubs: () => void
  readonly onSkipPeriod: () => void
  readonly onSkipEnd: () => void
  readonly onContinue: () => void
}) {
  if (finished) {
    return (
      <div className="me-quick">
        <button className="me-quick__btn is-emphasis" disabled={!canContinue} onClick={onContinue} type="button">
          Continuar
        </button>
      </div>
    )
  }

  return (
    <div className="me-quick" aria-label="Acciones rápidas">
      <span className="me-quick__label">Acciones</span>
      <div className="me-quick__rows">
        <div className="me-quick__row">
          <button
            aria-label={isPlaying ? 'Pausar partido' : 'Reanudar partido'}
            aria-pressed={isPlaying}
            className={`me-quick__btn is-icon${isPlaying ? ' is-active' : ''}`}
            onClick={onTogglePlay}
            type="button"
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          {speeds.map((value) => (
            <button
              aria-pressed={speed === value}
              className={`me-quick__btn${speed === value ? ' is-active' : ''}`}
              key={value}
              onClick={() => onSetSpeed(value)}
              type="button"
            >
              {value}x
            </button>
          ))}
        </div>
        <div className="me-quick__row">
          <button className="me-quick__btn" onClick={onNextPossession} title="Siguiente posesión" type="button">
            Posesión
          </button>
          <button className="me-quick__btn" onClick={onTimeout} type="button">
            Tiempo
          </button>
          <button className="me-quick__btn" onClick={onSubs} type="button">
            Cambios
          </button>
          <button
            aria-label="Simular hasta el final del cuarto"
            className="me-quick__btn is-emphasis"
            onClick={onSkipPeriod}
            title="Simular cuarto"
            type="button"
          >
            Cuarto
          </button>
          <button className="me-quick__btn" onClick={onSkipEnd} type="button">
            Final
          </button>
        </div>
      </div>
    </div>
  )
}
