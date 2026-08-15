import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'

import { confirmComposition, startComposition } from './ComposerEngine'
import { createEntityRef } from './EntityRef'
import { createPlayerActionRegistry, PLAYER_ACTIONS } from './playerActions'

describe('Player action catalog', () => {
  const world = createNewGame()
  const ownTeam = Object.values(world.teams)[0]!
  const ownPlayer = world.players[ownTeam.rosterPlayerIds[0]!]!
  const rivalTeam = Object.values(world.teams).find((team) => team.id !== ownTeam.id)!
  const rivalPlayer = world.players[rivalTeam.rosterPlayerIds[0]!]!
  const environment = { world, controlledTeamId: ownTeam.id }

  it('is one stable product catalog with unique ordered Player roots', () => {
    expect(PLAYER_ACTIONS).toHaveLength(20)
    expect(PLAYER_ACTIONS.map((action) => String(action.id))).toEqual(['player.talk', 'player.assign', 'player.instruct', 'player.substitute', 'player.limit', 'player.rest', 'player.assess', 'player.send', 'player.recall', 'player.negotiate', 'player.offer', 'player.release', 'player.trade', 'player.scout', 'player.follow', 'player.compare', 'player.delegate', 'player.tag', 'player.note', 'player.recruit'])
    expect(new Set(PLAYER_ACTIONS.map((action) => action.id)).size).toBe(PLAYER_ACTIONS.length)
    expect(PLAYER_ACTIONS.every((action) => action.semanticGroup !== undefined && action.iconKey !== undefined && action.capabilityStatus !== undefined)).toBe(true)
  })

  it('keeps the same action IDs across entities and changes only availability', () => {
    const registry = createPlayerActionRegistry()
    const own = registry.getActions(createEntityRef('player', ownPlayer.id), environment)
    const rival = registry.getActions(createEntityRef('player', rivalPlayer.id), environment)
    expect(own.map((entry) => entry.definition.id)).toEqual(rival.map((entry) => entry.definition.id))
    expect(own.map((entry) => entry.definition.order)).toEqual(rival.map((entry) => entry.definition.order))
    const ownRelease = own.find((entry) => entry.definition.id === PLAYER_ACTIONS.find((action) => action.id === 'player.release')!.id)!
    const rivalRelease = rival.find((entry) => entry.definition.id === ownRelease.definition.id)!
    expect(ownRelease.availability.kind).toBe('enabled')
    expect(rivalRelease.availability).toEqual({ kind: 'disabled', reason: 'Player is not on the controlled team' })
  })

  it('uses the generic ComposerEngine without route or screen input', () => {
    const release = PLAYER_ACTIONS.find((action) => action.id === 'player.release')!
    const state = startComposition(createEntityRef('player', ownPlayer.id), release, environment)
    expect(state.status).toBe('readyToConfirm')
    expect(confirmComposition(state).status).toBe('completed')
  })
})
