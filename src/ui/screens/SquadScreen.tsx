import { getCurrentSeason } from '@/app/game'
import { getPlayerAge } from '@/domain/player'
import { getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { calculatePlayerStatAverages, getPlayerCareerStats, getPlayerGameLogs, getPlayerSeasonStats } from '@/engine/stats/PlayerHistory'

interface SquadScreenProps { readonly world: Parameters<typeof getUserTeam>[0] }

export function SquadScreen({ world }: SquadScreenProps) {
  const team = getUserTeam(world)
  if (team === undefined) return null
  const order = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 } as const
  const roster = [...getTeamRoster(world, team.id)].sort((a, b) => order[a.basketball.primaryPosition] - order[b.basketball.primaryPosition] || a.lastName.localeCompare(b.lastName) || a.id.localeCompare(b.id))
  const season = getCurrentSeason(world)

  return <section className="screen">
    <div className="page-heading"><div><p className="eyebrow">SQUAD</p><h1>{team.name}</h1></div><span>{roster.length} PLAYERS</span></div>
    <div className="content-panel table-wrap"><table><thead><tr><th>NAME</th><th>POS</th><th>AGE</th><th>HT</th><th>WT</th><th>FIN</th><th>SHT</th><th>PLY</th><th>PER D</th><th>INT D</th><th>REB</th><th>ATH</th></tr></thead><tbody>{roster.map((player) => { const ratings = player.basketball.ratings; return <tr key={player.id}><td>{player.firstName} {player.lastName}</td><td>{player.basketball.primaryPosition}</td><td>{getPlayerAge(world, player.id)}</td><td>{player.bio.heightCm} cm</td><td>{player.bio.weightKg} kg</td><td>{ratings.finishing}</td><td>{ratings.shooting}</td><td>{ratings.playmaking}</td><td>{ratings.perimeterDefense}</td><td>{ratings.interiorDefense}</td><td>{ratings.rebounding}</td><td>{ratings.athleticism}</td></tr> })}</tbody></table></div>
    <div className="content-panel table-wrap"><p className="eyebrow">SEASON STATS</p><table><thead><tr><th>PLAYER</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>{roster.map((player) => { const stats = getPlayerSeasonStats(world, player.id, season.id); const averages = calculatePlayerStatAverages(stats); return <tr key={player.id}><td>{player.lastName}</td><td>{stats.gamesPlayed}</td><td>{averages.mpg.toFixed(1)}</td><td>{averages.ppg.toFixed(1)}</td><td>{averages.rpg.toFixed(1)}</td><td>{averages.apg.toFixed(1)}</td><td>{averages.spg.toFixed(1)}</td><td>{averages.bpg.toFixed(1)}</td><td>{averages.turnoversPerGame.toFixed(1)}</td><td>{averages.fieldGoalPercentage.toFixed(1)}%</td><td>{averages.threePointPercentage.toFixed(1)}%</td><td>{averages.freeThrowPercentage.toFixed(1)}%</td></tr> })}</tbody></table></div>
    <section className="content-panel"><p className="eyebrow">PLAYER HISTORY</p>{roster.map((player) => <PlayerHistory key={player.id} world={world} player={player} />)}</section>
  </section>
}

function PlayerHistory({ world, player }: { readonly world: Parameters<typeof getUserTeam>[0]; readonly player: ReturnType<typeof getTeamRoster>[number] }) {
  const stats = getPlayerCareerStats(world, player.id); const career = calculatePlayerStatAverages(stats); const logs = getPlayerGameLogs(world, player.id)
  return <details><summary>{player.firstName} {player.lastName} · Career GP {stats.gamesPlayed} · {career.ppg.toFixed(1)} PPG</summary><p>{player.basketball.primaryPosition} · {getPlayerAge(world, player.id)} years · {player.bio.heightCm} cm · {player.bio.weightKg} kg · Born {player.bio.dateOfBirth}</p><div className="table-wrap"><table><thead><tr><th>DATE</th><th>OPP</th><th>RESULT</th><th>MIN</th><th>PTS</th><th>2P</th><th>3P</th><th>FT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th><th>+/-</th></tr></thead><tbody>{logs.map((log) => { const won = log.isHome ? log.finalScore.home > log.finalScore.away : log.finalScore.away > log.finalScore.home; const line = log.stats; return <tr key={log.gameId}><td>{log.gameDate}</td><td>{log.isHome ? 'vs ' : '@ '}{world.teams[log.opponentTeamId]!.name}</td><td>{won ? 'W' : 'L'} {log.isHome ? `${log.finalScore.home}-${log.finalScore.away}` : `${log.finalScore.away}-${log.finalScore.home}`}</td><td>{Math.floor(line.secondsPlayed / 60)}:{String(line.secondsPlayed % 60).padStart(2, '0')}</td><td>{line.points}</td><td>{line.twoPointMade}/{line.twoPointAttempted}</td><td>{line.threePointMade}/{line.threePointAttempted}</td><td>{line.freeThrowsMade}/{line.freeThrowsAttempted}</td><td>{line.rebounds}</td><td>{line.assists}</td><td>{line.steals}</td><td>{line.blocks}</td><td>{line.turnovers}</td><td>{line.foulsCommitted}</td><td>{line.plusMinus > 0 ? `+${line.plusMinus}` : line.plusMinus}</td></tr> })}</tbody></table></div></details>
}
