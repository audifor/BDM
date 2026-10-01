// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { PlayerWorkspace } from '@/ui-ng/applications/player/PlayerWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

describe('Player contract integration', () => {
  it('shows a concise contract summary and routes own-club players to Contracts / Planning', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    useGameStore.getState().replaceWorld(world)
    window.history.replaceState({}, '', `/?ui=ng&app=player&playerId=${encodeURIComponent(playerId)}&playerView=contract`)

    render(<NgWorkspaceNavigationProvider><PlayerWorkspace /></NgWorkspaceNavigationProvider>)
    expect(screen.getByRole('region', { name: 'Player contract status' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Contracts / Planning' }))
    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('contracts')
    expect(url.searchParams.get('teamId')).toBe(team.id)
    expect(url.searchParams.get('playerId')).toBe(playerId)
  })
})
