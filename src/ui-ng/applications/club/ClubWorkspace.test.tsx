// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

import { ClubWorkspace } from './ClubWorkspace'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=club')
  useGameStore.getState().resetGame()
})

function mountClub() {
  const world = createNewGame()
  useGameStore.getState().replaceWorld(world)
  const view = render(<NgWorkspaceNavigationProvider><ClubWorkspace /></NgWorkspaceNavigationProvider>)
  return { world, team: getUserTeam(world)!, ...view }
}

describe('Club Courtside', () => {
  it('shows the empty state without a career', () => {
    render(<NgWorkspaceNavigationProvider><ClubWorkspace /></NgWorkspaceNavigationProvider>)
    expect(screen.getByText('No hay ninguna partida cargada.')).toBeInTheDocument()
  })

  it('renders a compact club hub based on the active world, not placeholder amounts', () => {
    const { team } = mountClub()
    const hub = document.querySelector('[data-ng-region="club-courtside"]')!
    expect(within(hub as HTMLElement).getByRole('heading', { name: team.name })).toBeInTheDocument()
    expect(hub.querySelectorAll('.cs-club__metric dd')[0]).toHaveTextContent(String(team.rosterPlayerIds.length))
    expect(within(hub as HTMLElement).getByText('DIRECCIÓN Y OBJETIVOS')).toBeInTheDocument()
    expect(within(hub as HTMLElement).getByText('CENTRO DE GESTIÓN')).toBeInTheDocument()
    expect(hub.querySelectorAll('.cs-club__metric')).toHaveLength(4)
    expect(hub.querySelectorAll('.cs-club__management-grid .cs-club__area')).toHaveLength(5)
  })

  it('navigates to canonical management applications instead of duplicating their commands', () => {
    mountClub()
    const hub = document.querySelector('[data-ng-region="club-courtside"]')! as HTMLElement
    const management = hub.querySelector('.cs-club__management-grid')! as HTMLElement
    fireEvent.click(within(management).getByRole('button', { name: /JUNTA DIRECTIVA/ }))
    expect(window.location.search).toContain('app=board')
  })

  it('presents institutional identity and the cost/cash distinction', () => {
    const { team } = mountClub()
    fireEvent.click(screen.getByRole('button', { name: 'IDENTIDAD' }))
    expect(screen.getByText('IDENTIDAD INSTITUCIONAL')).toBeInTheDocument()
    expect(screen.getByText('Año de fundación')).toBeInTheDocument()
    expect(screen.getByText('Rama')).toBeInTheDocument()
    expect(screen.getByText(team.gender === 'female' ? 'Femenina' : 'Masculina')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ÁREAS DEL CLUB' }))
    expect(screen.getByText('DATOS OPERATIVOS')).toBeInTheDocument()
    expect(screen.getByText(/no representan dinero disponible para fichajes/i)).toBeInTheDocument()
  })
})
