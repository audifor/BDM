import { addDays } from '@/domain/date'
import { createGame } from '@/domain/game'
import { gameIdFromString, teamIdFromString, type TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { FinalStandingLine } from '@/domain/season'
import type { WorldCompetitionFormatDocument, WorldCompetitionFormatNode } from '@/domain/competition'
import { calculateStandings } from './standings'
import { deriveCompetitionSeasonWindows, requireCompetitionFormatVariant } from './WorldCompetitionCalendar'
import { evaluateWorldCompetitionSeriesV1, instantiateWorldCompetitionSeriesV1, type WorldCompetitionSeriesPlanV1, type WorldCompetitionSeriesStateV1 } from './WorldCompetitionSeries'
import { instantiateWorldCompetitionFixedBracketV1, type WorldCompetitionFixedBracketPlanV1, type WorldCompetitionSeededEntryV1 } from './WorldCompetitionFixedBracket'
import { resolveWorldCompetitionVirtualFixturesV1, selectWorldCompetitionHigherSeedV1, type WorldCompetitionResolvedVirtualFixtureV1, type WorldCompetitionVirtualFixtureOutcomeV1 } from './WorldCompetitionVirtualFixtureResolver'

export interface CompetitionPostseasonSeriesStateV1 {
  readonly plan: WorldCompetitionSeriesPlanV1
  readonly state: WorldCompetitionSeriesStateV1
}

export interface CompetitionPostseasonStateV1 {
  readonly regularSeasonComplete: boolean
  readonly seeds: readonly WorldCompetitionSeededEntryV1[]
  readonly bracketPlan: WorldCompetitionFixedBracketPlanV1 | null
  readonly resolvedFixtures: readonly WorldCompetitionResolvedVirtualFixtureV1[]
  readonly readyFixtures: readonly WorldCompetitionResolvedVirtualFixtureV1[]
  readonly outcomes: readonly WorldCompetitionVirtualFixtureOutcomeV1[]
  readonly seriesByFixtureId: Readonly<Record<string, CompetitionPostseasonSeriesStateV1>>
  readonly championTeamId: TeamId | null
}

/** Derives bracket and series state from canonical format rules and persisted Game results. */
export function getCompetitionPostseasonState(world: GameWorld, seasonId: keyof GameWorld['seasons']): CompetitionPostseasonStateV1 | null {
  const season = world.seasons[seasonId]
  if (season === undefined) throw new Error(`Season does not exist: ${seasonId}`)
  const format = season.worldCompetitionFormat
  if (format === undefined) return null
  const variant = requireCompetitionFormatVariant(format)
  const regularNode = variant.nodes.find((node) => node.role === 'REGULAR_SEASON')
  if (regularNode === undefined) return null
  const postseasonKeys = reachableNodes(regularNode.key, variant)
  postseasonKeys.delete(regularNode.key)
  if (postseasonKeys.size === 0) return null
  const regularSeasonComplete = areRegularSeasonGamesComplete(world, season.id, regularNode.key)
  if (!regularSeasonComplete) return emptyPostseasonState()

  const standings = calculateStandings(world, season.id)
  const seeds = selectQualifiedEntries(standings, variant.edges.filter((edge) => edge.from === regularNode.key), format.competitionSeasonId)
  const bracketPlan = instantiateWorldCompetitionFixedBracketV1(format, variant.key, seeds)
  const outcomes: WorldCompetitionVirtualFixtureOutcomeV1[] = []
  const seriesByFixtureId: Record<string, CompetitionPostseasonSeriesStateV1> = {}

  for (let pass = 0; pass <= bracketPlan.fixtures.length; pass += 1) {
    const resolution = resolveWorldCompetitionVirtualFixturesV1(bracketPlan, outcomes)
    let addedOutcome = false
    for (const fixture of resolution.readyFixtures) {
      const series = evaluateFixtureSeries(world, season.id, format, fixture)
      seriesByFixtureId[fixture.fixtureId] = series
      if (!series.state.completed) continue
      outcomes.push({ fixtureId: fixture.fixtureId, winnerEntryId: series.state.winnerEntryId!, loserEntryId: series.state.loserEntryId! })
      addedOutcome = true
    }
    if (!addedOutcome) {
      return Object.freeze({
        regularSeasonComplete,
        seeds: Object.freeze(seeds),
        bracketPlan,
        resolvedFixtures: resolution.resolvedFixtures,
        readyFixtures: resolution.readyFixtures,
        outcomes: Object.freeze(outcomes),
        seriesByFixtureId: Object.freeze(seriesByFixtureId),
        championTeamId: terminalChampion(variant.nodes, variant.edges, outcomes),
      })
    }
  }
  throw new Error(`Competition postseason progression did not converge: ${format.competitionSeasonId}`)
}

/** Idempotently creates only the next physical game required by each resolved series. */
export function materializeCompetitionPostseason(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  const season = world.seasons[seasonId]
  if (season === undefined) throw new Error(`Season does not exist: ${seasonId}`)
  if (season.worldCompetitionFormat === undefined) return world
  const state = getCompetitionPostseasonState(world, seasonId)
  if (state === null || !state.regularSeasonComplete || state.bracketPlan === null) return world
  const additions = state.readyFixtures.flatMap((fixture) => {
    const series = state.seriesByFixtureId[fixture.fixtureId]
    if (series === undefined || series.state.completed || series.state.nextGame === null) return []
    const next = series.state.nextGame
    const existing = Object.values(world.games).find((game) => game.seasonId === season.id && game.postseasonFixtureId === fixture.fixtureId && game.postseasonGameNo === next.gameNo)
    if (existing !== undefined) {
      assertGameMatchesSeriesGame(existing, fixture, series.plan, next.gameNo)
      return []
    }
    const node = requireNode(season.worldCompetitionFormat!, fixture.nodeKey)
    const stageStart = deriveCompetitionSeasonWindows(season.startDate, season.endDate, season.worldCompetitionFormat).postseasonStartByNodeKey[node.key]
    if (stageStart === undefined) throw new Error(`Competition postseason node has no allocated calendar window: ${node.key}`)
    return [createGame({
      id: gameIdFromString(`competition-postseason:${season.id}:${fixture.fixtureId}:g${next.gameNo}`),
      seasonId: season.id,
      competitionId: season.competitionId,
      date: addDays(stageStart, next.gameNo - 1),
      homeTeamId: teamIdFromString(next.homeEntryId),
      awayTeamId: teamIdFromString(next.awayEntryId),
      status: 'scheduled',
      result: null,
      stakes: node.role === 'FINAL' ? 'final' : 'elimination',
      competitionStageKey: node.key,
      postseasonFixtureId: fixture.fixtureId,
      postseasonGameNo: next.gameNo,
    })]
  })
  return additions.length === 0 ? world : updateGameWorld(world, { games: [...Object.values(world.games), ...additions] })
}

export function areRegularSeasonGamesComplete(world: GameWorld, seasonId: keyof GameWorld['seasons'], regularStageKey: string): boolean {
  const games = Object.values(world.games).filter((game) => game.seasonId === seasonId && (game.competitionStageKey === undefined || game.competitionStageKey === regularStageKey))
  return games.length > 0 && games.every((game) => game.status === 'completed')
}

export function getCompetitionPostseasonChampion(world: GameWorld, seasonId: keyof GameWorld['seasons']): TeamId | undefined {
  return getCompetitionPostseasonState(world, seasonId)?.championTeamId ?? undefined
}

function evaluateFixtureSeries(world: GameWorld, seasonId: keyof GameWorld['seasons'], format: WorldCompetitionFormatDocument, fixture: WorldCompetitionResolvedVirtualFixtureV1): CompetitionPostseasonSeriesStateV1 {
  const node = requireNode(format, fixture.nodeKey)
  if (node.contest?.formatType !== 'SERIES') throw new Error(`Postseason contest is not a SERIES: ${node.key}`)
  if (node.hosting?.ruleType !== 'SERIES_PATTERN' || node.hosting.priorityBasis !== 'HIGHER_SEED') throw new Error(`Postseason SERIES ${node.key} requires a higher-seed SERIES_PATTERN`)
  const participants = fixture.participants
  const priorityEntryId = selectWorldCompetitionHigherSeedV1(participants).competitionSeasonEntryId
  const plan = instantiateWorldCompetitionSeriesV1(format, fixture.variantKey, fixture.nodeKey, {
    firstEntryId: participants[0].competitionSeasonEntryId,
    secondEntryId: participants[1].competitionSeasonEntryId,
    priorityEntryId,
  })
  const games = Object.values(world.games).filter((game) => game.seasonId === seasonId && game.postseasonFixtureId === fixture.fixtureId)
  if (games.some((game) => game.competitionStageKey !== fixture.nodeKey || game.postseasonGameNo === undefined)) throw new Error(`Postseason series game metadata conflicts with bracket fixture: ${fixture.fixtureId}`)
  const results = games.filter((game) => game.status === 'completed').map((game) => {
    const gameNo = game.postseasonGameNo!
    const expected = plan.games[gameNo - 1]
    if (expected === undefined) throw new Error(`Postseason game number exceeds best-of format: ${fixture.fixtureId} game ${gameNo}`)
    if (game.homeTeamId !== expected.homeEntryId || game.awayTeamId !== expected.awayEntryId) throw new Error(`Postseason game home/away order conflicts with format: ${game.id}`)
    return { gameId: expected.gameId, homeScore: game.result!.homeScore, awayScore: game.result!.awayScore }
  })
  const state = evaluateWorldCompetitionSeriesV1(plan, results)
  return Object.freeze({ plan, state })
}

function selectQualifiedEntries(standings: readonly FinalStandingLine[], incomingEdges: readonly { readonly selector: string; readonly rankFrom?: number; readonly rankTo?: number; readonly count?: number }[], competitionSeasonId: string): WorldCompetitionSeededEntryV1[] {
  const selectors = incomingEdges.filter((edge) => edge.selector === 'RANK_RANGE' || edge.selector === 'TOP_N')
  if (selectors.length !== 1) throw new Error(`Competition format requires exactly one rank-based playoff qualification rule: ${competitionSeasonId}`)
  const rule = selectors[0]!
  const rankFrom = rule.selector === 'TOP_N' ? 1 : rule.rankFrom
  const rankTo = rule.selector === 'TOP_N' ? rule.count : rule.rankTo
  if (rankFrom === undefined || rankTo === undefined || rankFrom < 1 || rankTo < rankFrom) throw new Error(`Competition format has invalid playoff qualification bounds: ${competitionSeasonId}`)
  const qualified = standings.filter((line) => line.position >= rankFrom && line.position <= rankTo)
  if (qualified.length !== rankTo - rankFrom + 1) throw new Error(`Competition standings cannot satisfy playoff qualification bounds: ${competitionSeasonId}`)
  return qualified.map((line) => Object.freeze({ competitionSeasonEntryId: line.teamId, seed: line.position }))
}

function terminalChampion(nodes: readonly WorldCompetitionFormatNode[], edges: readonly { readonly from: string; readonly selector: string }[], outcomes: readonly WorldCompetitionVirtualFixtureOutcomeV1[]): TeamId | null {
  const declaredFinals = nodes.filter((node) => node.role === 'FINAL')
  const terminalNodes = declaredFinals.length > 0 ? declaredFinals : nodes.filter((node) =>
    node.role === 'PLAYOFF' && !edges.some((edge) => edge.from === node.key),
  )
  if (terminalNodes.length !== 1) return null
  const finalOutcome = outcomes.find((outcome) => outcome.fixtureId.includes(`:${terminalNodes[0]!.key}:`))
  return finalOutcome === undefined ? null : teamIdFromString(finalOutcome.winnerEntryId)
}

function emptyPostseasonState(): CompetitionPostseasonStateV1 {
  return Object.freeze({ regularSeasonComplete: false, seeds: Object.freeze([]), bracketPlan: null, resolvedFixtures: Object.freeze([]), readyFixtures: Object.freeze([]), outcomes: Object.freeze([]), seriesByFixtureId: Object.freeze({}), championTeamId: null })
}

function requireNode(format: WorldCompetitionFormatDocument, key: string): WorldCompetitionFormatNode {
  const node = format.variants.find((variant) => variant.isRealVariant)?.nodes.find((candidate) => candidate.key === key) ?? format.variants[0]?.nodes.find((candidate) => candidate.key === key)
  if (node === undefined) throw new Error(`Competition format node not found: ${key}`)
  return node
}

function reachableNodes(start: string, variant: ReturnType<typeof requireCompetitionFormatVariant>): Set<string> {
  const reached = new Set([start])
  const pending = [start]
  while (pending.length > 0) {
    const current = pending.shift()!
    for (const edge of variant.edges.filter((candidate) => candidate.from === current)) {
      if (reached.has(edge.to)) continue
      reached.add(edge.to)
      pending.push(edge.to)
    }
  }
  return reached
}

function assertGameMatchesSeriesGame(game: GameWorld['games'][keyof GameWorld['games']], fixture: WorldCompetitionResolvedVirtualFixtureV1, plan: WorldCompetitionSeriesPlanV1, gameNo: number): void {
  const expected = plan.games[gameNo - 1]
  if (expected === undefined || game.homeTeamId !== expected.homeEntryId || game.awayTeamId !== expected.awayEntryId || game.postseasonFixtureId !== fixture.fixtureId) throw new Error(`Existing postseason game conflicts with series plan: ${game.id}`)
}
