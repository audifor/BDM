import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertWorldDbGameBootstrapSliceV1, type WorldDbGameBootstrapSelectionV1, type WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import { createMatchPlayerProfile, simulateMatchDetailed, applyCompletedMatch } from '@/engine/match'
import { SeededRandomSource } from '@/engine/random'
import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'

const slicePath = process.env.BDM_WORLD_DB_SLICE_JSON
const runProductionSmoke = slicePath !== undefined && existsSync(slicePath)

describe.runIf(runProductionSmoke)('World DB production Spain ACB smoke', () => {
  it('materializes the real slice, derives the first game and applies a real MatchEngine result', () => {
    const value: unknown = JSON.parse(readFileSync(slicePath!, 'utf8'))
    assertWorldDbGameBootstrapSliceV1(value)
    const slice: WorldDbGameBootstrapSliceV1 = value
    const selection: WorldDbGameBootstrapSelectionV1 = { source: slice.source, ecosystemId: slice.ecosystem.ecosystemId, competitionId: slice.competition.competitionId, competitionSeasonId: slice.season.competitionSeasonId, teamId: slice.teams[0]!.teamId }
    const world = bootstrapGameWorldFromWorldDb(slice, selection, { contentId: 'production-smoke', contentHash: '0'.repeat(64), worldDbSchema: slice.source.schemaId })
    expect(Object.keys(world.teams)).toHaveLength(18)
    expect(Object.keys(world.players)).toHaveLength(270)
    expect(Object.keys(world.staffPeopleById)).toHaveLength(90)
    expect(Object.keys(world.games)).toHaveLength(306)
    const game = Object.values(world.games)[0]!
    const home = world.teams[game.homeTeamId]!
    const away = world.teams[game.awayTeamId]!
    const squads = { home: home.rosterPlayerIds, away: away.rosterPlayerIds }
    const lineups = { home: squads.home.slice(0, 5), away: squads.away.slice(0, 5) }
    const profiles = { home: squads.home.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)), away: squads.away.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)) }
    const simulation = simulateMatchDetailed({ world, gameId: game.id, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, squads, lineups, playerProfiles: profiles, random: new SeededRandomSource(101), decisionRandom: new SeededRandomSource(202), actorRandom: new SeededRandomSource(303) })
    const completed = applyCompletedMatch(world, simulation)
    expect(completed.games[game.id]?.status).toBe('completed')
  })
})
