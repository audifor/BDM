import { getCountry, getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { calculatePlayerStatAverages, getPlayerCareerStats, getPlayerGameLogs, getPlayerSeasonStats } from '@/engine/stats/PlayerHistory'

interface SquadScreenProps {
  readonly world: Parameters<typeof getUserTeam>[0]
}

export function SquadScreen({ world }: SquadScreenProps) {
  const team = getUserTeam(world)
  if (team === undefined) return null
  const positionOrder = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 } as const
  const roster = [...getTeamRoster(world, team.id)].sort((a, b) =>
    positionOrder[a.basketball.primaryPosition] - positionOrder[b.basketball.primaryPosition] ||
    compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName) || compareText(a.id, b.id),
  )
  const season = Object.values(world.seasons)[0]

  return (
    <section className="screen">
      <div className="page-heading"><div><p className="eyebrow">SQUAD</p><h1>{team.name}</h1></div><span>{roster.length} PLAYERS</span></div>
      <div className="content-panel table-wrap">
        <table>
          <thead><tr><th>NAME</th><th>POS</th><th title="Finishing">FIN</th><th title="Shooting">SHT</th><th title="Playmaking">PLY</th><th title="Perimeter Defense">PER D</th><th title="Interior Defense">INT D</th><th title="Rebounding">REB</th><th title="Athleticism">ATH</th></tr></thead>
          <tbody>{roster.map((player) => { const r = player.basketball.ratings; return <tr key={player.id}><td>{player.firstName} {player.lastName}</td><td>{player.basketball.primaryPosition}</td><td>{r.finishing}</td><td>{r.shooting}</td><td>{r.playmaking}</td><td>{r.perimeterDefense}</td><td>{r.interiorDefense}</td><td>{r.rebounding}</td><td>{r.athleticism}</td></tr> })}</tbody>
        </table>
      </div>
      {season !== undefined && <div className="content-panel table-wrap"><p className="eyebrow">SEASON STATS</p><table><thead><tr><th>PLAYER</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>{roster.map((player) => { const stats = getPlayerSeasonStats(world, player.id, season.id); const averages = calculatePlayerStatAverages(stats); return <tr key={player.id}><td>{player.lastName}</td><td>{stats.gamesPlayed}</td><td>{averages.mpg.toFixed(1)}</td><td>{averages.ppg.toFixed(1)}</td><td>{averages.rpg.toFixed(1)}</td><td>{averages.apg.toFixed(1)}</td><td>{averages.spg.toFixed(1)}</td><td>{averages.bpg.toFixed(1)}</td><td>{averages.turnoversPerGame.toFixed(1)}</td><td>{averages.fieldGoalPercentage.toFixed(1)}%</td><td>{averages.threePointPercentage.toFixed(1)}%</td><td>{averages.freeThrowPercentage.toFixed(1)}%</td></tr> })}</tbody></table></div>}
      <section className="content-panel"><p className="eyebrow">PLAYER HISTORY</p>{roster.map((player) => { const career = calculatePlayerStatAverages(getPlayerCareerStats(world, player.id)); const logs = getPlayerGameLogs(world, player.id); return <details key={player.id}><summary>{player.firstName} {player.lastName} · Career GP {getPlayerCareerStats(world, player.id).gamesPlayed} · {career.ppg.toFixed(1)} PPG</summary><div className="table-wrap"><table><thead><tr><th>DATE</th><th>OPP</th><th>RESULT</th><th>MIN</th><th>PTS</th><th>2P</th><th>3P</th><th>FT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th><th>+/-</th></tr></thead><tbody>{logs.map((log) => { const opponent = world.teams[log.opponentTeamId]!.name; const won = log.isHome ? log.finalScore.home > log.finalScore.away : log.finalScore.away > log.finalScore.home; const s = log.stats; return <tr key={log.gameId}><td>{log.gameDate}</td><td>{log.isHome ? 'vs ' : '@ '}{opponent}</td><td>{won ? 'W' : 'L'} {log.isHome ? `${log.finalScore.home}-${log.finalScore.away}` : `${log.finalScore.away}-${log.finalScore.home}`}</td><td>{Math.floor(s.secondsPlayed / 60)}:{String(s.secondsPlayed % 60).padStart(2, '0')}</td><td>{s.points}</td><td>{s.twoPointMade}/{s.twoPointAttempted}</td><td>{s.threePointMade}/{s.threePointAttempted}</td><td>{s.freeThrowsMade}/{s.freeThrowsAttempted}</td><td>{s.rebounds}</td><td>{s.assists}</td><td>{s.steals}</td><td>{s.blocks}</td><td>{s.turnovers}</td><td>{s.foulsCommitted}</td><td>{s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}</td></tr> })}</tbody></table></div></details> })}</section>
    </section>
  )
}

function compareText(a: string, b: string): number { return a === b ? 0 : a < b ? -1 : 1 }
