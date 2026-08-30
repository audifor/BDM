// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { selectUserTrainingPlan } from '@/stores/gameStore'
import { TrainingPcbPage } from './TrainingPcbPage'

afterEach(cleanup)

describe('TrainingPcbPage / interactions', () => {
  it('changing Intensidad calls onIntensity with the selected value', () => {
    const world = createNewGame()
    const onIntensity = vi.fn()
    render(createElement(TrainingPcbPage, { world, onIntensity }))

    fireEvent.change(screen.getByLabelText('Intensidad'), { target: { value: 'high' } })

    expect(onIntensity).toHaveBeenCalledWith('high')
  })

  it('changing Foco calls onFocus with the selected value', () => {
    const world = createNewGame()
    const onFocus = vi.fn()
    render(createElement(TrainingPcbPage, { world, onFocus }))

    fireEvent.change(screen.getByLabelText('Foco'), { target: { value: 'shooting' } })

    expect(onFocus).toHaveBeenCalledWith('shooting')
  })

  it('reflects the real training plan intensity and focus in the controls', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const plan = selectUserTrainingPlan(world)!
    render(createElement(TrainingPcbPage, { world }))

    expect(screen.getByText(team.name)).toBeInTheDocument()
    expect((screen.getByLabelText('Intensidad') as HTMLSelectElement).value).toBe(plan.intensity)
    expect((screen.getByLabelText('Foco') as HTMLSelectElement).value).toBe(plan.focus)
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
