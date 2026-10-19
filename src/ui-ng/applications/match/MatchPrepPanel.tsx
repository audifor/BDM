import type { PlayerId } from '@/domain/ids'
import { PICK_AND_ROLL_COVERAGE_OPTIONS, TACTICAL_DEFENSE_OPTIONS } from '@/engine/match'
import type { GameWorld } from '@/domain/world'
import type { MatchReadinessPlayer, UserMatchReadiness } from '@/app/game/UserMatchReadiness'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { teamRecordLabel } from './engine/matchPresentation'

const PACE_LABELS = ['Muy lento', 'Lento', 'Equilibrado', 'Rápido', 'Máximo ritmo'] as const
const SHOT_LABELS = ['Evitar', 'Menos', 'Normal', 'Más', 'Priorizar'] as const
const BLOCK_LABEL = { NOT_ON_ROSTER: 'Fuera de plantilla', INACTIVE_CAREER: 'Inactivo', INJURED: 'Lesionado', INELIGIBLE: 'No elegible' } as const

function nameOf(world: GameWorld, playerId: PlayerId): string {
  const player = world.players[playerId]
  return player === undefined ? String(playerId) : `${player.firstName} ${player.lastName}`
}

function PlayerLine({ world, player }: { readonly world: GameWorld; readonly player: Pick<MatchReadinessPlayer, 'playerId' | 'position'> & Partial<MatchReadinessPlayer> }) {
  return <li className="mp-player">
    <span className="mp-pos">{player.position}</span>
    <button className="mp-link" onClick={() => navigateToPlayer(player.playerId)} type="button">{nameOf(world, player.playerId)}</button>
    {player.expectedMinutes !== undefined && <span className="mp-minutes" title="Minutos previstos">{player.expectedMinutes}′</span>}
    {player.fatigue !== undefined && player.fatigue >= 25 && <span className="mp-fatigue" title="Fatiga acumulada">Fatiga {Math.round(player.fatigue)}%</span>}
  </li>
}

/** Presentation of the next game: what the engine will actually field (starters, rotation, availability) and the tactical plan it will execute. */
export function MatchPrepPanel({ world, readiness, onOpenRoster, onOpenTactics }: {
  readonly world: GameWorld
  readonly readiness: UserMatchReadiness
  readonly onOpenRoster: () => void
  readonly onOpenTactics: () => void
}) {
  const { game, userTeamId, opponentTeamId, tactics } = readiness
  const home = world.teams[game.homeTeamId]!
  const away = world.teams[game.awayTeamId]!
  const startersByPlayer = new Map(readiness.players.map((player) => [player.playerId, player]))
  const starters = readiness.starters.map((playerId) => startersByPlayer.get(playerId)).filter((player): player is MatchReadinessPlayer => player !== undefined)
  const bench = readiness.players.filter((player) => player.role === 'BENCH').sort((a, b) => b.expectedMinutes - a.expectedMinutes || String(a.playerId).localeCompare(String(b.playerId)))
  const reserves = readiness.players.filter((player) => player.role === 'RESERVE')
  const unavailable = readiness.players.filter((player) => player.role === 'UNAVAILABLE')
  const preset = TACTICAL_DEFENSE_OPTIONS.find((option) => option.interior === tactics.defense.interior && option.perimeter === tactics.defense.perimeter)?.label ?? 'Individual'
  const coverage = PICK_AND_ROLL_COVERAGE_OPTIONS.find((option) => option.value === (tactics.defense.pickAndRollCoverage ?? 'switch'))?.label ?? 'Switch'
  return <div className="mp-prep" data-testid="match-prep">
    <section className="mp-card mp-card--fixture" aria-label="Presentación del encuentro">
      <p className="mp-eyebrow">{readiness.competitionName} · {readiness.isToday ? 'Hoy' : formatGameDateLabel(game.date)} · {readiness.isHome ? 'En casa' : 'Fuera'}</p>
      <div className="mp-versus">
        <div><strong>{home.name}</strong><small>{teamRecordLabel(world, home.id)}</small></div>
        <span>VS</span>
        <div><strong>{away.name}</strong><small>{teamRecordLabel(world, away.id)}</small></div>
      </div>
      <p className="mp-note">{readiness.periodCount} periodos de {readiness.periodMinutes}′ · prórroga si hay empate. Tú eres {world.teams[userTeamId]!.name}; el rival es {world.teams[opponentTeamId]!.name}.</p>
    </section>

    {readiness.blockedReason !== undefined && <p className="mp-alert" role="alert">{readiness.blockedReason}</p>}
    {readiness.issues.length > 0 && <ul className="mp-alert" role="alert" aria-label="Avisos de preparación">{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}

    <section className="mp-card" aria-label="Quinteto inicial">
      <header className="mp-card__head"><h3>Tu quinteto inicial</h3><span>{readiness.lineupSource === 'SAVED_USER_LINEUP' ? 'Elegido por ti' : 'Elegido por el entrenador'}</span></header>
      {starters.length === 0 ? <p className="mp-empty">No hay quinteto disponible.</p> : <ol className="mp-list">{starters.map((player) => <PlayerLine key={player.playerId} player={player} world={world} />)}</ol>}
      <button className="mp-action mp-action--ghost" onClick={onOpenRoster} type="button">Cambiar en Plantilla</button>
    </section>

    <section className="mp-card" aria-label="Rotación prevista">
      <header className="mp-card__head"><h3>Banquillo y rotación</h3><span>{readiness.rotationSource === 'USER_MINUTES' ? 'Minutos fijados por ti' : 'Minutos del cuerpo técnico'}</span></header>
      {bench.length === 0 ? <p className="mp-empty">Sin suplentes con minutos previstos.</p> : <ul className="mp-list">{bench.map((player) => <PlayerLine key={player.playerId} player={player} world={world} />)}</ul>}
      {reserves.length > 0 && <p className="mp-note">Sin minutos previstos: {reserves.map((player) => nameOf(world, player.playerId)).join(', ')}.</p>}
      <p className="mp-note">Los cambios los ejecuta el cuerpo técnico en las paradas: toma estos minutos como objetivo y los ajusta por posición, fatiga y faltas; el motor no admite sustituciones manuales en directo.</p>
    </section>

    <section className="mp-card" aria-label="No disponibles">
      <header className="mp-card__head"><h3>No disponibles</h3><span>{unavailable.length}</span></header>
      {unavailable.length === 0 ? <p className="mp-empty">Toda la plantilla está disponible.</p> : <ul className="mp-list">{unavailable.map((player) => <li className="mp-player is-unavailable" key={player.playerId}>
        <span className="mp-pos">{player.position}</span>
        <button className="mp-link" onClick={() => navigateToPlayer(player.playerId)} type="button">{nameOf(world, player.playerId)}</button>
        <span className="mp-tag">{player.blockReason === undefined ? 'No disponible' : BLOCK_LABEL[player.blockReason]}</span>
      </li>)}</ul>}
    </section>

    <section className="mp-card" aria-label="Plan táctico">
      <header className="mp-card__head"><h3>Plan táctico</h3><span>{readiness.hasGameTacticalOverride ? 'Ajuste de este partido' : 'Plan del equipo'}</span></header>
      <dl className="mp-facts">
        <div><dt>Ritmo</dt><dd>{PACE_LABELS[tactics.pace + 2]}</dd></div>
        <div><dt>Triples</dt><dd>{SHOT_LABELS[tactics.shotProfile.threePoint + 2]}</dd></div>
        <div><dt>Ataque al aro</dt><dd>{SHOT_LABELS[tactics.shotProfile.rim + 2]}</dd></div>
        <div><dt>Media distancia</dt><dd>{SHOT_LABELS[tactics.shotProfile.midRange + 2]}</dd></div>
        <div><dt>Esquema defensivo</dt><dd>{preset}</dd></div>
        <div><dt>Defensa del bloqueo</dt><dd>{coverage}</dd></div>
        <div><dt>Jugador destacado</dt><dd>{tactics.featuredPlayerId === undefined ? 'Ninguno' : nameOf(world, tactics.featuredPlayerId)}</dd></div>
        <div><dt>Emparejamientos</dt><dd>{readiness.matchupCount === 0 ? 'Automáticos' : `${readiness.matchupCount} asignados`}</dd></div>
      </dl>
      <button className="mp-action mp-action--ghost" onClick={onOpenTactics} type="button">Cambiar en Tácticas</button>
    </section>

    <section className="mp-card" aria-label="Quinteto rival">
      <header className="mp-card__head"><h3>Quinteto rival previsto</h3><span>{world.teams[opponentTeamId]!.name}</span></header>
      <ol className="mp-list">{readiness.opponentStarters.map((playerId) => <PlayerLine key={playerId} player={{ playerId, position: world.players[playerId]!.basketball.primaryPosition }} world={world} />)}</ol>
    </section>
  </div>
}
