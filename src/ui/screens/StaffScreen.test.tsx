// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'

import { StaffScreen } from './StaffScreen'
import { getTeamStaffPresentation, STAFF_ROLE_LABELS } from '@/ui/staffPresentation'

function world(): GameWorld {
  return createNewGame()
}

function userTeamId(w: GameWorld): TeamId {
  const team = getUserTeam(w)
  if (team === undefined) throw new Error('Expected a user team in the fixture world')
  return team.id
}

describe('StaffScreen', () => {
  afterEach(cleanup)

  it('renders the team staff list as a BDM data grid row per canonical assignment', () => {
    const w = world()
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    const items = getTeamStaffPresentation(w, teamId)
    expect(items.length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'staff-core' })).toBeTruthy()
    for (const item of items) expect(screen.getAllByText(item.name).length).toBeGreaterThan(0)
  })

  it('defaults selection to the first staff row and opens the detail panel for the initially selected staff person', () => {
    const w = world()
    const teamId = userTeamId(w)
    const items = getTeamStaffPresentation(w, teamId)
    const second = items[1] ?? items[0]!
    render(<StaffScreen initialSelectedStaffId={second.staffPersonId} teamId={teamId} world={w} />)
    expect(screen.getByText('STAFF PERSON')).toBeTruthy()
    expect(screen.getAllByText(STAFF_ROLE_LABELS[second.role]).length).toBeGreaterThan(0)
  })

  it('updates the detail panel when a different row is selected by click', () => {
    const w = world()
    const teamId = userTeamId(w)
    const items = getTeamStaffPresentation(w, teamId)
    if (items.length < 2) return
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByText(items[1]!.name))
    expect(screen.getAllByText(items[1]!.name).length).toBeGreaterThan(0)
  })

  it('preserves Entity Action row-level wiring (right-mouse-hold handlers present on the detail surface)', () => {
    const w = world()
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    const detail = document.querySelector('.staff-detail')
    expect(detail).toBeTruthy()
    // useEntityActions attaches pointer handlers used by the right-mouse-hold Entity Action composer.
    fireEvent.pointerDown(detail!, { button: 2, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(detail!, { button: 2 })
  })

  it('handles a team with no staff explicitly, without crashing', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assignments = getTeamStaffAssignments(w, teamId)
    const remainingAssignments = Object.values(w.teamStaffAssignmentsById).filter((assignment) => !assignments.some((removed) => removed.id === assignment.id))
    // Employment/assignment consistency is a canonical world invariant: removing every assignment
    // for this team must also mark those staff unemployed and drop their now-inconsistent contracts.
    const removedStaffIds = new Set(assignments.map((assignment) => assignment.staffPersonId))
    const employmentUpdates = Object.fromEntries([...removedStaffIds].map((id) => [id, { status: 'unemployed' }]))
    const remainingContracts = Object.values(w.staffContractsById).filter((contract) => !removedStaffIds.has(contract.staffId))
    const stripped = updateGameWorld(w, {
      teamStaffAssignments: remainingAssignments,
      staffEmploymentByStaffId: { ...w.staffEmploymentByStaffId, ...employmentUpdates } as never,
      staffContracts: remainingContracts,
    })
    render(<StaffScreen teamId={teamId} world={stripped} />)
    expect(screen.getByText('No staff')).toBeTruthy()
  })

  it('does not crash for a team id with no assigned team', () => {
    const w = world()
    render(<StaffScreen teamId={'not-a-real-team' as TeamId} world={w} />)
    expect(screen.getByText('No team assigned to the user coach.')).toBeTruthy()
  })
})
