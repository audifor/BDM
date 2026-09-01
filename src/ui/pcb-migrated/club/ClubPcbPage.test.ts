// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createAcbTestGame } from '@/app/game'
import { acceptStaffJobOffer, completeStaffInterview, createStaffJobOffer, createStaffJobOpeningForTeam, fireStaffFromTeam, identifyStaffCandidate, listFreeAgentStaff, startStaffInterview } from '@/app/staffCareer'
import type { GameWorld } from '@/domain/world'
import type { StaffPersonId } from '@/domain/ids'
import type { StaffRoleId } from '@/domain/staff'
import { getUserTeam } from '@/engine/calendar'
import { ClubPcbPage } from './ClubPcbPage'

afterEach(cleanup)

function hire(world: GameWorld, roleId: StaffRoleId, staffId: StaffPersonId): GameWorld {
  const opening = createStaffJobOpeningForTeam(world, { teamId: getUserTeam(world)!.id, roleId })
  const candidacy = identifyStaffCandidate(opening.world, { openingId: opening.opening.id, staffId })
  const interviewed = completeStaffInterview(startStaffInterview(candidacy.world, candidacy.candidacyId), candidacy.candidacyId)
  const offer = createStaffJobOffer(interviewed, { candidacyId: candidacy.candidacyId })
  return acceptStaffJobOffer(offer.world, offer.offerId)
}

function StaffSandbox() {
  const [world, setWorld] = useState(() => createAcbTestGame({ userTeamKey: 'caz' }))
  return createElement(ClubPcbPage, {
    initialTab: 'staff',
    world,
    onNegotiateStaff: (roleId: StaffRoleId, staffId: StaffPersonId) => setWorld((current) => hire(current, roleId, staffId)),
    onFireStaff: (staffId: StaffPersonId) => setWorld((current) => fireStaffFromTeam(current, staffId)),
  })
}

describe('ClubPcbPage staff sandbox', () => {
  it('renders canonical ACB staff rather than fixture staff', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    const assigned = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === getUserTeam(world)!.id)!
    const person = world.staffPeopleById[assigned.staffPersonId]!
    render(createElement(ClubPcbPage, { initialTab: 'staff', world }))

    expect(screen.getByText(`${person.identity.firstName} ${person.identity.lastName}`)).toBeInTheDocument()
    expect(screen.queryByText('Diego Ferrer')).not.toBeInTheDocument()
    expect(screen.queryByText(/Staff 100/)).not.toBeInTheDocument()
  })

  it('filters the real free-agent market, hires canonically, and returns fired staff to it', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    const candidateId = listFreeAgentStaff(world, 'assistantCoach')[0]!
    const candidate = world.staffPeopleById[candidateId]!
    const candidateName = `${candidate.identity.firstName} ${candidate.identity.lastName}`
    render(createElement(StaffSandbox))

    fireEvent.change(screen.getByLabelText('Filtrar por rol'), { target: { value: 'assistantCoach' } })
    expect(screen.getAllByRole('button', { name: 'Negociar y contratar' })).toHaveLength(5)
    expect(screen.getByText(candidateName)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Negociar y contratar' })[0]!)
    expect(screen.getAllByRole('button', { name: 'Negociar y contratar' })).toHaveLength(4)
    const firedButton = screen.getByRole('button', { name: `Despedir ${candidateName}` })
    fireEvent.click(firedButton)

    expect(screen.getByText(candidateName)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Negociar y contratar' })).toHaveLength(5)
  })
})
