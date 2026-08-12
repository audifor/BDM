import { getCurrentSeason } from '@/app/game'
import { calculateStandings } from '@/engine/competition/standings'
import type { GameWorld } from '@/domain/world'
import { getSeasonHistory, getSeasonHistoryRecord } from '@/engine/season'

interface StandingsScreenProps {
  readonly world: GameWorld
}

export function StandingsScreen({ world }: StandingsScreenProps) {
  const standings = calculateStandings(world, getCurrentSeason(world).id)
  const currentHistory = getSeasonHistoryRecord(world, getCurrentSeason(world).id)
  const history = getSeasonHistory(world)
  return (
    <section className="screen">
      <div className="page-heading"><div><p className="eyebrow">STANDINGS {currentHistory === undefined ? '' : '· FINAL'}</p><h1>League table</h1></div></div>
      <div className="content-panel table-wrap">
        <table><thead><tr><th>POS</th><th>TEAM</th><th>P</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>+/-</th></tr></thead>
          <tbody>{standings.map((entry) => <tr key={entry.teamId}><td>{entry.position}</td><td>{world.teams[entry.teamId]!.name}{currentHistory?.championTeamId === entry.teamId ? ' · CHAMPION' : ''}</td><td>{entry.played}</td><td>{entry.wins}</td><td>{entry.losses}</td><td>{entry.pointsFor}</td><td>{entry.pointsAgainst}</td><td>{entry.pointDifference > 0 ? '+' : ''}{entry.pointDifference}</td></tr>)}</tbody>
        </table>
      </div>
      {history.length > 0 && <section className="content-panel"><p className="eyebrow">SEASON HISTORY</p>{history.map((record) => <p key={record.seasonId}>{world.seasons[record.seasonId]!.label} · {world.teams[record.championTeamId]!.name} · {record.finalStandings[0]!.wins}-{record.finalStandings[0]!.losses}</p>)}</section>}
    </section>
  )
}
