import type { GameWorld } from '@/domain/world'
import type { PlayerId } from '@/domain/ids'
import type { MatchNextPresentationState } from './MatchNextPresentation'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'

export function MatchNextCenterPanel({
  world,
  presentation,
  selectedPlayerId,
  onSelectPlayer,
}: {
  readonly world: GameWorld
  readonly presentation: MatchNextPresentationState
  readonly selectedPlayerId: PlayerId | null
  readonly onSelectPlayer: (playerId: PlayerId) => void
}) {
  const selected = selectedPlayerId === null ? null : presentation.playersById.get(selectedPlayerId) ?? null
  const selectedPlayer = selected === null ? null : world.players[selected.playerId]
  return <section className="me-next-center" aria-label="Match Center de jugadores">
    <div className="me-next-center__teams">
      {[presentation.home, presentation.away].map((team) => {
        const name = world.teams[team.teamId]?.name ?? String(team.teamId)
        return <section className="me-next-team" key={team.teamId} aria-label={`Boxscore ${name}`}>
          <header className="me-next-team__head">
            <strong>{name}</strong>
            <span>{team.score} PTS · {team.currentFive.length} en pista</span>
          </header>
          <div className="me-next-team__table-wrap">
            <table className="me-next-team__table">
              <thead><tr><th>Jugador</th><th>Estado</th><th>MIN</th><th>PTS</th><th>TC</th><th>2PT</th><th>3PT</th><th>REB</th><th>ROB</th><th>FAT. PARTIDO</th></tr></thead>
              <tbody>{team.players.map((row) => {
                const player = world.players[row.playerId]
                if (!player) return null
                const stats = row.stats
                return <tr className={row.onCourt ? 'is-on' : ''} key={row.playerId}>
                  <td><button className="me-next-team__player" onClick={() => onSelectPlayer(row.playerId)} type="button">
                    <span>{player.firstName} {player.lastName}</span><small>{player.basketball.primaryPosition}{row.started ? ' · TITULAR' : ''}</small>
                  </button></td>
                  <td>{row.onCourt ? 'PISTA' : 'BANQUILLO'}</td>
                  <td>{formatMinutes(row.courtTimeSeconds)}</td>
                  <td>{stats.points}</td>
                  <td>{formatShooting(stats.fieldGoalsMade, stats.fieldGoalsAttempted)}</td>
                  <td>{formatShooting(stats.twoPointMade, stats.twoPointAttempted)}</td>
                  <td>{formatShooting(stats.threePointMade, stats.threePointAttempted)}</td>
                  <td>{stats.rebounds}</td>
                  <td>{stats.steals}</td>
                  <td>{Math.round(row.matchFatigue)}%</td>
                </tr>
              })}</tbody>
              <tfoot><tr><th colSpan={2}>TOTAL EQUIPO</th><td>{formatMinutes(team.players.reduce((sum, player) => sum + player.courtTimeSeconds, 0))}</td><td>{team.stats.points}</td><td>{formatShooting(team.stats.fieldGoalsMade, team.stats.fieldGoalsAttempted)}</td><td>{formatShooting(team.stats.twoPointMade, team.stats.twoPointAttempted)}</td><td>{formatShooting(team.stats.threePointMade, team.stats.threePointAttempted)}</td><td>{team.stats.rebounds}</td><td>{team.stats.steals}</td><td /></tr></tfoot>
            </table>
          </div>
        </section>
      })}
    </div>
    {selected && selectedPlayer && <aside className="me-next-player-inspector" aria-label={`Ficha de ${selectedPlayer.firstName} ${selectedPlayer.lastName}`}>
      <button aria-label="Cerrar ficha de jugador" onClick={() => onSelectPlayer(selected.playerId)} type="button">×</button>
      <strong>{selectedPlayer.firstName} {selectedPlayer.lastName}</strong>
      <span>{selectedPlayer.basketball.primaryPosition} · {selected.started ? 'Titular' : 'Suplente'} · {selected.onCourt ? 'En pista' : 'En banquillo'}</span>
      <span>{formatMinutes(selected.courtTimeSeconds)} MIN · {selected.stats.points} PTS · {selected.stats.rebounds} REB · {selected.stats.steals} ROB</span>
      <span>Fatiga del partido: {Math.round(selected.matchFatigue)}% · Fatiga previa: {Math.round(selected.preMatchFatigue)}%</span>
      <button onClick={() => navigateToPlayer(selected.playerId)} type="button">Abrir ficha completa</button>
    </aside>}
  </section>
}

function formatMinutes(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatShooting(made: number, attempted: number): string { return `${made}/${attempted}` }
