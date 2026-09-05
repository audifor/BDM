import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { getTeamRoster, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

import { buildRosterInspectorDossier } from './buildRosterInspectorDossier'
import { buildRosterStaffComments } from './buildRosterStaffComments'

describe('buildRosterInspectorDossier', () => {
  it('omits STAFF when the staff has not written and keeps occupied contract/status/notes', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!
    const dossier = buildRosterInspectorDossier(world, team.id, player)

    expect(buildRosterStaffComments(world, team.id, player.id).groups).toEqual([])
    expect(dossier.zones.map((zone) => zone.id)).toEqual(['contract', 'status', 'notes'])
    expect(dossier.zones.find((zone) => zone.id === 'contract')?.facts.map((fact) => fact.label)).toEqual([
      'Status',
      'Salary',
      'Expiration',
    ])
    expect(dossier.zones.find((zone) => zone.id === 'status')?.facts.some((fact) => fact.label === 'Availability')).toBe(
      true,
    )
    expect(dossier.zones.find((zone) => zone.id === 'notes')?.facts[0]?.value).toMatch(/^\d+ \/ \d+$/)
  })

  it('adds an injury fact without inventing staff commentary', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const player = getTeamRoster(base, team.id)[0]!
    const world = updateGameWorld(base, {
      injuries: [
        ...Object.values(base.injuriesById),
        createInjury({
          id: injuryIdFromString('dossier-injury'),
          playerId: player.id,
          kind: 'ankleSprain',
          severity: 'moderate',
          injuredOn: base.currentDate,
          expectedReturnDate: '2099-01-01' as never,
        }),
      ],
    })
    const dossier = buildRosterInspectorDossier(world, team.id, player)
    const status = dossier.zones.find((zone) => zone.id === 'status')

    expect(status?.facts.find((fact) => fact.label === 'Availability')?.value).toBe('Out')
    expect(status?.facts.find((fact) => fact.label === 'Injury')?.value).toMatch(/ankle/i)
    expect(dossier.zones.some((zone) => zone.id === 'staff')).toBe(false)
  })
})
