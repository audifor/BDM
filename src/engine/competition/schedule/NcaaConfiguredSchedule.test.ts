import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { generateNcaaConfiguredSchedule } from './NcaaLikeSchedule'
import { parseGameDate } from '@/domain/date'
import { seasonIdFromString, competitionIdFromString, teamIdFromString, conferenceIdFromString, ecosystemIdFromString } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { buildNcaaD1Real2026ConferenceSnapshot } from '@/app/game/NcaaD1Real2026Conferences'

describe('configured NCAA calendar', () => {
  it('generates seeded conference and nonconference games with rest and no duplicate matchday', () => {
    const world = createNewGame()
    const ecosystem = Object.values(world.ecosystems).find(value => value.kind === 'ncaaLike' && value.category === 'women')!
    const season = Object.values(world.seasons).find(value => world.competitions[value.competitionId]!.ecosystemId === ecosystem.id)!
    const members = season.conferenceMembershipSnapshot!
    const policies = Object.fromEntries([...new Set(members.map(m => m.conferenceId))].map(id => [id, 2]))
    const policy = { seed: 42, conferenceGamesPerTeam: policies, nonConferenceRounds: 2 }
    const games = generateNcaaConfiguredSchedule(world, season.id, policy)
    expect(generateNcaaConfiguredSchedule(world, season.id, policy)).toEqual(games)
    expect(generateNcaaConfiguredSchedule(world, season.id, { ...policy, seed: 43 })).not.toEqual(games)
    const participantDates = new Set<string>()
    for (const game of games) {
      const home = members.find(m => m.teamId === game.homeTeamId)!
      const away = members.find(m => m.teamId === game.awayTeamId)!
      expect(home.conferenceId === away.conferenceId).toBe(game.classification === 'conference')
      for (const id of [game.homeTeamId, game.awayTeamId]) {
        const key = `${id}:${game.date}`
        expect(participantDates.has(key)).toBe(false)
        participantDates.add(key)
      }
    }
    for (const member of members) {
      const conferenceGames = games.filter(g => g.classification === 'conference' && (g.homeTeamId === member.teamId || g.awayTeamId === member.teamId))
      expect(conferenceGames).toHaveLength(2)
      expect(conferenceGames.filter(g => g.homeTeamId === member.teamId)).toHaveLength(1)
      expect(games.some(g => g.classification === 'nonConference' && (g.homeTeamId === member.teamId || g.awayTeamId === member.teamId))).toBe(true)
    }
  })

  it('rejects missing or unsupported conference rules instead of inventing them', () => {
    const world = createNewGame()
    const season = Object.values(world.seasons).find(s => world.ecosystems[world.competitions[s.competitionId]!.ecosystemId]?.kind === 'ncaaLike')!
    expect(() => generateNcaaConfiguredSchedule(world, season.id, { seed: 1, conferenceGamesPerTeam: {}, nonConferenceRounds: 1 })).toThrow(/explicit policy/)
    const policies = Object.fromEntries(season.conferenceMembershipSnapshot!.map(m => [m.conferenceId, 3]))
    expect(() => generateNcaaConfiguredSchedule(world, season.id, { seed: 1, conferenceGamesPerTeam: policies, nonConferenceRounds: 1 })).toThrow(/even game count/)
  })

  it('balances documented-style even counts for odd and even conference sizes', () => {
    const seasonId = seasonIdFromString('test:season')
    const competitionId = competitionIdFromString('test:competition')
    const ecosystemId = ecosystemIdFromString('test:ecosystem')
    const shapes = [[9, 16], [13, 18], [14, 18], [16, 18], [18, 18]] as const
    const memberships = shapes.flatMap(([size], group) => Array.from({ length: size }, (_, i) => ({
      teamId: teamIdFromString(`test:team:${group}:${i}`), conferenceId: conferenceIdFromString(`test:conference:${group}`), seasonId,
    })))
    const world = {
      seasons: { [seasonId]: { id: seasonId, competitionId, startDate: parseGameDate('2026-10-01'), endDate: parseGameDate('2027-06-30'), participantTeamIds: memberships.map(m => m.teamId), conferenceMembershipSnapshot: memberships } },
      competitions: { [competitionId]: { id: competitionId, ecosystemId } }, ecosystems: { [ecosystemId]: { kind: 'ncaaLike' } },
    } as unknown as GameWorld
    const policy = { seed: 123, nonConferenceRounds: 4, conferenceGamesPerTeam: Object.fromEntries(shapes.map(([, count], i) => [`test:conference:${i}`, count])) }
    const games = generateNcaaConfiguredSchedule(world, seasonId, policy)
    for (const membership of memberships) {
      const own = games.filter(game => game.classification === 'conference' && (game.homeTeamId === membership.teamId || game.awayTeamId === membership.teamId))
      const group = Number(String(membership.conferenceId).split(':').at(-1))
      expect(own).toHaveLength(shapes[group]![1])
      expect(own.filter(game => game.homeTeamId === membership.teamId)).toHaveLength(shapes[group]![1] / 2)
      expect(new Set(own.map(game => game.homeTeamId === membership.teamId ? game.awayTeamId : game.homeTeamId)).size).toBe(shapes[group]![0] - 1)
      const all = games.filter(game => game.homeTeamId === membership.teamId || game.awayTeamId === membership.teamId)
      expect(new Set(all.map(game => game.date)).size).toBe(all.length)
    }
  })

  it('covers all real-catalog teams and conferences for both genders under an explicit test policy', () => {
    for (const gender of ['men', 'women'] as const) {
      const snapshot = buildNcaaD1Real2026ConferenceSnapshot(gender)
      const competitionId = competitionIdFromString(`test:${gender}:competition`)
      const seasonId = snapshot.seasonId
      const world = {
        seasons: { [seasonId]: { id: seasonId, competitionId, startDate: parseGameDate('2026-10-01'), endDate: parseGameDate('2027-06-30'), participantTeamIds: snapshot.teams.map(team => team.id), conferenceMembershipSnapshot: snapshot.memberships } },
        competitions: { [competitionId]: { id: competitionId, ecosystemId: snapshot.ecosystemId } },
        ecosystems: { [snapshot.ecosystemId]: { kind: 'ncaaLike' } },
      } as unknown as GameWorld
      // Two games is deliberately a small test policy, not a real NCAA rule.
      const policy = { seed: 202627, nonConferenceRounds: 2, conferenceGamesPerTeam: Object.fromEntries(snapshot.conferences.map(c => [c.id, 2])) }
      const games = generateNcaaConfiguredSchedule(world, seasonId, policy)
      expect(snapshot.conferences).toHaveLength(32)
      expect(snapshot.teams).toHaveLength(gender === 'men' ? 365 : 363)
      for (const team of snapshot.teams) {
        const scheduled = games.filter(game => game.homeTeamId === team.id || game.awayTeamId === team.id)
        expect(scheduled.filter(game => game.classification === 'conference')).toHaveLength(2)
        expect(scheduled.some(game => game.classification === 'nonConference')).toBe(true)
        expect(new Set(scheduled.map(game => game.date)).size).toBe(scheduled.length)
      }
    }
  })
})
