// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { MedicalPcbPage } from './MedicalPcbPage'

afterEach(cleanup)

describe('MedicalPcbPage', () => {
  it('opens and closes the injured-player detail panel from the injured list', () => {
    render(createElement(MedicalPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Lesionados' }))

    expect(screen.queryByLabelText('Detalle de jugador lesionado')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Álvaro Martín' }))

    const detail = screen.getByLabelText('Detalle de jugador lesionado')
    expect(within(detail).getByRole('heading', { name: 'Álvaro Martín' })).toBeInTheDocument()
    expect(within(detail).getByText('Esguince de tobillo')).toBeInTheDocument()
    expect(within(detail).getByText('8')).toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByLabelText('Detalle de jugador lesionado')).not.toBeInTheDocument()
  })

  it('switches the detail panel when a different injured player is selected', () => {
    render(createElement(MedicalPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Lesionados' }))

    fireEvent.click(screen.getByRole('button', { name: 'Álvaro Martín' }))
    expect(within(screen.getByLabelText('Detalle de jugador lesionado')).getByRole('heading', { name: 'Álvaro Martín' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Marcus Cole' }))
    const detail = screen.getByLabelText('Detalle de jugador lesionado')
    expect(within(detail).getByRole('heading', { name: 'Marcus Cole' })).toBeInTheDocument()
    expect(within(detail).getByText('Sobrecarga muscular')).toBeInTheDocument()
  })
})
