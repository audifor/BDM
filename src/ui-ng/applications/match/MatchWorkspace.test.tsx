// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
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
  it('opens the normal live match centre with ME-NEXT canonical frames', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    const scheduledId = Object.values(useGameStore.getState().world!.games).find((game) => game.status === 'scheduled')!.id
    mountMatch()

    fireEvent.click(screen.getByRole('button', { name: 'Play match' }))

    expect(document.querySelector('[data-ng-region="match-live"]')).not.toBeNull()
    expect(document.querySelector('[data-me-engine="match-next"]')).not.toBeNull()
    expect(document.querySelector('.match-court')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Pausar partido' })).toBeInTheDocument()
    expect(useMatchViewerStore.getState().simulation).toBeNull()
    expect(useGameStore.getState().world?.games[scheduledId]?.status).toBe('scheduled')
  })

  it('runs the normal instant-result path through ME-NEXT without blocking the workspace', async () => {
    useGameStore.getState().replaceWorld(createNewGame())
    const scheduledId = Object.values(useGameStore.getState().world!.games).find((game) => game.status === 'scheduled')!.id
    mountMatch()

    fireEvent.click(screen.getByRole('button', { name: 'Instant result' }))

    expect(document.querySelector('[data-ng-region="match-live"]')).toBeNull()
    expect(await screen.findByRole('status')).toHaveTextContent('Simulando resultado ME-NEXT')
    expect(useGameStore.getState().world?.games[scheduledId]?.status).toBe('scheduled')
  })
})
