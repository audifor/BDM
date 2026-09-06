// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { buildCompetitionWorkspaceModel } from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
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

  it('renders the top strip and four swappable module columns', () => {
    const world = createNewGame()
    useGameStore.getState().replaceWorld(world)
    const team = getUserTeam(world)!
    render(
      <NgWorkspaceNavigationProvider>
        <HomeWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByText(team.name, { selector: '.ng-canon-header__team' })).toBeInTheDocument()
    expect(screen.getByText('Próximo partido')).toBeInTheDocument()
    expect(screen.getByText('Dinámicas del choque')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clasificación de la liga/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Líderes estadísticos/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Objetivos/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Finanzas y sueldos/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Objetivos/i }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitemradio', { name: /Buzón/i })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Buzón/i }))
    expect(screen.getByRole('button', { name: /Buzón/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Objetivos/i })).not.toBeInTheDocument()
  })

  it('renders full standings with playoff/relegation zone cues', () => {
    const world = createNewGame()
    useGameStore.getState().replaceWorld(world)
    const model = buildCompetitionWorkspaceModel(world, undefined, getUserTeam(world)?.id)
    expect(model).not.toBeNull()
    const expectedRows = model!.standings.length
    expect(expectedRows).toBeGreaterThan(0)

    render(
      <NgWorkspaceNavigationProvider>
        <HomeWorkspace />
      </NgWorkspaceNavigationProvider>,
    )

    const standings = document.querySelector('.home-standings .home-slot-table')
    expect(standings).not.toBeNull()
    expect(standings!.querySelectorAll('li')).toHaveLength(expectedRows)
    expect(standings!.querySelectorAll('li.is-zone-playoff').length).toBe(
      Math.min(model!.standingsZoneBands.playoffThrough, expectedRows),
    )
    if (model!.standingsZoneBands.relegationFrom !== null) {
      expect(standings!.querySelectorAll('li.is-zone-relegation').length).toBeGreaterThan(0)
    }
    expect(document.querySelector('.home-standings .competition-standings__legend')).not.toBeNull()
    expect(screen.getByText('Playoff')).toBeInTheDocument()
    const head = document.querySelector('.home-standings .home-slot-table__head')
    expect(head?.textContent).toMatch(/PJ/)
    expect(head?.textContent).toMatch(/G/)
    expect(head?.textContent).toMatch(/P/)
    expect(head?.textContent).toMatch(/Dif/)
    expect(head?.textContent).toMatch(/Pts/)
    const teamLink = document.querySelector('.home-standings .home-slot-table .entity-link')
    expect(teamLink).not.toBeNull()
    fireEvent.click(teamLink!)
    expect(window.location.search).toMatch(/app=club|app=team|teamId=/)
  })
})
