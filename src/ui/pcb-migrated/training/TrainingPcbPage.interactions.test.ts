// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { TrainingPcbPage } from './TrainingPcbPage'

afterEach(cleanup)

describe('TrainingPcbPage / interactions', () => {
  it('changing Responsable updates the hero chip', () => {
    render(createElement(TrainingPcbPage))

    expect(screen.getByText('Responsable: Álvaro Quirós (84)')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: 'marta' } })

    expect(screen.getByText('Responsable: Marta Vidal (79)')).toBeInTheDocument()
    expect(screen.queryByText('Responsable: Álvaro Quirós (84)')).not.toBeInTheDocument()
  })

  it('changing the session end time updates the estimated impact', () => {
    render(createElement(TrainingPcbPage))
    fireEvent.click(screen.getAllByRole('button', { name: '+ Sesión' })[0]!)

    const modal = screen.getByRole('heading', { name: 'Nueva sesión' }).closest('section') as HTMLElement
    expect(within(modal).getByText('Carga 90 AU · Técnica individual · Concentración')).toBeInTheDocument()

    fireEvent.change(within(modal).getByLabelText('Fin'), { target: { value: '12:00' } })

    expect(within(modal).getByText('Carga 120 AU · Técnica individual · Concentración')).toBeInTheDocument()
  })

  it('Configurar lets you toggle a module and change its intensity, reflected on the card', () => {
    render(createElement(TrainingPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Módulos' }))

    const moduleCard = screen.getAllByRole('button', { name: 'Configurar' })[0]!.closest('article') as HTMLElement
    expect(within(moduleCard).queryByText('Desactivado')).not.toBeInTheDocument()

    fireEvent.click(within(moduleCard).getByRole('button', { name: 'Configurar' }))

    const modal = screen.getByRole('heading', { name: /^Configurar / }).closest('section') as HTMLElement
    fireEvent.click(within(modal).getByRole('checkbox'))
    fireEvent.click(within(modal).getByRole('button', { name: 'Alta' }))
    fireEvent.click(within(modal).getByRole('button', { name: 'Guardar' }))

    expect(within(moduleCard).getByText('Desactivado')).toBeInTheDocument()
  })
})
