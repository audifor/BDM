import { addDays } from '@/domain/date'
import { createGame, type CompletedGame } from '@/domain/game'
import { gameIdFromString, teamIdFromString } from '@/domain/ids'
import { createCompetition } from '@/domain/competition'
import { createSeason } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { WorldCompetitionFormatDocument, WorldCompetitionFormatNode, WorldCompetitionFormatVariant } from '@/domain/competition'
import { calculateStandings } from './standings'
import { deriveCompetitionSeasonWindows, requireCompetitionFormatVariant } from './WorldCompetitionCalendar'
import { instantiateWorldCompetitionFixedBracketV1, type WorldCompetitionFixedBracketPlanV1, type WorldCompetitionSeededEntryV1 } from './WorldCompetitionFixedBracket'
import { resolveWorldCompetitionVirtualFixturesV1, type WorldCompetitionVirtualFixtureOutcomeV1 } from './WorldCompetitionVirtualFixtureResolver'
import type { CompetitionPostseasonStateV1 } from './WorldCompetitionPostseason'

/** Builds progression for a single-elimination edition qualified from another competition season. */
export function getWorldCompetitionSingleEliminationState(world: GameWorld, seasonId: keyof GameWorld['seasons']): CompetitionPostseasonStateV1 | null {
  const season = world.seasons[seasonId]
  const format = season?.worldCompetitionFormat
  if (season === undefined || format === undefined) return null
  const variant = requireCompetitionFormatVariant(format)
  const selection = variant.entrySelection
  if (selection === undefined || selection.method !== 'RANK_BASED') return null
  const qualifiers = qualifiedEntries(world, selection.payload)
  if (qualifiers === null) return emptyState()
  const effectiveFormat = withDeterministicSeededDraw(format, variant, qualifiers)
  const bracketPlan = instantiateWorldCompetitionFixedBracketV1(effectiveFormat, variant.key, qualifiers)
  const outcomes = readOutcomes(world, season.id, bracketPlan)
  const resolved = resolveWorldCompetitionVirtualFixturesV1(bracketPlan, outcomes)
  const championTeamId = terminalChampion(variant.nodes, variant.edges, outcomes)
  return Object.freeze({
    regularSeasonComplete: true,
    seeds: Object.freeze(qualifiers),
    bracketPlan,
    resolvedFixtures: resolved.resolvedFixtures,
    readyFixtures: resolved.readyFixtures,
    outcomes: Object.freeze(outcomes),
    seriesByFixtureId: Object.freeze({}),
    championTeamId,
  })
}

export function materializeWorldCompetitionSingleElimination(world: GameWorld, seasonId: keyof GameWorld['seasons'], state: CompetitionPostseasonStateV1): GameWorld {
  const season = world.seasons[seasonId]!
  const participantsWorld = setSeasonParticipants(world, seasonId, state.seeds.map((entry) => teamIdFromString(entry.competitionSeasonEntryId)))
  const format = season.worldCompetitionFormat!
  const variant = requireCompetitionFormatVariant(format)
  const calendar = deriveCompetitionSeasonWindows(season.startDate, season.endDate, format, season.calendarPolicy)
  const additions = state.readyFixtures.map((fixture) => {
    const node = requireNode(variant.nodes, fixture.nodeKey)
    if (node.contest?.formatType !== 'SINGLE_GAME') throw new Error(`Knockout node must be SINGLE_GAME: ${node.key}`)
    const stageStart = calendar.postseasonStartByNodeKey[node.key]
    if (stageStart === undefined) throw new Error(`Competition node has no allocated calendar window: ${node.key}`)
    const existing = Object.values(participantsWorld.games).find((game) => game.seasonId === season.id && game.postseasonFixtureId === fixture.fixtureId)
    if (existing !== undefined) return undefined
    return createGame({
      id: gameIdFromString(`competition-game:${fixture.fixtureId}`),
      seasonId: season.id,
      competitionId: season.competitionId,
      date: stageStart,
      homeTeamId: teamIdFromString(fixture.participants[0].competitionSeasonEntryId),
      awayTeamId: teamIdFromString(fixture.participants[1].competitionSeasonEntryId),
      ...(node.hosting?.ruleType === 'NEUTRAL' ? { neutralSite: true } : {}),
      status: 'scheduled',
      result: null,
      stakes: node.role === 'FINAL' ? 'final' : 'elimination',
      competitionStageKey: node.key,
      postseasonFixtureId: fixture.fixtureId,
      postseasonGameNo: 1,
    })
  }).filter((game): game is NonNullable<typeof game> => game !== undefined)
  return additions.length === 0 ? participantsWorld : updateGameWorld(participantsWorld, { games: [...Object.values(participantsWorld.games), ...additions] })
}

export function materializeDependentCompetitionSeasons(world: GameWorld, sourceSeasonId: keyof GameWorld['seasons']): GameWorld {
  const sourceFormat = world.seasons[sourceSeasonId]?.worldCompetitionFormat
  if (sourceFormat === undefined) return world
  return Object.values(world.seasons).reduce((current, season) => {
    if (season.id === sourceSeasonId || season.worldCompetitionFormat === undefined) return current
    const variant = season.worldCompetitionFormat.variants.find((item) => item.isRealVariant) ?? season.worldCompetitionFormat.variants[0]
    const payload = variant?.entrySelection?.payload
    if (payload?.source_competition_season_id !== sourceFormat.competitionSeasonId) return current
    return materializeAnySingleElimination(current, season.id)
  }, world)
}

function materializeAnySingleElimination(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  const state = getWorldCompetitionSingleEliminationState(world, seasonId)
  return state === null || !state.regularSeasonComplete || state.bracketPlan === null
    ? world
    : materializeWorldCompetitionSingleElimination(world, seasonId, state)
}

function qualifiedEntries(world: GameWorld, payload: Readonly<Record<string, unknown>>): WorldCompetitionSeededEntryV1[] | null {
  const sourceCompetitionSeasonId = text(payload.source_competition_season_id)
  const reference = text(payload.reference_point)
  const matchday = reference === undefined ? undefined : Number(/^AFTER_MATCHDAY_(\d+)$/i.exec(reference)?.[1])
  const rankFrom = integer(payload.rank_from)
  const rankTo = integer(payload.rank_to)
  if (sourceCompetitionSeasonId === undefined || matchday === undefined || !Number.isInteger(matchday) || rankFrom === undefined || rankTo === undefined || rankFrom < 1 || rankTo < rankFrom) return null
  const sourceSeason = Object.values(world.seasons).find((candidate) => candidate.worldCompetitionFormat?.competitionSeasonId === sourceCompetitionSeasonId)
  if (sourceSeason === undefined) return null
  const sourceVariant = requireCompetitionFormatVariant(sourceSeason.worldCompetitionFormat!)
  const regularNode = sourceVariant.nodes.find((node) => node.role === 'REGULAR_SEASON')
  if (regularNode === undefined) return null
  const expectedTeamCount = regularNode.teamCount ?? (sourceSeason.participantTeamIds ?? world.competitions[sourceSeason.competitionId]!.participantTeamIds).length
  const gamesPerRound = expectedTeamCount / 2
  const regularGames = Object.values(world.games).filter((game) => game.seasonId === sourceSeason.id && (game.competitionStageKey === undefined || game.competitionStageKey === regularNode.key))
  const dates = [...new Set(regularGames.map((game) => game.date))].sort()
  if (dates.length < matchday) return null
  const firstLeg = dates.slice(0, matchday)
  const completedGames = firstLeg.flatMap((date) => regularGames.filter((game) => game.date === date))
  if (completedGames.length !== gamesPerRound * matchday || completedGames.some((game) => game.status !== 'completed')) return null
  if (firstLeg.some((date) => regularGames.filter((game) => game.date === date).length !== gamesPerRound)) return null
  const standings = calculateStandings(world, sourceSeason.id, firstLeg.at(-1))
  const qualified = standings.filter((entry) => entry.position >= rankFrom && entry.position <= rankTo)
  if (qualified.length !== rankTo - rankFrom + 1) return null
  return qualified.map((entry) => Object.freeze({ competitionSeasonEntryId: entry.teamId, seed: entry.position }))
}

function setSeasonParticipants(world: GameWorld, seasonId: keyof GameWorld['seasons'], teamIds: readonly ReturnType<typeof teamIdFromString>[]): GameWorld {
  const season = world.seasons[seasonId]!
  if (season.participantTeamIds?.join('|') === teamIds.join('|')) return world
  const competition = world.competitions[season.competitionId]!
  const nextSeason = createSeason({ ...season, participantTeamIds: teamIds })
  const nextCompetition = createCompetition({ ...competition, participantTeamIds: teamIds })
  return updateGameWorld(world, {
    competitions: [...Object.values(world.competitions).filter((item) => item.id !== competition.id), nextCompetition],
    seasons: [...Object.values(world.seasons).filter((item) => item.id !== season.id), nextSeason],
  })
}

function withDeterministicSeededDraw(format: WorldCompetitionFormatDocument, variant: WorldCompetitionFormatVariant, entries: readonly WorldCompetitionSeededEntryV1[]): WorldCompetitionFormatDocument {
  if (entries.length !== 8) throw new Error(`Single-elimination seeded draw requires eight entries: ${format.competitionSeasonId}`)
  const opener = variant.nodes.find((node) => node.teamCount === 8 && node.contest?.formatType === 'SINGLE_GAME')
  const semifinal = variant.nodes.find((node) => node.teamCount === 4 && node.contest?.formatType === 'SINGLE_GAME')
  if (opener === undefined || semifinal === undefined) throw new Error(`Eight-entry single-elimination format requires quarterfinal and semifinal nodes: ${format.competitionSeasonId}`)
  const matchups = ['1-8', '2-7', '3-6', '4-5']
  const paths = ['WINNER_1_VS_8_VS_WINNER_2_VS_7', 'WINNER_3_VS_6_VS_WINNER_4_VS_5']
  const variants = format.variants.map((candidate) => candidate.key !== variant.key ? candidate : {
    ...candidate,
    nodes: candidate.nodes.map((node) => node.key === opener.key
      ? { ...node, pairing: { type: 'FIXED_BRACKET' as const, payload: { matchups } } }
      : node.key === semifinal.key
        ? { ...node, pairing: { type: 'FIXED_BRACKET' as const, payload: { paths } } }
        : node),
  })
  return Object.freeze({ ...format, variants: Object.freeze(variants) })
}

function readOutcomes(world: GameWorld, seasonId: keyof GameWorld['seasons'], plan: WorldCompetitionFixedBracketPlanV1): WorldCompetitionVirtualFixtureOutcomeV1[] {
  const fixtureIds = new Set(plan.fixtures.map((fixture) => fixture.fixtureId))
  return Object.values(world.games).filter((game): game is CompletedGame => game.seasonId === seasonId && game.postseasonFixtureId !== undefined && fixtureIds.has(game.postseasonFixtureId) && game.status === 'completed').map((game) => {
    if (game.postseasonGameNo !== 1) throw new Error(`Single-game knockout result has invalid game number: ${game.id}`)
    const winner = game.result.homeScore > game.result.awayScore ? game.homeTeamId : game.awayTeamId
    const loser = winner === game.homeTeamId ? game.awayTeamId : game.homeTeamId
    return Object.freeze({ fixtureId: game.postseasonFixtureId!, winnerEntryId: winner, loserEntryId: loser })
  })
}

function terminalChampion(nodes: readonly WorldCompetitionFormatNode[], edges: readonly { readonly from: string }[], outcomes: readonly WorldCompetitionVirtualFixtureOutcomeV1[]): ReturnType<typeof teamIdFromString> | null {
  const finals = nodes.filter((node) => node.role === 'FINAL')
  const terminalNodes = finals.length === 1 ? finals : nodes.filter((node) => node.role === 'FINAL_EIGHT' && !edges.some((edge) => edge.from === node.key))
  if (terminalNodes.length !== 1) return null
  const outcome = outcomes.find((item) => item.fixtureId.includes(`:${terminalNodes[0]!.key}:`))
  return outcome === undefined ? null : teamIdFromString(outcome.winnerEntryId)
}

function requireNode(nodes: readonly WorldCompetitionFormatNode[], key: string): WorldCompetitionFormatNode {
  const node = nodes.find((candidate) => candidate.key === key)
  if (node === undefined) throw new Error(`Competition format node not found: ${key}`)
  return node
}

function emptyState(): CompetitionPostseasonStateV1 {
  return Object.freeze({ regularSeasonComplete: false, seeds: Object.freeze([]), bracketPlan: null, resolvedFixtures: Object.freeze([]), readyFixtures: Object.freeze([]), outcomes: Object.freeze([]), seriesByFixtureId: Object.freeze({}), championTeamId: null })
}

function text(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function integer(value: unknown): number | undefined { return typeof value === 'number' && Number.isInteger(value) ? value : undefined }
