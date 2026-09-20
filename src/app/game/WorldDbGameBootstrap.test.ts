import { describe, expect, it, vi } from 'vitest'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { parseGameDate } from '@/domain/date'
import { createGame } from '@/domain/game'
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS } from '@/domain/player/PlayerTruthCatalog'
import type { WorldDbSelectionCatalogV1 } from '@/domain/worldDb/SelectionCatalog'
import type { WorldDbGameBootstrapSelectionV1, WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import type { WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { parseWorldCompetitionFormatDocument, type WorldCompetitionRuntimeBundle } from '@/domain/competition'
import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'
import { WorldDbSessionV1 } from './WorldDbSession'
import { advanceGameDay } from './advanceGameDay'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { applyMatchResult } from '@/engine/match'
import { getCompetitionPostseasonState, materializeCompetitionPostseason } from '@/engine/competition'
import { calculateStandings } from '@/engine/competition/standings'
import { finalizeCompletedSeason, isSeasonComplete } from '@/engine/season'

const source = { databaseId: 'real-world.db', schemaId: 'DDL-PHASE1-A' } as const
const runtimeBundle: WorldCompetitionRuntimeBundle = { bundleSchemaVersion: 1, contentId: 'bdm-phase1-competition-runtime-v1', contentHashAlgorithm: 'BLAKE3', contentHash: 'a'.repeat(64), worldDbSchema: 'DDL-PHASE1-A', competitionFormats: [{ schemaVersion: '1.0', competitionId: 'competition:ESP:liga-endesa', competitionSeasonId: 'edition:ESP:liga-endesa:2025-26', seasonLabel: '2025-26', status: 'COMPLETE', variants: [], consequences: [], sources: [] }], initialScoreDocuments: [] }
const selection: WorldDbGameBootstrapSelectionV1 = { source, ecosystemId: 'ecosystem:ESP:acb', competitionId: 'competition:ESP:liga-endesa', competitionSeasonId: 'edition:ESP:liga-endesa:2025-26', teamId: 'team:ESP:male:000' }

function values(keys: readonly string[], value = 60): Readonly<Record<string, number>> { return Object.fromEntries(keys.map((key, index) => [key, value + (index % 10)])) }
function slice(): WorldDbGameBootstrapSliceV1 {
  const teams = Array.from({ length: 18 }, (_, index) => ({ teamId: `team:ESP:male:${String(index).padStart(3, '0')}`, name: `Team ${index}`, gender: 'male' as const, countryId: 'place:country:ESP' }))
  const players = teams.flatMap((team, teamIndex) => ['PG', 'SG', 'SF', 'PF', 'C'].map((position, positionIndex) => ({ playerId: `${team.teamId}:person:${positionIndex}`, personId: `${team.teamId}:person:${positionIndex}`, primaryPosition: position as 'PG' | 'SG' | 'SF' | 'PF' | 'C', secondaryPositions: [], dominantHand: 'RIGHT' as const, ratings: values(PLAYER_TRUTH_RATING_KEYS), tendencies: values(PLAYER_TRUTH_TENDENCY_KEYS), development: ['SHOOTING', 'FINISHING', 'BALL_HANDLING', 'PLAYMAKING', 'OFF_BALL_OFFENSE', 'DEFENSE_REBOUNDING', 'PHYSICAL', 'MENTAL'].map((dimensionCode) => ({ dimensionCode, ceiling: 85 + (teamIndex % 10), growthRate: 50, declineSensitivity: 20 })) })))
  const staffProfiles = teams.map((team) => ({ staffId: `staff:${team.teamId}:head`, personId: `${team.teamId}:head-coach`, attributes: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`STAFF_ATTRIBUTE_${String(index + 1).padStart(2, '0')}`, 60])), specialismIds: ['TACTICS'] }))
  const persons = [...players.map((player) => ({ personId: player.personId, firstName: player.personId.split(':').at(-2)!, lastName: 'Player', gender: 'male' as const, dateOfBirth: '1998-01-01', nationalityIds: ['place:country:ESP'], physical: { heightCm: 190, weightKg: 90, wingspanCm: 195, standingReachCm: 245 } })), ...staffProfiles.map((staff) => ({ personId: staff.personId, firstName: 'Head', lastName: staff.personId.split(':').at(-2)!, gender: 'male' as const, dateOfBirth: '1980-01-01', nationalityIds: ['place:country:ESP'], physical: { heightCm: 180, weightKg: 80, wingspanCm: 180, standingReachCm: 230 } }))]
  return { schemaVersion: 1, source, ecosystem: { ecosystemId: selection.ecosystemId, name: 'Spain ACB Ecosystem', kind: 'fibaLike', category: 'men' }, competition: { competitionId: selection.competitionId, name: 'Liga Endesa', gender: 'male', ecosystemId: selection.ecosystemId }, season: { competitionSeasonId: selection.competitionSeasonId, seasonId: 'season:2025_26', label: '2025-26', startDate: '2025-10-01', endDate: '2026-06-30', provenance: 'DERIVED_SIMULATION_FROM_B04' }, countries: [{ countryId: 'place:country:ESP', name: 'ESP', code: 'ESP' }], teams, persons, players, staffProfiles, staffAssignments: teams.map((team) => ({ assignmentId: `${team.teamId}:head-assignment`, staffId: `staff:${team.teamId}:head`, teamId: team.teamId, roleCode: 'headCoach', assignedOn: '2025-10-01' })), rosterAssignments: players.map((player) => ({ rosterId: `roster:${player.playerId.split(':').slice(0, 4).join(':')}`, teamId: player.playerId.split(':').slice(0, 4).join(':'), playerId: player.playerId, status: 'ACTIVE' })), matches: [] }
}
function catalog(): WorldDbSelectionCatalogV1 { const teams = slice().teams; return { schemaVersion: 1, source, ecosystems: [{ ecosystemId: selection.ecosystemId, code: 'SPAIN_ACB', name: 'Spain ACB Ecosystem', gender: 'M' }], levels: [], units: [], competitionAssignments: [{ assignmentId: 'assignment:liga-endesa', ecosystemId: selection.ecosystemId, competitionId: selection.competitionId, competitionName: 'Liga Endesa', levelId: null, unitId: null, roleType: 'PRIMARY_LEAGUE' }], competitionSeasons: [{ competitionSeasonId: selection.competitionSeasonId, competitionId: selection.competitionId, competitionName: 'Liga Endesa', seasonId: 'season:2025_26', editionNumber: 1 }], teamMemberships: teams.map((team) => ({ membershipId: `membership:${team.teamId}`, ecosystemId: selection.ecosystemId, teamId: team.teamId, teamName: team.name, levelId: null, unitId: null, membershipStatus: 'ACTIVE', validFrom: null, validTo: null })), teamUnitMemberships: [] } }
function repository(): WorldDatabaseRepository { const info: WorldDbDatabaseInfoV1 = { schemaVersion: 1, source, competitionSeasonIds: [selection.competitionSeasonId] }; return { inspectDatabase: vi.fn(async () => info), loadSelectionCatalog: vi.fn(async () => catalog()), loadCompetitionSeason: vi.fn(), loadMatchRealizations: vi.fn(), loadGameBootstrapSlice: vi.fn(async () => slice()), loadCompetitionRuntimeBundle: vi.fn(async () => runtimeBundle) } }
function openSession(repo = repository()): WorldDbSessionV1 { return new WorldDbSessionV1({ repository: repo, databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' }) }

describe('World DB Spain ACB playable GameWorld bootstrap', () => {
  it('derives the complete 18-team home-and-away schedule when persisted fixtures are absent', async () => { const session = openSession(); await session.open(); const world = await session.bootstrapGameWorld(selection); expect(Object.keys(world.teams)).toHaveLength(18); expect(Object.keys(world.players)).toHaveLength(90); expect(Object.keys(world.staffPeopleById)).toHaveLength(18); expect(Object.keys(world.teamStaffAssignmentsById)).toHaveLength(18); expect(Object.keys(world.games)).toHaveLength(306); expect(Object.values(world.teams).find((team) => team.id === selection.teamId)?.coachId).toBe('worlddb:coach:team:ESP:male:000'); expect(Object.values(world.coaches).find((coach) => coach.id === 'worlddb:coach:team:ESP:male:000')?.firstName).toBe('Head'); expect(Object.values(world.personsById).find((person) => person.id === `${selection.teamId}:head-coach`)?.profileRefs).toEqual([{ kind: 'staff', profileId: 'staff:team:ESP:male:000:head' }]) })
  it('builds 34 valid ACB rounds through the Season end and keeps them after save/load', () => {
    const sourceSlice = slice()
    const world = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
    const games = Object.values(world.games)
    const gamesByDate = new Map<string, typeof games>()
    const gamesByPair = new Map<string, typeof games>()
    for (const game of games) {
      gamesByDate.set(game.date, [...(gamesByDate.get(game.date) ?? []), game])
      const pairKey = [game.homeTeamId, game.awayTeamId].sort().join(':')
      gamesByPair.set(pairKey, [...(gamesByPair.get(pairKey) ?? []), game])
    }

    expect(games).toHaveLength(306)
    expect(gamesByDate.size).toBe(34)
    expect([...gamesByDate.values()].every((round) => round.length === 9)).toBe(true)
    for (const round of gamesByDate.values()) {
      expect(new Set(round.flatMap((game) => [game.homeTeamId, game.awayTeamId])).size).toBe(18)
    }
    expect(gamesByPair.size).toBe(153)
    for (const pair of gamesByPair.values()) {
      expect(pair).toHaveLength(2)
      expect(pair[0]!.homeTeamId).toBe(pair[1]!.awayTeamId)
      expect(pair[0]!.awayTeamId).toBe(pair[1]!.homeTeamId)
    }
    expect(new Set(games.map((game) => game.id)).size).toBe(306)
    expect(games.every((game) => game.date >= sourceSlice.season.startDate && game.date <= sourceSlice.season.endDate)).toBe(true)
    expect(games.some((game) => game.date.startsWith('2026-03-'))).toBe(true)
    expect(games.some((game) => game.date.startsWith('2026-04-'))).toBe(true)
    expect(games.some((game) => game.date > '2026-02-10')).toBe(true)
    expect(games.map((game) => game.date).sort()[0]).toBe(sourceSlice.season.startDate)
    expect(games.map((game) => game.date).sort().at(-1)).toBe(sourceSlice.season.endDate)

    const saved = serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z')
    const restored = deserializeGameWorldV4(saved)
    expect(Object.values(restored.games)).toEqual(games)
  })
  it('uses real fixtures instead of generating a replacement schedule', () => {
    const sourceSlice = slice()
    const realFixture = { matchId: 'match:official:1', scheduledAt: '2025-11-02T18:00:00Z', playedAt: null, status: 'SCHEDULED', homeTeamId: sourceSlice.teams[0]!.teamId, awayTeamId: sourceSlice.teams[1]!.teamId }
    const world = bootstrapGameWorldFromWorldDb({ ...sourceSlice, matches: [realFixture] }, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })

    expect(Object.keys(world.games)).toEqual([realFixture.matchId])
    expect(Object.values(world.games)[0]?.date).toBe('2025-11-02')
  })
  it('can advance from February when a later-season game remains scheduled', () => {
    const sourceSlice = slice()
    const fullWorld = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
    const marchGame = Object.values(fullWorld.games).find((game) => game.date >= '2026-03-01')!
    const februaryWorld = createGameWorld({
      currentDate: parseGameDate('2026-02-28'),
      currentSeasonId: fullWorld.currentSeasonId,
      userCoachId: fullWorld.userCoachId,
      countries: Object.values(fullWorld.countries),
      coaches: Object.values(fullWorld.coaches),
      players: Object.values(fullWorld.players),
      teams: Object.values(fullWorld.teams),
      staffPeople: Object.values(fullWorld.staffPeopleById),
      teamStaffAssignments: Object.values(fullWorld.teamStaffAssignmentsById),
      competitions: Object.values(fullWorld.competitions),
      ecosystems: Object.values(fullWorld.ecosystems),
      seasons: Object.values(fullWorld.seasons),
      games: [marchGame!],
    })

    const advanced = advanceGameDay(februaryWorld)
    expect(advanced.currentDate).toBe('2026-03-01')
    expect(advanced.games[marchGame!.id]).toBeDefined()
  })
  it('is deterministic and preserves canonical 80/40 truth vectors', () => { const pin = { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }; const first = bootstrapGameWorldFromWorldDb(slice(), selection, pin); const second = bootstrapGameWorldFromWorldDb(slice(), selection, pin); expect(JSON.stringify(first)).toBe(JSON.stringify(second)); expect(Object.values(first.players).every((player) => Object.keys(player.basketball.ratings).length === 80 && Object.keys(player.basketball.tendencies).length === 40)).toBe(true) })
  it('rejects a selected team outside the B02 slice', async () => { const session = openSession(); await session.open(); await expect(session.bootstrapGameWorld({ ...selection, teamId: 'team:ESP:male:missing' })).rejects.toThrow('not in ecosystem') })

  it('plays RealWorldSpain through ranked ACB playoffs, crowns a champion and survives save/load', () => {
    const worldCompetitionFormat = parseWorldCompetitionFormatDocument({
      schema_version: '1.0', competition_id: selection.competitionId, competition_season_id: selection.competitionSeasonId, season_label: '2025-26', status: 'COMPLETE',
      variants: [{ key: 'MAIN', is_real_variant: true, nodes: [
        { key: 'REGULAR', node_type: 'STAGE', role: 'REGULAR_SEASON', team_count: 18, pairing: { type: 'ROUND_ROBIN', meetings_per_pair: 2 }, opponent_scope: { type: 'ALL_STAGE' } },
        { key: 'QUARTERFINALS', node_type: 'ROUND', role: 'PLAYOFF', team_count: 8, pairing: { type: 'FIXED_BRACKET', payload: { matchups: ['1-8', '4-5', '2-7', '3-6'] } }, contest: { format_type: 'SERIES', best_of: 3, wins_required: 2 }, hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HAH', priority_basis: 'HIGHER_SEED' } },
        { key: 'SEMIFINALS', node_type: 'ROUND', role: 'PLAYOFF', team_count: 4, pairing: { type: 'FIXED_BRACKET', payload: { paths: ['WINNER_1_VS_8_VS_WINNER_4_VS_5', 'WINNER_2_VS_7_VS_WINNER_3_VS_6'] } }, contest: { format_type: 'SERIES', best_of: 5, wins_required: 3 }, hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HHAAH', priority_basis: 'HIGHER_SEED' } },
        { key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2, contest: { format_type: 'SERIES', best_of: 5, wins_required: 3 }, hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HHAAH', priority_basis: 'HIGHER_SEED' } },
      ], edges: [
        { from: 'REGULAR', to: 'QUARTERFINALS', selector: 'RANK_RANGE', rank_from: 1, rank_to: 8 },
        { from: 'QUARTERFINALS', to: 'SEMIFINALS', selector: 'WINNER' },
        { from: 'SEMIFINALS', to: 'FINAL', selector: 'WINNER' },
      ] }],
      sources: [{ url: 'https://acb.com', type: 'OFFICIAL' }],
    })
    const sourceSlice = slice()
    const baseWorld = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }, worldCompetitionFormat)
    const season = baseWorld.seasons[baseWorld.currentSeasonId]!
    const regularGames = Object.values(baseWorld.games).filter((game) => game.competitionStageKey === 'REGULAR')
    expect(regularGames).toHaveLength(306)
    expect(Math.max(...regularGames.map((game) => Number(game.date.replaceAll('-', ''))))).toBe(20260617)
    expect(regularGames.some((game) => game.date.startsWith('2026-03-'))).toBe(true)
    expect(regularGames.some((game) => game.date.startsWith('2026-04-'))).toBe(true)
    expect(Object.values(baseWorld.games).some((game) => game.competitionStageKey === 'QUARTERFINALS')).toBe(false)

    const lastRegularGame = [...regularGames].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))[0]!
    const almostComplete = updateGameWorld(baseWorld, { games: Object.values(baseWorld.games).map((game) => game.id === lastRegularGame.id ? game : game.competitionStageKey === 'REGULAR' ? createGame({ ...game, status: 'completed', result: { homeScore: 100, awayScore: 80 } }) : game) })
    const afterRegularSeason = applyMatchResult(almostComplete, { gameId: lastRegularGame.id, homeTeamId: lastRegularGame.homeTeamId, awayTeamId: lastRegularGame.awayTeamId, homeScore: 100, awayScore: 80 })
    const regularStandings = calculateStandings(afterRegularSeason, season.id)
    const initialPostseason = getCompetitionPostseasonState(afterRegularSeason, season.id)!
    expect(getCompetitionPostseasonState(afterRegularSeason, season.id)).toEqual(initialPostseason)
    expect(initialPostseason.seeds).toHaveLength(8)
    expect(initialPostseason.seeds.map((entry) => entry.competitionSeasonEntryId)).toEqual(regularStandings.slice(0, 8).map((line) => line.teamId))
    expect(Object.values(afterRegularSeason.games).filter((game) => game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(4)
    expect(Object.values(afterRegularSeason.games).filter((game) => game.competitionStageKey === 'QUARTERFINALS').every((game) => game.date === '2026-06-18')).toBe(true)
    expect(calculateStandings(afterRegularSeason, season.id)).toEqual(regularStandings)
    const idempotentPostseason = materializeCompetitionPostseason(afterRegularSeason, season.id)
    expect(Object.keys(idempotentPostseason.games)).toHaveLength(Object.keys(afterRegularSeason.games).length)

    const firstPostseasonGame = Object.values(afterRegularSeason.games).find((game) => game.competitionStageKey === 'QUARTERFINALS')!
    const afterOnePlayoffResult = applyMatchResult(afterRegularSeason, { gameId: firstPostseasonGame.id, homeTeamId: firstPostseasonGame.homeTeamId, awayTeamId: firstPostseasonGame.awayTeamId, homeScore: 100, awayScore: 80 })
    const savedMidSeries = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(afterOnePlayoffResult, '2026-09-01T00:00:00.000Z'))))
    expect(Object.values(savedMidSeries.games)).toHaveLength(Object.values(afterOnePlayoffResult.games).length)
    expect(getCompetitionPostseasonState(savedMidSeries, season.id)).toEqual(getCompetitionPostseasonState(afterOnePlayoffResult, season.id))

    let playoffWorld = savedMidSeries
    for (let step = 0; step < 27; step += 1) {
      const next = Object.values(playoffWorld.games).filter((game) => game.competitionStageKey !== 'REGULAR' && game.status === 'scheduled').sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))[0]
      if (next === undefined) break
      const lowerSeedWinsFinal = next.competitionStageKey === 'FINAL' && [1, 2, 5].includes(next.postseasonGameNo!)
      playoffWorld = applyMatchResult(playoffWorld, { gameId: next.id, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId, homeScore: lowerSeedWinsFinal ? 80 : 100, awayScore: lowerSeedWinsFinal ? 100 : 80 })
    }

    const postseasonGames = Object.values(playoffWorld.games).filter((game) => game.competitionStageKey !== 'REGULAR')
    expect(postseasonGames.filter((game) => game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(12)
    expect(postseasonGames.filter((game) => game.competitionStageKey === 'SEMIFINALS')).toHaveLength(10)
    expect(postseasonGames.filter((game) => game.competitionStageKey === 'FINAL')).toHaveLength(3)
    expect(postseasonGames.every((game) => game.status === 'completed')).toBe(true)
    expect(postseasonGames.every((game) => game.date >= '2026-06-18' && game.date <= '2026-06-30')).toBe(true)
    const completedPostseason = getCompetitionPostseasonState(playoffWorld, season.id)!
    const finalSeries = Object.values(completedPostseason.seriesByFixtureId).find((series) => series.plan.nodeKey === 'FINAL')!
    expect(Object.values(completedPostseason.seriesByFixtureId).filter((series) => series.plan.nodeKey === 'QUARTERFINALS').every((series) => series.plan.bestOf === 3 && series.plan.winsRequired === 2)).toBe(true)
    expect(Object.values(completedPostseason.seriesByFixtureId).filter((series) => series.plan.nodeKey === 'SEMIFINALS').every((series) => series.plan.bestOf === 5 && series.plan.winsRequired === 3)).toBe(true)
    expect(finalSeries.plan.bestOf).toBe(5)
    expect(finalSeries.plan.winsRequired).toBe(3)
    expect(new Set(Object.values(playoffWorld.games).map((game) => game.id)).size).toBe(Object.values(playoffWorld.games).length)
    expect(getCompetitionPostseasonState(playoffWorld, season.id)?.championTeamId).toBe(initialPostseason.seeds[1]!.competitionSeasonEntryId)
    expect(isSeasonComplete(playoffWorld, season.id)).toBe(true)

    const completed = finalizeCompletedSeason(playoffWorld, season.id)
    const history = completed.seasonHistoryBySeasonId[season.id]!
    expect(history.championTeamId).toBe(initialPostseason.seeds[1]!.competitionSeasonEntryId)
    expect(history.championSource).toBe('postseason')
    expect(history.finalStandings).toEqual(regularStandings)
    expect(calculateStandings(completed, season.id)).toEqual(regularStandings)
    expect(completed.worldDbCompetitionRuntime?.competitionSeasonIds).toEqual([])
    const savedChampion = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(completed, '2026-09-01T00:00:00.000Z'))))
    expect(Object.values(savedChampion.games)).toEqual(Object.values(completed.games))
    expect(savedChampion.seasonHistoryBySeasonId[season.id]).toEqual(history)
    expect(getCompetitionPostseasonState(savedChampion, season.id)).toEqual(getCompetitionPostseasonState(completed, season.id))
  })
})
