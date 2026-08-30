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

  it('does not expose live substitution candidates while substitutions are disabled', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const controller = createLiveUserMatch(world); const playerOutId = [...controller.snapshot().lineups.home, ...controller.snapshot().lineups.away].find((id) => team.rosterPlayerIds.includes(id))!
    expect(controller.replacementCandidates(team.id, playerOutId)).toEqual([])
  })
})
