// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { TacticsPcbPage } from './TacticsPcbPage'

afterEach(cleanup)

describe('TacticsPcbPage / Match Plan', () => {
  it('updates the Ritmo, Cobertura P&R and Rotación overrides and resets them', () => {
    render(createElement(TacticsPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    const paceSelect = screen.getByLabelText('Ritmo') as HTMLSelectElement
    const coverageSelect = screen.getByLabelText('Cobertura P&R') as HTMLSelectElement
    const rotationSelect = screen.getByLabelText('Rotación') as HTMLSelectElement

    expect(paceSelect.value).toBe('Equilibrado')
    expect(coverageSelect.value).toBe('Drop')
    expect(rotationSelect.value).toBe('Estándar')

    fireEvent.change(paceSelect, { target: { value: 'Rápido' } })
    fireEvent.change(coverageSelect, { target: { value: 'Switch' } })
    fireEvent.change(rotationSelect, { target: { value: 'Corta' } })

    expect(paceSelect.value).toBe('Rápido')
    expect(coverageSelect.value).toBe('Switch')
    expect(rotationSelect.value).toBe('Corta')

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect((screen.getByLabelText('Ritmo') as HTMLSelectElement).value).toBe('Equilibrado')
    expect((screen.getByLabelText('Cobertura P&R') as HTMLSelectElement).value).toBe('Drop')
    expect((screen.getByLabelText('Rotación') as HTMLSelectElement).value).toBe('Estándar')
  })

  it('opens the scouting report for the selected opponent and closes it', () => {
    render(createElement(TacticsPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ver scouting' }))

    const modal = screen.getByRole('heading', { name: 'Scouting · Lions BC' }).closest('section')!
    expect(within(modal).getByText('T. Walker · P&R 86')).toBeInTheDocument()
    expect(within(modal).getByText('T. Walker')).toBeInTheDocument()

    fireEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('heading', { name: 'Scouting · Lions BC' })).not.toBeInTheDocument()
  })

  it('shows a different scouting report when the opponent changes', () => {
    render(createElement(TacticsPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    const opponentSelect = screen.getAllByRole('combobox').find((el) => (el as HTMLSelectElement).value === 'Lions BC') as HTMLSelectElement
    fireEvent.change(opponentSelect, { target: { value: 'Falcons BC' } })

    fireEvent.click(screen.getByRole('button', { name: 'Ver scouting' }))
    const modal = screen.getByRole('heading', { name: 'Scouting · Falcons BC' }).closest('section')!
    expect(within(modal).getByText('D. Okoye · Poste bajo 84')).toBeInTheDocument()
  })
})
