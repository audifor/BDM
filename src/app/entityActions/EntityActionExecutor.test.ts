import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createLiveUserMatch } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { confirmComposition, selectComposerOption, startComposition } from './ComposerEngine'
import { createEntityCommand } from './EntityCommand'
import { executeEntityActionResult } from './EntityActionExecutor'
import { createEntityRef } from './EntityRef'
import { productionEntityActionRegistry } from './productionRegistry'

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

  it('executes a valid substitute transiently through LiveMatchController', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const controller = createLiveUserMatch(world); const playerOutId = [...controller.snapshot().lineups.home, ...controller.snapshot().lineups.away].find((id) => team.rosterPlayerIds.includes(id))!; const candidates = controller.replacementCandidates(team.id, playerOutId); const playerInId = candidates[0]!
    const entity = createEntityRef('player', playerOutId); const action = productionEntityActionRegistry.getCatalog('player').find((candidate) => candidate.id === 'player.substitute')!; const environment = { world, controlledTeamId: team.id, activeMatchSession: controller }
    let composition = startComposition(entity, action, environment); composition = selectComposerOption(composition, playerInId); composition = confirmComposition(composition)
    const result = composition.status === 'completed' ? executeEntityActionResult(world, composition.command, { controlledTeamId: team.id, activeMatchSession: controller }) : { kind: 'rejected' as const }
    expect(result.kind).toBe('sessionUpdated'); expect(world.teams[team.id]!.rosterPlayerIds).toContain(playerOutId)
  })
})
