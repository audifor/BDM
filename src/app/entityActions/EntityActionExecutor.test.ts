import { describe, expect, it } from 'vitest'

import { createLiveUserMatch, createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { createEntityCommand } from './EntityCommand'
import { executeEntityActionResult } from './EntityActionExecutor'
import { createEntityRef } from './EntityRef'

describe('EntityActionExecutor', () => {
  it('executes only the wired release command through the market application API', () => {
    const world = createNewGame(); const team = Object.values(world.teams)[0]!; const playerId = team.rosterPlayerIds[0]!
    const result = executeEntityActionResult(world, createEntityCommand({ type: 'player.release', entity: createEntityRef('player', playerId) }), { controlledTeamId: team.id })
    expect(result.kind).toBe('executed')
    if (result.kind === 'executed') expect(result.world.teams[team.id]!.rosterPlayerIds).not.toContain(playerId)
  })

  it('does not claim an executor for other commands', () => {
    const world = createNewGame(); const team = Object.values(world.teams)[0]!; const playerId = team.rosterPlayerIds[0]!
    expect(executeEntityActionResult(world, createEntityCommand({ type: 'player.talk', entity: createEntityRef('player', playerId) }), { controlledTeamId: team.id })).toEqual({ kind: 'noExecutor' })
  })

  it('exposes the real bench as live substitution candidates for an on-court player (MG2B)', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const controller = createLiveUserMatch(world)
    const snapshot = controller.snapshot(); const isHome = snapshot.homeTeamId === team.id
    const playerOutId = isHome ? snapshot.lineups.home[0]! : snapshot.lineups.away[0]!
    const candidates = controller.replacementCandidates(team.id, playerOutId)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates).not.toContain(playerOutId)
  })

  it('applies a valid live substitution through the entity-action boundary and reports sessionUpdated', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const controller = createLiveUserMatch(world)
    const snapshot = controller.snapshot(); const isHome = snapshot.homeTeamId === team.id
    const playerOutId = isHome ? snapshot.lineups.home[0]! : snapshot.lineups.away[0]!
    const playerInId = controller.replacementCandidates(team.id, playerOutId)[0]!

    const result = executeEntityActionResult(world, createEntityCommand({ type: 'player.substitute', entity: createEntityRef('player', playerOutId), payload: { replacement: playerInId } }), { controlledTeamId: team.id, activeMatchSession: controller })

    expect(result.kind).toBe('sessionUpdated')
    if (result.kind === 'sessionUpdated') expect(result.simulation.events.at(-1)).toMatchObject({ type: 'substitution', playerOutId, playerInId })
  })

  it('rejects an invalid live substitution through the entity-action boundary instead of applying it', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const controller = createLiveUserMatch(world)
    const snapshot = controller.snapshot(); const isHome = snapshot.homeTeamId === team.id
    const playerOutId = isHome ? snapshot.lineups.home[0]! : snapshot.lineups.away[0]!
    const alreadyOnCourt = isHome ? snapshot.lineups.home[1]! : snapshot.lineups.away[1]!

    const result = executeEntityActionResult(world, createEntityCommand({ type: 'player.substitute', entity: createEntityRef('player', playerOutId), payload: { replacement: alreadyOnCourt } }), { controlledTeamId: team.id, activeMatchSession: controller })

    expect(result.kind).toBe('rejected')
  })
})
