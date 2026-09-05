import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { boxScoreValuation } from '@/engine/stats/boxScoreValuation'
import { calculatePlayerStatAverages, getPlayerSeasonStats } from '@/engine/stats/PlayerHistory'

export interface RosterInspectorSeasonStat {
  readonly label: string
  readonly value: string
}

export function buildRosterInspectorSeasonStats(
  world: GameWorld,
  playerId: PlayerId,
): readonly RosterInspectorSeasonStat[] {
  const stats = getPlayerSeasonStats(world, playerId, world.currentSeasonId)
  const averages = calculatePlayerStatAverages(stats)
  if (stats.gamesPlayed === 0) {
    return [
      { label: 'PTS', value: '—' },
      { label: 'REB', value: '—' },
      { label: 'AST', value: '—' },
      { label: 'MIN', value: '—' },
      { label: 'VAL', value: '—' },
    ]
  }

  const plusMinus = averages.plusMinusPerGame
  return [
    { label: 'PTS', value: averages.ppg.toFixed(1) },
    { label: 'REB', value: averages.rpg.toFixed(1) },
    { label: 'AST', value: averages.apg.toFixed(1) },
    { label: 'MIN', value: averages.mpg.toFixed(1) },
    { label: 'VAL', value: (boxScoreValuation(stats) / stats.gamesPlayed).toFixed(1) },
    { label: '+/-', value: `${plusMinus > 0 ? '+' : ''}${plusMinus.toFixed(1)}` },
  ]
}
