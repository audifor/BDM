// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { selectUserTrainingPlan } from '@/stores/gameStore'
import { parseGameDate } from '@/domain/date'
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

  it('derives the week label from world.currentDate instead of a hardcoded value', () => {
    const world = createNewGame()
    render(createElement(TrainingPcbPage, { world }))

    expect(screen.getAllByText(/^\d{4}-\d{2}-\d{2} - \d{4}-\d{2}-\d{2}$/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/18 ago/)).not.toBeInTheDocument()
    expect(screen.queryByText(/24 ago/)).not.toBeInTheDocument()
  })

  it('shows a neutral week label when there is no world', () => {
    render(createElement(TrainingPcbPage))

    expect(screen.getAllByText('Sin fecha de referencia').length).toBeGreaterThan(0)
  })

  it('anchors the week label on Monday-Sunday even when currentDate is not a Monday, and keeps that alignment across navigation', () => {
    // 2026-08-19 is a Wednesday; its calendar week runs Monday 2026-08-17 to Sunday 2026-08-23.
    const world = { ...createNewGame(), currentDate: parseGameDate('2026-08-19') }
    render(createElement(TrainingPcbPage, { world }))

    expect(screen.getAllByText('2026-08-17 - 2026-08-23').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('2026-08-24 - 2026-08-30')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText('2026-08-10 - 2026-08-16')).toBeInTheDocument()
  })

  it('opening the new-session modal for a real team shows a real catalog definition and calls onScheduleSession with real domain data', () => {
    const world = createNewGame()
    const onScheduleSession = vi.fn()
    render(createElement(TrainingPcbPage, { world, onScheduleSession }))
    fireEvent.click(screen.getAllByRole('button', { name: '+ Sesión' })[0]!)

    const modal = screen.getByRole('heading', { name: 'Nueva sesión' }).closest('section') as HTMLElement
    expect(within(modal).getByText(/Carga \d+ · /)).toBeInTheDocument()

    fireEvent.click(within(modal).getByRole('button', { name: 'Guardar sesión' }))

    expect(onScheduleSession).toHaveBeenCalledTimes(1)
    const scheduled = onScheduleSession.mock.calls[0]![0]
    expect(scheduled.scope).toBe('team')
    expect(scheduled.status).toBe('scheduled')
  })

  it('the Modules tab lists the real built-in catalog and creating a module lets the user pick base type + scope, calling onSaveModule with real domain data', () => {
    const onSaveModule = vi.fn()
    render(createElement(TrainingPcbPage, { onSaveModule }))
    fireEvent.click(screen.getByRole('button', { name: 'Módulos' }))

    expect(screen.getByText('Three-Point Shooting')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Crear módulo' }))

    const modal = screen.getByRole('heading', { name: 'Crear módulo' }).closest('section') as HTMLElement
    fireEvent.change(within(modal).getByLabelText('Nombre'), { target: { value: 'Mi módulo' } })
    fireEvent.change(within(modal).getByLabelText('Tipo base'), { target: { value: 'threePoint' } })
    fireEvent.change(within(modal).getByLabelText('Alcance'), { target: { value: 'individual' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Alta' }))
    fireEvent.click(within(modal).getByRole('button', { name: 'Guardar' }))

    expect(onSaveModule).toHaveBeenCalledTimes(1)
    expect(onSaveModule.mock.calls[0]![0]).toMatchObject({ name: 'Mi módulo', baseDefinitionId: 'threePoint', intensity: 'high', scope: 'individual' })
  })

  it('creating a team-only base module restricts scope to team only', () => {
    const onSaveModule = vi.fn()
    render(createElement(TrainingPcbPage, { onSaveModule }))
    fireEvent.click(screen.getByRole('button', { name: 'Módulos' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Crear módulo' }))

    const modal = screen.getByRole('heading', { name: 'Crear módulo' }).closest('section') as HTMLElement
    fireEvent.change(within(modal).getByLabelText('Nombre'), { target: { value: 'Cohesión custom' } })
    fireEvent.change(within(modal).getByLabelText('Tipo base'), { target: { value: 'teamCohesion' } })

    const scopeSelect = within(modal).getByLabelText('Alcance') as HTMLSelectElement
    expect(Array.from(scopeSelect.options).map((option) => option.value)).toEqual(['team'])

    fireEvent.click(within(modal).getByRole('button', { name: 'Guardar' }))
    expect(onSaveModule.mock.calls[0]![0]).toMatchObject({ baseDefinitionId: 'teamCohesion', scope: 'team' })
  })

  it('shows the inherited real effect profile in the module creator, not an arbitrary numeric editor', () => {
    render(createElement(TrainingPcbPage))
    fireEvent.click(screen.getByRole('button', { name: 'Módulos' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Crear módulo' }))

    const modal = screen.getByRole('heading', { name: 'Crear módulo' }).closest('section') as HTMLElement
    expect(within(modal).getByText(/Perfil de efectos heredado/)).toBeInTheDocument()
    expect(within(modal).getByText(/Estímulo de desarrollo/)).toBeInTheDocument()
    expect(within(modal).getByText(/Carga\/fatiga/)).toBeInTheDocument()
    expect(within(modal).getByText(/Riesgo de lesión \(metadato, no aplicado por el motor\)/)).toBeInTheDocument()
  })

  it('shows the ISO week number alongside the Mon-Sun range', () => {
    const world = { ...createNewGame(), currentDate: parseGameDate('2026-08-19') }
    render(createElement(TrainingPcbPage, { world }))
    expect(screen.getByText(/Semana 34 · 2026-08-17 - 2026-08-23/)).toBeInTheDocument()
  })
})
