import { describe, expect, it } from 'vitest'

import type { PlayerId } from '@/domain/ids'
import type { RosterDepthChartPlayer } from '@/ui-ng/applications/roster/buildRosterDepthChart'

import { buildDepthChartLaneItems } from './buildRosterDepthChartView'

function player(
  id: string,
  name: string,
  band: RosterDepthChartPlayer['band'],
): RosterDepthChartPlayer {
  return {
    id: id as PlayerId,
    name,
    stars: 3,
    band,
    slot: undefined,
  }
}

describe('buildDepthChartLaneItems', () => {
  it('numbers relative depth without role labels when nobody is assigned', () => {
    const items = buildDepthChartLaneItems([
      player('p1', 'Trae Bell-Haynes', 'unassigned'),
      player('p2', 'Sergi García', 'unassigned'),
      player('p3', 'Guillem Vives', 'unassigned'),
    ])

    expect(items.map((item) => (item.kind === 'player' ? `${item.rank} ${item.player.name}` : item.label))).toEqual([
      '1 Trae Bell-Haynes',
      '2 Sergi García',
      '3 Guillem Vives',
    ])
  })

  it('inserts BDM role bands only for populated assigned groups', () => {
    const items = buildDepthChartLaneItems([
      player('p1', 'Starter One', 'starter'),
      player('p2', 'Rotation One', 'rotation'),
      player('p3', 'Depth One', 'bench'),
      player('p4', 'Open One', 'unassigned'),
    ])

    expect(items.map((item) => (item.kind === 'group' ? item.label : `${item.rank} ${item.player.name}`))).toEqual([
      'STARTER',
      '1 Starter One',
      'ROTATION',
      '2 Rotation One',
      'DEPTH',
      '3 Depth One',
      '4 Open One',
    ])
    expect(
      items
        .filter((item): item is Extract<(typeof items)[number], { kind: 'group' }> => item.kind === 'group')
        .map((item) => item.label),
    ).toEqual(['STARTER', 'ROTATION', 'DEPTH'])
  })
})
