import { describe, expect, it, vi } from 'vitest'

import { CANONICAL_RATING_KEYS } from '@/domain/player'
import type { WorldDbSelectionCatalogV1 } from '@/domain/worldDb/SelectionCatalog'
import type { WorldDbGameBootstrapSelectionV1, WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import type { WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'

import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'
import { WorldDbSessionV1 } from './WorldDbSession'

const source = { databaseId: 'real-world.db', schemaId: 'DDL-PHASE1-A' } as const
const runtimeBundle: WorldCompetitionRuntimeBundle = {
  bundleSchemaVersion: 1,
  contentId: 'bdm-phase1-competition-runtime-v1',
  contentHashAlgorithm: 'BLAKE3',
  contentHash: 'a'.repeat(64),
  worldDbSchema: 'DDL-PHASE1-A',
  competitionFormats: [{ schemaVersion: '1.0', competitionId: 'competition:league', competitionSeasonId: 'competition-season:league:2026', seasonLabel: '2026', status: 'COMPLETE', variants: [], consequences: [], sources: [] }],
  initialScoreDocuments: [],
}
const selection: WorldDbGameBootstrapSelectionV1 = {
  source,
  ecosystemId: 'ecosystem:real',
  competitionId: 'competition:league',
  competitionSeasonId: 'competition-season:league:2026',
  teamId: 'team:alpha',
}

function ratings(): Readonly<Record<string, number>> {
  return Object.fromEntries(CANONICAL_RATING_KEYS.map((key, index) => [key, 60 + (index % 20)]))
}

function slice(): WorldDbGameBootstrapSliceV1 {
  const countries = [
    { countryId: 'country:home', name: 'Home', code: 'HOM' },
    { countryId: 'country:away', name: 'Away', code: 'AWY' },
  ]
  const teams = [
    { teamId: 'team:alpha', name: 'Alpha Club', gender: 'male' as const, countryId: 'country:home' },
    { teamId: 'team:beta', name: 'Beta Club', gender: 'male' as const, countryId: 'country:away' },
  ]
  const players = teams.flatMap((team, teamIndex) => ['PG', 'SG', 'SF', 'PF', 'C'].map((position, positionIndex) => ({
    playerId: `${team.teamId}:player:${position}`,
    firstName: `First${teamIndex}${positionIndex}`,
    lastName: `Last${teamIndex}${positionIndex}`,
    gender: 'male' as const,
    nationalityId: team.countryId,
    dateOfBirth: '1998-01-01',
    heightCm: 190 + positionIndex,
    weightKg: 85 + positionIndex,
    primaryPosition: position as 'PG' | 'SG' | 'SF' | 'PF' | 'C',
    ratings: ratings(),
  })))
  return {
    schemaVersion: 1,
    source,
    ecosystem: { ecosystemId: 'ecosystem:real', name: 'Real Basketball', kind: 'fibaLike', category: 'men' },
    competition: { competitionId: selection.competitionId, name: 'Real League', gender: 'male', ecosystemId: selection.ecosystemId },
    season: { competitionSeasonId: selection.competitionSeasonId, seasonId: 'season:2026', label: '2026', startDate: '2026-10-01', endDate: '2027-06-30' },
    countries,
    teams,
    players,
    rosterAssignments: players.map((player) => ({ teamId: player.playerId.startsWith('team:alpha') ? 'team:alpha' : 'team:beta', playerId: player.playerId, status: 'ACTIVE' })),
    matches: [{ matchId: 'match:opening', scheduledAt: '2026-10-01T19:00:00Z', playedAt: null, status: 'SCHEDULED', homeTeamId: 'team:alpha', awayTeamId: 'team:beta' }],
  }
}

function catalog(): WorldDbSelectionCatalogV1 {
  return {
    schemaVersion: 1,
    source,
    ecosystems: [{ ecosystemId: selection.ecosystemId, code: 'REAL', name: 'Real Basketball', gender: 'M' }],
    levels: [],
    units: [],
    competitionAssignments: [{ assignmentId: 'assignment:league', ecosystemId: selection.ecosystemId, competitionId: selection.competitionId, competitionName: 'Real League', levelId: null, unitId: null, roleType: 'PRIMARY_LEAGUE' }],
    competitionSeasons: [{ competitionSeasonId: selection.competitionSeasonId, competitionId: selection.competitionId, competitionName: 'Real League', seasonId: 'season:2026', editionNumber: 1 }],
    teamMemberships: [
      { membershipId: 'membership:alpha', ecosystemId: selection.ecosystemId, teamId: 'team:alpha', teamName: 'Alpha Club', levelId: null, membershipStatus: 'ACTIVE', validFrom: null, validTo: null },
      { membershipId: 'membership:beta', ecosystemId: selection.ecosystemId, teamId: 'team:beta', teamName: 'Beta Club', levelId: null, membershipStatus: 'ACTIVE', validFrom: null, validTo: null },
    ],
    teamUnitMemberships: [],
  }
}

function repository(): WorldDatabaseRepository {
  const info: WorldDbDatabaseInfoV1 = { schemaVersion: 1, source, competitionSeasonIds: [selection.competitionSeasonId] }
  return {
    inspectDatabase: vi.fn(async () => info),
    loadSelectionCatalog: vi.fn(async () => catalog()),
    loadCompetitionSeason: vi.fn(),
    loadMatchRealizations: vi.fn(),
    loadGameBootstrapSlice: vi.fn(async () => slice()),
    loadCompetitionRuntimeBundle: vi.fn(async () => runtimeBundle),
  }
}

function openSession(repo = repository()): WorldDbSessionV1 {
  return new WorldDbSessionV1({ repository: repo, databasePath: source.databaseId, runtimeBundlePath: 'runtime-bundle.json' })
}

describe('World DB playable GameWorld bootstrap', () => {
  it('turns a valid canonical selection into a valid GameWorld', async () => {
    const session = openSession()
    await session.open()
    const world = await session.bootstrapGameWorld(selection)

    expect(Object.values(world.teams).find((team) => team.id === selection.teamId)).toMatchObject({ id: selection.teamId, name: 'Alpha Club' })
    expect(Object.values(world.competitions).find((competition) => competition.id === selection.competitionId)?.participantTeamIds).toEqual(['team:alpha', 'team:beta'])
    expect(Object.values(world.seasons).find((season) => season.id === 'season:2026')?.participantTeamIds).toEqual(['team:alpha', 'team:beta'])
    expect(Object.keys(world.games)).toEqual(['match:opening'])
    expect(world.worldDbCompetitionRuntime?.competitionSeasonIds).toEqual([selection.competitionSeasonId])
  })

  it.each([
    ['selected team nonexistent', { teamId: 'team:missing' }, 'not in ecosystem'],
    ['source identity mismatch', { source: { databaseId: 'other.db', schemaId: source.schemaId } }, 'source identity mismatch'],
  ])('%s is rejected', async (_label, patch, message) => {
    const session = openSession()
    await session.open()
    await expect(session.bootstrapGameWorld({ ...selection, ...patch } as WorldDbGameBootstrapSelectionV1)).rejects.toThrow(message)
  })

  it('rejects a team that is in the ecosystem but outside the selected competition season slice', async () => {
    const session = openSession()
    await session.open()
    const outside = slice()
    const repo = repository()
    repo.loadGameBootstrapSlice = vi.fn(async () => ({ ...outside, teams: outside.teams.filter((team) => team.teamId !== 'team:alpha'), players: outside.players.filter((player) => !player.playerId.startsWith('team:alpha')), rosterAssignments: outside.rosterAssignments.filter((assignment) => assignment.teamId !== 'team:alpha') }))
    const outsideSession = openSession(repo)
    await outsideSession.open()
    await expect(outsideSession.bootstrapGameWorld(selection)).rejects.toThrow('not in competition season')
  })

  it('rejects an incoherent competition season', async () => {
    const repo = repository()
    repo.loadSelectionCatalog = vi.fn(async () => ({ ...catalog(), competitionSeasons: [...catalog().competitionSeasons, { competitionSeasonId: 'competition-season:other:2026', competitionId: 'competition:other', competitionName: 'Other', seasonId: 'season:2026', editionNumber: 1 }] }))
    const session = openSession(repo)
    await session.open()
    await expect(session.bootstrapGameWorld({ ...selection, competitionSeasonId: 'competition-season:other:2026' })).rejects.toThrow('does not belong to competition')
  })

  it('is deterministic and contains one canonical team/player record per loaded identity', () => {
    const first = bootstrapGameWorldFromWorldDb(slice(), selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
    const second = bootstrapGameWorldFromWorldDb(slice(), selection, { contentId: runtimeBundle.contentId, contentHash: runtimeBundle.contentHash, worldDbSchema: runtimeBundle.worldDbSchema })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(new Set(Object.keys(first.teams)).size).toBe(Object.keys(first.teams).length)
    expect(new Set(Object.keys(first.players)).size).toBe(Object.keys(first.players).length)
    expect(Object.values(first.teams).flatMap((team) => team.rosterPlayerIds).every((playerId) => first.players[playerId] !== undefined)).toBe(true)
    expect(Object.values(first.teams).some((team) => team.id === selection.teamId)).toBe(true)
    expect(CANONICAL_RATING_KEYS.every((key) => Object.values(first.players).every((player) => Number.isFinite(player.basketball.ratings[key])))).toBe(true)
  })
})
