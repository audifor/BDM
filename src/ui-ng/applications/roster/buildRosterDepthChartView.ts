import type { RosterDepthChartPlayer } from '@/ui-ng/applications/roster/buildRosterDepthChart'

export const DEPTH_CHART_GROUP_LABEL = {
  starter: 'STARTER',
  rotation: 'ROTATION',
  bench: 'DEPTH',
} as const

export type RosterDepthChartAssignedBand = keyof typeof DEPTH_CHART_GROUP_LABEL

export type RosterDepthChartLaneItem =
  | {
      readonly kind: 'group'
      readonly band: RosterDepthChartAssignedBand
      readonly label: (typeof DEPTH_CHART_GROUP_LABEL)[RosterDepthChartAssignedBand]
    }
  | {
      readonly kind: 'player'
      readonly player: RosterDepthChartPlayer
      readonly rank: number
    }

const ASSIGNED_BANDS = ['starter', 'rotation', 'bench'] as const satisfies readonly RosterDepthChartAssignedBand[]

export function laneHasAssignedRoles(players: readonly RosterDepthChartPlayer[]): boolean {
  return players.some((player) => player.band !== 'unassigned')
}

export function buildDepthChartLaneItems(
  players: readonly RosterDepthChartPlayer[],
): readonly RosterDepthChartLaneItem[] {
  if (!laneHasAssignedRoles(players)) {
    return players.map((player, index) => ({ kind: 'player', player, rank: index + 1 }))
  }

  const items: RosterDepthChartLaneItem[] = []
  let rank = 0

  for (const band of ASSIGNED_BANDS) {
    const members = players.filter((player) => player.band === band)
    if (members.length === 0) continue
    items.push({ kind: 'group', band, label: DEPTH_CHART_GROUP_LABEL[band] })
    for (const player of members) {
      rank += 1
      items.push({ kind: 'player', player, rank })
    }
  }

  for (const player of players.filter((item) => item.band === 'unassigned')) {
    rank += 1
    items.push({ kind: 'player', player, rank })
  }

  return items
}
