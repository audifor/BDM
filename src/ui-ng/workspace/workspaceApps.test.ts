// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import type { PlayerId } from '@/domain/ids'

import {
  navigateToPlayer,
  navigateToPlayerFromRoster,
  parseWorkspaceApp,
  parseWorkspacePlayerId,
} from '@/ui-ng/workspace/workspaceApps'

describe('workspaceApps navigation', () => {
  it('parses workspace app and player id from query params', () => {
    expect(parseWorkspaceApp('roster')).toBe('roster')
    expect(parseWorkspaceApp('invalid')).toBe('player')
    expect(parseWorkspacePlayerId('player-1')).toBe('player-1')
    expect(parseWorkspacePlayerId(null)).toBeNull()
  })

  it('navigateToPlayerFromRoster pushes player workspace URL', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=roster')
    const pushState = vi.spyOn(window.history, 'pushState')
    const playerId = 'player:abc' as PlayerId

    navigateToPlayerFromRoster(playerId)

    expect(pushState).toHaveBeenCalled()
    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('player')
    expect(url.searchParams.get('playerId')).toBe(playerId)
    expect(url.searchParams.get('playerView')).toBeNull()
  })

  it('navigateToPlayer clears app param and pushes player id', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=roster')
    const pushState = vi.spyOn(window.history, 'pushState')
    const playerId = 'player:xyz' as PlayerId

    navigateToPlayer(playerId)

    expect(pushState).toHaveBeenCalled()
    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBeNull()
    expect(url.searchParams.get('playerId')).toBe(playerId)
  })
})
