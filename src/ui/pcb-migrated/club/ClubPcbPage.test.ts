// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { acceptStaffJobOffer, completeStaffInterview, createStaffJobOffer, createStaffJobOpeningForTeam, declineStaffJobOffer, fireStaffFromTeam, identifyStaffCandidate, listFreeAgentStaff, startStaffInterview } from '@/app/staffCareer'
import type { GameWorld } from '@/domain/world'
import type { StaffPersonId } from '@/domain/ids'
import type { StaffRoleId } from '@/domain/staff'
import { getUserTeam } from '@/engine/calendar'
import { ClubPcbPage } from './ClubPcbPage'

afterEach(cleanup)

function startCandidacy(world: GameWorld, roleId: StaffRoleId, staffId: StaffPersonId): GameWorld {
  const opening = createStaffJobOpeningForTeam(world, { teamId: getUserTeam(world)!.id, roleId })
  const candidacy = identifyStaffCandidate(opening.world, { openingId: opening.opening.id, staffId })
  return candidacy.world
}

function StaffSandbox() {
  const [world, setWorld] = useState(() => createAcbTestGame({ userTeamKey: 'caz' }))
  return createElement(ClubPcbPage, {
    initialTab: 'staff',
    world,
    onStartStaffCandidacy: (roleId: StaffRoleId, staffId: StaffPersonId) => setWorld((current) => startCandidacy(current, roleId, staffId)),
    onStartStaffInterview: (candidacyId: string) => setWorld((current) => startStaffInterview(current, candidacyId)),
    onCompleteStaffInterview: (candidacyId: string) => setWorld((current) => completeStaffInterview(current, candidacyId)),
    onCreateStaffOffer: (candidacyId: string) => setWorld((current) => createStaffJobOffer(current, { candidacyId }).world),
    onAcceptStaffOffer: (offerId: string) => setWorld((current) => acceptStaffJobOffer(current, offerId)),
    onDeclineStaffOffer: (offerId: string) => setWorld((current) => declineStaffJobOffer(current, offerId)),
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

  it('projects a fired legacy staff member without marketRole safely', () => {
    const prototype = createNewGame()
    const team = getUserTeam(prototype)!
    const assignment = Object.values(prototype.teamStaffAssignmentsById).find((item) => item.teamId === team.id)!
    const staffId = assignment.staffPersonId
    const fired = fireStaffFromTeam(prototype, staffId)

    expect(fired.staffPeopleById[staffId]!.marketRole).toBeUndefined()
    expect(listFreeAgentStaff(fired, assignment.role)).toContain(staffId)
    expect(() => render(createElement(ClubPcbPage, { initialTab: 'staff', world: fired }))).not.toThrow()
  })

  it('uses GameWorld candidacy, interview and offer stages before hiring and returns fired staff to the market', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    const candidateId = listFreeAgentStaff(world, 'assistantCoach')[0]!
    const candidate = world.staffPeopleById[candidateId]!
    const candidateName = `${candidate.identity.firstName} ${candidate.identity.lastName}`
    render(createElement(StaffSandbox))

    fireEvent.change(screen.getByLabelText('Filtrar por rol'), { target: { value: 'assistantCoach' } })
    expect(screen.getAllByRole('button', { name: 'Iniciar candidatura' })).toHaveLength(5)
    expect(screen.getByText(candidateName)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Iniciar candidatura' })[0]!)
    expect(screen.getByRole('button', { name: 'Iniciar entrevista' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `Despedir ${candidateName}` })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar entrevista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Completar entrevista' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generar oferta' }))
    expect(screen.getByText(/Oferta: \$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceptar oferta' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar oferta' }))
    const firedButton = screen.getByRole('button', { name: `Despedir ${candidateName}` })
    fireEvent.click(firedButton)

    expect(screen.getByText(candidateName)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Iniciar candidatura' })).toHaveLength(5)
  })
})
