// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { TacticsPcbPage } from './TacticsPcbPage'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

describe('TacticsPcbPage / Pizarra', () => {
  it('has no decorative save: without an active game the tactical controls are disabled', () => {
    render(createElement(TacticsPcbPage))

    expect(screen.queryByRole('button', { name: 'GUARDAR AJUSTES' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'GENERAL' }))
    expect(screen.getByLabelText('Ritmo')).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Sin partida activa')
  })
})
