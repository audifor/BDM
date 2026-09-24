import { describe, expect, it } from 'vitest'

import { createDefaultTacticalPlan, createMatchSession } from '@/engine/match'
import { getUserTeam } from '@/engine/calendar'
import { assignLineupSlot, createDefaultTeamLineup } from '@/domain/tactics'
import { resolveGameClockRulesForGame, updateGameWorld } from '@/domain/world'
import { resolveStartingFive } from '@/engine/team'
import { updateGamePlan } from './TacticalPlanning'
import { createLiveUserMatch, prepareMatchOptions, prepareUserMatch } from './playUserGame'
import { createNewGame } from './createNewGame'

describe('LiveMatchController', () => {
  it('starts without future sporting events and reaches the batch result through the same steps', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    expect(controller.snapshot().events).toHaveLength(1)
    while (!controller.isComplete) controller.advanceOneStep()
    expect(controller.snapshot()).toEqual(prepareUserMatch(world))
  })

  it('returns presentation snapshots around exactly one live sporting step', () => {
    const controller = createLiveUserMatch(createNewGame())
    const step = controller.advanceOneStepWithSnapshots()

    expect(step.before.events).toHaveLength(1)
    expect(step.after.events.length).toBeGreaterThan(step.before.events.length)
    expect(step.after.events.at(-1)!.clockSecondsRemaining).toBeLessThan(step.before.events.at(-1)!.clockSecondsRemaining)
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

    const instantInput = prepareMatchOptions(world, game)
    const instantSession = createMatchSession(instantInput)
    const repeatedInput = prepareMatchOptions(world, game)
    const repeatedSession = createMatchSession(repeatedInput)
    const live = createLiveUserMatch(world)

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

  it('simulates only the remainder of the current quarter', () => {
    const controller = createLiveUserMatch(createNewGame())
    controller.advanceOneStep()
    const after = controller.skipToEndOfPeriod()

    expect(after.events).toContainEqual(expect.objectContaining({ type: 'periodEnd', period: 1, clockSecondsRemaining: 0 }))
    expect(after.events.at(-1)).toMatchObject({ type: 'periodStart', period: 2, clockSecondsRemaining: 600 })
    expect(after.events.some((event) => event.period > 2)).toBe(false)
    expect(controller.isComplete).toBe(false)
  })

  it('keeps live coaching disabled for now', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const before = controller.snapshot()
    const userTeam = getUserTeam(world)!
    const plan = { ...createDefaultTacticalPlan(), pace: 2 as const }

    expect(controller.applyTactics(userTeam.id, plan)).toEqual(before)
    expect(controller.snapshot()).toEqual(before)
  })

  it('keeps manual substitutions disabled for now', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const before = controller.snapshot()
    const userTeam = getUserTeam(world)!
    const playerOutId = userTeam.rosterPlayerIds[0]!
    const playerInId = userTeam.rosterPlayerIds[1]!

    expect(controller.applyManualSubstitutions(userTeam.id, [{ playerOutId, playerInId }])).toEqual(before)
    expect(controller.replacementCandidates(userTeam.id, playerOutId)).toEqual([])
    expect(controller.snapshot()).toEqual(before)
  })
})
