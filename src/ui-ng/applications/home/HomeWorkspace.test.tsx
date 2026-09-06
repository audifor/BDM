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

  it('renders the manager dashboard from live world data', () => {
    const world = createNewGame()
    useGameStore.getState().replaceWorld(world)
    const team = getUserTeam(world)!
    render(
      <NgWorkspaceNavigationProvider>
        <HomeWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByText(team.name, { selector: '.ng-canon-header__team' })).toBeInTheDocument()
    expect(document.querySelector('[data-ng-region="home-competition-calendar"]')).toBeInTheDocument()
    expect(screen.getByText('Próximo partido')).toBeInTheDocument()
    expect(screen.getByText('Clasificación')).toBeInTheDocument()
    expect(screen.getByText('Líderes de la liga')).toBeInTheDocument()
    expect(screen.getByText('Noticias del club')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
  })
})
