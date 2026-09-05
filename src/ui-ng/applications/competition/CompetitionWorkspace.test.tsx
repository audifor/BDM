// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame, instantResult } from '@/app/game'
import { useGameStore } from '@/stores/gameStore'
import { CompetitionWorkspace } from '@/ui-ng/applications/competition/CompetitionWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=competition')
  useGameStore.getState().resetGame()
})

describe('CompetitionWorkspace', () => {
  it('opens on the month calendar and keeps the other competition views', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    render(
      <NgWorkspaceNavigationProvider>
        <CompetitionWorkspace />
      </NgWorkspaceNavigationProvider>,
    )

    expect(screen.getByRole('button', { name: 'Calendario' })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelector('[data-ng-region="competition-calendar"]')).not.toBeNull()
    expect(document.querySelector('.competition-calendar__month')?.textContent).toMatch(/\d{4}/)
    expect(screen.getByText('Mis partidos')).toBeInTheDocument()
    expect(screen.getByText('Hitos')).toBeInTheDocument()
    expect(screen.getByText('Entrenamiento')).toBeInTheDocument()
    expect(screen.getByLabelText('Filtro de calendario')).toHaveValue('mine')

    fireEvent.click(screen.getByRole('button', { name: 'Clasificación' }))
    expect(screen.getByRole('columnheader', { name: /Pct/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Próximos' }))
    expect(screen.queryByText('No hay partidos pendientes.')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Local/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Visitante/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }))
    expect(screen.getByText('Aún no hay resultados en esta temporada.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Estadísticas' }))
    expect(screen.getByText('No hay estadísticas de partido en esta temporada.')).toBeInTheDocument()
  })

  it('shows top-3 leader cards above the statistics table after a completed match', () => {
    useGameStore.getState().replaceWorld(instantResult(createNewGame()))
    render(
      <NgWorkspaceNavigationProvider>
        <CompetitionWorkspace />
      </NgWorkspaceNavigationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Estadísticas' }))
    expect(screen.getByText('Puntos')).toBeInTheDocument()
    expect(screen.getByText('Rebotes')).toBeInTheDocument()
    expect(screen.getByText('Asistencias')).toBeInTheDocument()
    expect(screen.getByText('Valoración')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /PPG/ })).toBeInTheDocument()
  })
})
