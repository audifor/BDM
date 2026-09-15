import { describe, expect, it } from 'vitest'
import { createNewGame } from './createNewGame'
import { prepareUserMatch, createLiveUserMatch } from './playUserGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { calculatePlayerImpact, selectStartingFive } from '@/engine/team'
import type { GameWorld } from '@/domain/world'
import type { PlayerId } from '@/domain/ids'

const STARTER_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const

function withUserStarters(world: GameWorld, starterIds: readonly PlayerId[]): GameWorld {
  const team = getUserTeam(world)!
  return STARTER_SLOTS.reduce((next, slot, index) => setLineupSlot(next, team.id, slot, starterIds[index]!), world)
}

/** The five roster players `selectStartingFive` would never pick first: lowest player-impact per position pool. */
function worstFiveByImpact(world: GameWorld): readonly PlayerId[] {
  const team = getUserTeam(world)!
  const roster = getTeamRoster(world, team.id)
  return [...roster].sort((a, b) => calculatePlayerImpact(a) - calculatePlayerImpact(b)).slice(0, 5).map((player) => player.id)
}

describe('match construction: configured TeamLineup is authoritative (MG2A / BUG-1)', () => {
  it('Test A: starts exactly the user-configured five even when selectStartingFive would choose differently', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const configuredStarters = worstFiveByImpact(base)
    const algorithmicStarters = selectStartingFive(base, team.id)

    expect(new Set(configuredStarters)).not.toEqual(new Set(algorithmicStarters))

    const world = withUserStarters(base, configuredStarters)
    const simulation = prepareUserMatch(world)
    const isHome = simulation.homeTeamId === team.id
    const actualStarters = isHome ? simulation.lineups.home : simulation.lineups.away

    expect(new Set(actualStarters)).toEqual(new Set(configuredStarters))
  })

  it('Test B: changing the configured lineup changes the real starting five', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const firstFive = roster.slice(0, 5).map((player) => player.id)
    const secondFive = [roster[0]!.id, roster[1]!.id, roster[2]!.id, roster[3]!.id, roster[5]!.id]

    const worldA = withUserStarters(base, firstFive)
    const worldB = withUserStarters(base, secondFive)
    const isHome = getUserTeam(worldA)!.id === prepareUserMatch(worldA).homeTeamId

    const startersA = isHome ? prepareUserMatch(worldA).lineups.home : prepareUserMatch(worldA).lineups.away
    const startersB = isHome ? prepareUserMatch(worldB).lineups.home : prepareUserMatch(worldB).lineups.away

    expect(new Set(startersA)).toEqual(new Set(firstFive))
    expect(new Set(startersB)).toEqual(new Set(secondFive))
    expect(new Set(startersA)).not.toEqual(new Set(startersB))
  })

  it('Test C: the AI opponent keeps using its existing selection mechanism when no lineup is configured for it', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const world = withUserStarters(base, worstFiveByImpact(base))
    const simulation = prepareUserMatch(world)
    const opponentTeamId = simulation.homeTeamId === team.id ? simulation.awayTeamId : simulation.homeTeamId
    const opponentStarters = simulation.homeTeamId === team.id ? simulation.lineups.away : simulation.lineups.home
    const algorithmicOpponentStarters = selectStartingFive(world, opponentTeamId, world.currentDate)

    expect(new Set(opponentStarters)).toEqual(new Set(algorithmicOpponentStarters))
  })

  it('Test D: no configured lineup falls back deterministically and the match remains playable', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!

    const simulation = prepareUserMatch(world)
    const isHome = simulation.homeTeamId === team.id
    const actualStarters = isHome ? simulation.lineups.home : simulation.lineups.away
    const algorithmicStarters = selectStartingFive(world, team.id)

    expect(actualStarters).toHaveLength(5)
    expect(new Set(actualStarters)).toEqual(new Set(algorithmicStarters))
    expect(simulation.finalScore.home + simulation.finalScore.away).toBeGreaterThan(0)
  })

  it('Test E: an invalid configured lineup (duplicate player across slots) falls back deterministically', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    let world = setLineupSlot(base, team.id, 'PG', roster[0]!.id)
    world = setLineupSlot(world, team.id, 'SG', roster[1]!.id)
    world = setLineupSlot(world, team.id, 'SF', roster[2]!.id)
    world = setLineupSlot(world, team.id, 'PF', roster[3]!.id)
    // Leave C unassigned: only four distinct starters configured -> invalid (not exactly five).

    const simulation = prepareUserMatch(world)
    const isHome = simulation.homeTeamId === team.id
    const actualStarters = isHome ? simulation.lineups.home : simulation.lineups.away
    const algorithmicStarters = selectStartingFive(world, team.id)

    expect(actualStarters).toHaveLength(5)
    expect(new Set(actualStarters)).toEqual(new Set(algorithmicStarters))
  })

  it('createLiveUserMatch also honors the configured lineup (live path, not only instant-result)', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const configuredStarters = worstFiveByImpact(base)
    const world = withUserStarters(base, configuredStarters)

    const controller = createLiveUserMatch(world)
    const snapshot = controller.snapshot()
    const isHome = snapshot.homeTeamId === team.id
    const actualStarters = isHome ? snapshot.lineups.home : snapshot.lineups.away

    expect(new Set(actualStarters)).toEqual(new Set(configuredStarters))
  })
})
