import { describe, expect, it } from 'vitest'
import { useGameStore } from '@/stores/gameStore'
import { createNewGame } from './createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { calculatePlayerImpact, selectStartingFive } from '@/engine/team'

const STARTER_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const

describe('completed live-match finalization boundary (MG2D / MG1 BUG-5)', () => {
  it('Test A / B: a live user match finalized through the store commits the authoritative result to GameWorld', () => {
    useGameStore.getState().resetGame()
    useGameStore.getState().newGame()
    const preMatchWorld = useGameStore.getState().world!
    const gameId = Object.values(preMatchWorld.games).find((game) => game.homeTeamId === getUserTeam(preMatchWorld)?.id || game.awayTeamId === getUserTeam(preMatchWorld)?.id)!.id

    expect(preMatchWorld.games[gameId]?.status).toBe('scheduled')

    useGameStore.getState().startLiveMatch()
    const finalSimulation = useGameStore.getState().skipLiveMatch()
    useGameStore.getState().completeMatch(finalSimulation)

    const finalizedWorld = useGameStore.getState().world!
    expect(finalizedWorld.games[gameId]?.status).toBe('completed')
    expect(finalizedWorld.games[gameId]?.result).toEqual({ homeScore: finalSimulation.finalScore.home, awayScore: finalSimulation.finalScore.away })
    expect(finalizedWorld.matchStatLogsByGameId[gameId]?.finalScore).toEqual(finalSimulation.finalScore)
  })

  it('Test E: finalizing the same completed match twice is rejected, not silently duplicated', () => {
    useGameStore.getState().resetGame()
    useGameStore.getState().newGame()

    useGameStore.getState().startLiveMatch()
    const finalSimulation = useGameStore.getState().skipLiveMatch()
    useGameStore.getState().completeMatch(finalSimulation)
    const worldAfterFirst = useGameStore.getState().world!

    expect(() => useGameStore.getState().completeMatch(finalSimulation)).toThrow()
    expect(useGameStore.getState().world).toBe(worldAfterFirst)
  })

  it('Test H: live coaching commands are rejected once the match session is finalized', () => {
    useGameStore.getState().resetGame()
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const team = getUserTeam(world)!

    useGameStore.getState().startLiveMatch()
    const finalSimulation = useGameStore.getState().skipLiveMatch()
    useGameStore.getState().completeMatch(finalSimulation)

    expect(() => useGameStore.getState().applyLiveTactics(team.id, { pace: 1, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } })).toThrow()
    expect(() => useGameStore.getState().applyManualSubstitutions(team.id, [])).toThrow()
  })

  it('Test G: configured starters remain authoritative through the live-match finalization boundary', () => {
    useGameStore.getState().resetGame()
    useGameStore.getState().newGame()
    let world = useGameStore.getState().world!
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const configuredStarters = [...roster].sort((a, b) => calculatePlayerImpact(a) - calculatePlayerImpact(b)).slice(0, 5).map((p) => p.id)
    const algorithmicStarters = selectStartingFive(world, team.id)
    expect(new Set(configuredStarters)).not.toEqual(new Set(algorithmicStarters))
    world = STARTER_SLOTS.reduce((next, slot, index) => setLineupSlot(next, team.id, slot, configuredStarters[index]!), world)
    useGameStore.setState({ world })

    const snapshot = useGameStore.getState().startLiveMatch()
    const isHome = snapshot.homeTeamId === team.id
    const actualStarters = isHome ? snapshot.lineups.home : snapshot.lineups.away

    expect(new Set(actualStarters)).toEqual(new Set(configuredStarters))
  })

  it('Test I: replacement candidates for the live match never depend on calculatePlayerImpact', () => {
    useGameStore.getState().resetGame()
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const team = getUserTeam(world)!

    useGameStore.getState().startLiveMatch()
    const controller = useGameStore.getState().getActiveMatchSession()!
    const snapshot = controller.snapshot()
    const isHome = snapshot.homeTeamId === team.id
    const active = isHome ? snapshot.lineups.home : snapshot.lineups.away
    const squad = isHome ? snapshot.squads.home : snapshot.squads.away

    const candidates = controller.replacementCandidates(team.id, active[0]!)
    expect(candidates.every((candidateId) => squad.includes(candidateId) && !active.includes(candidateId))).toBe(true)
  })
})
