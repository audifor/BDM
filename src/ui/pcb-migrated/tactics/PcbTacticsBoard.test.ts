// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { TacticsPcbPage } from './TacticsPcbPage'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

describe('TacticsPcbPage / Pizarra', () => {
  it('GUARDAR AJUSTES shows an observable confirmation', () => {
    render(createElement(TacticsPcbPage))

    const saveButton = screen.getByRole('button', { name: 'GUARDAR AJUSTES' })
    fireEvent.click(saveButton)

    expect(screen.getByRole('button', { name: 'AJUSTES GUARDADOS' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'GUARDAR AJUSTES' })).not.toBeInTheDocument()
  })
})
