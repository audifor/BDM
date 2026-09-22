import { describe, expect, it, vi } from 'vitest'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import * as CalendarEngine from '@/engine/calendar'
import * as PlayerDevelopmentEngine from '@/engine/development'
import { addDays, parseGameDate } from '@/domain/date'
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
import { SPAIN_ACB_2025_26_CALENDAR } from '@/data/worldCompetitionCalendars'
import { spainCopaCompetitionSeasonId } from '@/data/worldCompetitionCalendars'
import { createWorldDbSpainGame } from './WorldDbSpainGame'
import { startNextSeason, startNextSeasonFor } from './startNextSeason'
import * as SeasonLifecycle from './startNextSeason'
import { simulateUntilDate } from './simulateUntilDate'

const source = { databaseId: 'real-world.db', schemaId: 'DDL-PHASE1-A' } as const
const runtimeBundle: WorldCompetitionRuntimeBundle = { bundleSchemaVersion: 1, contentId: 'bdm-phase1-competition-runtime-v1', contentHashAlgorithm: 'BLAKE3', contentHash: 'a'.repeat(64), worldDbSchema: 'DDL-PHASE1-A', competitionFormats: [leagueFormat(), cupFormat()], initialScoreDocuments: [] }
const selection: WorldDbGameBootstrapSelectionV1 = { source, ecosystemId: 'ecosystem:ESP:acb', competitionId: 'competition:ESP:liga-endesa', competitionSeasonId: 'edition:ESP:liga-endesa:2025-26', teamId: 'team:ESP:male:000' }

function values(keys: readonly string[], value = 60): Readonly<Record<string, number>> { return Object.fromEntries(keys.map((key, index) => [key, value + (index % 10)])) }
function slice(): WorldDbGameBootstrapSliceV1 {
  const teams = Array.from({ length: 18 }, (_, index) => ({ teamId: `team:ESP:male:${String(index).padStart(3, '0')}`, name: `Team ${index}`, gender: 'male' as const, countryId: 'place:country:ESP', organizationId: `organization:${index === 1 ? 0 : index}`, organizationSectionId: `section:${index}` }))
  const organizations = [...new Map(teams.map((team) => [team.organizationId, { organizationId: team.organizationId, entityId: `entity:${team.organizationId}`, legalName: `Legal ${team.organizationId}`, foundedYear: 1900, dissolvedYear: null, primaryPlaceId: 'place:country:ESP', website: null }])).values(), { organizationId: 'organization:holding', entityId: 'entity:organization:holding', legalName: 'Holding Organization', foundedYear: 2000, dissolvedYear: null, primaryPlaceId: null, website: null }]
  const organizationSections = teams.map((team) => ({ sectionId: team.organizationSectionId, organizationId: team.organizationId, sport: 'BASKETBALL', gender: 'MALE', categoryScope: null, canonicalName: team.name, validFrom: '1900-01-01', validTo: null }))
  const players = teams.flatMap((team, teamIndex) => ['PG', 'SG', 'SF', 'PF', 'C'].map((position, positionIndex) => ({ playerId: `${team.teamId}:person:${positionIndex}`, personId: `${team.teamId}:person:${positionIndex}`, primaryPosition: position as 'PG' | 'SG' | 'SF' | 'PF' | 'C', secondaryPositions: [], dominantHand: 'RIGHT' as const, ratings: values(PLAYER_TRUTH_RATING_KEYS), tendencies: values(PLAYER_TRUTH_TENDENCY_KEYS), development: ['SHOOTING', 'FINISHING', 'BALL_HANDLING', 'PLAYMAKING', 'OFF_BALL_OFFENSE', 'DEFENSE_REBOUNDING', 'PHYSICAL', 'MENTAL'].map((dimensionCode) => ({ dimensionCode, ceiling: 85 + (teamIndex % 10), growthRate: 50, declineSensitivity: 20 })) })))
  const staffProfiles = teams.map((team) => ({ staffId: `staff:${team.teamId}:head`, personId: `${team.teamId}:head-coach`, attributes: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`STAFF_ATTRIBUTE_${String(index + 1).padStart(2, '0')}`, 60])), specialismIds: ['TACTICS'] }))
  const persons = [...players.map((player) => ({ personId: player.personId, firstName: player.personId.split(':').at(-2)!, lastName: 'Player', gender: 'male' as const, dateOfBirth: '1998-01-01', nationalityIds: ['place:country:ESP'], physical: { heightCm: 190, weightKg: 90, wingspanCm: 195, standingReachCm: 245 } })), ...staffProfiles.map((staff) => ({ personId: staff.personId, firstName: 'Head', lastName: staff.personId.split(':').at(-2)!, gender: 'male' as const, dateOfBirth: '1980-01-01', nationalityIds: ['place:country:ESP'], physical: { heightCm: 180, weightKg: 80, wingspanCm: 180, standingReachCm: 230 } })), { personId: 'person:owner-only', firstName: 'Owner', lastName: 'Only', nationalityIds: [] }]
  return { schemaVersion: 1, source, ecosystem: { ecosystemId: selection.ecosystemId, name: 'Spain ACB Ecosystem', kind: 'fibaLike', category: 'men' }, competition: { competitionId: selection.competitionId, name: 'Liga Endesa', gender: 'male', ecosystemId: selection.ecosystemId }, season: { competitionSeasonId: selection.competitionSeasonId, seasonId: 'season:2025_26', label: '2025-26', startDate: '2025-10-01', endDate: '2026-06-30', provenance: 'DERIVED_SIMULATION_FROM_B04' }, countries: [{ countryId: 'place:country:ESP', name: 'ESP', code: 'ESP' }], organizations, organizationSections, organizationOwnership: [{ ownershipId: 'ownership:worlddb', organizationId: teams[0]!.organizationId, ownerKind: 'PERSON', ownerId: 'person:owner-only', ownershipPercentage: 25, validFrom: '2025-10-01', validTo: null }], teams, persons, players, staffProfiles, staffAssignments: teams.map((team) => ({ assignmentId: `${team.teamId}:head-assignment`, staffId: `staff:${team.teamId}:head`, teamId: team.teamId, roleCode: 'headCoach', assignedOn: '2025-10-01' })), rosterAssignments: players.map((player) => ({ rosterId: `roster:${player.playerId.split(':').slice(0, 4).join(':')}`, teamId: player.playerId.split(':').slice(0, 4).join(':'), playerId: player.playerId, status: 'ACTIVE' })), matches: [] }
}
function catalog(): WorldDbSelectionCatalogV1 { const teams = slice().teams; return { schemaVersion: 1, source, ecosystems: [{ ecosystemId: selection.ecosystemId, code: 'SPAIN_ACB', name: 'Spain ACB Ecosystem', gender: 'M' }], levels: [], units: [], competitionAssignments: [{ assignmentId: 'assignment:liga-endesa', ecosystemId: selection.ecosystemId, competitionId: selection.competitionId, competitionName: 'Liga Endesa', levelId: null, unitId: null, roleType: 'PRIMARY_LEAGUE' }], competitionSeasons: [{ competitionSeasonId: selection.competitionSeasonId, competitionId: selection.competitionId, competitionName: 'Liga Endesa', seasonId: 'season:2025_26', editionNumber: 1 }, { competitionSeasonId: spainCopaCompetitionSeasonId(2025), competitionId: 'competition:ESP:copa-del-rey', competitionName: 'Copa del Rey', seasonId: 'season:2025_26', editionNumber: 1 }], teamMemberships: teams.map((team) => ({ membershipId: `membership:${team.teamId}`, ecosystemId: selection.ecosystemId, teamId: team.teamId, teamName: team.name, levelId: null, unitId: null, membershipStatus: 'ACTIVE', validFrom: null, validTo: null })), teamUnitMemberships: [] } }
function repository(bootstrapSlice = slice()): WorldDatabaseRepository { const info: WorldDbDatabaseInfoV1 = { schemaVersion: 1, source, competitionSeasonIds: [selection.competitionSeasonId, spainCopaCompetitionSeasonId(2025)] }; return { inspectDatabase: vi.fn(async () => info), loadSelectionCatalog: vi.fn(async () => catalog()), loadCompetitionSeason: vi.fn(), loadMatchRealizations: vi.fn(), loadGameBootstrapSlice: vi.fn(async () => bootstrapSlice), loadCompetitionRuntimeBundle: vi.fn(async () => runtimeBundle) } }
function openSession(repo = repository()): WorldDbSessionV1 { return new WorldDbSessionV1({ repository: repo, databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' }) }

describe('World DB Spain ACB playable GameWorld bootstrap', () => {
  it('derives the complete 18-team home-and-away schedule when persisted fixtures are absent', async () => { const session = openSession(); await session.open(); const world = await session.bootstrapGameWorld(selection); expect(Object.keys(world.teams)).toHaveLength(18); expect(Object.keys(world.players)).toHaveLength(90); expect(Object.keys(world.staffPeopleById)).toHaveLength(18); expect(Object.keys(world.teamStaffAssignmentsById)).toHaveLength(18); expect(Object.keys(world.games)).toHaveLength(306); expect(Object.values(world.teams).find((team) => team.id === selection.teamId)?.coachId).toBe('worlddb:coach:team:ESP:male:000'); expect(Object.values(world.coaches).find((coach) => coach.id === 'worlddb:coach:team:ESP:male:000')?.firstName).toBe('Head'); expect(Object.values(world.personsById).find((person) => person.id === `${selection.teamId}:head-coach`)?.profileRefs).toEqual([{ kind: 'staff', profileId: 'staff:team:ESP:male:000:head' }]) })
  it('preserves shared organization identity, section records and their IDs through save/load', () => {
    const sourceSlice = slice()
    const world = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
    const first = Object.values(world.teams)[0]!
    const second = Object.values(world.teams)[1]!
    expect(first.organizationId).toBe(second.organizationId)
    expect(first.organizationId).toBe('organization:0')
    expect(world.organizationsById[first.organizationId]?.legalName).toBe('Legal organization:0')
    expect(world.organizationSectionsById[second.organizationSectionId]?.canonicalName).toBe('Team 1')
    expect(world.organizationOwnershipById['ownership:worlddb' as never]?.owner).toEqual({ kind: 'PERSON', personId: 'person:owner-only' })
    expect(world.personsById['person:owner-only' as never]?.profileRefs).toEqual([])
    expect(world.organizationsById['organization:holding' as never]?.legalName).toBe('Holding Organization')
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z'))
    expect(restored.teams[second.id]?.organizationId).toBe(first.organizationId)
    expect(restored.organizationSectionsById[second.organizationSectionId]?.organizationId).toBe(first.organizationId)
    expect(restored.organizationsById[first.organizationId]).toEqual(world.organizationsById[first.organizationId])
  })
  it('loads person and organization investor interests with identity closure but no ownership/control effects', () => {
    const sourceSlice = slice()
    const targetOrganizationId = sourceSlice.teams[0]!.organizationId
    const investorPerson = { personId: 'person:interested-only', firstName: 'Interested', lastName: 'Only', nationalityIds: [] as readonly string[] }
    const interestedSlice = {
      ...sourceSlice,
      persons: [...sourceSlice.persons, investorPerson],
      organizationInvestorInterest: [
        { interestId: 'interest:person', organizationId: targetOrganizationId, investorKind: 'PERSON' as const, investorId: investorPerson.personId, interestType: 'ACQUISITION', status: 'OPEN', openedOn: '2025-10-01', closedOn: null },
        { interestId: 'interest:organization', organizationId: targetOrganizationId, investorKind: 'ORGANIZATION' as const, investorId: 'organization:holding', interestType: 'PARTNERSHIP', status: null, openedOn: null, closedOn: null },
      ],
    }
    const world = bootstrapGameWorldFromWorldDb(interestedSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
    expect(Object.keys(world.organizationInvestorInterestsById)).toEqual(['interest:person', 'interest:organization'])
    expect(world.personsById['person:interested-only' as never]?.profileRefs).toEqual([])
    expect(world.organizationsById['organization:holding' as never]?.legalName).toBe('Holding Organization')
    expect(Object.keys(world.organizationOwnershipById)).toEqual(['ownership:worlddb'])
    expect(Object.keys(world.organizationControlById)).toEqual([])
  })
  it('rejects a team whose organization does not own its referenced section', () => {
    const sourceSlice = slice()
    const invalidSlice = { ...sourceSlice, teams: sourceSlice.teams.map((team, index) => index === 1 ? { ...team, organizationId: 'organization:2' } : team) }
    expect(() => bootstrapGameWorldFromWorldDb(invalidSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })).toThrow(/organization relation is invalid/)
  })
  it('builds 34 valid ACB rounds through the Season end and keeps them after save/load', () => {
    const sourceSlice = slice()
    const world = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }, undefined, SPAIN_ACB_2025_26_CALENDAR)
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
    expect(games.map((game) => game.date).sort()[0]).toBe('2025-10-04')
    expect(games.map((game) => game.date).sort().at(-1)).toBe('2026-05-30')

    const saved = serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z')
    const restored = deserializeGameWorldV4(saved)
    expect(Object.values(restored.games)).toEqual(games)
  })
  it('uses generated fixtures when the real source contains only a partial schedule', () => {
    const sourceSlice = slice()
    const realFixture = { matchId: 'match:official:1', scheduledAt: '2025-11-02T18:00:00Z', playedAt: null, status: 'SCHEDULED', homeTeamId: sourceSlice.teams[0]!.teamId, awayTeamId: sourceSlice.teams[1]!.teamId }
    const world = bootstrapGameWorldFromWorldDb({ ...sourceSlice, matches: [realFixture] }, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }, undefined, SPAIN_ACB_2025_26_CALENDAR)

    expect(Object.keys(world.games)).toHaveLength(306)
    expect(Object.values(world.games).some((game) => game.id === realFixture.matchId)).toBe(false)
    expect(new Set(Object.values(world.games).map((game) => game.date)).size).toBe(34)
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
  it('is deterministic and preserves every canonical 80/40 truth key and value', () => { const sourceSlice = slice(); const pin = { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }; const first = bootstrapGameWorldFromWorldDb(sourceSlice, selection, pin); const second = bootstrapGameWorldFromWorldDb(sourceSlice, selection, pin); expect(JSON.stringify(first)).toBe(JSON.stringify(second)); for (const sourcePlayer of sourceSlice.players) { const player = first.players[sourcePlayer.playerId as never]!; expect(Object.keys(player.basketball.ratings)).toEqual(PLAYER_TRUTH_RATING_KEYS); expect(PLAYER_TRUTH_RATING_KEYS.map((key) => player.basketball.ratings[key])).toEqual(PLAYER_TRUTH_RATING_KEYS.map((key) => sourcePlayer.ratings[key])); expect(Object.keys(player.basketball.tendencies)).toEqual(PLAYER_TRUTH_TENDENCY_KEYS) } })
  it('rejects a World DB slice with a missing canonical rating', () => { const malformed = slice(); const player = malformed.players[0]!; const { [PLAYER_TRUTH_RATING_KEYS[0]!]: _missing, ...ratings } = player.ratings; expect(() => bootstrapGameWorldFromWorldDb({ ...malformed, players: malformed.players.map((candidate) => candidate.playerId === player.playerId ? { ...candidate, ratings } : candidate) }, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })).toThrow('exactly 80 canonical keys') })
  it('rejects a selected team outside the B02 slice', async () => { const session = openSession(); await session.open(); await expect(session.bootstrapGameWorld({ ...selection, teamId: 'team:ESP:male:missing' })).rejects.toThrow('not in ecosystem') })

  it('plays RealWorldSpain through ranked ACB playoffs, crowns a champion and survives save/load', () => {
    const worldCompetitionFormat = leagueFormat()
    const sourceSlice = slice()
    const baseWorld = bootstrapGameWorldFromWorldDb(sourceSlice, selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema }, worldCompetitionFormat, SPAIN_ACB_2025_26_CALENDAR)
    const season = baseWorld.seasons[baseWorld.currentSeasonId]!
    const regularGames = Object.values(baseWorld.games).filter((game) => game.competitionStageKey === 'REGULAR')
    expect(regularGames).toHaveLength(306)
    expect(Math.max(...regularGames.map((game) => Number(game.date.replaceAll('-', ''))))).toBe(20260530)
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
    expect(Object.values(afterRegularSeason.games).filter((game) => game.competitionStageKey === 'QUARTERFINALS').every((game) => game.date === '2026-06-02')).toBe(true)
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
      playoffWorld = applyMatchResult(playoffWorld, { gameId: next.id, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId, homeScore: 100, awayScore: 80 })
    }

    const postseasonGames = Object.values(playoffWorld.games).filter((game) => game.competitionStageKey !== 'REGULAR')
    expect(postseasonGames.filter((game) => game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(12)
    expect(postseasonGames.filter((game) => game.competitionStageKey === 'SEMIFINALS')).toHaveLength(10)
    expect(postseasonGames.filter((game) => game.competitionStageKey === 'FINAL')).toHaveLength(5)
    expect(postseasonGames.every((game) => game.status === 'completed')).toBe(true)
    expect(postseasonGames.every((game) => game.date >= '2026-06-02' && game.date <= '2026-06-28')).toBe(true)
    const completedPostseason = getCompetitionPostseasonState(playoffWorld, season.id)!
    const finalSeries = Object.values(completedPostseason.seriesByFixtureId).find((series) => series.plan.nodeKey === 'FINAL')!
    expect(Object.values(completedPostseason.seriesByFixtureId).filter((series) => series.plan.nodeKey === 'QUARTERFINALS').every((series) => series.plan.bestOf === 3 && series.plan.winsRequired === 2)).toBe(true)
    expect(Object.values(completedPostseason.seriesByFixtureId).filter((series) => series.plan.nodeKey === 'SEMIFINALS').every((series) => series.plan.bestOf === 5 && series.plan.winsRequired === 3)).toBe(true)
    expect(finalSeries.plan.bestOf).toBe(5)
    expect(finalSeries.plan.winsRequired).toBe(3)
    expect(new Set(Object.values(playoffWorld.games).map((game) => game.id)).size).toBe(Object.values(playoffWorld.games).length)
    expect(getCompetitionPostseasonState(playoffWorld, season.id)?.championTeamId).toBe(finalSeries.state.winnerEntryId)
    expect(isSeasonComplete(playoffWorld, season.id)).toBe(true)

    const completed = finalizeCompletedSeason(playoffWorld, season.id)
    const history = completed.seasonHistoryBySeasonId[season.id]!
    expect(history.championTeamId).toBe(completedPostseason.championTeamId)
    expect(history.championSource).toBe('postseason')
    expect(history.finalStandings).toEqual(regularStandings)
    expect(calculateStandings(completed, season.id)).toEqual(regularStandings)
    expect(completed.worldDbCompetitionRuntime?.competitionSeasonIds).toEqual([])
    const savedChampion = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(completed, '2026-09-01T00:00:00.000Z'))))
    expect(Object.values(savedChampion.games)).toEqual(Object.values(completed.games))
    expect(savedChampion.seasonHistoryBySeasonId[season.id]).toEqual(history)
    expect(getCompetitionPostseasonState(savedChampion, season.id)).toEqual(getCompetitionPostseasonState(completed, season.id))
  })

  it('runs the RealWorldSpain league, linked Cup, playoffs, clock and next edition lifecycle', async () => {
    const sourceSlice = slice()
    const leagueSeasonId = sourceSlice.season.seasonId as never
    let world = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(sourceSlice),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    const leagueSeason = world.seasons[leagueSeasonId]!
    const cupSeasonId = Object.values(world.seasons).find((season) => season.worldCompetitionFormat?.competitionSeasonId === spainCopaCompetitionSeasonId(2025))!.id
    const regularGames = Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'REGULAR')
    const rounds = [...new Set(regularGames.map((game) => game.date))].sort()

    expect(rounds).toHaveLength(34)
    expect(regularGames).toHaveLength(306)
    expect(regularGames.map((game) => game.date).sort()[0]).toBe('2025-10-04')
    expect(rounds[16]).toBe('2026-01-24')
    expect(rounds[33]).toBe('2026-05-30')
    expect(Object.values(world.games).filter((game) => game.seasonId === cupSeasonId)).toHaveLength(0)

    const first17 = regularGames.filter((game) => game.date <= rounds[16]!)
    world = completeGames(world, first17.slice(0, -1))
    const incompleteCupEligibility = getCompetitionPostseasonState(world, cupSeasonId)!
    expect(incompleteCupEligibility.regularSeasonComplete).toBe(false)
    const finalJ17Game = first17.at(-1)!
    world = applyMatchResult(world, { gameId: finalJ17Game.id, homeTeamId: finalJ17Game.homeTeamId, awayTeamId: finalJ17Game.awayTeamId, homeScore: 100, awayScore: 80 })

    const cupSeasonAfterQualification = world.seasons[cupSeasonId]!
    const firstHalfStandings = calculateStandings(world, leagueSeasonId, rounds[16])
    expect(cupSeasonAfterQualification.participantTeamIds).toHaveLength(8)
    expect(cupSeasonAfterQualification.participantTeamIds).toEqual(firstHalfStandings.slice(0, 8).map((line) => line.teamId))
    expect(Object.values(world.games).filter((game) => game.seasonId === cupSeasonId && game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(4)
    expect(Object.values(world.games).filter((game) => game.seasonId === cupSeasonId).every((game) => game.neutralSite === true)).toBe(true)
    expect(Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'REGULAR')).toHaveLength(306)

    const savedCupQualification = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z'))))
    expect(savedCupQualification.seasons[cupSeasonId]?.worldCompetitionFormat?.competitionSeasonId).toBe(spainCopaCompetitionSeasonId(2025))
    expect(Object.values(savedCupQualification.games).filter((game) => game.seasonId === cupSeasonId)).toHaveLength(4)
    expect(Object.values(savedCupQualification.games).filter((game) => game.seasonId === cupSeasonId).every((game) => game.neutralSite === true)).toBe(true)

    for (const stage of ['QUARTERFINALS', 'SEMIFINALS', 'FINAL']) {
      const stageGames = Object.values(world.games).filter((game) => game.seasonId === cupSeasonId && game.competitionStageKey === stage && game.status === 'scheduled')
      world = completeGamesWithTrigger(world, stageGames)
    }
    const cupState = getCompetitionPostseasonState(world, cupSeasonId)!
    const cupChampion = cupState.championTeamId!
    expect(cupChampion).toBeDefined()
    expect(isSeasonComplete(world, cupSeasonId)).toBe(true)
    expect(Object.values(world.games).filter((game) => game.seasonId === cupSeasonId)).toHaveLength(7)
    world = finalizeCompletedSeason(world, cupSeasonId)
    expect(world.seasonHistoryBySeasonId[cupSeasonId]?.championTeamId).toBe(cupChampion)

    const after33 = completeGames(world, regularGames.filter((game) => game.date <= rounds[32]!))
    expect(Object.values(after33.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'REGULAR' && game.status === 'completed')).toHaveLength(297)
    expect(getCompetitionPostseasonState(after33, leagueSeasonId)?.regularSeasonComplete).toBe(false)
    expect(Object.values(after33.games).some((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'QUARTERFINALS')).toBe(false)

    const leagueGamesThroughJ33AndPartOfJ34 = regularGames.filter((game) => game.date <= rounds[33]!).slice(0, -1)
    world = completeGames(world, leagueGamesThroughJ33AndPartOfJ34)
    const lastRegularGame = regularGames.find((game) => game.id === regularGames.at(-1)!.id)!
    world = applyMatchResult(world, { gameId: lastRegularGame.id, homeTeamId: lastRegularGame.homeTeamId, awayTeamId: lastRegularGame.awayTeamId, homeScore: 100, awayScore: 80 })
    const finalStandings = calculateStandings(world, leagueSeasonId)
    const playoffState = getCompetitionPostseasonState(world, leagueSeasonId)!
    expect(playoffState.regularSeasonComplete).toBe(true)
    expect(playoffState.seeds.map((entry) => entry.competitionSeasonEntryId)).toEqual(finalStandings.slice(0, 8).map((line) => line.teamId))
    expect(Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'REGULAR' && game.status === 'completed')).toHaveLength(306)
    expect(Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(4)

    const savedPlayoffs = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-09-01T00:00:00.000Z'))))
    expect(getCompetitionPostseasonState(savedPlayoffs, leagueSeasonId)?.seeds).toEqual(playoffState.seeds)
    expect(Object.values(savedPlayoffs.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === 'QUARTERFINALS')).toHaveLength(4)
    world = savedPlayoffs

    for (const stage of ['QUARTERFINALS', 'SEMIFINALS', 'FINAL']) {
      const fixtureIds = [...new Set(Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey === stage).map((game) => game.postseasonFixtureId!))]
      for (const fixtureId of fixtureIds) {
        while (true) {
          const next = Object.values(world.games).find((game) => game.seasonId === leagueSeasonId && game.postseasonFixtureId === fixtureId && game.status === 'scheduled')
          if (next === undefined) break
          world = applyMatchResult(world, { gameId: next.id, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId, homeScore: 100, awayScore: 80 })
        }
      }
    }

    const completedPlayoffs = Object.values(world.games).filter((game) => game.seasonId === leagueSeasonId && game.competitionStageKey !== 'REGULAR')
    const leagueChampion = getCompetitionPostseasonState(world, leagueSeasonId)!.championTeamId!
    expect(completedPlayoffs).toHaveLength(27)
    expect(completedPlayoffs.every((game) => game.status === 'completed' && game.date >= '2026-06-02' && game.date <= '2026-06-28')).toBe(true)
    expect(new Set(Object.values(world.games).map((game) => game.id)).size).toBe(Object.values(world.games).length)
    expect(isSeasonComplete(world, leagueSeasonId)).toBe(true)
    world = finalizeCompletedSeason(world, leagueSeasonId)
    expect(world.seasonHistoryBySeasonId[leagueSeasonId]?.championTeamId).toBe(leagueChampion)

    const atFinalWindow = updateGameWorld(world, { currentDate: parseGameDate('2026-06-28') })
    const atJuly1 = advanceGameDay(advanceGameDay(advanceGameDay(atFinalWindow)))
    expect(atJuly1.currentDate).toBe('2026-07-01')

    // Rollover never moves the world clock or currentSeasonId (see startNextSeason.ts): the new
    // edition is located by competitionId, not by re-reading currentSeasonId.
    const nextSeasonWorld = startNextSeason(atJuly1)
    expect(nextSeasonWorld.currentDate).toBe(atJuly1.currentDate)
    expect(nextSeasonWorld.currentSeasonId).toBe(atJuly1.currentSeasonId)
    const leagueCompetitionId = atJuly1.seasons[leagueSeasonId]!.competitionId
    const nextLeague = Object.values(nextSeasonWorld.seasons).find((season) => season.competitionId === leagueCompetitionId && season.id !== leagueSeasonId)!
    const nextLeagueGames = Object.values(nextSeasonWorld.games).filter((game) => game.seasonId === nextLeague.id && game.competitionStageKey === 'REGULAR')
    const nextCup = Object.values(nextSeasonWorld.seasons).find((season) => season.worldCompetitionFormat?.competitionSeasonId === spainCopaCompetitionSeasonId(2026))
    expect(nextLeague.worldCompetitionFormat?.competitionSeasonId).toBe('edition:ESP:liga-endesa:2026-27')
    expect(nextLeagueGames).toHaveLength(306)
    expect(new Set(nextLeagueGames.map((game) => game.date)).size).toBe(34)
    expect(nextCup).toBeDefined()
    expect(nextCup?.calendarPolicy?.seasonWindow.startDate).toBe('2027-02-19')
    expect(nextLeague.calendarPolicy?.seasonWindow.startDate).toBe('2026-10-01')
  })

  // RWS-BUG-002A: the calendar's regular-season window is now derived from the actual round
  // count and cadence (deriveNextEditionCalendarPolicy), never a fixed offset copied from the
  // reference 2025-26 edition, so it can no longer run out of margin however the aligned
  // start date's weekday falls across repeated rollovers.
  it('RWS-BUG-002 long run: advances the world clock exactly 1000 calendar days through multiple ACB season rollovers without stopping', async () => {
    const initialWorld = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(slice()),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    const startDate = initialWorld.currentDate
    const expectedFinalDate = addDays(startDate, 1000)

    const primaryCompetitionId = initialWorld.seasons[initialWorld.currentSeasonId]!.competitionId

    let world = initialWorld
    let seasonsCreated = 0
    let postseasonsCreated = 0
    let gamesCompletedTotal = 0
    // Rollover NEVER moves currentDate/currentSeasonId (see startNextSeason.ts): a Season, once
    // rolled, must never be handed to startNextSeasonFor again -- track which ones already have a
    // next edition so the world clock's own day-by-day walk is the only thing driving progress,
    // exactly as CalendarEngine.migrateCurrentSeasonIfElapsed will once currentDate reaches it.
    const rolledSeasonIds = new Set<string>()
    const seasonIdsSeen = new Set<string>([world.currentSeasonId as string])

    let safety = 0
    while (world.currentDate < expectedFinalDate) {
      safety += 1
      if (safety > 5000) throw new Error('Long-run safety limit exceeded before reaching the expected final date')
      const beforePostseasonGames = Object.values(world.games).filter((game) => game.competitionStageKey !== 'REGULAR').length
      const beforeCompletedGames = Object.values(world.games).filter((game) => game.status === 'completed').length

      world = advanceGameDay(world)

      const afterCompletedGames = Object.values(world.games).filter((game) => game.status === 'completed').length
      gamesCompletedTotal += afterCompletedGames - beforeCompletedGames
      const afterPostseasonGames = Object.values(world.games).filter((game) => game.competitionStageKey !== 'REGULAR').length
      if (afterPostseasonGames > beforePostseasonGames) postseasonsCreated += 1

      const latestPrimarySeason = Object.values(world.seasons)
        .filter((season) => season.competitionId === primaryCompetitionId)
        .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))[0]!
      if (!rolledSeasonIds.has(latestPrimarySeason.id) && isSeasonComplete(world, latestPrimarySeason.id) && world.seasonHistoryBySeasonId[latestPrimarySeason.id] !== undefined) {
        world = startNextSeasonFor(world, latestPrimarySeason.id)
        rolledSeasonIds.add(latestPrimarySeason.id)
        seasonsCreated += 1
        const newest = Object.values(world.seasons)
          .filter((season) => season.competitionId === primaryCompetitionId)
          .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))[0]!
        seasonIdsSeen.add(newest.id)
      }
    }

    expect(world.currentDate).toBe(expectedFinalDate)
    expect(seasonsCreated).toBeGreaterThanOrEqual(1)
    expect(postseasonsCreated).toBeGreaterThanOrEqual(1)
    expect(gamesCompletedTotal).toBeGreaterThan(306)

    // No duplicated CompetitionSeasons: every rollover produced a distinct Season identity.
    expect(seasonIdsSeen.size).toBe(seasonsCreated + 1)
    // No duplicated Games: canonical Game IDs remain unique across the whole run.
    expect(new Set(Object.values(world.games).map((game) => game.id)).size).toBe(Object.values(world.games).length)
  }, 120_000)

  it('RWS-BUG-002 ten-year run: reaches 2035-10-01 through canonical simulation, rollovers, and annual development', async () => {
    const startDate = parseGameDate('2025-10-01')
    const targetDate = parseGameDate('2035-10-01')
    const initialWorld = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(slice()),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    expect(initialWorld.currentDate).toBe(startDate)
    const expectedCycleIds = expectedAnnualDevelopmentCycleIds(startDate, targetDate)
    const deterministicCycleContext = {
      fromSeasonId: initialWorld.currentSeasonId,
      toSeasonId: initialWorld.currentSeasonId,
      targetDate: startDate,
      cycleId: expectedCycleIds[0]!,
    }
    expect(PlayerDevelopmentEngine.applyOffseasonDevelopment(initialWorld, deterministicCycleContext)).toEqual(
      PlayerDevelopmentEngine.applyOffseasonDevelopment(initialWorld, deterministicCycleContext),
    )

    const advancedDates: string[] = []
    const noGameDates: string[] = []
    const originalAdvanceDay = CalendarEngine.advanceDay
    const advanceDaySpy = vi.spyOn(CalendarEngine, 'advanceDay').mockImplementation((world) => {
      const next = originalAdvanceDay(world)
      advancedDates.push(next.currentDate)
      if (!Object.values(next.games).some((game) => game.status === 'scheduled' && game.date === next.currentDate)) {
        noGameDates.push(next.currentDate)
      }
      return next
    })

    const originalStartNextSeasonFor = SeasonLifecycle.startNextSeasonFor
    const rolloverDates: string[] = []
    const rolloverSpy = vi.spyOn(SeasonLifecycle, 'startNextSeasonFor').mockImplementation((world, seasonId) => {
      const currentDateBeforeRollover = world.currentDate
      const next = originalStartNextSeasonFor(world, seasonId)
      expect(next.currentDate).toBe(currentDateBeforeRollover)
      rolloverDates.push(currentDateBeforeRollover)
      return next
    })

    const observedApplications: { readonly cycleId: string | undefined; readonly date: string }[] = []
    const originalApplyOffseasonDevelopment = PlayerDevelopmentEngine.applyOffseasonDevelopment
    const developmentSpy = vi.spyOn(PlayerDevelopmentEngine, 'applyOffseasonDevelopment').mockImplementation((world, context) => {
      observedApplications.push({ cycleId: context.cycleId, date: world.currentDate })
      return originalApplyOffseasonDevelopment(world, context)
    })

    let result: ReturnType<typeof simulateUntilDate>
    let capturedSpyCalls: { readonly cycleId: string | undefined; readonly date: string }[] = []
    try {
      result = simulateUntilDate(initialWorld, targetDate)
      // Capture the spy history while it is still active; mockRestore() clears its call history.
      capturedSpyCalls = developmentSpy.mock.calls.map(([world, context]) => ({ cycleId: context.cycleId, date: world.currentDate }))
    } finally {
      developmentSpy.mockRestore()
      rolloverSpy.mockRestore()
      advanceDaySpy.mockRestore()
    }

    const { world } = result!
    const seasons = Object.values(world.seasons)
    const seasonIds = seasons.map((season) => season.id)
    const duplicateSeasonIds = seasonIds.filter((id, index) => seasonIds.indexOf(id) !== index)
    const competitionSeasonIds = seasons.flatMap((season) =>
      season.worldCompetitionFormat === undefined ? [] : [season.worldCompetitionFormat.competitionSeasonId],
    )
    const duplicateCompetitionSeasonIds = competitionSeasonIds.filter((id, index) => competitionSeasonIds.indexOf(id) !== index)
    const games = Object.values(world.games)
    const gameIds = games.map((game) => game.id)
    const duplicateGameIds = gameIds.filter((id, index) => gameIds.indexOf(id) !== index)
    const pendingGamesInPast = games.filter((game) => game.status === 'scheduled' && game.date < world.currentDate)
    const observedCycleIds = observedApplications.map((application) => application.cycleId).filter((id): id is string => id !== undefined)
    const duplicateCycleIds = observedCycleIds.filter((id, index) => observedCycleIds.indexOf(id) !== index)
    const competitionSeasonsCreated = seasons.length - Object.keys(initialWorld.seasons).length

    console.log(JSON.stringify({
      startDate,
      targetDate,
      finalDate: result!.finalDate,
      expectedCycleIds,
      observedCycleIds,
      applications: observedApplications,
      capturedSpyCalls,
      duplicateCycleIds,
      competitionSeasonsCreated,
      competitionSeasonsInWorld: seasons.length,
      pendingGamesInPast: pendingGamesInPast.length,
      duplicateSeasonIds,
      duplicateCompetitionSeasonIds,
      duplicateGameIds,
    }))

    expect(result!.finalDate).toBe(targetDate)
    expect(world.currentDate).toBe(targetDate)
    expect(result!.daysAdvanced).toBe(3652)
    expect(['arrived', 'userGame', 'mediaOpportunity']).toContain(result!.stopReason.type)
    expect(advancedDates.at(-1)).toBe(targetDate)
    expect(noGameDates.length).toBeGreaterThan(0)
    expect(pendingGamesInPast).toHaveLength(0)
    expect(duplicateSeasonIds).toEqual([])
    expect(duplicateCompetitionSeasonIds).toEqual([])
    expect(seasons.every((season) => season.startDate <= season.endDate)).toBe(true)
    for (const competitionId of new Set(seasons.map((season) => season.competitionId))) {
      const editions = seasons
        .filter((season) => season.competitionId === competitionId)
        .sort((left, right) => left.startDate.localeCompare(right.startDate))
      expect(editions.every((season, index) => index === 0 || editions[index - 1]!.endDate < season.startDate)).toBe(true)
    }
    expect(duplicateGameIds).toEqual([])
    expect(rolloverDates.length).toBeGreaterThanOrEqual(10)
    expect(rolloverDates.every((date) => date >= startDate && date < targetDate)).toBe(true)
    expect(capturedSpyCalls).toEqual(observedApplications)
    expect(observedCycleIds).toEqual(expectedCycleIds)
    expect(new Set(observedCycleIds).size).toBe(observedCycleIds.length)
    expect(duplicateCycleIds).toEqual([])
    expect(observedApplications.map((application) => application.date)).toEqual(
      expectedCycleIds.map((cycleId) => `${cycleId.slice('annual-development:'.length)}-07-01`),
    )
    expect(world.worldAnnualDevelopmentCycle?.lastAppliedCycleId).toBe(expectedCycleIds.at(-1))
  }, 900_000)

  it.each([100, 365])('measures advanceGameDay performance over %i consecutive days', async (dayCount) => {
    let world = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(slice()),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    const startedAt = performance.now()
    for (let day = 0; day < dayCount; day += 1) world = advanceGameDay(world)
    const elapsedMs = performance.now() - startedAt
    // eslint-disable-next-line no-console
    console.log(`advanceGameDay x${dayCount}: ${elapsedMs.toFixed(1)}ms (${(elapsedMs / dayCount).toFixed(2)}ms/day)`)
    expect(world.currentDate).toBeDefined()
  }, 60_000)

  it.each([10, 20])('RWS-BUG-002A lifecycle: rolls over %i consecutive ACB seasons without duplicate IDs, dates, or fixtures', async (seasonCount) => {
    let world = await createWorldDbSpainGame(selection.teamId, {
      repository: repository(slice()),
      databasePath: source.databaseId,
      runtimeBundlePath: 'runtime-bundle.json',
    })
    const primaryCompetitionId = world.seasons[world.currentSeasonId]!.competitionId
    const seasonIds = new Set<string>()
    const seasonStartDates: string[] = []
    let previousSeasonEnd = ''
    // Rollover never moves currentSeasonId (see startNextSeason.ts): each edition is located by
    // competitionId + latest startDate, exactly like CalendarEngine's own successor lookup.
    let season = world.seasons[world.currentSeasonId]!

    for (let seasonNumber = 0; seasonNumber < seasonCount; seasonNumber += 1) {
      expect(seasonIds.has(season.id)).toBe(false)
      seasonIds.add(season.id)
      seasonStartDates.push(season.startDate)
      if (previousSeasonEnd !== '') expect(season.startDate > previousSeasonEnd).toBe(true)
      previousSeasonEnd = season.endDate

      const regularGames = Object.values(world.games).filter((game) => game.seasonId === season.id && game.competitionStageKey === 'REGULAR')
      expect(regularGames).toHaveLength(306)
      expect(new Set(regularGames.map((game) => game.date)).size).toBe(34)

      world = completeGamesWithTrigger(world, regularGames)
      let playoffWorld = world
      while (true) {
        const next = Object.values(playoffWorld.games).find((game) => game.seasonId === season.id && game.competitionStageKey !== 'REGULAR' && game.status === 'scheduled')
        if (next === undefined) break
        playoffWorld = applyMatchResult(playoffWorld, { gameId: next.id, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId, homeScore: 100, awayScore: 80 })
      }
      world = playoffWorld
      expect(isSeasonComplete(world, season.id)).toBe(true)
      world = finalizeCompletedSeason(world, season.id)
      expect(world.seasonHistoryBySeasonId[season.id]).toBeDefined()

      world = startNextSeasonFor(world, season.id)
      season = Object.values(world.seasons)
        .filter((candidate) => candidate.competitionId === primaryCompetitionId)
        .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))[0]!
    }

    // No duplicated CompetitionSeasons/fixtures across the whole run.
    expect(seasonIds.size).toBe(seasonCount)
    expect(new Set(Object.values(world.games).map((game) => game.id)).size).toBe(Object.values(world.games).length)
    // No CompetitionSeason ever reused an absolute date range from the reference 2025-26 edition
    // (season index 0), except that first edition itself.
    expect(new Set(seasonStartDates).size).toBe(seasonCount)
    expect(seasonStartDates.slice(1).every((date) => date !== seasonStartDates[0])).toBe(true)
  }, 300_000)
})

function expectedAnnualDevelopmentCycleIds(startDate: string, targetDate: string): string[] {
  const cycleIds: string[] = []
  const firstYear = Number(startDate.slice(0, 4))
  const lastYear = Number(targetDate.slice(0, 4))
  for (let year = firstYear; year <= lastYear; year += 1) {
    const triggerDate = `${year}-07-01`
    if (triggerDate > startDate && triggerDate <= targetDate) cycleIds.push(`annual-development:${year}`)
  }
  return cycleIds
}

function leagueFormat() {
  return parseWorldCompetitionFormatDocument({
    schema_version: '1.0', competition_id: 'competition:ESP:liga-endesa', competition_season_id: 'edition:ESP:liga-endesa:2025-26', season_label: '2025-26', status: 'COMPLETE',
    variants: [{ key: 'MAIN', is_real_variant: true, nodes: [
      { key: 'REGULAR', node_type: 'STAGE', role: 'REGULAR_SEASON', team_count: 18, pairing: { type: 'ROUND_ROBIN', meetings_per_pair: 2 } },
      { key: 'QUARTERFINALS', node_type: 'ROUND', role: 'PLAYOFF', team_count: 8, pairing: { type: 'FIXED_BRACKET', payload: { matchups: ['1-8', '2-7', '3-6', '4-5'] } }, contest: { format_type: 'SERIES', best_of: 3, wins_required: 2 }, hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HAH', priority_basis: 'HIGHER_SEED', payload: {} } },
      { key: 'SEMIFINALS', node_type: 'ROUND', role: 'PLAYOFF', team_count: 4, pairing: { type: 'FIXED_BRACKET', payload: { paths: ['WINNER_1_VS_8_VS_WINNER_2_VS_7', 'WINNER_3_VS_6_VS_WINNER_4_VS_5'] } }, contest: { format_type: 'SERIES', best_of: 5, wins_required: 3 }, hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HAHAH', priority_basis: 'HIGHER_SEED', payload: {} } },
      { key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2, contest: { format_type: 'SERIES', best_of: 5, wins_required: 3 }, hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HAHAH', priority_basis: 'HIGHER_SEED', payload: {} } },
    ], edges: [
      { from: 'REGULAR', to: 'QUARTERFINALS', selector: 'RANK_RANGE', rank_from: 1, rank_to: 8 },
      { from: 'QUARTERFINALS', to: 'SEMIFINALS', selector: 'WINNER' },
      { from: 'SEMIFINALS', to: 'FINAL', selector: 'WINNER' },
    ] }],
    sources: [{ url: 'https://www.acb.com', type: 'OFFICIAL' }],
  })
}

function cupFormat() {
  const seasonId = spainCopaCompetitionSeasonId(2025)
  return parseWorldCompetitionFormatDocument({
    schema_version: '1.0', competition_id: 'competition:ESP:copa-del-rey', competition_season_id: seasonId, season_label: '2025-26', status: 'COMPLETE',
    variants: [{ key: 'MAIN', is_real_variant: true, entry_selection: { method: 'RANK_BASED', payload: { source_competition_season_id: 'edition:ESP:liga-endesa:2025-26', reference_point: 'AFTER_MATCHDAY_17', rank_from: 1, rank_to: 8 } }, seeding: { scheme_type: 'POTS', basis: [] }, nodes: [
      { key: 'QUARTERFINALS', node_type: 'ROUND', role: 'FINAL_EIGHT', team_count: 8, pairing: { type: 'FIXED_BRACKET', payload: { matchups: ['1-8', '2-7', '3-6', '4-5'] } }, contest: { format_type: 'SINGLE_GAME', requires_winner: true }, hosting: { rule_type: 'NEUTRAL', payload: {} } },
      { key: 'SEMIFINALS', node_type: 'ROUND', role: 'FINAL_EIGHT', team_count: 4, pairing: { type: 'FIXED_BRACKET', payload: { paths: ['WINNER_1_VS_8_VS_WINNER_2_VS_7', 'WINNER_3_VS_6_VS_WINNER_4_VS_5'] } }, contest: { format_type: 'SINGLE_GAME', requires_winner: true }, hosting: { rule_type: 'NEUTRAL', payload: {} } },
      { key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2, contest: { format_type: 'SINGLE_GAME', requires_winner: true }, hosting: { rule_type: 'NEUTRAL', payload: {} } },
    ], edges: [ { from: 'QUARTERFINALS', to: 'SEMIFINALS', selector: 'WINNER' }, { from: 'SEMIFINALS', to: 'FINAL', selector: 'WINNER' } ] }],
    sources: [{ url: 'https://www.acb.com', type: 'OFFICIAL' }],
  })
}

function completeGames(world: ReturnType<typeof bootstrapGameWorldFromWorldDb>, games: readonly ReturnType<typeof createGame>[]) {
  const ids = new Set(games.map((game) => game.id))
  return updateGameWorld(world, { games: Object.values(world.games).map((game) => ids.has(game.id) && game.status === 'scheduled' ? createGame({ ...game, status: 'completed', result: { homeScore: 100, awayScore: 80 } }) : game) })
}

function completeGamesWithTrigger(world: ReturnType<typeof bootstrapGameWorldFromWorldDb>, games: readonly ReturnType<typeof createGame>[]) {
  const scheduled = games.filter((game) => world.games[game.id]?.status === 'scheduled')
  if (scheduled.length === 0) return world
  const trigger = scheduled.at(-1)!
  const prepared = completeGames(world, scheduled.slice(0, -1))
  return applyMatchResult(prepared, { gameId: trigger.id, homeTeamId: trigger.homeTeamId, awayTeamId: trigger.awayTeamId, homeScore: 100, awayScore: 80 })
}
