// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { advanceGameDay, createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { StaffWorkspace } from '@/ui-ng/applications/staff/StaffWorkspace'
import { STAFF_PROFESSIONAL_ATTRIBUTE_LABELS, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=staff')
  useGameStore.getState().resetGame()
})

function mountStaffWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <StaffWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

describe('StaffWorkspace', () => {
  it('shows an empty state when no world is loaded', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <StaffWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Staff' })).toBeInTheDocument()
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('renders canonical team staff identities, roles and professional attributes', () => {
    const { team, world } = mountStaffWorkspace()
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === team.id)!
    const person = world.staffPeopleById[assignment.staffPersonId]!

    expect(
      screen.getByText((_, element) => element?.classList.contains('staff-workspace-header__team') === true && element.textContent === team.name),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${person.identity.firstName} ${person.identity.lastName}` })).toBeInTheDocument()
    expect(screen.getAllByText(STAFF_ROLE_LABELS.assistantCoach).length).toBeGreaterThan(0)
    expect(screen.getAllByText(STAFF_ROLE_LABELS.regionalScout).length).toBeGreaterThan(0)
    expect(screen.getAllByText(STAFF_ROLE_LABELS.physiotherapist).length).toBeGreaterThan(0)
    expect(screen.getByText('Role evaluation')).toBeInTheDocument()
    for (const key of STAFF_PROFESSIONAL_ATTRIBUTE_KEYS) {
      expect(screen.getByText(STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key])).toBeInTheDocument()
    }
  })

  it('opens responsibilities from the canonical workspace tabs', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Responsibilities' }))
    expect(screen.getAllByText('Responsibility').length).toBeGreaterThan(0)
    expect(screen.getByText('Control mode')).toBeInTheDocument()
  })

  it('opens dynamics people from the canonical workspace tabs', () => {
    mountStaffWorkspace()
    fireEvent.click(screen.getByRole('button', { name: /^Dynamics/ }))
    expect(screen.getByRole('button', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Conflicts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Career' })).toBeInTheDocument()
  })

  it('renders dynamics states as red-to-green tone dots instead of band text', () => {
    mountStaffWorkspace(advanceGameDay(createNewGame()))
    fireEvent.click(screen.getByRole('button', { name: /^Dynamics/ }))
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
    expect(screen.queryByText('VERY SATISFIED')).not.toBeInTheDocument()
    expect(screen.queryByText('EXTREMELY SATISFIED')).not.toBeInTheDocument()
    expect(screen.queryByText('VERY DISSATISFIED')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Units' }))
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
    expect(screen.queryByText('VERY STRONG')).not.toBeInTheDocument()
    expect(screen.queryByText('VERY WEAK')).not.toBeInTheDocument()
  })

  it('opens the individual staff dossier from a staff name', () => {
    const { world, team } = mountStaffWorkspace()
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === team.id)!
    const person = world.staffPeopleById[assignment.staffPersonId]!
    fireEvent.click(screen.getByRole('button', { name: `${person.identity.firstName} ${person.identity.lastName}` }))

    expect(new URL(window.location.href).searchParams.get('staffId')).toBe(assignment.staffPersonId)
    expect(
      screen.getByRole('heading', { name: `${person.identity.firstName}${person.identity.lastName}` }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attributes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contract' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByText('Role evaluation')).toBeInTheDocument()
  })
})

