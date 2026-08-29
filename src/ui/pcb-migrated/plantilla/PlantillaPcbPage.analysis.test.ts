// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { PlantillaPcbPage } from './PlantillaPcbPage'

afterEach(cleanup)

describe('PlantillaPcbPage / Análisis chips', () => {
  it('opens and closes a player detail panel from the Líderes/Influyentes chips', () => {
    render(createElement(PlantillaPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Análisis + Dinámicas' }))

    expect(screen.queryByText('CLUTCH')).not.toBeInTheDocument()

    const leaders = screen.getByText('Líderes').closest('section')!
    const firstLeader = within(leaders).getAllByRole('button')[0]!
    const leaderName = firstLeader.textContent!
    fireEvent.click(firstLeader)

    const detail = document.querySelector('.pcb-plantilla__player-detail') as HTMLElement
    expect(within(detail).getByText(leaderName)).toBeInTheDocument()
    expect(screen.getByText('CLUTCH')).toBeInTheDocument()

    fireEvent.click(within(detail).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByText('CLUTCH')).not.toBeInTheDocument()
    expect(document.querySelector('.pcb-plantilla__player-detail')).not.toBeInTheDocument()
  })
})
