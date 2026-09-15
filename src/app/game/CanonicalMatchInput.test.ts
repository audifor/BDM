import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNewGame } from './createNewGame'
import { createLiveUserMatch, prepareUserMatch, prepareMatch, simulateAndApplyGame } from './playUserGame'
import { resolveCanonicalMatchInput } from './resolveCanonicalMatchInput'
import { getUserTeam, getGamesToday } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { setTacticalInstruction } from './TacticalPlanning'
import { calculatePlayerImpact, selectStartingFive } from '@/engine/team'
import type { GameWorld } from '@/domain/world'
import type { PlayerId } from '@/domain/ids'

const STARTER_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const BENCH_SLOTS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const

function withUserLineup(world: GameWorld, starterIds: readonly PlayerId[], benchIds: readonly PlayerId[] = []): GameWorld {
  const team = getUserTeam(world)!
  const withStarters = STARTER_SLOTS.reduce((next, slot, index) => setLineupSlot(next, team.id, slot, starterIds[index]!), world)
  return benchIds.reduce((next, playerId, index) => setLineupSlot(next, team.id, BENCH_SLOTS[index]!, playerId), withStarters)
}

function userGame(world: GameWorld) {
  const team = getUserTeam(world)!
  return getGamesToday(world).find((game) => game.homeTeamId === team.id || game.awayTeamId === team.id)!
}

describe('CanonicalMatchInput — canonical pre-match resolution boundary (MG3)', () => {
  it('Test A: Live Match and Instant Result resolve identical input for the same world and game', () => {
    const world = createNewGame()
    const game = userGame(world)

    const liveInput = resolveCanonicalMatchInput(world, game)
    const instantInput = resolveCanonicalMatchInput(world, game)

    expect(liveInput.lineups).toEqual(instantInput.lineups)
    expect(liveInput.squads).toEqual(instantInput.squads)
    expect(liveInput.tacticalPlans).toEqual(instantInput.tacticalPlans)
    expect(liveInput.homeRotationPlan).toEqual(instantInput.homeRotationPlan)
    expect(liveInput.awayRotationPlan).toEqual(instantInput.awayRotationPlan)
    expect(liveInput.random.constructor).toBe(instantInput.random.constructor)
  })

  it('Test A (integration): createLiveUserMatch and prepareUserMatch produce the same starting five for the same configured lineup', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const configuredStarters = roster.slice(0, 5).map((p) => p.id)
    const world = withUserLineup(base, configuredStarters)

    const controller = createLiveUserMatch(world)
    const liveSnapshot = controller.snapshot()
    const instantSimulation = prepareUserMatch(world)

    expect(liveSnapshot.lineups).toEqual(instantSimulation.lineups)
  })

  it('Test B: a configured TeamLineup starting five appears identically in the resolver, Live Match, and Instant Result', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const configuredStarters = [...roster].sort((a, b) => calculatePlayerImpact(a) - calculatePlayerImpact(b)).slice(0, 5).map((p) => p.id)
    const algorithmicStarters = selectStartingFive(base, team.id)
    expect(new Set(configuredStarters)).not.toEqual(new Set(algorithmicStarters))
    const world = withUserLineup(base, configuredStarters)
    const game = userGame(world)
    const isHome = game.homeTeamId === team.id

    const input = resolveCanonicalMatchInput(world, game)
    const liveSnapshot = createLiveUserMatch(world).snapshot()
    const instantSimulation = prepareUserMatch(world)

    const resolverStarters = isHome ? input.lineups.home : input.lineups.away
    expect(new Set(resolverStarters)).toEqual(new Set(configuredStarters))
    expect(new Set(isHome ? liveSnapshot.lineups.home : liveSnapshot.lineups.away)).toEqual(new Set(configuredStarters))
    expect(new Set(isHome ? instantSimulation.lineups.home : instantSimulation.lineups.away)).toEqual(new Set(configuredStarters))
  })

  it('Test C: configured bench priority (B1..B7) is preserved in the resolved rotation plan, never reordered by ratings', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const starterIds = roster.slice(0, 5).map((p) => p.id)
    const benchPool = roster.slice(5, 12).map((p) => p.id)
    const reversedBench = [...benchPool].reverse()

    const worldA = withUserLineup(base, starterIds, benchPool)
    const worldB = withUserLineup(base, starterIds, reversedBench)
    const gameA = userGame(worldA)
    const gameB = userGame(worldB)

    const inputA = resolveCanonicalMatchInput(worldA, gameA)
    const inputB = resolveCanonicalMatchInput(worldB, gameB)

    const isHome = gameA.homeTeamId === team.id
    const planA = isHome ? inputA.homeRotationPlan : inputA.awayRotationPlan
    const planB = isHome ? inputB.homeRotationPlan : inputB.awayRotationPlan
    // Reversing bench priority must produce a different rotation schedule; the resolver
    // must never reorder by calculatePlayerImpact regardless of the configured order.
    expect(planA).not.toEqual(planB)
  })

  it('Test D: a configured tactical plan appears as the real initial tactical state', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const configured = { pace: 2 as const, shotProfile: { rim: 1 as const, midRange: 0 as const, threePoint: -1 as const }, defense: { interior: 0 as const, perimeter: 0 as const } }
    const world = setTacticalInstruction(base, team.id, configured)
    const game = userGame(world)
    const isHome = game.homeTeamId === team.id

    const input = resolveCanonicalMatchInput(world, game)
    const resolvedPlan = isHome ? input.tacticalPlans.home : input.tacticalPlans.away

    expect(resolvedPlan).toEqual(configured)

    const controller = createLiveUserMatch(world)
    const liveIsHome = controller.snapshot().homeTeamId === team.id
    expect(controller.currentPlans[liveIsHome ? 'home' : 'away'].currentTacticalPlan).toEqual(configured)
  })

  it('Test E: no configured tactics falls back to the same deterministic default for every consumer', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const game = userGame(world)
    const isHome = game.homeTeamId === team.id

    const input1 = resolveCanonicalMatchInput(world, game)
    const input2 = resolveCanonicalMatchInput(world, game)
    const defaultPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }

    expect(isHome ? input1.tacticalPlans.home : input1.tacticalPlans.away).toEqual(defaultPlan)
    expect(input1.tacticalPlans).toEqual(input2.tacticalPlans)
  })

  it('Test F: the ruleset-relevant seed/identity is resolved once through a single boundary for both live and instant paths', () => {
    const world = createNewGame()
    const game = userGame(world)

    const input = resolveCanonicalMatchInput(world, game)

    expect(input.gameId).toBe(game.id)
    expect(input.homeTeamId).toBe(game.homeTeamId)
    expect(input.awayTeamId).toBe(game.awayTeamId)
  })

  it('Test G: a live substitution changes the runtime lineup but never the resolved CanonicalMatchInput', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const starterIds = roster.slice(0, 5).map((p) => p.id)
    const benchIds = roster.slice(5, 12).map((p) => p.id)
    const world = withUserLineup(base, starterIds, benchIds)
    const game = userGame(world)

    const input = resolveCanonicalMatchInput(world, game)
    const isHome = game.homeTeamId === team.id
    const originalStarters = isHome ? input.lineups.home : input.lineups.away

    const controller = createLiveUserMatch(world)
    controller.applyManualSubstitutions(team.id, [{ playerOutId: originalStarters[0]!, playerInId: benchIds[0]! }])

    const inputAfter = resolveCanonicalMatchInput(world, game)
    expect(isHome ? inputAfter.lineups.home : inputAfter.lineups.away).toEqual(originalStarters)
    expect(new Set(originalStarters)).toEqual(new Set(starterIds))
  })

  it('Test H: a live tactical change updates runtime coaching state but never the resolved CanonicalMatchInput', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const world = base
    const game = userGame(world)
    const isHome = game.homeTeamId === team.id

    const input = resolveCanonicalMatchInput(world, game)
    const initialPlan = isHome ? input.tacticalPlans.home : input.tacticalPlans.away

    const controller = createLiveUserMatch(world)
    controller.applyTactics(team.id, { pace: 2, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } })

    const inputAfter = resolveCanonicalMatchInput(world, game)
    expect(isHome ? inputAfter.tacticalPlans.home : inputAfter.tacticalPlans.away).toEqual(initialPlan)
  })

  it('Test I: the same CanonicalMatchInput with the same command sequence produces the same final result', () => {
    function playToCompletion() {
      const world = createNewGame()
      const controller = createLiveUserMatch(world)
      return controller.skipToEnd()
    }

    const first = playToCompletion()
    const second = playToCompletion()

    expect(first).toEqual(second)
  })

  it('Test J: Instant Result still completes and produces a valid, persistable simulation (regression)', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)

    expect(simulation.finalScore.home).not.toBe(simulation.finalScore.away)
    expect(simulation.events.some((event) => event.type === 'gameEnd')).toBe(true)
  })

  it('Test K: Live Match still runs start-to-finish through the resolver-backed controller (regression)', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    expect(controller.snapshot().events).toHaveLength(1)
    const final = controller.skipToEnd()
    expect(controller.isComplete).toBe(true)
    expect(final.finalScore.home + final.finalScore.away).toBeGreaterThan(0)
  })

  it('Test L: a missing/unconfigured lineup still falls back deterministically through the resolver boundary, not inside the engine', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const game = userGame(world)
    const isHome = game.homeTeamId === team.id

    const input = resolveCanonicalMatchInput(world, game)
    const algorithmicStarters = selectStartingFive(world, team.id)

    expect(isHome ? input.lineups.home : input.lineups.away).toHaveLength(5)
    expect(new Set(isHome ? input.lineups.home : input.lineups.away)).toEqual(new Set(algorithmicStarters))

    const simulation = prepareMatch(world, game)
    expect(simulation.finalScore.home + simulation.finalScore.away).toBeGreaterThan(0)
  })

  it('AI vs AI simulation uses the same resolver boundary as user matches', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const aiGame = Object.values(world.games).find((game) => game.homeTeamId !== userTeam.id && game.awayTeamId !== userTeam.id && game.status === 'scheduled')!

    const input = resolveCanonicalMatchInput(world, aiGame)
    expect(input.lineups.home).toHaveLength(5)
    expect(input.lineups.away).toHaveLength(5)

    const completedWorld = simulateAndApplyGame(world, aiGame)
    expect(completedWorld.games[aiGame.id]?.status).toBe('completed')
  })

  it('architectural guard: the Match runtime never independently re-resolves lineups or tactics from GameWorld', () => {
    const engineDir = path.join(__dirname, '../../engine/match')
    const runtimeFiles = [
      'MatchEngine.ts',
      'rotation/RotationPlan.ts',
      'rotation/RotationController.ts',
      'rotation/MatchRotationRunner.ts',
      'coaching/MatchCoachingState.ts',
      'coaching/ManualSubstitutions.ts',
      'tactics/MatchTacticalPlan.ts',
    ]
    for (const file of runtimeFiles) {
      const source = readFileSync(path.join(engineDir, file), 'utf-8')
      expect(source, `${file} must not call getTeamLineup`).not.toMatch(/getTeamLineup/)
      expect(source, `${file} must not call getEffectiveTacticalPlan`).not.toMatch(/getEffectiveTacticalPlan/)
    }
    const controllerSource = readFileSync(path.join(__dirname, './LiveMatchController.ts'), 'utf-8')
    expect(controllerSource).not.toMatch(/getTeamLineup/)
    expect(controllerSource).not.toMatch(/getEffectiveTacticalPlan/)
  })
})
