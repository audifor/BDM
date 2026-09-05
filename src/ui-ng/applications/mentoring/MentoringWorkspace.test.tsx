// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { MentoringWorkspace } from '@/ui-ng/applications/mentoring/MentoringWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=mentoring')
  useGameStore.getState().resetGame()
})

function mountMentoringWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <MentoringWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

describe('MentoringWorkspace', () => {
  it('shows an empty state when no world is loaded', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <MentoringWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Mentoring' })).toBeInTheDocument()
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('clones the PCB mentoring surface with the real roster', () => {
    const { team, world } = mountMentoringWorkspace()
    const roster = getTeamRoster(world, team.id)
    expect(screen.getByText(team.name, { selector: '.mentoring-workspace-header__team' })).toBeInTheDocument()
    expect(screen.getByLabelText('Mentoring PCB migrado')).toBeInTheDocument()
    expect(document.querySelector('.pcb-plantilla__mentor-table')).toHaveClass('ng-precision-grid')
    expect(screen.getByText('0 Grupos Activos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo' }))
    expect(screen.getByRole('heading', { name: 'Crear Grupo' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: `${roster[0]!.firstName} ${roster[0]!.lastName}` })).toBeInTheDocument()
    expect(screen.queryByText('Sergio De Larrea')).not.toBeInTheDocument()
  })

  it('creates and deletes a mentoring group from the cloned form', () => {
    const { team, world } = mountMentoringWorkspace()
    const roster = getTeamRoster(world, team.id)
    const mentor = roster[0]!
    const mentorName = `${mentor.firstName} ${mentor.lastName}`
    const mentee = roster.find((player) => {
      const name = `${player.firstName} ${player.lastName}`
      return player.id !== mentor.id && name !== mentorName
    })!
    const menteeName = `${mentee.firstName} ${mentee.lastName}`
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo' }))
    fireEvent.change(screen.getByLabelText('Mentor'), { target: { value: mentor.id } })
    fireEvent.click(screen.getAllByRole('button', { name: menteeName })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Crear Grupo' }))
    expect(screen.getByText('1 Grupos Activos')).toBeInTheDocument()
    expect(screen.getByText(mentorName)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByText('0 Grupos Activos')).toBeInTheDocument()
  })

  it('opens a player dossier from a mentoring group name', () => {
    const { team, world } = mountMentoringWorkspace()
    const roster = getTeamRoster(world, team.id)
    const mentor = roster[0]!
    const mentee = roster[1]!
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo' }))
    fireEvent.change(screen.getByLabelText('Mentor'), { target: { value: mentor.id } })
    fireEvent.click(screen.getAllByRole('button', { name: `${mentee.firstName} ${mentee.lastName}` })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Crear Grupo' }))
    fireEvent.click(screen.getByRole('button', { name: `${mentor.firstName} ${mentor.lastName}` }))
    expect(new URL(window.location.href).searchParams.get('playerId')).toBe(mentor.id)
  })
})
