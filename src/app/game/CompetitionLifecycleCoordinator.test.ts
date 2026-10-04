import { describe, expect, it } from 'vitest'

import { addDays, createGameDate } from '@/domain/date'
import { createPlace } from '@/domain/facilities'
import { createCompetition, parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { createSeason } from '@/domain/season'
import { createTalentCohort } from '@/domain/talent'
import type { CompetitionCalendarPolicy } from '@/domain/season'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { generateWorld } from '@/engine/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { applyMatchResult } from '@/engine/match'
import { finalizeCompletedSeason, isSeasonComplete } from '@/engine/season'
import { initializeRecruitingCycle } from '@/engine/season/SeasonContentLifecycle'
import { canPerformRecruitingAction } from '@/engine/recruiting/RecruitingPermission'
import { addRecruitingBoardEntry, designateOffCampusRecruiter, discoverRecruitingTalentCandidate, performRecruitingAction, progressAiRecruiting } from '@/engine/recruiting/RecruitingEngine'
import { createTalentSupplyCohort } from '@/engine/world/TalentSupply'
import { recruitingRulesetForSeason } from '@/domain/recruiting'
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
    expect(result.transitions[0]!.annualHooksExecuted).toContain('clubStrategicReview')
    expect(Object.values(result.world.teams).filter((team) => team.coachId !== undefined && team.coachId !== result.world.userCoachId).every((team) => result.world.clubStrategicStatesByTeamId[team.id] !== undefined)).toBe(true)
    expect(Object.values(result.world.teams).filter((team) => team.coachId === result.world.userCoachId).every((team) => result.world.clubStrategicStatesByTeamId[team.id] === undefined)).toBe(true)
    expect(target.conferenceMembershipSnapshot).toEqual(ncaaSeason.conferenceMembershipSnapshot!.map((membership) => ({ ...membership, seasonId: target.id })))
    expect(Object.values(result.world.games).filter((game) => game.seasonId === target.id)).toHaveLength(result.transitions[0]!.schedule.fixtureCount)
    expect(Object.values(result.world.recruitingCyclesById).filter((cycle) => cycle.sourceSeasonId === target.id)).toHaveLength(1)
    const successorCycle = Object.values(result.world.recruitingCyclesById).find((cycle) => cycle.sourceSeasonId === target.id)!
    expect(successorCycle.staffDesignations ?? []).toEqual([])
    expect(successorCycle.calendar).toMatchObject({ provenance: 'SIMULATED_CARRY_FORWARD', sourceSeason: '2026-27', derivedSeason: `${target.startDate.slice(0, 4)}-${String(Number(target.startDate.slice(0, 4)) + 1).slice(-2)}` })
    expect(successorCycle.calendar!.windows.some((window) => window.period === 'contact' && window.startsOn === successorCycle.opensOn && window.endsOn === successorCycle.closesOn)).toBe(false)
    const secondCompleted = completeSeason(result.world, target.id)
    const secondTransition = advanceCompetitionLifecycles(secondCompleted)
    const thirdSeason = Object.values(secondTransition.world.seasons).find((season) => season.competitionId === ncaaSeason.competitionId && season.id !== ncaaSeason.id && season.id !== target.id)!
    const secondSuccessorCycle = Object.values(secondTransition.world.recruitingCyclesById).find((cycle) => cycle.sourceSeasonId === thirdSeason.id)!
    expect(secondSuccessorCycle.staffDesignations ?? []).toEqual([])
    expect(secondTransition.blockedOn).toBeUndefined()
    expect(secondSuccessorCycle.calendar).toMatchObject({ provenance: 'SIMULATED_CARRY_FORWARD', basedOnRulesetId: successorCycle.calendar!.basedOnRulesetId, derivedSeason: `${thirdSeason.startDate.slice(0, 4)}-${String(Number(thirdSeason.startDate.slice(0, 4)) + 1).slice(-2)}` })
    expect(secondSuccessorCycle.calendar!.windows.some((window) => window.period === 'contact' && window.startsOn === secondSuccessorCycle.opensOn && window.endsOn === secondSuccessorCycle.closesOn)).toBe(false)
    expect(result.world.recruitingCyclesById[sourceCycleId]!.targetSeasonId).toBe(target.id)
    expect(result.world.recruitSigningsById[signing.id]!.targetSeasonId).toBe(target.id)
    expect(result.world.seasonHistoryBySeasonId[ncaaSeason.id]).toEqual(completed.seasonHistoryBySeasonId[ncaaSeason.id])
    expect(Object.values(result.world.games).filter((game) => game.seasonId === ncaaSeason.id)).toEqual(Object.values(completed.games).filter((game) => game.seasonId === ncaaSeason.id))
    expect(advanceCompetitionLifecycles(result.world).transitions).toEqual([])
  })

  it('creates and uses a simulated 2045-46 NCAA RecruitingCycle without external calendar data', () => {
    const world = createNewGame()
    const ncaaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const competition = world.competitions[ncaaSeason.competitionId]!
    const future = createSeason({ id: seasonIdFromString('season-ncaa-2045'), competitionId: competition.id, label: '2045-46', startDate: createGameDate(2045, 8, 1), endDate: createGameDate(2046, 7, 31), participantTeamIds: competition.participantTeamIds })
    const withFuture = updateGameWorld(world, { currentDate: createGameDate(2045, 9, 15), currentSeasonId: future.id, seasons: [...Object.values(world.seasons), future] })
    const country = Object.values(withFuture.countries)[0]!
    const origin = createPlace({ id: 'bs15e-2045-intake-origin', kind: 'CITY', name: 'Simulated 2045 intake origin', countryId: country.id })
    const cohort = createTalentCohort({ id: 'bs15e-2045-intake', placeId: origin.id, birthYear: 2027, generationYear: 2045, gender: 'male', seed: 204546, inputVersion: 'bs15e-2045-v1', inputs: { ageCohortPopulation: 20_000, basketballParticipationPerThousand: 60, accessOpportunityBasisPoints: 9_000 } })
    const intake = createTalentSupplyCohort(updateGameWorld(withFuture, { places: [...Object.values(withFuture.placesById), origin] }), cohort)
    const initialized = initializeRecruitingCycle(intake, future.id)
    const sourceCycle = Object.values(initialized.recruitingCyclesById).find((item) => item.sourceSeasonId === future.id)!
    const cycle = { ...sourceCycle, status: 'open' as const, rules: { ...sourceCycle.rules, poolSize: 4 } }
    let used = updateGameWorld(initialized, { recruitingCycles: Object.values(initialized.recruitingCyclesById).map((item) => item.id === cycle.id ? cycle : item) })
    expect(cycle.calendar).toMatchObject({ provenance: 'SIMULATED_CARRY_FORWARD', sourceSeason: '2026-27', derivedSeason: '2045-46', basedOnRulesetId: 'NCAA_DI_MBB_2026_27' })
    expect(cycle.sourceSeasonId).toBe(future.id)
    expect(cycle.calendar!.windows.length).toBeGreaterThan(0)
    const permission = canPerformRecruitingAction({ date: used.currentDate, isNCAA: true, calendar: cycle.calendar, category: 'men', action: 'inboundCall' })
    expect(permission).toMatchObject({ allowed: true, period: 'recruiting', provenance: 'SIMULATED_CARRY_FORWARD' })
    expect(permission.rulesetId).toContain('BDM-CONTINUITY-2045-46')

    const program = competition.participantTeamIds.find((teamId) => Object.values(used.teamStaffAssignmentsById).some((assignment) => assignment.teamId === teamId))!
    const discovered = discoverRecruitingTalentCandidate(used, cycle.id, program)
    expect(discovered.ok).toBe(true)
    if (!discovered.ok) return
    used = discovered.value
    const recruit = Object.values(used.recruitProfilesById).find((profile) => profile.cycleId === cycle.id)!
    expect(used.recruitingBoards).toContainEqual({ programTeamId: program, recruitId: recruit.id, priority: 'normal' })
    used = addRecruitingBoardEntry(used, { programTeamId: program, recruitId: recruit.id, priority: 'high' })
    const remote = performRecruitingAction(used, cycle.id, recruit.id, program, 'pitch')
    expect(remote).toMatchObject({ ok: true })
    if (!remote.ok) return
    used = remote.value
    expect(used.recruitingBoards).toContainEqual({ programTeamId: program, recruitId: recruit.id, priority: 'high' })

    const assigned = Object.values(used.teamStaffAssignmentsById).find((item) => item.teamId === program)!
    const illegal = performRecruitingAction(used, cycle.id, recruit.id, program, 'contact', { type: 'unofficial', startsOn: used.currentDate, endsOn: used.currentDate, lodgingNights: 0, offCampus: true, offCampusSite: 'educationalInstitution', staffPersonId: assigned.staffPersonId })
    expect(illegal).toMatchObject({ ok: false, reason: 'STAFF_NOT_DESIGNATED_OFF_CAMPUS_RECRUITER' })
    const blockedPermission = canPerformRecruitingAction({ date: used.currentDate, isNCAA: true, calendar: cycle.calendar, category: 'men', action: 'inPersonContact', location: 'offCampus', personDayRequired: true, designatedOffCampusRecruiter: false, maximumDesignatedOffCampusRecruiters: 6, maximumSimultaneousOffCampusRecruiters: 4, personDaysUsed: 0 })
    expect(blockedPermission).toMatchObject({ allowed: false, reasonCode: 'STAFF_NOT_DESIGNATED_OFF_CAMPUS_RECRUITER', provenance: 'SIMULATED_CARRY_FORWARD' })
    const designation = designateOffCampusRecruiter(used, cycle.id, program, assigned.staffPersonId)
    expect(designation.ok).toBe(true)
    if (!designation.ok) return
    const offCampusAction = performRecruitingAction(designation.value, cycle.id, recruit.id, program, 'contact', { type: 'unofficial', startsOn: used.currentDate, endsOn: used.currentDate, lodgingNights: 0, offCampus: true, offCampusSite: 'educationalInstitution', staffPersonId: assigned.staffPersonId })
    expect(offCampusAction.ok).toBe(true)
    if (!offCampusAction.ok) return
    used = offCampusAction.value
    expect(Object.values(used.recruitingActionHistoryById).some((item) => item.cycleId === cycle.id && item.offCampus && item.staffPersonId === assigned.staffPersonId)).toBe(true)
    const personDayQuery = new Set(Object.values(used.recruitingActionHistoryById).filter((item) => item.cycleId === cycle.id && item.programTeamId === program && item.offCampus).map((item) => `${item.staffPersonId}:${item.date}`))
    expect(personDayQuery.size).toBe(1)

    const beforeAi = Object.keys(used.recruitingActionHistoryById).length
    used = progressAiRecruiting(used, cycle.id)
    expect(Object.keys(used.recruitingActionHistoryById).length).toBeGreaterThan(beforeAi)
    expect(Object.values(used.recruitingActionHistoryById).some((item) => item.cycleId === cycle.id && item.kind === 'negotiation'), JSON.stringify(Object.values(used.recruitingActionHistoryById).filter((item) => item.cycleId === cycle.id).map((item) => ({ program: item.programTeamId, kind: item.kind, staff: item.staffPersonId, cost: item.cost })))).toBe(true)
    expect(Object.values(used.recruitingCyclesById).find((item) => item.id === cycle.id)!.calendar!.provenance).toBe('SIMULATED_CARRY_FORWARD')
    used = updateGameWorld(used, { currentDate: addDays(used.currentDate, 1) })
    const nextDayAction = performRecruitingAction(used, cycle.id, recruit.id, program, 'pitch')
    expect(nextDayAction.ok).toBe(true)
    if (!nextDayAction.ok) return
    used = nextDayAction.value
    const progressedPermission = canPerformRecruitingAction({ date: used.currentDate, isNCAA: true, calendar: used.recruitingCyclesById[cycle.id]!.calendar, category: 'men', action: 'inboundCall' })
    expect(progressedPermission).toMatchObject({ allowed: true, provenance: 'SIMULATED_CARRY_FORWARD', rulesetId: expect.stringContaining('BDM-CONTINUITY-2045-46') })
    expect(Object.values(used.recruitingActionHistoryById).some((item) => item.cycleId === cycle.id && item.date === used.currentDate)).toBe(true)
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
