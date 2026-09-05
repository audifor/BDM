// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import type { PlayerId, StaffPersonId, TeamId } from '@/domain/ids'

import {
  navigateToPlayer,
  navigateToPlayerFromRoster,
  navigateToPlayerMedical,
  navigateToStaff,
  navigateToTeamInNg,
  parseWorkspaceApp,
  parseWorkspacePlayerId,
  parseWorkspaceStaffId,
  parseWorkspaceTeamId,
} from '@/ui-ng/workspace/workspaceApps'

describe('workspaceApps navigation', () => {
  it('parses workspace app and player id from query params', () => {
    expect(parseWorkspaceApp('roster')).toBe('roster')
    expect(parseWorkspaceApp('staff')).toBe('staff')
    expect(parseWorkspaceApp('medical')).toBe('medical')
    expect(parseWorkspaceApp('recruiting')).toBe('recruiting')
    expect(parseWorkspaceApp('schedule')).toBe('schedule')
    expect(parseWorkspaceApp('invalid')).toBe('home')
    expect(parseWorkspaceApp(null)).toBe('home')
    expect(parseWorkspacePlayerId('player-1')).toBe('player-1')
    expect(parseWorkspacePlayerId(null)).toBeNull()
    expect(parseWorkspaceStaffId('staff-1')).toBe('staff-1')
    expect(parseWorkspaceStaffId(null)).toBeNull()
    expect(parseWorkspaceTeamId('team:leyma')).toBe('team:leyma')
    expect(parseWorkspaceTeamId(null)).toBeNull()
  })

  it('navigateToStaff opens the staff dossier URL', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=staff')
    const pushState = vi.spyOn(window.history, 'pushState')
    const staffId = 'staff:abc' as StaffPersonId

    navigateToStaff(staffId)

    expect(pushState).toHaveBeenCalled()
    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('staff')
    expect(url.searchParams.get('staffId')).toBe(staffId)
    expect(url.searchParams.get('staffView')).toBeNull()
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

  it('navigateToPlayer explicitly opens the player app and pushes player id', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=roster')
    const pushState = vi.spyOn(window.history, 'pushState')
    const playerId = 'player:xyz' as PlayerId

    navigateToPlayer(playerId)

    expect(pushState).toHaveBeenCalled()
    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('player')
    expect(url.searchParams.get('playerId')).toBe(playerId)
  })

  it('navigateToPlayerMedical opens the player medical view', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=medical')
    const pushState = vi.spyOn(window.history, 'pushState')
    const playerId = 'player:med' as PlayerId

    navigateToPlayerMedical(playerId)

    expect(pushState).toHaveBeenCalled()
    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('player')
    expect(url.searchParams.get('playerId')).toBe(playerId)
    expect(url.searchParams.get('playerView')).toBe('medical')
  })

  it('navigateToTeamInNg opens the profile of the clicked club', () => {
    window.history.replaceState({}, '', '/?ui=ng&playerId=player-1')
    const pushState = vi.spyOn(window.history, 'pushState')
    const teamId = 'team:leyma' as TeamId

    navigateToTeamInNg({ type: 'team', teamId, section: 'overview' })

    expect(pushState).toHaveBeenCalled()
    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('club')
    expect(url.searchParams.get('teamId')).toBe(teamId)
    expect(url.searchParams.get('playerId')).toBeNull()
    expect(url.searchParams.get('playerView')).toBeNull()
  })

  it('navigateToTeamInNg opens that team roster for squad', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=club')
    const teamId = 'team:leyma' as TeamId

    navigateToTeamInNg({ type: 'team', teamId, section: 'squad' })

    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('roster')
    expect(url.searchParams.get('teamId')).toBe(teamId)
  })
})
