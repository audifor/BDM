// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { selectUserTrainingPlan, useGameStore } from '@/stores/gameStore'
import { TrainingWorkspace } from '@/ui-ng/applications/training/TrainingWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=training')
  useGameStore.getState().resetGame()
})

function mountTrainingWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <TrainingWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

describe('TrainingWorkspace', () => {
  it('shows an empty state when no world is loaded', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <TrainingWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Training' })).toBeInTheDocument()
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('clones the five canonical training surfaces under NG chrome', () => {
    const { team } = mountTrainingWorkspace()
    expect(screen.getByText(team.name, { selector: '.training-workspace-header__team' })).toBeInTheDocument()
    for (const label of ['Equipo', 'Individual', 'Carga', 'Staff', 'Módulos']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Entrenamiento PCB migrado')).toHaveClass('pcb-training--ng')
    expect(document.querySelector('.pcb-training__subnav')).toBeNull()
  })

  it('keeps intensity writes on the cloned Equipo surface', () => {
    const { world } = mountTrainingWorkspace()
    fireEvent.change(screen.getByLabelText('Intensidad'), { target: { value: 'high' } })
    expect(selectUserTrainingPlan(useGameStore.getState().world ?? world)?.intensity).toBe('high')
  })

  it('opens the cloned Módulos catalog', () => {
    mountTrainingWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Módulos' }))
    expect(screen.getByText('Training Modules')).toBeInTheDocument()
    expect(screen.getByText('Three-Point Shooting')).toBeInTheDocument()
    expect(document.querySelector('.pcb-training__module-pills')).toBeInTheDocument()
    expect(document.querySelectorAll('.pcb-training__module-pill').length).toBeGreaterThan(1)
  })

  it('filters the module pills by category and scope', () => {
    mountTrainingWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Módulos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Táctica' }))
    expect(screen.getByText('Team Cohesion')).toBeInTheDocument()
    expect(screen.queryByText('Three-Point Shooting')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alcance Individual' }))
    expect(screen.getByText('Three-Point Shooting')).toBeInTheDocument()
    expect(screen.queryByText('Team Cohesion')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Alcance Equipo' }))
    expect(screen.getByText('Team Cohesion')).toBeInTheDocument()
    expect(screen.getByText('Three-Point Shooting')).toBeInTheDocument()
  })

  it('fills the visible week from Entrenamientos automáticos and skips match days', () => {
    const { team } = mountTrainingWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrenamientos automáticos' }))
    const sessions = Object.values(useGameStore.getState().world!.scheduledTrainingSessionsById).filter(
      (session) => session.id.startsWith(`auto:${team.id}:`),
    )
    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions.every((session) => session.scope === 'team')).toBe(true)
  })

  it('opens a player dossier from an Individual training name', () => {
    const { world, team } = mountTrainingWorkspace()
    const player = world.players[team.rosterPlayerIds[0]!]!
    fireEvent.click(screen.getByRole('button', { name: 'Individual' }))
    expect(document.querySelector('.pcb-training__personal')).toHaveClass('ng-precision-grid')
    expect(document.querySelector('.pcb-training__assign')).toBeInTheDocument()
    expect(screen.queryAllByRole('listbox')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: `${player.firstName} ${player.lastName}` }))
    expect(new URL(window.location.href).searchParams.get('playerId')).toBe(player.id)
  })
})
