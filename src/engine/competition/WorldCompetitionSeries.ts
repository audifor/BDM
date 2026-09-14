import type { WorldCompetitionFormatDocument } from '@/domain/competition'

export interface WorldCompetitionSeriesParticipantsV1 {
  readonly firstEntryId: string
  readonly secondEntryId: string
  readonly priorityEntryId: string
}

export interface WorldCompetitionSeriesGameV1 {
  readonly gameId: string
  readonly gameNo: number
  readonly homeEntryId: string
  readonly awayEntryId: string
}

export interface WorldCompetitionSeriesPlanV1 {
  readonly competitionSeasonId: string
  readonly variantKey: string
  readonly nodeKey: string
  readonly bestOf: number
  readonly winsRequired: number
  readonly firstEntryId: string
  readonly secondEntryId: string
  readonly priorityEntryId: string
  readonly games: readonly WorldCompetitionSeriesGameV1[]
}

export interface WorldCompetitionSeriesGameResultV1 {
  readonly gameId: string
  readonly homeScore: number
  readonly awayScore: number
}

export interface WorldCompetitionSeriesStateV1 {
  readonly firstEntryWins: number
  readonly secondEntryWins: number
  readonly completed: boolean
  readonly winnerEntryId: string | null
  readonly loserEntryId: string | null
  readonly nextGame: WorldCompetitionSeriesGameV1 | null
}

export function instantiateWorldCompetitionSeriesV1(
  format: WorldCompetitionFormatDocument,
  variantKey: string,
  nodeKey: string,
  participants: WorldCompetitionSeriesParticipantsV1,
): WorldCompetitionSeriesPlanV1 {
  if (format.status !== 'COMPLETE') throw new Error(`Competition format is not executable: ${format.competitionSeasonId}`)
  const variant = format.variants.find((candidate) => candidate.key === variantKey)
  if (variant === undefined) throw new Error(`Competition format variant not found: ${variantKey}`)
  const node = variant.nodes.find((candidate) => candidate.key === nodeKey)
  if (node === undefined) throw new Error(`Competition format node not found: ${nodeKey}`)
  if (node.contest?.formatType !== 'SERIES') throw new Error(`Competition node ${nodeKey} is not SERIES`)

  const bestOf = node.contest.bestOf
  const winsRequired = node.contest.winsRequired
  if (bestOf === undefined || winsRequired === undefined) throw new Error(`SERIES node ${nodeKey} requires best_of and wins_required`)
  if (bestOf % 2 === 0 || winsRequired !== Math.floor(bestOf / 2) + 1) throw new Error(`Invalid best-of series definition for ${nodeKey}`)

  const { firstEntryId, secondEntryId, priorityEntryId } = participants
  if (!firstEntryId || !secondEntryId || firstEntryId === secondEntryId) throw new Error('Series requires two distinct entries')
  if (priorityEntryId !== firstEntryId && priorityEntryId !== secondEntryId) throw new Error('Series priority entry must be one of the participants')

  if (node.hosting?.ruleType !== 'SERIES_PATTERN' || node.hosting.pattern === undefined) {
    throw new Error(`SERIES node ${nodeKey} requires explicit SERIES_PATTERN hosting`)
  }
  const pattern = node.hosting.pattern
  if (pattern.length !== bestOf || !/^[HA]+$/.test(pattern)) throw new Error(`Invalid series hosting pattern for ${nodeKey}: ${pattern}`)

  const otherEntryId = priorityEntryId === firstEntryId ? secondEntryId : firstEntryId
  const games = [...pattern].map((symbol, index) => Object.freeze({
    gameId: `worldseries:${format.competitionSeasonId}:${variantKey}:${nodeKey}:g${index + 1}`,
    gameNo: index + 1,
    homeEntryId: symbol === 'H' ? priorityEntryId : otherEntryId,
    awayEntryId: symbol === 'H' ? otherEntryId : priorityEntryId,
  }))

  return Object.freeze({
    competitionSeasonId: format.competitionSeasonId,
    variantKey,
    nodeKey,
    bestOf,
    winsRequired,
    firstEntryId,
    secondEntryId,
    priorityEntryId,
    games: Object.freeze(games),
  })
}

export function evaluateWorldCompetitionSeriesV1(
  plan: WorldCompetitionSeriesPlanV1,
  results: readonly WorldCompetitionSeriesGameResultV1[],
): WorldCompetitionSeriesStateV1 {
  const gameIds = new Set(plan.games.map((game) => game.gameId))
  const resultByGameId = new Map<string, WorldCompetitionSeriesGameResultV1>()
  for (const result of results) {
    if (!gameIds.has(result.gameId)) throw new Error(`Series result references unknown game: ${result.gameId}`)
    if (resultByGameId.has(result.gameId)) throw new Error(`Duplicate series game result: ${result.gameId}`)
    resultByGameId.set(result.gameId, result)
  }

  let firstEntryWins = 0
  let secondEntryWins = 0
  let nextGame: WorldCompetitionSeriesGameV1 | null = null
  let missingGameSeen = false

  for (const game of plan.games) {
    const result = resultByGameId.get(game.gameId)
    const clinched = firstEntryWins >= plan.winsRequired || secondEntryWins >= plan.winsRequired
    if (result === undefined) {
      if (!clinched && nextGame === null) nextGame = game
      if (!clinched) missingGameSeen = true
      continue
    }
    if (clinched) throw new Error(`Series contains result after clinch: ${game.gameId}`)
    if (missingGameSeen) throw new Error(`Series results must be contiguous from game 1: ${game.gameId}`)
    validateScore(result.homeScore, `${game.gameId} homeScore`)
    validateScore(result.awayScore, `${game.gameId} awayScore`)
    if (result.homeScore === result.awayScore) throw new Error(`Completed series game cannot be tied: ${game.gameId}`)

    const winnerEntryId = result.homeScore > result.awayScore ? game.homeEntryId : game.awayEntryId
    if (winnerEntryId === plan.firstEntryId) firstEntryWins += 1
    else if (winnerEntryId === plan.secondEntryId) secondEntryWins += 1
    else throw new Error(`Series game winner is not a series participant: ${game.gameId}`)
  }

  const completed = firstEntryWins >= plan.winsRequired || secondEntryWins >= plan.winsRequired
  const winnerEntryId = completed ? (firstEntryWins > secondEntryWins ? plan.firstEntryId : plan.secondEntryId) : null
  const loserEntryId = completed ? (winnerEntryId === plan.firstEntryId ? plan.secondEntryId : plan.firstEntryId) : null
  if (completed) nextGame = null

  return Object.freeze({ firstEntryWins, secondEntryWins, completed, winnerEntryId, loserEntryId, nextGame })
}

function validateScore(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer`)
}
