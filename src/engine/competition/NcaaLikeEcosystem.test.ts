import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { calculateConferenceStandings, calculateStandingsForCompetition, getConferenceRegularSeasonChampion } from './standings'

describe('NCAA-like ecosystem', () => {
  it('creates deterministic programs, conferences and a classified conflict-free schedule alongside FIBA and NBA', () => {
    const first = createNewGame(); const second = createNewGame()
    expect(Object.values(first.ecosystems).map((item) => item.kind).sort()).toEqual(['fibaLike', 'nbaLike', 'ncaaLike'].sort())
    const ncaa = Object.values(first.ecosystems).find((item) => item.kind === 'ncaaLike')!
    const season = Object.values(first.seasons).find((item) => first.competitions[item.competitionId]!.ecosystemId === ncaa.id)!
    const conferences = Object.values(first.conferencesById).filter((item) => item.ecosystemId === ncaa.id)
    const games = Object.values(first.games).filter((game) => game.seasonId === season.id)
    expect(conferences).toHaveLength(3); expect(first.conferenceMemberships.filter((item) => item.seasonId === season.id)).toHaveLength(12)
    expect(new Set(first.conferenceMemberships.filter((item) => item.seasonId === season.id).map((item) => item.teamId)).size).toBe(12)
    expect(games.some((game) => game.classification === 'conference')).toBe(true); expect(games.some((game) => game.classification === 'nonConference')).toBe(true)
    for (const game of games) { const home = first.conferenceMemberships.find((item) => item.seasonId === season.id && item.teamId === game.homeTeamId)!; const away = first.conferenceMemberships.find((item) => item.seasonId === season.id && item.teamId === game.awayTeamId)!; expect(home.conferenceId === away.conferenceId).toBe(game.classification === 'conference') }
    expect(new Set(games.flatMap((game) => [`${game.homeTeamId}:${game.date}`, `${game.awayTeamId}:${game.date}`])).size).toBe(games.length * 2)
    expect(games).toEqual(Object.values(second.games).filter((game) => game.seasonId === season.id))
    expect(first.salaryRulesBySeasonId[season.id]).toBeUndefined(); expect(first.tradeRulesBySeasonId[season.id]).toBeUndefined(); expect(Object.values(first.draftsById).some((draft) => draft.ecosystemId === ncaa.id)).toBe(false)
  })

  it('keeps conference and overall records separate, derives champions, and round-trips snapshots', () => {
    const world = createNewGame(); const ncaa = Object.values(world.ecosystems).find((item) => item.kind === 'ncaaLike')!; const season = Object.values(world.seasons).find((item) => world.competitions[item.competitionId]!.ecosystemId === ncaa.id)!; const conference = Object.values(world.conferencesById).find((item) => item.ecosystemId === ncaa.id)!
    const completed = updateGameWorld(world, { games: Object.values(world.games).map((game) => game.seasonId !== season.id ? game : { ...game, status: 'completed' as const, result: { homeScore: 80, awayScore: 70 } }) })
    const conferenceStandings = calculateConferenceStandings(completed, season.id, conference.id); const overall = calculateStandingsForCompetition(completed, season.competitionId)
    expect(conferenceStandings[0]!.played).toBeLessThan(overall.find((item) => item.teamId === conferenceStandings[0]!.teamId)!.played)
    expect(getConferenceRegularSeasonChampion(completed, season.id, conference.id)).toBe(conferenceStandings[0]!.teamId)
    expect(deserializeGameWorldV1(serializeGameWorldV1(world, '2032-10-01T00:00:00.000Z')).seasons[season.id]!.conferenceMembershipSnapshot).toEqual(season.conferenceMembershipSnapshot)
  })
})
