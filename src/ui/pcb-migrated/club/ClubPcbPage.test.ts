// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { ClubPcbPage } from './ClubPcbPage'

afterEach(cleanup)

const asHtml = (element: Element | null) => element as HTMLElement

describe('ClubPcbPage', () => {
  it('assigns and unassigns a player to a development coach from the Gestionar modal', () => {
    render(createElement(ClubPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Staff & Roles' }))

    fireEvent.click(screen.getByRole('button', { name: 'Gestionar' }))
    expect(screen.getByRole('heading', { name: /Jugadores de Diego Ferrer/ })).toBeInTheDocument()

    const available = asHtml(screen.getByText('Disponibles (1)').closest('.unassigned-players-section'))
    expect(within(available).getByText('Julian Price')).toBeInTheDocument()
    fireEvent.click(within(available).getByRole('button', { name: 'Asignar' }))

    expect(screen.getByText('Asignados (2)')).toBeInTheDocument()
    const assigned = asHtml(screen.getByText('Asignados (2)').closest('.assigned-players-section'))
    expect(within(assigned).getByText('Julian Price')).toBeInTheDocument()

    const retireButtons = within(assigned).getAllByRole('button', { name: 'Retirar' })
    const julianRow = retireButtons.find((button) => button.closest('.staff-option')?.textContent?.includes('Julian Price'))!
    fireEvent.click(julianRow)

    expect(screen.getByText('Asignados (1)')).toBeInTheDocument()
    const availableAfter = asHtml(screen.getByText('Disponibles (1)').closest('.unassigned-players-section'))
    expect(within(availableAfter).getByText('Julian Price')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('heading', { name: /Jugadores de Diego Ferrer/ })).not.toBeInTheDocument()
  })

  it('hires new staff for a role with no available candidates and reflects it in assignments', () => {
    render(createElement(ClubPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Staff & Roles' }))

    // Physio already has Marta Vidal assigned (from fixtures) and has limit 2, but she
    // is the only fixture staff member with medical/recovery skills, so the second
    // vacancy has zero remaining candidates and should offer "Contratar Nuevo".
    const getPhysioCard = () => asHtml(screen.getByRole('heading', { name: 'Fisioterapeuta' }).closest('.role-card'))
    const physioRoleCount = () => within(getPhysioCard()).getByText((_, node) => node?.className === 'role-count' && /\d \/ 2/.test(node.textContent ?? ''))
    expect(physioRoleCount()).toHaveTextContent('1 / 2')
    expect(within(getPhysioCard()).getByRole('button', { name: 'Contratar Nuevo' })).toBeInTheDocument()

    fireEvent.click(within(getPhysioCard()).getByRole('button', { name: 'Contratar Nuevo' }))

    expect(physioRoleCount()).toHaveTextContent('2 / 2')
    expect(within(getPhysioCard()).getByText(/^Fisioterapeuta \d+$/)).toBeInTheDocument()
  })

  it('assigns an available staff member to a role via the assignment modal', () => {
    render(createElement(ClubPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Staff & Roles' }))

    const getAssistantCard = () => asHtml(screen.getByRole('heading', { name: 'Asistente Defensivo' }).closest('.role-card'))
    const roleCount = () => within(getAssistantCard()).getByText((_, node) => node?.className === 'role-count' && /\d \/ 1/.test(node.textContent ?? ''))
    expect(roleCount()).toHaveTextContent('0 / 1')
    fireEvent.click(within(getAssistantCard()).getByRole('button', { name: 'Asignar Staff' }))

    expect(screen.getByRole('heading', { name: /Asignar.*Asistente Defensivo/ })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Laura Sáez').closest('.staff-option')!)

    expect(screen.queryByRole('heading', { name: /Asignar.*Asistente Defensivo/ })).not.toBeInTheDocument()
    expect(roleCount()).toHaveTextContent('1 / 1')
    expect(within(getAssistantCard()).getByText('Laura Sáez')).toBeInTheDocument()
  })

  it('opens and closes a player detail panel from the Dashboard top players table', () => {
    render(createElement(ClubPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Marcus Cole' }))

    const detail = screen.getByLabelText('Detalle de jugador')
    expect(within(detail).getByRole('heading', { name: 'Marcus Cole' })).toBeInTheDocument()
    expect(within(detail).getByText('950000')).toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByLabelText('Detalle de jugador')).not.toBeInTheDocument()
  })

  it('raises board confidence when negotiating objectives succeeds', () => {
    render(createElement(ClubPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Junta Directiva' }))

    fireEvent.click(screen.getByRole('button', { name: 'Negociar Objetivos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Intentar Negociar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Visión General' }))
    expect(screen.getByText('80')).toBeInTheDocument()
  })
})
