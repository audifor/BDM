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
    expect(screen.getByRole('region', { name: /Player contract status|No recorded agreement/ })).toBeInTheDocument()
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

  it('shows authorized market observation without consulting rival hidden terms', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const outsider = Object.values(world.players).find(player => !userTeam.rosterPlayerIds.includes(player.id))!
    const knowledge = {
      organizationId: userTeam.organizationId,
      playerId: outsider.id,
      availability: 'LISTENING' as const,
      playerInterest: 61,
      confidence: 74,
      assessedAt: world.currentDate,
      source: 'AGENT' as const,
    }
    useGameStore.getState().replaceWorld({
      ...world,
      marketKnowledge: [...world.marketKnowledge, knowledge],
    })
    window.history.replaceState({}, '',
      `/?ui=ng&app=player&playerId=${encodeURIComponent(outsider.id)}&playerView=contract`)
    render(<NgWorkspaceNavigationProvider><PlayerWorkspace /></NgWorkspaceNavigationProvider>)
    expect(screen.getByText('MAY LISTEN')).toBeInTheDocument()
    expect(screen.getByText('AGENT SOURCE')).toBeInTheDocument()
    expect(screen.getByText('MIXED SIGNAL')).toBeInTheDocument()
    expect(screen.getByText('74%')).toBeInTheDocument()
    expect(screen.queryByText('Financial Schedule')).not.toBeInTheDocument()
    expect(screen.queryByText('Contract Detail')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /DIRECT CONTACT/ }))
    expect(screen.getByText(/A personal relationship may help/)).toBeInTheDocument()
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
    expect(screen.getByRole('region', { name: 'Authorized market intelligence' })).toBeInTheDocument()
    expect(screen.getByText('CHOOSE A CONTACT ROUTE')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /MANAGE CONTRACT/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Financial snapshot')).not.toBeInTheDocument()
    expect(screen.queryByText('Financial Schedule')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /OPEN SCOUTING REPORT/ })).toBeInTheDocument()
    expect(screen.getByText('NOT VERIFIED')).toBeInTheDocument()
    expect(screen.queryByText(/Northline Sports|Vertex Sports|Pioneer Sports|Crown Sports/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Financial snapshot/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /AGENT CHANNEL/ }))
    expect(screen.getByText('Intermediary approach')).toBeInTheDocument()
    expect(screen.getByText(/FUTURE RPG ACTION/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /CONTACT AGENT NOW/ })).not.toBeInTheDocument()
  })
})