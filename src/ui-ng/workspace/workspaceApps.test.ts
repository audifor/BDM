// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import type { PlayerId, StaffPersonId, TeamId } from '@/domain/ids'

import {
  navigateToPlayer,
  navigateToPlayerFromRoster,
  navigateToPlayerMedical,
  navigateToRecruitingPlayer,
  navigateToTalentApp,
  navigateToTalentDestination,
  navigateToStaff,
  navigateToTeamInNg,
  parseWorkspaceApp,
  parseWorkspacePlayerId,
  parseWorkspaceStaffId,
  parseWorkspaceTeamId,
  readNgWorkspaceNavigation,
  syncWorkspaceAppQuery,
} from '@/ui-ng/workspace/workspaceApps'

describe('workspaceApps navigation', () => {
  it('deep links an attention action to the same Player and relevant view', () => {
    const playerId = 'player:bs15h-route' as PlayerId
    window.history.replaceState({}, '', '/?ui=ng&app=talent')
    navigateToTalentDestination({ app: 'player', playerId, playerView: 'scouting' })
    let params = new URL(window.location.href).searchParams
    expect(params.get('app')).toBe('player')
    expect(params.get('playerId')).toBe(playerId)
    expect(params.get('playerView')).toBe('scouting')

    navigateToTalentDestination({ app: 'recruiting', playerId, focusPlayerId: playerId })
    params = new URL(window.location.href).searchParams
    expect(params.get('app')).toBe('recruiting')
    expect(params.get('playerId')).toBe(playerId)
    expect(params.get('focusPlayerId')).toBe(playerId)

    navigateToTalentDestination({ app: 'portal', playerId, focusPlayerId: playerId })
    params = new URL(window.location.href).searchParams
    expect(params.get('app')).toBe('portal')
    expect(params.get('playerId')).toBe(playerId)
    expect(params.get('focusPlayerId')).toBe(playerId)

    navigateToTalentDestination({ app: 'draft', playerId, focusPlayerId: playerId })
    params = new URL(window.location.href).searchParams
    expect(params.get('app')).toBe('draft')
    expect(params.get('playerId')).toBe(playerId)
    expect(params.get('focusPlayerId')).toBe(playerId)

    navigateToTalentApp('draft', playerId)
    params = new URL(window.location.href).searchParams
    expect(params.get('playerId')).toBe(playerId)
    expect(params.get('focusPlayerId')).toBe(playerId)
  })

  it('parses workspace app and player id from query params', () => {
    expect(parseWorkspaceApp('roster')).toBe('roster')
    expect(parseWorkspaceApp('staff')).toBe('staff')
    expect(parseWorkspaceApp('medical')).toBe('medical')
    expect(parseWorkspaceApp('recruiting')).toBe('recruiting')
    expect(parseWorkspaceApp('talent')).toBe('talent')
    expect(parseWorkspaceApp('portal')).toBe('portal')
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

  it('routes talent navigation to a connected workspace', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=scouting')
    const pushState = vi.spyOn(window.history, 'pushState')

    navigateToTalentApp('portal')

    expect(pushState).toHaveBeenCalled()
    expect(new URL(window.location.href).searchParams.get('app')).toBe('portal')
  })

  it('deep-links an authorized Portal Player into their Recruiting profile', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=portal')
    navigateToRecruitingPlayer('player:portal' as PlayerId)

    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('recruiting')
    expect(url.searchParams.get('focusPlayerId')).toBe('player:portal')
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

  // MX0.5: a resolver carries the canonical entity a workspace must select (the trade negotiation being answered).
  it('carries and clears the negotiation context of a resolver', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=home')

    syncWorkspaceAppQuery('trades', 'replace', { negotiationId: 'trade-negotiation:a:b' })

    expect(new URL(window.location.href).searchParams.get('app')).toBe('trades')
    expect(new URL(window.location.href).searchParams.get('negotiationId')).toBe('trade-negotiation:a:b')
    expect(readNgWorkspaceNavigation().negotiationId).toBe('trade-negotiation:a:b')

    // Any later navigation without context drops it, so a stale negotiation can never leak into another workspace.
    syncWorkspaceAppQuery('contracts')
    expect(new URL(window.location.href).searchParams.get('negotiationId')).toBeNull()
    expect(readNgWorkspaceNavigation().negotiationId).toBeNull()
  })

  // MX0.7: a governance breakpoint carries the exact decision/request the Board workspace must select.
  it('carries and clears the governance context of a resolver', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=home')

    syncWorkspaceAppQuery('board', 'replace', { decisionId: 'governance:PLAYER_CONTRACT_SIGNING:inst:neg', requestId: 'request:operating-plan' })

    expect(new URL(window.location.href).searchParams.get('app')).toBe('board')
    expect(readNgWorkspaceNavigation()).toMatchObject({ decisionId: 'governance:PLAYER_CONTRACT_SIGNING:inst:neg', requestId: 'request:operating-plan' })

    // A plain navigation must never leak a stale governance matter into another workspace.
    syncWorkspaceAppQuery('home')
    expect(new URL(window.location.href).searchParams.get('decisionId')).toBeNull()
    expect(new URL(window.location.href).searchParams.get('requestId')).toBeNull()
    expect(readNgWorkspaceNavigation()).toMatchObject({ decisionId: null, requestId: null })

    // An empty context is ignored rather than written as an empty parameter.
    syncWorkspaceAppQuery('board', 'replace', { decisionId: '' })
    expect(new URL(window.location.href).searchParams.get('decisionId')).toBeNull()
  })
})
