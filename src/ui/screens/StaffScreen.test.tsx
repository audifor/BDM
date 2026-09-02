// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { StaffRoleId } from '@/domain/staff'
import { setTeamResponsibility } from '@/app/staffResponsibilities'

import { StaffScreen } from './StaffScreen'
import { getTeamStaffPresentation, RESPONSIBILITY_KIND_LABELS, STAFF_ROLE_LABELS } from '@/ui/staffPresentation'

function world(): GameWorld {
  return createNewGame()
}

function userTeamId(w: GameWorld): TeamId {
  const team = getUserTeam(w)
  if (team === undefined) throw new Error('Expected a user team in the fixture world')
  return team.id
}

function staffWithRole(w: GameWorld, teamId: TeamId, role: StaffRoleId): StaffPersonId {
  const assignment = getTeamStaffAssignments(w, teamId).find((item) => item.role === role)
  if (assignment === undefined) throw new Error(`Expected an assignment with role ${role} on team ${teamId}`)
  return assignment.staffPersonId
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

  it('defaults to the STAFF tab, with staff-core grid rendered', () => {
    const w = world()
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    const tabs = document.querySelector('.staff-screen-tabs')!
    expect(tabs.querySelector('button.is-active')?.textContent).toBe('STAFF')
    expect(screen.getByRole('region', { name: 'staff-core' })).toBeTruthy()
  })

  it('opens the RESPONSIBILITIES tab and renders the staff-responsibilities grid with real responsibilities', () => {
    const w = world()
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    expect(screen.getByRole('region', { name: 'staff-responsibilities' })).toBeTruthy()
    expect(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.createTeamTrainingPlan).length).toBeGreaterThan(0)
  })

  it('shows CONTROL/HOLDER/LOAD columns in the responsibilities grid', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    const delegated = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
    render(<StaffScreen teamId={teamId} world={delegated} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    expect(screen.getByText('CONTROL')).toBeTruthy()
    expect(screen.getByText('HOLDER')).toBeTruthy()
    expect(screen.getByText('LOAD')).toBeTruthy()
    expect(screen.getAllByText('DELEGATED').length).toBeGreaterThan(0)
  })

  it('does not render an unsupported mode as a selectable control in the inspector', () => {
    const w = world()
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    fireEvent.doubleClick(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.oppositionScouting)[0]!)
    // oppositionScouting's supportedModes are userControlled/advisory/organizational — 'delegated' must never render as an option.
    const modeGroup = document.querySelector('.staff-mode-group')!
    const labels = [...modeGroup.querySelectorAll('button')].map((button) => button.textContent)
    expect(labels).not.toContain('DELEGATED')
    expect(labels).toEqual(['USER CONTROLLED', 'ADVISORY', 'ORGANIZATIONAL'])
  })

  it('delegated/advisory shows eligible Staff selector; choosing a candidate and Apply calls the callback', () => {
    const w = world()
    const teamId = userTeamId(w)
    const onSetResponsibility = vi.fn()
    render(<StaffScreen onSetResponsibility={onSetResponsibility} teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    fireEvent.doubleClick(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.createTeamTrainingPlan)[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'DELEGATED' }))
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    fireEvent.change(select, { target: { value: assistantId } })
    fireEvent.click(screen.getByRole('button', { name: 'APPLY' }))
    expect(onSetResponsibility).toHaveBeenCalledWith({ teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
  })

  it('userControlled calls the callback without a holder', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    const delegated = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
    const onSetResponsibility = vi.fn()
    render(<StaffScreen onSetResponsibility={onSetResponsibility} teamId={teamId} world={delegated} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    fireEvent.doubleClick(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.createTeamTrainingPlan)[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'USER CONTROLLED' }))
    fireEvent.click(screen.getByRole('button', { name: 'APPLY' }))
    expect(onSetResponsibility).toHaveBeenCalledWith({ teamId, kind: 'createTeamTrainingPlan', mode: 'userControlled' })
  })

  it('changing the selected Responsibility resets the draft', () => {
    const w = world()
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    fireEvent.doubleClick(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.createTeamTrainingPlan)[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'DELEGATED' }))
    fireEvent.doubleClick(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.defensiveGamePlan)[0]!)
    expect(screen.getByRole('button', { name: 'USER CONTROLLED' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows RESPONSIBILITIES HELD in Staff detail, listing only responsibilities held by that staff person', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assistantId = staffWithRole(w, teamId, 'assistantCoach')
    const delegated = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistantId })
    render(<StaffScreen initialSelectedStaffId={assistantId} teamId={teamId} world={delegated} />)
    expect(screen.getByText('RESPONSIBILITIES HELD')).toBeTruthy()
    expect(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.createTeamTrainingPlan).length).toBeGreaterThan(0)
  })

  it('a Team with no Staff can still open Responsibilities', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assignments = getTeamStaffAssignments(w, teamId)
    const remainingAssignments = Object.values(w.teamStaffAssignmentsById).filter((assignment) => !assignments.some((removed) => removed.id === assignment.id))
    const removedStaffIds = new Set(assignments.map((assignment) => assignment.staffPersonId))
    const employmentUpdates = Object.fromEntries([...removedStaffIds].map((id) => [id, { status: 'unemployed' }]))
    const remainingContracts = Object.values(w.staffContractsById).filter((contract) => !removedStaffIds.has(contract.staffId))
    const stripped = updateGameWorld(w, {
      teamStaffAssignments: remainingAssignments,
      staffEmploymentByStaffId: { ...w.staffEmploymentByStaffId, ...employmentUpdates } as never,
      staffContracts: remainingContracts,
    })
    render(<StaffScreen teamId={teamId} world={stripped} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    expect(screen.getByRole('region', { name: 'staff-responsibilities' })).toBeTruthy()
    expect(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.createTeamTrainingPlan).length).toBeGreaterThan(0)
  })

  it('is read-only-safe when no onSetResponsibility callback is provided', () => {
    const w = world()
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    fireEvent.doubleClick(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.createTeamTrainingPlan)[0]!)
    expect(screen.queryByRole('button', { name: 'APPLY' })).toBeNull()
  })

  it('treatmentRecommendation never offers DELEGATED as a control mode', () => {
    const w = world()
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    fireEvent.doubleClick(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.treatmentRecommendation)[0]!)
    const modeGroup = document.querySelector('.staff-mode-group')!
    const labels = [...modeGroup.querySelectorAll('button')].map((button) => button.textContent)
    expect(labels).not.toContain('DELEGATED')
    expect(labels).toEqual(['USER CONTROLLED', 'ADVISORY', 'ORGANIZATIONAL'])
  })

  it('treatmentRecommendation + ADVISORY shows an eligible physiotherapist; selecting them and Apply calls the callback with mode advisory', () => {
    const w = world()
    const teamId = userTeamId(w)
    const onSetResponsibility = vi.fn()
    render(<StaffScreen onSetResponsibility={onSetResponsibility} teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    fireEvent.doubleClick(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.treatmentRecommendation)[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'ADVISORY' }))
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const physiotherapistId = staffWithRole(w, teamId, 'physiotherapist')
    expect(select.querySelector(`option[value="${physiotherapistId}"]`)).toBeTruthy()
    fireEvent.change(select, { target: { value: physiotherapistId } })
    fireEvent.click(screen.getByRole('button', { name: 'APPLY' }))
    expect(onSetResponsibility).toHaveBeenCalledWith({ teamId, kind: 'treatmentRecommendation', mode: 'advisory', holderStaffId: physiotherapistId })
  })

  it('a stale/invalid draft holder (no longer a candidate) keeps APPLY disabled', () => {
    const w = world()
    const teamId = userTeamId(w)
    const physiotherapistId = staffWithRole(w, teamId, 'physiotherapist')
    // Reassign the physiotherapist to a role ineligible for treatmentRecommendation (still employed,
    // still on the Team) so the persisted holder becomes stale/invalid without violating world validation.
    const reassignedAssignments = Object.values(w.teamStaffAssignmentsById).map((assignment) =>
      assignment.staffPersonId === physiotherapistId ? { ...assignment, role: 'assistantCoach' } : assignment,
    )
    const staleWorld = updateGameWorld(w, {
      teamStaffAssignments: reassignedAssignments,
      staffEmploymentByStaffId: {
        ...w.staffEmploymentByStaffId,
        [physiotherapistId]: { ...w.staffEmploymentByStaffId[physiotherapistId], roleId: 'assistantCoach' },
      } as never,
    })
    const onSetResponsibility = vi.fn()
    render(<StaffScreen onSetResponsibility={onSetResponsibility} teamId={teamId} world={staleWorld} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    fireEvent.doubleClick(screen.getAllByText(RESPONSIBILITY_KIND_LABELS.treatmentRecommendation)[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'ADVISORY' }))
    // The reassigned physiotherapist no longer qualifies for treatmentRecommendation under any role, so no combobox renders.
    expect(screen.getByText('NO ELIGIBLE STAFF')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'APPLY' }).hasAttribute('disabled')).toBe(true)
  })
})
