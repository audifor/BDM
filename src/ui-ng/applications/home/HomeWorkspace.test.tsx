// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { HomeWorkspace } from '@/ui-ng/applications/home/HomeWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=home')
  useGameStore.getState().resetGame()
})

describe('HomeWorkspace', () => {
  it('shows an empty career state without a world', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <HomeWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByText('No career loaded.')).toBeInTheDocument()
  })

  it('renders canonical continue and next-match facts from the live world', () => {
    const world = createNewGame()
    useGameStore.getState().replaceWorld(world)
    const team = getUserTeam(world)!
    render(
      <NgWorkspaceNavigationProvider>
        <HomeWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByText(team.name)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })
})
