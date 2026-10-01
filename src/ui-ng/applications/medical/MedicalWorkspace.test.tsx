// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { createResponsibility, responsibilityIdForTeam } from '@/domain/responsibility'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { progressMedicalAdvisories } from '@/engine/injury/MedicalAdvisory'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { useGameStore } from '@/stores/gameStore'
import { MedicalWorkspace } from '@/ui-ng/applications/medical/MedicalWorkspace'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=medical')
  useGameStore.getState().resetGame()
})

function withInjury(world: ReturnType<typeof createNewGame>) {
  const team = getUserTeam(world)!
  const playerId = team.rosterPlayerIds[0]!
  const injury = createInjury({
    id: injuryIdFromString('injury-medical-ui'),
    playerId,
    kind: 'hamstringStrain',
    severity: 'serious',
    injuredOn: world.currentDate,
    expectedReturnDate: addDays(world.currentDate, 21),
  })
  return {
    world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), injury] }),
    playerId,
  }
}

function mountMedicalWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <MedicalWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

describe('MedicalWorkspace', () => {
  it('shows an empty state when no world is loaded', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <MedicalWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Medical' })).toBeInTheDocument()
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('renders canonical availability and medical staff without facilities fiction', () => {
    const { team } = mountMedicalWorkspace()

    expect(
      screen.getByText(
        (_, element) => element?.classList.contains('medical-workspace-header__team') === true && element.textContent === team.name,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('No active injuries.')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Facilities')
    expect(document.body.textContent).not.toContain('Prevention')

    fireEvent.click(screen.getByRole('button', { name: 'Staff' }))
    expect(screen.getByText(STAFF_ROLE_LABELS.physiotherapist)).toBeInTheDocument()
  })

  it('opens the injured tab with a canonical injury and navigates to the player medical dossier', () => {
    const base = createNewGame()
    const { world, playerId } = withInjury(base)
    const player = world.players[playerId]!
    mountMedicalWorkspace(world)

    fireEvent.click(screen.getByRole('button', { name: /^Injured/ }))
    expect(screen.getAllByText('Hamstring strain').length).toBeGreaterThan(0)
    expect(screen.getByText('Injury dossier')).toBeInTheDocument()
    expect(document.querySelector('[data-ng-region="medical-injured-inspector"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `${player.firstName} ${player.lastName}` }))
    const url = new URL(window.location.href)
    expect(url.searchParams.get('playerId')).toBe(playerId)
    expect(url.searchParams.get('playerView')).toBe('medical')
  })

  it('lets the user clear or defer a due RTP review from Medical', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const playerId = team.rosterPlayerIds[0]!
    const injury = createInjury({
      id: injuryIdFromString('injury-medical-review-action'), playerId, kind: 'kneeSprain', severity: 'moderate',
      injuredOn: addDays(base.currentDate, -10), expectedReturnDate: base.currentDate,
    })
    const view = mountMedicalWorkspace(updateGameWorld(base, { injuries: [injury] }))

    expect(screen.getAllByText('RETURN-TO-PLAY REVIEW').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE RECOVERY' }))
    let updated = useGameStore.getState().world!
    expect(updated.injuriesById[injury.id]?.expectedReturnDate).toBe(injury.expectedReturnDate)
    expect(updated.injuriesById[injury.id]?.returnToPlay?.reviewDueOn).toBe(addDays(base.currentDate, 1))

    const dueAgain = updateGameWorld(updated, { currentDate: addDays(base.currentDate, 1) })
    view.unmount()
    mountMedicalWorkspace(dueAgain)
    fireEvent.click(screen.getByRole('button', { name: 'CLEAR FOR PLAY' }))
    updated = useGameStore.getState().world!
    expect(updated.injuriesById[injury.id]?.returnToPlay?.clearedOn).toBe(dueAgain.currentDate)
    expect(updated.injuriesById[injury.id]?.returnToPlay?.reviews).toHaveLength(2)
  })

  it('uses the existing Staff recommendation accept action without clearing the injury', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const playerId = team.rosterPlayerIds[0]!
    const staffId = staffPersonIdFromString(`medical-ui-staff:${team.id}`)
    const staff = { id: staffId, identity: { firstName: 'Medical', lastName: 'Advisor' }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> } }
    const injury = createInjury({
      id: injuryIdFromString('injury-medical-recommendation'), playerId, kind: 'hamstringStrain', severity: 'moderate',
      injuredOn: base.currentDate, expectedReturnDate: addDays(base.currentDate, 15),
    })
    const withStaff = updateGameWorld(base, {
      staffPeople: [...Object.values(base.staffPeopleById), staff],
      teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`medical-ui-assignment:${team.id}`), staffPersonId: staffId, teamId: team.id, role: 'teamDoctor', assignedOn: base.currentDate }],
    })
    const responsibility = createResponsibility({
      id: responsibilityIdForTeam(team.id, 'returnToPlayRecommendation'), teamId: team.id,
      kind: 'returnToPlayRecommendation', mode: 'advisory', holderStaffId: staffId, assignedOn: base.currentDate,
    })
    const advised = progressMedicalAdvisories(updateGameWorld(withStaff, { injuries: [injury], responsibilities: [responsibility] }))
    const outcome = Object.values(advised.delegationOutcomesById).find((item) => item.kind === 'returnToPlayRecommendation' && item.payload.injuryId === injury.id)!
    mountMedicalWorkspace(advised)

    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT' }))
    const updated = useGameStore.getState().world!
    expect(updated.delegationOutcomesById[outcome.id]?.userDisposition).toBe('accepted')
    expect(updated.injuriesById[injury.id]?.returnToPlay?.clearedOn).toBeUndefined()
    expect(updated.delegationOutcomesById[outcome.id]?.applied).toBe(true)
  })
})
