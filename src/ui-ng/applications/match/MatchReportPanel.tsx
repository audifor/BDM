import type { Game } from '@/domain/game'
import type { PlayerId } from '@/domain/ids'
import type { MatchStatLog, PlayerGameStatLine } from '@/domain/stats/MatchStatLog'
import { getUserTeam } from '@/engine/calendar'
import type { GameWorld } from '@/domain/world'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { formatMinutesClock, formatPlusMinus, formatShooting } from './engine/matchPresentation'

/** The user's most recent completed Game with its canonical result record, if any. */
export function latestUserMatchLog(world: GameWorld): { readonly game: Game; readonly log: MatchStatLog } | undefined {
  const team = getUserTeam(world)
  if (team === undefined) return undefined
  const completed = Object.values(world.games)
    .filter((game) => game.status === 'completed' && (game.homeTeamId === team.id || game.awayTeamId === team.id) && world.matchStatLogsByGameId[game.id] !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)))[0]
  return completed === undefined ? undefined : { game: completed, log: world.matchStatLogsByGameId[completed.id]! }
}

const RESOLUTION_LABEL = { FULL: 'Jugado en directo', FAST: 'Simulación rápida', BACKGROUND: 'Simulación de fondo' } as const

function totals(lines: readonly PlayerGameStatLine[]) {
  const sum = (pick: (line: PlayerGameStatLine) => number) => lines.reduce((total, line) => total + pick(line), 0)
  return {
    seconds: sum((line) => line.stats.secondsPlayed), points: sum((line) => line.stats.points),
    fgm: sum((line) => line.stats.fieldGoalsMade), fga: sum((line) => line.stats.fieldGoalsAttempted),
    tpm: sum((line) => line.stats.threePointMade), tpa: sum((line) => line.stats.threePointAttempted),
    ftm: sum((line) => line.stats.freeThrowsMade), fta: sum((line) => line.stats.freeThrowsAttempted),
    reb: sum((line) => line.stats.rebounds), ast: sum((line) => line.stats.assists), stl: sum((line) => line.stats.steals),
    blk: sum((line) => line.stats.blocks), tov: sum((line) => line.stats.turnovers), pf: sum((line) => line.stats.foulsCommitted),
  }
}

/** Acta of a completed Game: result and box score read straight from its canonical MatchStatLog (nothing is recomputed from the UI). */
export function MatchReportPanel({ world, game, log }: { readonly world: GameWorld; readonly game: Game; readonly log: MatchStatLog }) {
  const home = world.teams[log.homeTeamId]
  const away = world.teams[log.awayTeamId]
  const userTeamId = getUserTeam(world)?.id
  const userScore = userTeamId === log.homeTeamId ? log.finalScore.home : log.finalScore.away
  const rivalScore = userTeamId === log.homeTeamId ? log.finalScore.away : log.finalScore.home
  const outcome = userScore > rivalScore ? 'VICTORIA' : 'DERROTA'
  return <section className="mp-report" aria-label="Acta del partido" data-game-id={game.id}>
    <header className="mp-report__head">
      <div>
        <p className="mp-eyebrow">Acta · {world.competitions[log.competitionId]?.name ?? 'Competición'} · {String(log.gameDate)}</p>
        <h3 className="mp-report__score" aria-label={`Resultado final ${home?.name} ${log.finalScore.home}, ${away?.name} ${log.finalScore.away}`}>
          <span>{home?.name ?? log.homeTeamId}</span> <b>{log.finalScore.home}</b><i>–</i><b>{log.finalScore.away}</b> <span>{away?.name ?? log.awayTeamId}</span>
        </h3>
      </div>
      <div className="mp-report__meta">
        <strong className={userScore > rivalScore ? 'is-win' : 'is-loss'}>{outcome}</strong>
        <span>{log.resolution === undefined ? 'Resultado registrado' : RESOLUTION_LABEL[log.resolution]}</span>
      </div>
    </header>
    <div className="mp-report__teams">
      {([log.homeTeamId, log.awayTeamId] as const).map((teamId) => {
        const lines = log.playerLines.filter((line) => line.teamId === teamId).sort((a, b) => Number(b.started) - Number(a.started) || b.stats.secondsPlayed - a.stats.secondsPlayed || String(a.playerId).localeCompare(String(b.playerId)))
        const total = totals(lines)
        const teamName = world.teams[teamId]?.name ?? teamId
        return <article className="mp-report__team" key={teamId} aria-label={`Estadísticas ${teamName}`}>
          <h4>{teamName}</h4>
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead><tr><th>Jugador</th><th>MIN</th><th>PTS</th><th>TC</th><th>3P</th><th>TL</th><th>REB</th><th>AST</th><th>ROB</th><th>TAP</th><th>PÉR</th><th>FP</th><th>+/-</th></tr></thead>
              <tbody>{lines.map((line) => <ReportRow key={line.playerId} line={line} world={world} />)}</tbody>
              <tfoot><tr><th>Equipo</th><td>{formatMinutesClock(total.seconds)}</td><td>{total.points}</td><td>{formatShooting(total.fgm, total.fga)}</td><td>{formatShooting(total.tpm, total.tpa)}</td><td>{formatShooting(total.ftm, total.fta)}</td><td>{total.reb}</td><td>{total.ast}</td><td>{total.stl}</td><td>{total.blk}</td><td>{total.tov}</td><td>{total.pf}</td><td /></tr></tfoot>
            </table>
          </div>
        </article>
      })}
    </div>
  </section>
}

function ReportRow({ line, world }: { readonly line: PlayerGameStatLine; readonly world: GameWorld }) {
  const player = world.players[line.playerId as PlayerId]
  const stats = line.stats
  return <tr>
    <th scope="row">
      <button className="mp-link" onClick={() => navigateToPlayer(line.playerId)} type="button">{player === undefined ? String(line.playerId) : `${player.firstName} ${player.lastName}`}</button>
      <small>{player?.basketball.primaryPosition}{line.started ? ' · TITULAR' : ''}</small>
    </th>
    <td>{formatMinutesClock(stats.secondsPlayed)}</td><td>{stats.points}</td><td>{formatShooting(stats.fieldGoalsMade, stats.fieldGoalsAttempted)}</td>
    <td>{formatShooting(stats.threePointMade, stats.threePointAttempted)}</td><td>{formatShooting(stats.freeThrowsMade, stats.freeThrowsAttempted)}</td>
    <td>{stats.rebounds}</td><td>{stats.assists}</td><td>{stats.steals}</td><td>{stats.blocks}</td><td>{stats.turnovers}</td><td>{stats.foulsCommitted}</td><td>{formatPlusMinus(stats.plusMinus)}</td>
  </tr>
}
