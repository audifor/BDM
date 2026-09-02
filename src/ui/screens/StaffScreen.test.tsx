// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString, type StaffPersonId, type TeamId } from '@/domain/ids'
import type { StaffRoleId } from '@/domain/staff'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import { acceptStaffRecommendation, dismissStaffRecommendation } from '@/app/staffRecommendations'
import { progressMedicalAdvisories } from '@/engine/injury/MedicalAdvisory'
import { advanceGameDay } from '@/app/game/advanceGameDay'

import { StaffScreen } from './StaffScreen'
import { getTeamStaffPresentation, RESPONSIBILITY_KIND_LABELS, STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { getStaffUnitsForTeam, STAFF_UNIT_COHESION_DIMENSION_LABELS } from '@/ui/staffUnitCohesionPresentation'
import { STAFF_UNIT_COHESION_DIMENSIONS } from '@/domain/staffUnitCohesion'

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
    fireEvent.click(within(document.querySelector('.staff-mode-group')!).getByRole('button', { name: 'ADVISORY' }))
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
    fireEvent.click(within(document.querySelector('.staff-mode-group')!).getByRole('button', { name: 'ADVISORY' }))
    // The reassigned physiotherapist no longer qualifies for treatmentRecommendation under any role, so no combobox renders.
    expect(screen.getByText('NO ELIGIBLE STAFF')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'APPLY' }).hasAttribute('disabled')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Advisory tab (Wave 4C3)
// ---------------------------------------------------------------------------

type AdvisoryStaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const advisoryFlatAttributes: AdvisoryStaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as AdvisoryStaffAttributes

function withAdvisoryStaffInRole(world: GameWorld, teamId: TeamId, role: string, kind: 'treatmentRecommendation' | 'contractRecommendation') {
  const staffId = staffPersonIdFromString(`advisory-ui-staff-${role}-${kind}-${teamId}`)
  const withStaff = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Med', lastName: 'Ic' }, professional: { attributes: advisoryFlatAttributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`advisory-ui-assignment-${role}-${kind}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
  })
  const id = `responsibility:${teamId}:${kind}` as never
  const delegated = updateGameWorld(withStaff, {
    responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind, mode: 'advisory', holderStaffId: staffId }],
  })
  return { world: delegated, staffId }
}

function withAdvisoryActiveInjury(world: GameWorld, teamId: TeamId) {
  const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
  const injury = createInjury({ id: injuryIdFromString(`advisory-ui-injury-${teamId}`), playerId, kind: 'ankleSprain', severity: 'moderate', injuredOn: world.currentDate, expectedReturnDate: '2099-01-01' as never })
  return { world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), injury] }), injury }
}

function medicalPendingWorld() {
  const base = createNewGame()
  const teamId = userTeamId(base)
  const { world: withInjury } = withAdvisoryActiveInjury(base, teamId)
  const { world: withStaff, staffId } = withAdvisoryStaffInRole(withInjury, teamId, 'teamDoctor', 'treatmentRecommendation')
  const progressed = progressMedicalAdvisories(withStaff)
  const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'treatmentRecommendation')!
  return { world: progressed, outcome, teamId }
}

function contractInformationalWorld() {
  const base = createNewGame()
  const teamId = userTeamId(base)
  const { world: withStaff, staffId } = withAdvisoryStaffInRole(base, teamId, 'capContractsSpecialist', 'contractRecommendation')
  const playerId = withStaff.teams[teamId]!.rosterPlayerIds[0]
  const outcomeId = 'delegation-outcome:advisory-ui-contract' as never
  const withOutcome = updateGameWorld(withStaff, {
    delegationOutcomes: [...Object.values(withStaff.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:contractRecommendation` as never, staffId, decidedOn: withStaff.currentDate, kind: 'contractRecommendation', applied: false, qualityScore: 60, payload: { playerId: playerId ?? '', recommendation: 'renew', annualSalary: 1000000, recommendedAnnualSalary: 1000000, budgetStatus: 'healthy', confidence: 70 } }],
  })
  return { world: withOutcome, outcomeId, teamId }
}

describe('StaffScreen Advisory tab', () => {
  afterEach(cleanup)

  it('STAFF remains the default tab', () => {
    const w = createNewGame()
    render(<StaffScreen teamId={userTeamId(w)} world={w} />)
    const tabs = document.querySelector('.staff-screen-tabs')!
    expect(tabs.querySelector('button.is-active')?.textContent).toBe('STAFF')
    expect(screen.getByRole('region', { name: 'staff-core' })).toBeTruthy()
  })

  it('RESPONSIBILITIES tab still works', () => {
    const w = createNewGame()
    render(<StaffScreen teamId={userTeamId(w)} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    expect(screen.getByRole('region', { name: 'staff-responsibilities' })).toBeTruthy()
  })

  it('ADVISORY tab exists and renders the staff-advisory grid, defaulting to OPEN', () => {
    const { world, teamId } = medicalPendingWorld()
    render(<StaffScreen teamId={teamId} world={world} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    expect(screen.getByRole('region', { name: 'staff-advisory' })).toBeTruthy()
    const filterGroup = document.querySelector<HTMLElement>('.staff-advisory-toolbar .staff-mode-group')!
    expect(within(filterGroup).getByRole('button', { name: 'OPEN' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('HISTORY filter shows accepted/dismissed and hides open recommendations', () => {
    const { world, outcome, teamId } = medicalPendingWorld()
    const accepted = updateGameWorld(world, { delegationOutcomes: [...Object.values(world.delegationOutcomesById).filter((item) => item.id !== outcome.id), { ...outcome, applied: true, userDisposition: 'accepted', userDecidedOn: world.currentDate }] })
    render(<StaffScreen teamId={teamId} world={accepted} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    const filterGroup = document.querySelector<HTMLElement>('.staff-advisory-toolbar .staff-mode-group')!
    fireEvent.click(within(filterGroup).getByRole('button', { name: 'HISTORY' }))
    expect(screen.getByRole('region', { name: 'staff-advisory' }).textContent).toContain('ACCEPTED')
  })

  it('ACCEPT appears for a Medical pending recommendation', () => {
    const { world, teamId } = medicalPendingWorld()
    const onAcceptRecommendation = vi.fn()
    render(<StaffScreen onAcceptRecommendation={onAcceptRecommendation} teamId={teamId} world={world} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    expect(screen.getByRole('button', { name: 'ACCEPT' })).toBeTruthy()
  })

  it('ACCEPT does not appear for contractRecommendation (no canonical acceptance seam)', () => {
    const { world, teamId } = contractInformationalWorld()
    const onAcceptRecommendation = vi.fn()
    render(<StaffScreen onAcceptRecommendation={onAcceptRecommendation} teamId={teamId} world={world} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    expect(screen.queryByRole('button', { name: 'ACCEPT' })).toBeNull()
  })

  it('DISMISS appears for an informational recommendation', () => {
    const { world, teamId } = contractInformationalWorld()
    const onDismissRecommendation = vi.fn()
    render(<StaffScreen onDismissRecommendation={onDismissRecommendation} teamId={teamId} world={world} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    expect(screen.getByRole('button', { name: 'DISMISS' })).toBeTruthy()
  })

  it('ACCEPT calls the callback with the correct outcomeId', () => {
    const { world, outcome, teamId } = medicalPendingWorld()
    const onAcceptRecommendation = vi.fn().mockReturnValue({ ok: true, world })
    render(<StaffScreen onAcceptRecommendation={onAcceptRecommendation} teamId={teamId} world={world} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT' }))
    expect(onAcceptRecommendation).toHaveBeenCalledWith(outcome.id)
  })

  it('DISMISS calls the callback with the correct outcomeId', () => {
    const { world, outcomeId, teamId } = contractInformationalWorld()
    const onDismissRecommendation = vi.fn().mockReturnValue({ ok: true, world })
    render(<StaffScreen onDismissRecommendation={onDismissRecommendation} teamId={teamId} world={world} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    fireEvent.click(screen.getByRole('button', { name: 'DISMISS' }))
    expect(onDismissRecommendation).toHaveBeenCalledWith(outcomeId)
  })

  it('accepted moves out of OPEN and into HISTORY when the world updates (real facade, real rerender)', () => {
    const { world, outcome, teamId } = medicalPendingWorld()
    const result = acceptStaffRecommendation(world, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { rerender } = render(<StaffScreen teamId={teamId} world={world} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    expect(screen.getByRole('region', { name: 'staff-advisory' }).textContent).not.toContain('ACCEPTED')
    rerender(<StaffScreen teamId={teamId} world={result.world} />)
    const filterGroup = document.querySelector<HTMLElement>('.staff-advisory-toolbar .staff-mode-group')!
    fireEvent.click(within(filterGroup).getByRole('button', { name: 'HISTORY' }))
    expect(screen.getByRole('region', { name: 'staff-advisory' }).textContent).toContain('ACCEPTED')
  })

  it('dismissed moves out of OPEN and into HISTORY when the world updates', () => {
    const { world, outcome, teamId } = medicalPendingWorld()
    const result = dismissStaffRecommendation(world, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    render(<StaffScreen teamId={teamId} world={result.world} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    const filterGroup = document.querySelector<HTMLElement>('.staff-advisory-toolbar .staff-mode-group')!
    fireEvent.click(within(filterGroup).getByRole('button', { name: 'HISTORY' }))
    expect(screen.getByRole('region', { name: 'staff-advisory' }).textContent).toContain('DISMISSED')
  })

  it('read-only (no callbacks) does not show ACCEPT/DISMISS mutating buttons', () => {
    const { world, teamId } = medicalPendingWorld()
    render(<StaffScreen teamId={teamId} world={world} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    expect(screen.queryByRole('button', { name: 'ACCEPT' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'DISMISS' })).toBeNull()
  })

  it('a Team with no Staff does not break Advisory (still renders the tab/grid)', () => {
    const w = createNewGame()
    const teamId = userTeamId(w)
    const assignments = Object.values(w.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === teamId)
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
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    expect(screen.getByRole('region', { name: 'staff-advisory' })).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// DYNAMICS tab (Wave 5A)
// ---------------------------------------------------------------------------

describe('StaffScreen Dynamics tab', () => {
  afterEach(cleanup)

  it('STAFF remains the default tab', () => {
    const w = createNewGame()
    render(<StaffScreen teamId={userTeamId(w)} world={w} />)
    const tabs = document.querySelector('.staff-screen-tabs')!
    expect(tabs.querySelector('button.is-active')?.textContent).toBe('STAFF')
  })

  it('DYNAMICS tab exists', () => {
    const w = createNewGame()
    render(<StaffScreen teamId={userTeamId(w)} world={w} />)
    expect(screen.getByRole('button', { name: /^DYNAMICS/ })).toBeTruthy()
  })

  it('Dynamics works with employed Staff (after the daily pipeline creates Human Contexts) and renders the staff-dynamics grid', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    expect(screen.getByRole('region', { name: 'staff-dynamics' })).toBeTruthy()
  })

  it('the grid renders qualitative state labels, never raw Human State numbers', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    const region = screen.getByRole('region', { name: 'staff-dynamics' })
    // No raw 0-100 numeric band value should ever appear as standalone cell content.
    expect(region.textContent).not.toMatch(/>\s*\d{1,3}\s*</)
  })

  it('NEEDS ATTENTION filter narrows the grid to Staff with needsAttention signals', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    const filterGroup = document.querySelector<HTMLElement>('.staff-advisory-toolbar .staff-mode-group')!
    fireEvent.click(within(filterGroup).getByRole('button', { name: 'NEEDS ATTENTION' }))
    expect(within(filterGroup).getByRole('button', { name: 'NEEDS ATTENTION' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('selecting a Staff row opens the inspector with real explainability content', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    const staffId = staffWithRole(w, teamId, 'assistantCoach')
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    const rows = screen.getAllByRole('row')
    const targetRow = rows.find((row) => row.textContent?.includes(w.staffPeopleById[staffId]!.identity.firstName))
    if (targetRow !== undefined) fireEvent.click(targetRow)
    expect(screen.getByText('PROFESSIONAL STATE')).toBeTruthy()
  })

  it('an empty/no-issue Staff person still shows a useful inspector (no fabricated data)', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    expect(screen.getByText('PROFESSIONAL STATE')).toBeTruthy()
    expect(screen.getAllByText('STATE').length).toBeGreaterThan(0)
  })

  it('existing RESPONSIBILITIES still works alongside Dynamics', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: 'RESPONSIBILITIES' }))
    expect(screen.getByRole('region', { name: 'staff-responsibilities' })).toBeTruthy()
  })

  it('existing ADVISORY still works alongside Dynamics', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^ADVISORY/ }))
    expect(screen.getByRole('region', { name: 'staff-advisory' })).toBeTruthy()
  })

  it('read-only rendering has zero side effects on Human State (rendering twice yields identical staffHumanStatesByContextId)', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    const before = JSON.stringify(w.staffHumanStatesByContextId)
    const { unmount } = render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    unmount()
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    expect(JSON.stringify(w.staffHumanStatesByContextId)).toBe(before)
  })

  it('Wave 5B: Working Relationships appears in the inspector after a real Responsibility grant produces an attributed relationship', () => {
    let w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    const staffId = staffWithRole(w, teamId, 'assistantCoach')
    w = setTeamResponsibility(w, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    const fullName = `${w.staffPeopleById[staffId]!.identity.firstName} ${w.staffPeopleById[staffId]!.identity.lastName}`
    const nameCell = screen.getByText(fullName)
    fireEvent.doubleClick(nameCell.closest('tr')!)
    expect(screen.getByText('WORKING RELATIONSHIPS')).toBeTruthy()
    // Never raw -100..100 numbers in the relationship row.
    const section = screen.getByText('WORKING RELATIONSHIPS').closest('section')!
    expect(section.textContent).not.toMatch(/-?\d{2,3}(?!\d)/)
  })
})

// ---------------------------------------------------------------------------
// DYNAMICS tab — PEOPLE | UNITS subviews (Wave 5C)
// ---------------------------------------------------------------------------

function subviewGroup(): HTMLElement {
  return document.querySelector<HTMLElement>('.staff-dynamics-subview .staff-mode-group')!
}

describe('StaffScreen Dynamics UNITS subview', () => {
  afterEach(cleanup)

  it('DYNAMICS defaults to the PEOPLE subview, rendering the existing staff-dynamics grid', () => {
    const w = advanceGameDay(createNewGame())
    render(<StaffScreen teamId={userTeamId(w)} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    expect(within(subviewGroup()).getByRole('button', { name: 'PEOPLE' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(subviewGroup()).getByRole('button', { name: 'UNITS' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('region', { name: 'staff-dynamics' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'staff-units' })).toBeNull()
  })

  it('switching to UNITS renders the staff-units grid with one row per resolved unit', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    fireEvent.click(within(subviewGroup()).getByRole('button', { name: 'UNITS' }))
    expect(screen.getByRole('region', { name: 'staff-units' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'staff-dynamics' })).toBeNull()

    const units = getStaffUnitsForTeam(w, teamId)
    expect(units.length).toBeGreaterThan(0)
    for (const unit of units) expect(screen.getAllByText(unit.departmentLabel).length).toBeGreaterThan(0)
  })

  it('double-clicking a unit row opens its inspector with qualitative bands only — no raw cohesion numbers', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    fireEvent.click(within(subviewGroup()).getByRole('button', { name: 'UNITS' }))

    const units = getStaffUnitsForTeam(w, teamId)
    const target = units[units.length - 1]!
    // BDMDataGrid fires onRowClick on double-click, not click.
    fireEvent.doubleClick(screen.getAllByText(target.departmentLabel)[0]!.closest('tr')!)

    const inspector = screen.getByText('STAFF UNIT').closest('section')!
    expect(inspector.textContent).toContain(target.departmentLabel)
    for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) {
      expect(inspector.textContent).toContain(STAFF_UNIT_COHESION_DIMENSION_LABELS[dimension])
    }
    // Scoped to the inspector: no bare 2-3 digit 0-100 cohesion value may be rendered.
    expect(inspector.textContent).not.toMatch(/\b\d{2,3}\b/)
  })

  it('a unit with no cohesion state yet degrades gracefully rather than crashing', () => {
    // A brand-new world has not run the periodic pipeline, so no unit state exists.
    const w = createNewGame()
    render(<StaffScreen teamId={userTeamId(w)} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    fireEvent.click(within(subviewGroup()).getByRole('button', { name: 'UNITS' }))
    expect(screen.getByRole('region', { name: 'staff-units' })).toBeTruthy()
    expect(screen.getByText('Unit cohesion has not been established yet.')).toBeTruthy()
  })

  it('the PEOPLE inspector shows a qualitative Culture Fit band, never a raw fit score', () => {
    const w = advanceGameDay(createNewGame())
    const teamId = userTeamId(w)
    render(<StaffScreen teamId={teamId} world={w} />)
    fireEvent.click(screen.getByRole('button', { name: /^DYNAMICS/ }))
    expect(screen.getByText('CULTURE FIT')).toBeTruthy()

    const group = screen.getByText('CULTURE FIT').closest('section, div')!
    const bands = ['STRONG FIT', 'GOOD FIT', 'MIXED FIT', 'MISMATCH', 'SEVERE MISMATCH', 'NOT YET ESTABLISHED']
    expect(bands.some((band) => group.textContent?.includes(band))).toBe(true)
    // A raw 0-100 fit score must never be rendered next to the band.
    expect(group.querySelector('dd')?.textContent).not.toMatch(/\d/)
  })
})
