// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { createPreMatchMediaOpportunity } from '@/engine/media'
import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { MatchWorkspace } from '@/ui-ng/applications/match/MatchWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(() => {
  cleanup()
  useMatchViewerStore.getState().clear()
})

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=match')
  useGameStore.getState().resetGame()
  useMatchViewerStore.getState().clear()
})

function mountMatch() {
  return render(
    <NgWorkspaceNavigationProvider>
      <MatchWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
}

describe('MatchWorkspace', () => {
  it('blocks a second match command while the shared world is advancing', () => {
    const world = createNewGame()
    useGameStore.getState().replaceWorld(world)
    const stored = useGameStore.getState().world
    useGameStore.setState({ simulationBusy: true })
    mountMatch()
    for (const name of ['Jugar partido', 'Simulación rápida', 'Avanzar un día']) expect(screen.getByRole('button', { name })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Jugar partido' }))
    expect(document.querySelector('[data-ng-region="match-live"]')).toBeNull()
    expect(useGameStore.getState().world).toBe(stored)
    useGameStore.setState({ simulationBusy: false })
  })

  it('explains a required press decision instead of silently ignoring advance day', async () => {
    const initial = createNewGame(), team = getUserTeam(initial)!
    const game = Object.values(initial.games).find(g => g.date === initial.currentDate && (g.homeTeamId === team.id || g.awayTeamId === team.id))!
    const important = updateGameWorld(initial, { games: Object.values(initial.games).map(g => g.id === game.id ? { ...g, stakes: 'final' as const } : g) })
    const world = createPreMatchMediaOpportunity(important, game.id)
    useGameStore.getState().replaceWorld(world)
    mountMatch()
    fireEvent.click(screen.getByRole('button', { name: 'Avanzar un día' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/media|pending|prensa/i)
    expect(useGameStore.getState().world?.currentDate).toBe(world.currentDate)
    expect(useGameStore.getState().world?.games[game.id]?.status).toBe('scheduled')
  })

  it('opens the normal live match centre with ME-NEXT canonical frames', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    const scheduledId = Object.values(useGameStore.getState().world!.games).find((game) => game.status === 'scheduled')!.id
    mountMatch()

    fireEvent.click(screen.getByRole('button', { name: 'Jugar partido' }))

    expect(document.querySelector('[data-ng-region="match-live"]')).not.toBeNull()
    expect(document.querySelector('[data-me-engine="match-next"]')).not.toBeNull()
    expect(document.querySelector('.match-court')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Pausar partido' })).toBeInTheDocument()
    // A watched match is not part of GameWorld, so the career controls refuse to save or load meanwhile.
    expect(useGameStore.getState().liveMatchActive).toBe(true)
    expect(useMatchViewerStore.getState().simulation).toBeNull()
    expect(useGameStore.getState().world?.games[scheduledId]?.status).toBe('scheduled')
  })

  it('runs the normal instant-result path through ME-NEXT without blocking the workspace', async () => {
    useGameStore.getState().replaceWorld(createNewGame())
    const scheduledId = Object.values(useGameStore.getState().world!.games).find((game) => game.status === 'scheduled')!.id
    mountMatch()

    fireEvent.click(screen.getByRole('button', { name: 'Simulación rápida' }))

    expect(document.querySelector('[data-ng-region="match-live"]')).toBeNull()
    // The first async frame may already have reported its current period.
    // Both messages mean that the same ME-NEXT simulation is actively running.
    expect(await screen.findByRole('status')).toHaveTextContent(/Simulando el partido/)
    expect(screen.getByRole('button', { name: 'Simulación rápida' })).toBeDisabled()
    expect(useGameStore.getState().world?.games[scheduledId]?.status).toBe('scheduled')
  })
})
