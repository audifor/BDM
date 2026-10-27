import type { TeamId } from '@/domain/ids'
import type { FinalStandingLine } from './SeasonHistory'

export interface ClassificationResult {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly homeScore: number
  readonly awayScore: number
}

/** Shared 2/1 classification-points and recursive mini-table policy.
 * No club/competition identities or calendar assumptions belong here.
 * A terminal unresolved draw requires an external draw authority; provisional
 * display order by ID is never used to qualify teams from a completed stage.
 */
export function rankClassificationMiniLeague(entries: readonly FinalStandingLine[], results: readonly ClassificationResult[], final: boolean): FinalStandingLine[] {
  const split = (rows: readonly FinalStandingLine[], value: (r: FinalStandingLine) => number) => {
    const groups = new Map<number, FinalStandingLine[]>()
    for (const row of rows) { const key = value(row); groups.set(key, [...(groups.get(key) ?? []), row]) }
    return [...groups.entries()].sort(([a], [b]) => b - a).map(([, group]) => group)
  }
  const rankTied = (rows: readonly FinalStandingLine[]): FinalStandingLine[] => {
    if (rows.length <= 1) return [...rows]
    const ids = new Set(rows.map(r => r.teamId))
    const mini = new Map(rows.map(r => [r.teamId, { points: 0, difference: 0, scored: 0 }]))
    for (const game of results) {
      if (!ids.has(game.homeTeamId) || !ids.has(game.awayTeamId)) continue
      const home = mini.get(game.homeTeamId)!, away = mini.get(game.awayTeamId)!
      home.points += game.homeScore > game.awayScore ? 2 : 1
      away.points += game.awayScore > game.homeScore ? 2 : 1
      home.difference += game.homeScore - game.awayScore; away.difference += game.awayScore - game.homeScore
      home.scored += game.homeScore; away.scored += game.awayScore
    }
    const criteria = [(r: FinalStandingLine) => mini.get(r.teamId)!.points,
      (r: FinalStandingLine) => mini.get(r.teamId)!.difference,
      (r: FinalStandingLine) => mini.get(r.teamId)!.scored,
      (r: FinalStandingLine) => r.pointDifference, (r: FinalStandingLine) => r.pointsFor]
    for (const value of criteria) {
      const groups = split(rows, value)
      if (groups.length > 1) return groups.flatMap(rankTied)
    }
    if (final) throw Error('Classification draw authority required for tied teams: ' + [...ids].sort().join(', '))
    return [...rows].sort((a, b) => a.teamId.localeCompare(b.teamId))
  }
  return split(entries, r => 2 * r.wins + r.losses).flatMap(rankTied).map((r, i) => ({ ...r, position: i + 1 }))
}
