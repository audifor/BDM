import { getCountry, getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

interface SquadScreenProps {
  readonly world: Parameters<typeof getUserTeam>[0]
}

export function SquadScreen({ world }: SquadScreenProps) {
  const team = getUserTeam(world)
  if (team === undefined) return null
  const roster = getTeamRoster(world, team.id)

  return (
    <section className="screen">
      <div className="page-heading"><div><p className="eyebrow">SQUAD</p><h1>{team.name}</h1></div><span>{roster.length} PLAYERS</span></div>
      <div className="content-panel table-wrap">
        <table>
          <thead><tr><th>NAME</th><th>NATIONALITY</th></tr></thead>
          <tbody>{roster.map((player) => <tr key={player.id}><td>{player.firstName} {player.lastName}</td><td>{getCountry(world, player.nationalityId).name}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  )
}
