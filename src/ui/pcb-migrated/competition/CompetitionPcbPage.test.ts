// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { CompetitionPcbPage } from './CompetitionPcbPage'

afterEach(cleanup)

describe('CompetitionPcbPage', () => {
  it('opens and closes a team detail panel from the upcoming fixtures list', () => {
    render(createElement(CompetitionPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Próximos' }))

    expect(screen.queryByLabelText('Detalle de equipo')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Real Madrid' })[0]!)

    const detail = screen.getByLabelText('Detalle de equipo')
    expect(within(detail).getByRole('heading', { name: 'Real Madrid' })).toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByLabelText('Detalle de equipo')).not.toBeInTheDocument()
  })

  it('opens a player detail panel from the stats leaderboard', () => {
    render(createElement(CompetitionPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Estadísticas' }))

    fireEvent.click(screen.getByRole('button', { name: 'Sergio Llull' }))

    const detail = screen.getByLabelText('Detalle de jugador')
    expect(within(detail).getByRole('heading', { name: 'Sergio Llull' })).toBeInTheDocument()
    expect(within(detail).getByText('PG')).toBeInTheDocument()
  })

  it('simulates a match and records a deterministic score', () => {
    render(createElement(CompetitionPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Próximos' }))

    expect(screen.queryByLabelText('Resultados simulados')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Simular' })[0]!)

    const results = screen.getByLabelText('Resultados simulados')
    expect(within(results).getByText((_, node) => node?.tagName === 'LI' && node.textContent === 'acb-0: 76-72')).toBeInTheDocument()
  })

  it('navigates between calendar months with Anterior/Siguiente', () => {
    render(createElement(CompetitionPcbPage))
    expect(screen.getByText('Septiembre de 2025')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Octubre de 2025')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Noviembre de 2025')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText('Octubre de 2025')).toBeInTheDocument()
  })

  it('navigates between jornadas with Jornada anterior/siguiente and the select', () => {
    render(createElement(CompetitionPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }))

    expect(screen.getByRole('heading', { name: 'Jornada 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jornada anterior' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Jornada siguiente' }))
    expect(screen.getByRole('heading', { name: 'Jornada 2' })).toBeInTheDocument()

    const jornadaSelect = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(jornadaSelect, { target: { value: '2' } })
    expect(screen.getByRole('heading', { name: 'Jornada 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jornada siguiente' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Jornada anterior' }))
    expect(screen.getByRole('heading', { name: 'Jornada 2' })).toBeInTheDocument()
  })
})
