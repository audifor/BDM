import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createCompetition } from '@/domain/competition'
import { createSportsEcosystem } from '@/domain/ecosystem'
import { createSeason } from '@/domain/season'
import { createGameWorld } from '@/domain/world'
import { competitionIdFromString, seasonIdFromString } from '@/domain/ids'
import { parseGameDate } from '@/domain/date'
import { generateRoundRobinSchedule } from './schedule'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { buildNextCompetitionParticipants, getCompetitionTier, resolvePromotionRelegation } from './PromotionRelegation'
import { advanceCompetitionLifecycles } from '@/app/game/CompetitionLifecycleCoordinator'
import { startNextSeasonFor } from '@/app/game/startNextSeason'
import { resolveGroupedRelegation } from './PromotionRelegation'
import { parseWorldCompetitionFormatDocument, defaultLeagueCompetitionRules } from '@/domain/competition'
import formats from '@/data/worlddb-v2/global-formats.json'
import type { GameWorld } from '@/domain/world'
import { teamIdFromString } from '@/domain/ids'

describe('promotion and relegation', () => {
  it('selects the documented bottom places from each group, not the overall table', () => {
    const original = parseWorldCompetitionFormatDocument(formats.find(item => item.competition_id === 'competition:FRA:nm2')!)
    const variant = original.variants[0]!
    const format = { ...original, variants: [{ ...variant, nodes: variant.nodes.map(node => node.role === 'REGULAR_SEASON' ? { ...node, teamCount: 12 } : node) }],
      consequences: original.consequences.map(item => ({ ...item, rankFrom: 2, rankTo: 3 })) }
    const teams = Array.from({ length: 12 }, (_, i) => teamIdFromString(`team:${String(i).padStart(2, '0')}`))
    const games = []
    for (let group = 0; group < 4; group++) {
      const members = teams.filter((_, i) => i % 4 === group)
      for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
        games.push({ seasonId: 'season', competitionStageKey: 'REGULAR_GROUPS', status: 'completed', homeTeamId: members[i], awayTeamId: members[j], result: { homeScore: 80 + i, awayScore: 70 + j } })
      }
    }
    const world = { seasons: { season: { id: 'season', competitionId: 'competition', participantTeamIds: teams, worldCompetitionFormat: format } },
      competitions: { competition: { participantTeamIds: teams, rules: defaultLeagueCompetitionRules } }, games: Object.fromEntries(games.map((game, index) => [index, game])) } as unknown as GameWorld
    expect(resolveGroupedRelegation(world, seasonIdFromString('season'))).toEqual([teams[4], teams[8], teams[5], teams[9], teams[6], teams[10], teams[7], teams[11]])
  })
  it('waits for both independent editions, resolves deterministically, and only changes future participants', () => {
    const base = createNewGame(); const teams = Object.values(base.teams); const upperId = competitionIdFromString('tier-one'); const lowerId = competitionIdFromString('tier-two')
    const upper = createCompetition({ id: upperId, name: 'Tier 1', gender: 'male', participantTeamIds: teams.slice(0, 4).map((team) => team.id) })
    const lower = createCompetition({ id: lowerId, name: 'Tier 2', gender: 'male', participantTeamIds: teams.slice(4, 8).map((team) => team.id) })
    const upperSeason = createSeason({ id: seasonIdFromString('tier-one-2032'), competitionId: upperId, label: 'Tier 1 2032', startDate: parseGameDate('2032-10-01'), endDate: parseGameDate('2033-05-20'), participantTeamIds: upper.participantTeamIds })
    const lowerSeason = createSeason({ id: seasonIdFromString('tier-two-2032'), competitionId: lowerId, label: 'Tier 2 2032', startDate: parseGameDate('2032-09-01'), endDate: parseGameDate('2033-05-05'), participantTeamIds: lower.participantTeamIds })
    const ecosystem = createSportsEcosystem({ id: base.ecosystems[upper.ecosystemId]!.id, name: 'Virelia', kind: 'fibaLike', domesticTiers: [{ competitionId: upperId, level: 1 }, { competitionId: lowerId, level: 2 }], tierMovementRules: [{ upperCompetitionId: upperId, lowerCompetitionId: lowerId, exchangeCount: 1 }] })
    let world = createGameWorld({ currentDate: base.currentDate, currentSeasonId: upperSeason.id, userCoachId: base.userCoachId, countries: Object.values(base.countries), coaches: Object.values(base.coaches), players: Object.values(base.players), teams, staffPeople: Object.values(base.staffPeopleById), teamStaffAssignments: Object.values(base.teamStaffAssignmentsById), competitions: [upper, lower], ecosystems: [ecosystem], seasons: [upperSeason, lowerSeason], games: [] })
    const games = [generateRoundRobinSchedule({ world, seasonId: upperSeason.id }), generateRoundRobinSchedule({ world, seasonId: lowerSeason.id })].flat()
    world = createGameWorld({ currentDate: world.currentDate, currentSeasonId: world.currentSeasonId, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), staffPeople: Object.values(world.staffPeopleById), teamStaffAssignments: Object.values(world.teamStaffAssignmentsById), competitions: [upper, lower], ecosystems: [ecosystem], seasons: [upperSeason, lowerSeason], games })
    const preserved = { ecosystems: world.ecosystems, competitions: world.competitions, training: world.trainingPlansByTeamId, fatigue: world.careerFatigueByPlayerId, inbox: world.inboxItemsById, news: world.newsItemsById, seasons: world.seasons }
    const complete = (input: typeof world, seasonId: string) => Object.values(input.games).filter((game) => game.seasonId === seasonId).reduce((current, game) => applyMatchResult(current, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 }), input)
    world = finalizeSeason(complete(world, lowerSeason.id), lowerSeason.id)
    expect(Object.keys(world.promotionRelegationResolutionsById)).toHaveLength(0)
    expect(advanceCompetitionLifecycles(world).transitions).toEqual([])
    expect(() => startNextSeasonFor(world, lowerSeason.id)).toThrow('linked promotion/relegation editions')
    expect(world.ecosystems).toEqual(preserved.ecosystems); expect(world.competitions).toEqual(preserved.competitions); expect(world.trainingPlansByTeamId).toEqual(preserved.training); expect(world.careerFatigueByPlayerId).toEqual(preserved.fatigue); expect(world.inboxItemsById).toEqual(preserved.inbox); expect(world.seasons[lowerSeason.id]!.participantTeamIds).toEqual(preserved.seasons[lowerSeason.id]!.participantTeamIds)
    world = finalizeSeason(complete(world, upperSeason.id), upperSeason.id)
    const resolved = resolvePromotionRelegation(world, upperSeason.id, lowerSeason.id)
    const resolution = Object.values(resolved.promotionRelegationResolutionsById)[0]!
    expect(resolution.id).toBe(`promotion-relegation:${upperSeason.id}:${lowerSeason.id}`)
    expect(resolved).toEqual(world)
    expect(buildNextCompetitionParticipants(world, upperSeason.id)).toEqual([...upper.participantTeamIds.slice(0, 3), resolution.promotedTeamIds[0]!])
    expect(buildNextCompetitionParticipants(world, lowerSeason.id)).toEqual([...lower.participantTeamIds.slice(1), resolution.relegatedTeamIds[0]!])
    const continued = advanceCompetitionLifecycles(world)
    expect(continued.transitions).toHaveLength(2)
    const nextUpper = Object.values(continued.world.seasons).find((season) => season.competitionId === upperId && season.id !== upperSeason.id)!
    const nextLower = Object.values(continued.world.seasons).find((season) => season.competitionId === lowerId && season.id !== lowerSeason.id)!
    expect(nextUpper.participantTeamIds).toEqual(buildNextCompetitionParticipants(world, upperSeason.id))
    expect(nextLower.participantTeamIds).toEqual(buildNextCompetitionParticipants(world, lowerSeason.id))
    expect(world.seasons[upperSeason.id]!.participantTeamIds).toEqual(upper.participantTeamIds)
    expect(getCompetitionTier(world, lowerId)?.level).toBe(2)
    expect(Object.values(world.memoriesById)).toEqual(expect.arrayContaining([expect.objectContaining({ tags: expect.arrayContaining(['promotion']), permanent: true }), expect.objectContaining({ tags: expect.arrayContaining(['relegation']), permanent: true })]))
  })
})
