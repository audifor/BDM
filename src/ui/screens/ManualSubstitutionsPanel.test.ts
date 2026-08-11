import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { createNewGame, prepareUserMatch } from '@/app/game'

import { createManualSubstitutionBatch, deriveDraftBench, ManualSubstitutionsPanel, replaceDraftPlayer } from './ManualSubstitutionsPanel'

describe('ManualSubstitutionsPanel draft helpers', () => {
  it('uses the current active lineup and derives the bench from the MatchSquad', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const squad = world.teams[simulation.homeTeamId]!.rosterPlayerIds.map((playerId) => world.players[playerId]!)

    expect(simulation.lineups.home).toHaveLength(5)
    const bench = deriveDraftBench(squad, simulation.lineups.home)
    expect(bench).toHaveLength(squad.length - 5)
    expect(bench.map((player) => player.id).every((playerId) => !simulation.lineups.home.includes(playerId))).toBe(true)
  })

  it('renders the current court and MatchSquad bench with player details', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const squad = world.teams[simulation.homeTeamId]!.rosterPlayerIds.map((playerId) => world.players[playerId]!)
    const markup = renderToStaticMarkup(createElement(ManualSubstitutionsPanel, { activeLineup: simulation.lineups.home, squadPlayers: squad, playerStats: [], fatigueByPlayerId: {}, onApply: () => undefined, onCancel: () => undefined }))

    expect(markup).toContain('ON COURT')
    expect(markup).toContain('BENCH')
    expect(markup).toContain('MIN 00:00')
    expect(markup).toContain('CON 100%')
    for (const playerId of simulation.lineups.home) expect(markup).toContain(world.players[playerId]!.lastName)
    for (const player of deriveDraftBench(squad, simulation.lineups.home)) expect(markup).toContain(player.lastName)
  })

  it('prepares several swaps without modifying the original lineup', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const original = simulation.lineups.home
    const squad = world.teams[simulation.homeTeamId]!.rosterPlayerIds.map((playerId) => world.players[playerId]!)
    const bench = deriveDraftBench(squad, original)
    const firstDraft = replaceDraftPlayer(original, original[0]!, bench[0]!.id)
    const finalDraft = replaceDraftPlayer(firstDraft, original[2]!, bench[1]!.id)

    expect(original).toEqual(simulation.lineups.home)
    expect(finalDraft).toEqual([bench[0]!.id, original[1]!, bench[1]!.id, original[3]!, original[4]!])
    expect(createManualSubstitutionBatch(original, finalDraft)).toEqual([
      { playerOutId: original[0]!, playerInId: bench[0]!.id },
      { playerOutId: original[2]!, playerInId: bench[1]!.id },
    ])
  })

  it('returns an empty batch when the draft is unchanged', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)

    expect(createManualSubstitutionBatch(simulation.lineups.home, simulation.lineups.home)).toEqual([])
  })
})
