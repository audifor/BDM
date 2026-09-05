// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { TacticsWorkspace } from '@/ui-ng/applications/tactics/TacticsWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=tactics')
  useGameStore.getState().resetGame()
  useTacticalPlanStore.getState().reset()
})

function mountTacticsWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <TacticsWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

describe('TacticsWorkspace', () => {
  it('shows an empty state when no world is loaded', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <TacticsWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Tactics' })).toBeInTheDocument()
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('clones the six canonical tactics surfaces under NG chrome', () => {
    const { team } = mountTacticsWorkspace()
    expect(screen.getByText(team.name, { selector: '.tactics-workspace-header__team' })).toBeInTheDocument()
    for (const label of ['Pizarra', 'Diseñador', 'Emparejamientos', 'Rotaciones', 'Jugadas', 'Partido']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Tácticas PCB migradas')).toHaveClass('pcb-tactics--ng')
    expect(document.querySelector('.pcb-tactics__tabs')).toBeNull()
  })

  it('opens the full PCB Emparejamientos table', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Emparejamientos' }))
    expect(screen.getByRole('heading', { name: 'Matchups Defensivos' })).toBeInTheDocument()
    for (const column of ['POS', 'JUGADOR RIVAL', 'AMENAZA', 'ALTURA', 'DEFENSOR', 'PRESIÓN', 'P&R', 'DIRECCIÓN']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(column) })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Auto-matchup' })).toBeEnabled()
    expect(document.querySelector('.pcb-tactics__matchups-table')).toHaveClass('ng-precision-grid')
  })

  it('opens the rotation matrix as a Precision Grid', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))
    expect(screen.getByRole('heading', { name: 'Matriz de Rotación' })).toBeInTheDocument()
    expect(document.querySelector('.pcb-tactics__rotation-grid')).toHaveClass('ng-precision-grid')
  })

  it('opens a player dossier from a Pizarra name', () => {
    const { world, team } = mountTacticsWorkspace()
    const player = world.players[team.rosterPlayerIds[0]!]!
    fireEvent.click(screen.getByRole('button', { name: `${player.firstName} ${player.lastName}` }))
    expect(new URL(window.location.href).searchParams.get('playerId')).toBe(player.id)
  })

  it('keeps match-plan overrides on the cloned Partido surface', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))
    expect(screen.getByRole('heading', { name: 'Plan de Partido' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ritmo'), { target: { value: 'Rápido' } })
    expect(useTacticalPlanStore.getState().plan.pace).toBe(1)
  })
})
