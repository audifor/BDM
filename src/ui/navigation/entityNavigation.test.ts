import { beforeEach, describe, expect, it } from 'vitest'

import { competitionIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'

import { useEntityNavigationStore } from './entityNavigation'

describe('entity navigation', () => {
  beforeEach(() => useEntityNavigationStore.getState().reset())

  it('returns to the exact previous entity section', () => {
    const team = { type: 'team' as const, teamId: teamIdFromString('team-a'), section: 'squad' as const }
    useEntityNavigationStore.getState().navigate(team)
    useEntityNavigationStore.getState().navigate({ type: 'player', playerId: playerIdFromString('player-a'), section: 'overview' })
    useEntityNavigationStore.getState().back()
    expect(useEntityNavigationStore.getState().destination).toEqual(team)
  })

  it('preserves deep competition, team, player history', () => {
    const competition = { type: 'competition' as const, competitionId: competitionIdFromString('competition-a'), section: 'teams' as const }
    const team = { type: 'team' as const, teamId: teamIdFromString('team-rival'), section: 'overview' as const }
    useEntityNavigationStore.getState().navigate(competition)
    useEntityNavigationStore.getState().navigate(team)
    useEntityNavigationStore.getState().navigate({ type: 'player', playerId: playerIdFromString('player-rival'), section: 'overview' })
    useEntityNavigationStore.getState().back()
    expect(useEntityNavigationStore.getState().destination).toEqual(team)
    useEntityNavigationStore.getState().back()
    expect(useEntityNavigationStore.getState().destination).toEqual(competition)
  })
})
