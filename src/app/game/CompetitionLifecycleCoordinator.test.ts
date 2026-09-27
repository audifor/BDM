import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { createCompetition, parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { createSeason } from '@/domain/season'
import type { CompetitionCalendarPolicy } from '@/domain/season'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { generateWorld } from '@/engine/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { applyMatchResult } from '@/engine/match'
import { finalizeCompletedSeason, isSeasonComplete } from '@/engine/season'
import type { CompetitionId } from '@/domain/ids'
import { competitionIdFromString, seasonIdFromString } from '@/domain/ids'

import { advanceGameDay } from './advanceGameDay'
import { createNewGame } from './createNewGame'
import { advanceCompetitionLifecycles, classifyCompetitionLifecycles } from './CompetitionLifecycleCoordinator'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'

describe('RWS-BUG-002A CompetitionLifecycleCoordinator: independent multi-competition rollover', () => {
  it('classifies three independently-calendared competitions as FULLY_SUPPORTED_PRIMARY regardless of currentSeasonId', () => {
    const world = threeIndependentCompetitionsWorld()
    const capabilities = classifyCompetitionLifecycles(world)

    expect(capabilities).toHaveLength(3)
    expect(capabilities.every((capability) => capability.support === 'FULLY_SUPPORTED_PRIMARY')).toBe(true)
    // None of the three is the world's currentSeasonId by construction below except one -- the
    // classification must not depend on that.
    const currentSeasonCapability = capabilities.find((capability) => capability.seasonId === world.currentSeasonId)!
    const otherCapabilities = capabilities.filter((capability) => capability.seasonId !== world.currentSeasonId)
    expect(otherCapabilities).toHaveLength(2)
    expect(currentSeasonCapability.support).toBe('FULLY_SUPPORTED_PRIMARY')
    expect(otherCapabilities.every((capability) => capability.support === 'FULLY_SUPPORTED_PRIMARY')).toBe(true)
  })

  it('rolls each of three competitions independently: finishing early does not depend on or disturb the others', () => {
    let world = threeIndependentCompetitionsWorld()
    const [seasonA, seasonB, seasonC] = threeSeasonIds(world)

    // Complete Competition A only; B and C remain untouched, mid-season.
    world = completeSeason(world, seasonA)
    const afterA = advanceCompetitionLifecycles(world)
    expect(afterA.blockedOn).toBeUndefined()

    const nextASeasons = Object.values(afterA.world.seasons).filter((season) => season.competitionId === seasonCompetitionId(afterA.world, seasonA))
    expect(nextASeasons).toHaveLength(2) // original + next edition
    // B and C are exactly as they were: not completed, no new editions, no id churn.
    expect(afterA.world.seasons[seasonB]).toEqual(world.seasons[seasonB])
    expect(afterA.world.seasons[seasonC]).toEqual(world.seasons[seasonC])
    expect(Object.values(afterA.world.seasons).filter((season) => season.competitionId === seasonCompetitionId(afterA.world, seasonB))).toHaveLength(1)
    expect(Object.values(afterA.world.seasons).filter((season) => season.competitionId === seasonCompetitionId(afterA.world, seasonC))).toHaveLength(1)

    // Now complete B; A's already-rolled next edition and C remain unaffected.
    world = completeSeason(afterA.world, seasonB)
    const afterB = advanceCompetitionLifecycles(world)
    expect(afterB.blockedOn).toBeUndefined()
    expect(Object.values(afterB.world.seasons).filter((season) => season.competitionId === seasonCompetitionId(afterB.world, seasonB))).toHaveLength(2)
    expect(afterB.world.seasons[seasonC]).toEqual(world.seasons[seasonC])

    // Finally complete C.
    world = completeSeason(afterB.world, seasonC)
    const afterC = advanceCompetitionLifecycles(world)
    expect(afterC.blockedOn).toBeUndefined()
    expect(Object.values(afterC.world.seasons).filter((season) => season.competitionId === seasonCompetitionId(afterC.world, seasonC))).toHaveLength(2)

    // Every rollover produced a distinct SeasonId; nothing was duplicated across the whole run.
    const allSeasonIds = Object.keys(afterC.world.seasons)
    expect(new Set(allSeasonIds).size).toBe(allSeasonIds.length)
    // No fixture (Game) ID is duplicated across the whole world after three independent rollovers.
    const allGameIds = Object.keys(afterC.world.games)
    expect(new Set(allGameIds).size).toBe(allGameIds.length)
  })

  it('does not apply player development when a background (non-current) competition rolls over', () => {
    let world = threeIndependentCompetitionsWorld()
    const [, seasonB] = threeSeasonIds(world)
    // seasonB is NOT world.currentSeasonId by construction.
    expect(world.currentSeasonId).not.toBe(seasonB)

    const somePlayer = Object.values(world.players)[0]!
    world = completeSeason(world, seasonB)
    const rolled = advanceCompetitionLifecycles(world)

    expect(rolled.world.players[somePlayer.id]).toEqual(somePlayer)
    expect(rolled.world.currentDate).toBe(world.currentDate)
    expect(rolled.world.currentSeasonId).toBe(world.currentSeasonId)
  })

  it('rolls a valid NCAA-like season with its conference snapshot and exactly one next recruiting cycle', () => {
    const world = createNewGame()
    const ncaaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const capabilities = classifyCompetitionLifecycles(world)
    expect(capabilities.find((capability) => capability.seasonId === ncaaSeason.id)!.support).toBe('FULLY_SUPPORTED_PRIMARY')

    const completed = completeSeason(world, ncaaSeason.id)
    const invalidConferenceWorld = updateGameWorld(completed, { seasons: Object.values(completed.seasons).map((season) => season.id === ncaaSeason.id ? { ...season, conferenceMembershipSnapshot: [] } : season) })
    expect(classifyCompetitionLifecycles(invalidConferenceWorld).find((capability) => capability.seasonId === ncaaSeason.id)!.support).toBe('UNSUPPORTED_FUTURE_LIFECYCLE')
    expect(evaluateSimulationBreakpoints(invalidConferenceWorld).candidates).toContainEqual(expect.objectContaining({ level: 'BLOCKING', reason: 'unsupportedCompetitionLifecycle', sourceId: ncaaSeason.id }))
    const ecosystemId = world.competitions[ncaaSeason.competitionId]!.ecosystemId
    const sourceCycleId = `recruiting:${ecosystemId}:${ncaaSeason.id}`
    const signing = { id: 'signing:rollover-test', cycleId: sourceCycleId, recruitId: 'recruit-profile:test', playerId: 'recruit:test' as never, programTeamId: world.competitions[ncaaSeason.competitionId]!.participantTeamIds[0]!, targetSeasonId: `${ncaaSeason.id}:next` as never, offerId: 'offer:test', signedOn: ncaaSeason.endDate }
    const completedWithSigning = updateGameWorld(completed, { recruitSignings: [signing] })
    const result = advanceCompetitionLifecycles(completedWithSigning)
    const target = Object.values(result.world.seasons).find((season) => season.competitionId === ncaaSeason.competitionId && season.id !== ncaaSeason.id)!

    expect(result.blockedOn).toBeUndefined()
    expect(evaluateSimulationBreakpoints(result.world).candidates.some((item) => item.reason === 'unsupportedCompetitionLifecycle' && item.sourceId === ncaaSeason.id)).toBe(false)
    expect(result.transitions).toHaveLength(1)
    expect(result.transitions[0]).toMatchObject({ sourceSeasonId: ncaaSeason.id, targetSeasonId: target.id, competitionId: ncaaSeason.competitionId, schedule: { kind: 'generated' } })
    expect(result.transitions[0]!.schedule.fixtureCount).toBeGreaterThan(0)
    expect(result.transitions[0]!.annualHooksExecuted).toContain('recruitingCycle')
    expect(target.conferenceMembershipSnapshot).toEqual(ncaaSeason.conferenceMembershipSnapshot!.map((membership) => ({ ...membership, seasonId: target.id })))
    expect(Object.values(result.world.games).filter((game) => game.seasonId === target.id)).toHaveLength(result.transitions[0]!.schedule.fixtureCount)
    expect(Object.values(result.world.recruitingCyclesById).filter((cycle) => cycle.sourceSeasonId === target.id)).toHaveLength(1)
    expect(result.world.recruitingCyclesById[sourceCycleId]!.targetSeasonId).toBe(target.id)
    expect(result.world.recruitSigningsById[signing.id]!.targetSeasonId).toBe(target.id)
    expect(result.world.seasonHistoryBySeasonId[ncaaSeason.id]).toEqual(completed.seasonHistoryBySeasonId[ncaaSeason.id])
    expect(Object.values(result.world.games).filter((game) => game.seasonId === ncaaSeason.id)).toEqual(Object.values(completed.games).filter((game) => game.seasonId === ncaaSeason.id))
    expect(advanceCompetitionLifecycles(result.world).transitions).toEqual([])
  })
})

function threeIndependentCompetitionsWorld(): GameWorld {
  const base = generateWorld({ seed: 777, gender: 'female' })
  const teamIds = Object.values(base.teams).map((team) => team.id)
  // Overlapping team pools: a team (and therefore its players) may sit in more than one
  // competition at once, exactly like a real club playing in a domestic league and a cup.
  const groupA = teamIds.slice(0, 4)
  const groupB = teamIds.slice(2, 6)
  const groupC = teamIds.slice(4, 8)

  const seasonStart = base.currentDate
  const competitionA = createCompetition({ id: competitionIdFromString('lifecycle-competition-a'), name: 'Lifecycle League A', gender: 'female', participantTeamIds: groupA })
  const competitionB = createCompetition({ id: competitionIdFromString('lifecycle-competition-b'), name: 'Lifecycle League B', gender: 'female', participantTeamIds: groupB })
  const competitionC = createCompetition({ id: competitionIdFromString('lifecycle-competition-c'), name: 'Lifecycle League C', gender: 'female', participantTeamIds: groupC })

  // Distinct preferredWeekdays per competition: overlapping teams (see groupA/groupB/groupC
  // above) can validly belong to more than one competition at once, but no two of their games
  // may ever land on the same calendar date, so each competition plays on a different weekday.
  const seasonA = fullySupportedSeason(seasonIdFromString('lifecycle-season-a-0001'), competitionA.id, addDays(seasonStart, 0), 2025, 6)
  const seasonB = fullySupportedSeason(seasonIdFromString('lifecycle-season-b-0001'), competitionB.id, addDays(seasonStart, 1), 2026, 0)
  const seasonC = fullySupportedSeason(seasonIdFromString('lifecycle-season-c-0001'), competitionC.id, addDays(seasonStart, 3), 2027, 3)

  const staged = createGameWorld({
    currentDate: base.currentDate,
    currentSeasonId: seasonA.id,
    userCoachId: base.userCoachId,
    countries: Object.values(base.countries),
    coaches: Object.values(base.coaches),
    players: Object.values(base.players),
    teams: Object.values(base.teams),
    staffPeople: Object.values(base.staffPeopleById),
    teamStaffAssignments: Object.values(base.teamStaffAssignmentsById),
    competitions: [competitionA, competitionB, competitionC],
    seasons: [seasonA, seasonB, seasonC],
    games: [],
  })

  const gamesA = generateRoundRobinSchedule({ world: staged, seasonId: seasonA.id, competitionStageKey: 'REGULAR' })
  const gamesB = generateRoundRobinSchedule({ world: staged, seasonId: seasonB.id, competitionStageKey: 'REGULAR' })
  const gamesC = generateRoundRobinSchedule({ world: staged, seasonId: seasonC.id, competitionStageKey: 'REGULAR' })

  return updateGameWorld(staged, { games: [...gamesA, ...gamesB, ...gamesC] })
}

/** A single-stage (no postseason) format + calendar, valid input for `deriveNextEditionCalendarPolicy`. */
function fullySupportedSeason(seasonId: ReturnType<typeof seasonIdFromString>, competitionId: CompetitionId, startDate: ReturnType<typeof addDays>, startYear: number, preferredWeekday: number) {
  const editionId = `edition:lifecycle:${competitionId}:${startYear}`
  const format = parseWorldCompetitionFormatDocument({
    schema_version: '1.0', competition_id: competitionId, competition_season_id: editionId, season_label: `${startYear}`, status: 'COMPLETE',
    variants: [{ key: 'MAIN', is_real_variant: true, nodes: [
      { key: 'REGULAR', node_type: 'STAGE', role: 'REGULAR_SEASON', team_count: 4, pairing: { type: 'ROUND_ROBIN', meetings_per_pair: 2 } },
    ], edges: [] }],
    sources: [{ url: 'https://example.test', type: 'OFFICIAL' }],
  })
  const endDate = addDays(startDate, 200)
  const calendarPolicy: CompetitionCalendarPolicy = {
    seasonWindow: { startDate, endDate },
    regularSeasonWindow: { startDate, endDate: addDays(startDate, 60) },
    specialCompetitionWindows: [],
    postseasonWindow: null,
    postseasonStageStartDates: {},
    offseasonWindow: { startDate: addDays(startDate, 61), endDate },
    regularSeasonCadence: { preferredWeekdays: [preferredWeekday], midweekWeekdays: [(preferredWeekday + 3) % 7], midweekRoundNumbers: [], weeklyCadenceDays: 7, minimumRestDays: 3, breakDaysAfterRound: {} },
    postseasonCadence: { daysBetweenGames: 1, daysBetweenRounds: 1 },
  }
  return createSeason({ id: seasonId, competitionId, label: `${startYear}`, startDate, endDate, participantTeamIds: undefined, worldCompetitionFormat: format, calendarPolicy })
}

function threeSeasonIds(world: GameWorld): readonly [ReturnType<typeof seasonIdFromString>, ReturnType<typeof seasonIdFromString>, ReturnType<typeof seasonIdFromString>] {
  const ids = Object.keys(world.seasons).sort() as ReturnType<typeof seasonIdFromString>[]
  return [ids[0]!, ids[1]!, ids[2]!]
}

function seasonCompetitionId(world: GameWorld, seasonId: ReturnType<typeof seasonIdFromString>): CompetitionId {
  return world.seasons[seasonId]!.competitionId
}

function completeSeason(world: GameWorld, seasonId: ReturnType<typeof seasonIdFromString>): GameWorld {
  const games = Object.values(world.games).filter((game) => game.seasonId === seasonId && game.status === 'scheduled')
  let current = world
  for (const game of games) current = applyMatchResult(current, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
  expect(isSeasonComplete(current, seasonId)).toBe(true)
  return finalizeCompletedSeason(current, seasonId)
}
