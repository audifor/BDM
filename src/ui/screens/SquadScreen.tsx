import { getCountry, getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

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

  return (
    <section className="screen">
      <div className="page-heading"><div><p className="eyebrow">SQUAD</p><h1>{team.name}</h1></div><span>{roster.length} PLAYERS</span></div>
      <div className="content-panel table-wrap">
        <table>
          <thead><tr><th>NAME</th><th>POS</th><th title="Finishing">FIN</th><th title="Shooting">SHT</th><th title="Playmaking">PLY</th><th title="Perimeter Defense">PER D</th><th title="Interior Defense">INT D</th><th title="Rebounding">REB</th><th title="Athleticism">ATH</th></tr></thead>
          <tbody>{roster.map((player) => { const r = player.basketball.ratings; return <tr key={player.id}><td>{player.firstName} {player.lastName}</td><td>{player.basketball.primaryPosition}</td><td>{r.finishing}</td><td>{r.shooting}</td><td>{r.playmaking}</td><td>{r.perimeterDefense}</td><td>{r.interiorDefense}</td><td>{r.rebounding}</td><td>{r.athleticism}</td></tr> })}</tbody>
        </table>
      </div>
    </section>
  )
}

function compareText(a: string, b: string): number { return a === b ? 0 : a < b ? -1 : 1 }
