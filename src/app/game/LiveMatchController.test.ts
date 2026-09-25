import { describe, expect, it } from 'vitest'

import { applyDueRotations, createDefaultTacticalPlan, createMatchSession, INITIAL_ROTATION_CONTROLLER_STATE, type MatchTacticalPlan } from '@/engine/match'
import { getUserTeam } from '@/engine/calendar'
import { assignLineupSlot, createDefaultTeamLineup } from '@/domain/tactics'
import { getTeamRoster, resolveGameClockRulesForGame, updateGameWorld } from '@/domain/world'
import { resolveStartingFive } from '@/engine/team'
import { activeLineupPlayerIds, rotationRegulationPeriodMinutes, updateRotationMinutesForTeam } from '@/engine/tactics/RotationEngine'
import { updateGamePlan } from './TacticalPlanning'
import { createLiveUserMatch, prepareMatchOptions, prepareUserMatch } from './playUserGame'
import { createNewGame } from './createNewGame'

describe('LiveMatchController', () => {
  it('starts without future sporting events and reaches the batch result through the same steps', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world, undefined, 12345)
    expect(controller.snapshot().events).toHaveLength(1)
    while (!controller.isComplete) controller.advanceOneStep()
    expect(controller.snapshot()).toEqual(prepareUserMatch(world, undefined, 12345))
  })

  it('returns presentation snapshots and clock bounds around exactly one live sporting step', () => {
    const controller = createLiveUserMatch(createNewGame())
    const step = controller.advanceOneStepWithSnapshots()

    expect(step.before.events).toHaveLength(1)
    expect(step.after.events.length).toBe(step.before.events.length)
    expect(step.startPeriod).toBe(1)
    expect(step.startClockSeconds).toBe(600)
    expect(step.endClockSeconds).toBe(step.startClockSeconds)
    expect(step.endAttackingTeamId).toBe(controller.attackingTeamId)
    expect(step.beforeSpatial.players).toHaveLength(10)
    expect(step.afterSpatial.players).toHaveLength(10)
  })

  it('uses the same explicit starting five in instant preparation and live match bootstrap', () => {
    const original = createNewGame()
    const team = getUserTeam(original)!
    const expected = team.rosterPlayerIds.slice(0, 5)
    let lineup = createDefaultTeamLineup(team.id)
    for (const [index, playerId] of expected.entries()) lineup = assignLineupSlot(lineup, (['PG', 'SG', 'SF', 'PF', 'C'] as const)[index]!, playerId)
    const world = updateGameWorld(original, { lineupsByTeamId: { ...original.lineupsByTeamId, [team.id]: lineup } })
    const prepared = prepareUserMatch(world)
    const live = createLiveUserMatch(world).snapshot()
    const game = world.games[prepared.gameId]!
    const side = team.id === game.homeTeamId ? 'home' : 'away'

    expect(prepared.lineups[side]).toEqual(expected)
    expect(live.lineups[side]).toEqual(expected)
  })

  it('shares persisted tactics, matchup overrides, profiles, and rules across live and instant startup', () => {
    const original = createNewGame()
    const team = getUserTeam(original)!
    const game = Object.values(original.games).find((candidate) => candidate.status === 'scheduled' && (candidate.homeTeamId === team.id || candidate.awayTeamId === team.id))!
    const homeStarters = resolveStartingFive(original, game.homeTeamId, game.date)
    const awayStarters = resolveStartingFive(original, game.awayTeamId, game.date)
    const homeMatchups = [{ ourPlayerId: homeStarters[4]!, opponentPlayerId: awayStarters[0]! }]
    const awayMatchups = [{ ourPlayerId: awayStarters[3]!, opponentPlayerId: homeStarters[1]! }]
    let world = updateGamePlan(original, {
      gameId: game.id,
      teamId: game.homeTeamId,
      matchups: homeMatchups,
      tacticalOverride: { pace: 2, shotProfile: { rim: -1, midRange: 1, threePoint: 2 } },
    })
    world = updateGamePlan(world, {
      gameId: game.id,
      teamId: game.awayTeamId,
      matchups: awayMatchups,
      tacticalOverride: { pace: -2, shotProfile: { rim: 2, midRange: -1, threePoint: 0 } },
    })

    const instantInput = prepareMatchOptions(world, game, undefined, 24680)
    const instantSession = createMatchSession(instantInput)
    const repeatedInput = prepareMatchOptions(world, game, undefined, 24680)
    const repeatedSession = createMatchSession(repeatedInput)
    const live = createLiveUserMatch(world, undefined, 24680)

    expect(instantSession.state.coachingState.home.currentTacticalPlan).toMatchObject({ pace: 2, shotProfile: { rim: -1, midRange: 1, threePoint: 2 } })
    expect(instantSession.state.coachingState.away.currentTacticalPlan).toMatchObject({ pace: -2, shotProfile: { rim: 2, midRange: -1, threePoint: 0 } })
    expect(instantSession.state.defensiveMatchups).toEqual({ home: homeMatchups, away: awayMatchups })
    expect(instantSession.state.playerProfiles).toEqual(instantInput.playerProfiles)
    expect(instantSession.state.initialLineups).toEqual(instantInput.lineups)
    expect(instantSession.state.clockRules).toEqual(resolveGameClockRulesForGame(world, game))
    expect(instantSession.state.openingTeamId).toBe(repeatedSession.state.openingTeamId)
    expect(instantInput.decisionRandom.nextInt(0, 1_000_000)).toBe(repeatedInput.decisionRandom.nextInt(0, 1_000_000))
    expect(instantInput.actorRandom.nextInt(0, 1_000_000)).toBe(repeatedInput.actorRandom.nextInt(0, 1_000_000))
    expect(live.currentPlans).toEqual(instantSession.state.coachingState)
    expect(live.currentMatchups).toEqual(instantSession.state.defensiveMatchups)
    expect(live.snapshot().lineups).toEqual(instantSession.state.initialLineups)
  })

  it('resolves base then game override then explicit user override identically for Live and Instant', () => {
    const original = createNewGame()
    const team = getUserTeam(original)!
    const game = Object.values(original.games).find((candidate) => candidate.status === 'scheduled' && (candidate.homeTeamId === team.id || candidate.awayTeamId === team.id))!
    const basePlan = { ...createDefaultTacticalPlan(), pace: -1 as const, shotProfile: { rim: 0 as const, midRange: 1 as const, threePoint: 0 as const } }
    const awayBasePlan = { ...createDefaultTacticalPlan(), pace: 1 as const }
    let world = updateGameWorld(original, { tacticalPlansByTeamId: {
      ...original.tacticalPlansByTeamId,
      [game.homeTeamId]: { teamId: game.homeTeamId, instructions: basePlan },
      [game.awayTeamId]: { teamId: game.awayTeamId, instructions: awayBasePlan },
    } })
    const gameOverride = { ...createDefaultTacticalPlan(), pace: 1 as const, shotProfile: { rim: -1 as const, midRange: 0 as const, threePoint: 2 as const } }
    world = updateGamePlan(world, { gameId: game.id, teamId: game.homeTeamId, tacticalOverride: gameOverride })
    const explicit = { ...createDefaultTacticalPlan(), pace: 2 as const }
    const userIsHome = team.id === game.homeTeamId
    const explicitBySide = userIsHome ? { home: explicit } : { away: explicit }
    const canonicalOptions = prepareMatchOptions(world, game)
    const effectiveHome = prepareMatchOptions(world, game, explicitBySide)
    const instant = createMatchSession(effectiveHome)
    const live = createLiveUserMatch(world, explicit)

    expect(canonicalOptions.tacticalPlans?.home).toEqual({ ...basePlan, ...gameOverride, shotProfile: gameOverride.shotProfile, defense: gameOverride.defense })
    expect(effectiveHome.tacticalPlans?.[userIsHome ? 'home' : 'away']).toEqual(explicit)
    expect(instant.state.coachingState).toEqual(live.currentPlans)
    expect(instant.state.coachingState[userIsHome ? 'away' : 'home'].currentTacticalPlan.pace).toBe(userIsHome ? awayBasePlan.pace : gameOverride.pace)
  })

  it('compiles saved minutes into runner substitutions and falls back for unusable minutes', () => {
    const original = createNewGame()
    const team = getUserTeam(original)!
    const roster = getTeamRoster(original, team.id)
    const slots = ['PG', 'SG', 'SF', 'PF', 'C', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const
    const lineup = slots.reduce((current, slot, index) => assignLineupSlot(current, slot, roster[index]!.id), createDefaultTeamLineup(team.id))
    const world = updateGameWorld(original, { lineupsByTeamId: { ...original.lineupsByTeamId, [team.id]: lineup } })
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled' && (candidate.homeTeamId === team.id || candidate.awayTeamId === team.id))!
    const periods = rotationRegulationPeriodMinutes(world, team.id)
    const minutes = Object.fromEntries(roster.map((player, index) => [player.id, periods.map((length) => index < 5 ? length - 1 : index === 5 ? 5 : 0)]))
    const withMinutes = updateRotationMinutesForTeam(world, team.id, minutes)
    const options = prepareMatchOptions(withMinutes, game)
    const side = team.id === game.homeTeamId ? 'home' : 'away'
    const rotation = side === 'home' ? options.homeRotationPlan : options.awayRotationPlan
    const session = createMatchSession(options)
    const firstRotationClock = rotation.instructions[0]!.clockThresholdSeconds
    const atRotationClock = { ...session, state: { ...session.state, clockSecondsRemaining: firstRotationClock } }
    const applied = applyDueRotations(atRotationClock, rotation, INITIAL_ROTATION_CONTROLLER_STATE)
    const initialLineup = side === 'home' ? session.state.activeLineups.home : session.state.activeLineups.away
    const rotatedLineup = side === 'home' ? applied.session.state.activeLineups.home : applied.session.state.activeLineups.away
    const invalidWorld = { ...world, rotationPlansByTeamId: { ...world.rotationPlansByTeamId, [team.id]: { teamId: team.id, instructions: [], minutesByPeriod: {} } } }
    const fallbackOptions = prepareMatchOptions(invalidWorld, game)
    const fallbackPlan = side === 'home' ? fallbackOptions.homeRotationPlan : fallbackOptions.awayRotationPlan
    const defaultOptions = prepareMatchOptions(world, game)
    const defaultPlan = side === 'home' ? defaultOptions.homeRotationPlan : defaultOptions.awayRotationPlan

    expect(activeLineupPlayerIds(world, team.id)).toHaveLength(roster.length)
    expect(rotation.instructions.length).toBeGreaterThan(0)
    expect(rotatedLineup).not.toEqual(initialLineup)
    expect(fallbackPlan.instructions).toEqual(defaultPlan.instructions)
  })

  it('simulates only the remainder of the current quarter', () => {
    const controller = createLiveUserMatch(createNewGame())
    controller.advanceOneStep()
    const after = controller.skipToEndOfPeriod()

    expect(after.events).toContainEqual(expect.objectContaining({ type: 'periodEnd', period: 1, clockSecondsRemaining: 0 }))
    expect(after.events.at(-1)).toMatchObject({ type: 'periodStart', period: 2, clockSecondsRemaining: 600 })
    expect(after.events.some((event) => event.period > 2)).toBe(false)
    expect(controller.isComplete).toBe(false)
  })

  it('applies live tactics to runtime state consumed by the next gameplay step', () => {
    const world = createNewGame()
    const baseline = createLiveUserMatch(world, undefined, 424242)
    const coached = createLiveUserMatch(world, undefined, 424242)
    const replay = createLiveUserMatch(world, undefined, 424242)
    const initial = coached.snapshot()
    const plans = {
      home: { ...createDefaultTacticalPlan(), pace: 2 as const, shotProfile: { rim: 2 as const, midRange: -1 as const, threePoint: 1 as const }, defense: { interior: 2 as const, perimeter: -1 as const, pickAndRollCoverage: 'switch' as const }, featuredPlayerId: world.teams[initial.homeTeamId]!.rosterPlayerIds[0]! },
      away: { ...createDefaultTacticalPlan(), pace: 2 as const, shotProfile: { rim: 1 as const, midRange: -2 as const, threePoint: 2 as const }, defense: { interior: 2 as const, perimeter: -1 as const, pickAndRollCoverage: 'switch' as const }, featuredPlayerId: world.teams[initial.awayTeamId]!.rosterPlayerIds[0]! },
    }

    for (const controller of [coached, replay]) {
      controller.applyTactics(initial.homeTeamId, plans.home)
      controller.applyTactics(initial.awayTeamId, plans.away)
    }
    expect(coached.currentPlans.home.currentTacticalPlan).toEqual(plans.home)
    expect(coached.currentPlans.away.currentTacticalPlan).toEqual(plans.away)
    expect(coached.snapshot().events.filter((event) => event.type === 'tacticalChange')).toHaveLength(2)
    const beforeInvalidTactics = coached.snapshot()
    const invalidPlan = { ...plans.home, pace: 3 } as unknown as MatchTacticalPlan
    expect(() => coached.applyTactics(initial.homeTeamId, invalidPlan)).toThrow()
    expect(coached.snapshot()).toEqual(beforeInvalidTactics)

    const defaultSetup = baseline.advanceOneStepWithSnapshots()
    const coachedSetup = coached.advanceOneStepWithSnapshots()
    const replaySetup = replay.advanceOneStepWithSnapshots()
    const defaultStep = baseline.advanceOneStepWithSnapshots()
    const coachedStep = coached.advanceOneStepWithSnapshots()
    const replayStep = replay.advanceOneStepWithSnapshots()

    expect(defaultSetup.startClockSeconds).toBe(defaultSetup.endClockSeconds)
    expect(coachedSetup.startClockSeconds).toBe(coachedSetup.endClockSeconds)
    expect(defaultStep.startClockSeconds - defaultStep.endClockSeconds - (coachedStep.startClockSeconds - coachedStep.endClockSeconds)).toBe(4)
    expect([replaySetup, replayStep]).toEqual([coachedSetup, coachedStep])
  })

  it('updates the runtime active five and the next gameplay step after substitution', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const userTeam = getUserTeam(world)!
    const side = userTeam.id === controller.snapshot().homeTeamId ? 'home' : 'away'
    const activeBefore = controller.activeLineups[side]
    const playerOutId = activeBefore[0]!
    const playerInId = controller.replacementCandidates(userTeam.id, playerOutId)[0]!
    const updated = controller.applySubstitution(userTeam.id, playerOutId, playerInId)
    const activeAfter = controller.activeLineups[side]

    expect(activeAfter).toHaveLength(5)
    expect(new Set(activeAfter)).toHaveLength(5)
    expect(activeAfter).not.toContain(playerOutId)
    expect(activeAfter).toContain(playerInId)
    expect(controller.replacementCandidates(userTeam.id, playerOutId)).toEqual([])
    expect(updated.events.at(-1)).toMatchObject({ type: 'substitution', teamId: userTeam.id, playerOutId, playerInId, source: 'manual' })

    let afterStep = updated
    let gameplayEvent = afterStep.events.find((event, index) => index >= updated.events.length && 'teamId' in event && 'playerId' in event)
    for (let step = 0; gameplayEvent === undefined && step < 3; step += 1) {
      afterStep = controller.advanceOneStep()
      gameplayEvent = afterStep.events.find((event, index) => index >= updated.events.length && 'teamId' in event && 'playerId' in event)
    }
    expect(gameplayEvent).toBeDefined()
    if (gameplayEvent !== undefined && 'teamId' in gameplayEvent && 'playerId' in gameplayEvent) {
      const eventLineup = gameplayEvent.teamId === controller.snapshot().homeTeamId ? controller.activeLineups.home : controller.activeLineups.away
      expect(eventLineup).toContain(gameplayEvent.playerId)
    }
  })

  it('rejects an invalid substitution batch without partially changing the runtime', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const userTeam = getUserTeam(world)!
    const active = controller.activeLineups[userTeam.id === controller.snapshot().homeTeamId ? 'home' : 'away']
    const before = controller.snapshot()

    expect(() => controller.applyManualSubstitutions(userTeam.id, [
      { playerOutId: active[0]!, playerInId: controller.replacementCandidates(userTeam.id, active[0]!)[0]! },
      { playerOutId: active[1]!, playerInId: active[2]! },
    ])).toThrow()
    expect(controller.snapshot()).toEqual(before)
    expect(controller.activeLineups[userTeam.id === before.homeTeamId ? 'home' : 'away']).toEqual(active)
  })
})
