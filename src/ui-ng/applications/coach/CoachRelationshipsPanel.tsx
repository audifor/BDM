import { useMemo, useState } from 'react'
import { getRelationshipBandForPeople, type GameWorld } from '@/domain/world'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

type Relationships = ReturnType<typeof import('@/domain/world').getRelationshipsForPerson>
type Filter = 'all' | 'player' | 'coach' | 'staff'

function resolvePerson(world: GameWorld, id: string) {
  const player = world.players[id as keyof typeof world.players]
  if (player !== undefined) return { name: player.firstName + ' ' + player.lastName, kind: 'player' as const }
  const coach = world.coaches[id as keyof typeof world.coaches]
  if (coach !== undefined) return { name: coach.firstName + ' ' + coach.lastName, kind: 'coach' as const }
  const staff = world.staffPeopleById[id as keyof typeof world.staffPeopleById]
  if (staff !== undefined) return { name: staff.identity.firstName + ' ' + staff.identity.lastName, kind: 'staff' as const }
  return { name: id, kind: 'staff' as const }
}

export function CoachRelationshipsPanel({ world, relationships }: { readonly world: GameWorld; readonly relationships: Relationships }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const rows = useMemo(() => relationships.map((item, index) => {
    const otherId = item.sourceId === world.userCoachId ? item.targetId : item.sourceId
    const person = resolvePerson(world, otherId)
    return {
      id: item.sourceId + ':' + item.targetId + ':' + index,
      name: person.name, kind: person.kind, value: item.value,
      band: getRelationshipBandForPeople(world, item.sourceId, item.targetId),
    }
  }), [relationships, world])
  const visible = rows.filter((item) => (filter === 'all' || item.kind === filter)
    && (item.name + ' ' + item.band).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  const columns = ngTableColumns(visible, [
    ngCol('person', 'Person', (row) => row.name, { value: (row) => row.name }),
    ngCol('kind', 'Role', (row) => row.kind, { value: (row) => row.kind }),
    ngCol('band', 'Relationship', (row) => row.band, { value: (row) => row.band }),
    ngCol('value', 'Value', (row) => row.value, { numeric: true, value: (row) => row.value }),
  ])
  return <section className="coach-relations">
    <header className="coach-relations__header">
      <div><small>YOUR NETWORK</small><h2>Relationships <span>{relationships.length}</span></h2>
        <p>Professional and personal ties registered by the career simulation.</p>
      </div>
      <div className="coach-relations__controls">
        <label className="coach-relations__search"><span>Search</span>
          <input aria-label="Search coach relationships" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or relationship..." type="search" />
        </label>
        <div aria-label="Relationship type" className="coach-relations__filters">
          {(['all', 'player', 'coach', 'staff'] as const).map((kind) =>
            <button key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)} type="button">{kind}</button>)}
        </div>
      </div>
    </header>
    <div className="coach-relations__panel">
      {visible.length > 0 ? <NgPrecisionTable className="ng-canon__table" columns={columns} gridId="ng-coach-relationships" rows={visible} />
        : <p className="coach-relations__empty">{relationships.length === 0 ? 'No materialized relationships.' : 'No matching relationships.'}</p>}
    </div>
  </section>
}
