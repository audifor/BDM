/** FIBA/ACB PIR from a persisted box-score snapshot. Missing drawn fouls / blocks against are omitted. */
export function boxScoreValuation(stats: {
  readonly points: number
  readonly rebounds: number
  readonly assists: number
  readonly steals: number
  readonly blocks: number
  readonly fieldGoalsMade: number
  readonly fieldGoalsAttempted: number
  readonly freeThrowsMade: number
  readonly freeThrowsAttempted: number
  readonly turnovers: number
  readonly foulsCommitted: number
}): number {
  return (
    stats.points +
    stats.rebounds +
    stats.assists +
    stats.steals +
    stats.blocks -
    (stats.fieldGoalsAttempted - stats.fieldGoalsMade) -
    (stats.freeThrowsAttempted - stats.freeThrowsMade) -
    stats.turnovers -
    stats.foulsCommitted
  )
}
