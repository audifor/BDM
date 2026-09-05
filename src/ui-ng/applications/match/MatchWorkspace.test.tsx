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
  it('opens the live MatchEngine centre instead of instantly resolving the fixture', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    const scheduledId = Object.values(useGameStore.getState().world!.games).find((game) => game.status === 'scheduled')!.id
    mountMatch()

    fireEvent.click(screen.getByRole('button', { name: 'Play match' }))

    expect(document.querySelector('[data-ng-region="match-live"]')).not.toBeNull()
    expect(document.querySelector('.match-court')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Pausar partido' })).toBeInTheDocument()
    expect(useGameStore.getState().world?.games[scheduledId]?.status).toBe('scheduled')
  })

  it('keeps instant result as a world completion without opening the viewer', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    const scheduledId = Object.values(useGameStore.getState().world!.games).find((game) => game.status === 'scheduled')!.id
    mountMatch()

    fireEvent.click(screen.getByRole('button', { name: 'Instant result' }))

    expect(document.querySelector('[data-ng-region="match-live"]')).toBeNull()
    expect(useGameStore.getState().world?.games[scheduledId]?.status).toBe('completed')
  })
})
