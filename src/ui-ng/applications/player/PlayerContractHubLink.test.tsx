// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { PlayerWorkspace } from '@/ui-ng/applications/player/PlayerWorkspace'
import { ContractsWorkspace } from '@/ui-ng/applications/contracts/ContractsWorkspace'
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
    fireEvent.click(screen.getByRole('button', { name: /MANAGE CONTRACT/ }))
    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('contracts')
    expect(url.searchParams.get('teamId')).toBe(team.id)
    expect(url.searchParams.get('playerId')).toBe(playerId)
  })

  it('focuses the selected player after navigating into Contracts Planning', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    useGameStore.getState().replaceWorld(world)
    window.history.replaceState({}, '',
      `/?ui=ng&app=contracts&teamId=${encodeURIComponent(team.id)}&playerId=${encodeURIComponent(playerId)}`)
    const { container } = render(<NgWorkspaceNavigationProvider><ContractsWorkspace /></NgWorkspaceNavigationProvider>)
    const focused = container.querySelector('tr[data-focused-player="true"]')
    expect(focused).not.toBeNull()
    expect(focused?.textContent).toContain(world.players[playerId]?.lastName)
  })

  it('protects rival financials, negotiations and role promises from World Truth', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const rivalPlayer = Object.values(world.players).find((player) =>
      !userTeam.rosterPlayerIds.includes(player.id) &&
      Object.values(world.contractsById).some((contract) => contract.playerId === player.id),
    )
    expect(rivalPlayer).toBeDefined()
    useGameStore.getState().replaceWorld(world)
    window.history.replaceState({}, '',
      `/?ui=ng&app=player&playerId=${encodeURIComponent(rivalPlayer!.id)}&playerView=contract`)

    render(<NgWorkspaceNavigationProvider><PlayerWorkspace /></NgWorkspaceNavigationProvider>)
    expect(screen.getByText('CONTRACT TERMS NOT VERIFIED')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /MANAGE CONTRACT/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Financial snapshot')).not.toBeInTheDocument()
    expect(screen.queryByText('Financial Schedule')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /OPEN SCOUTING REPORT/ })).toBeInTheDocument()
  })
})