// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { nextEligibleTrainingDate } from '@/engine/training'
import { selectUserTrainingPlan } from '@/stores/gameStore'
import { addDays, parseGameDate } from '@/domain/date'
import { getGamesForTeam } from '@/domain/world'
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

  it('opening the new-session modal for a real team shows a real catalog definition and calls onScheduleTeamModule with real domain data', () => {
    const world = createNewGame()
    const onScheduleTeamModule = vi.fn()
    render(createElement(TrainingPcbPage, { world, onScheduleTeamModule }))
    // The first "+ Sesión" button belongs to the current week's Monday, which can be today/past
    // relative to world.currentDate and is therefore disabled; use the last enabled button instead.
    const buttons = screen.getAllByRole('button', { name: '+ Sesión' })
    const enabled = buttons.find((button) => !(button as HTMLButtonElement).disabled)!
    fireEvent.click(enabled)

    const modal = screen.getByRole('heading', { name: 'Nueva sesión' }).closest('section') as HTMLElement
    expect(within(modal).getByText(/Carga \d+ · /)).toBeInTheDocument()

    fireEvent.click(within(modal).getByRole('button', { name: 'Guardar sesión' }))

    expect(onScheduleTeamModule).toHaveBeenCalledTimes(1)
    const scheduled = onScheduleTeamModule.mock.calls[0]![0]
    expect(scheduled.moduleId).toBeDefined()
  })

  it('selecting Alta intensity in the session modal forwards it to onScheduleTeamModule', () => {
    const world = createNewGame()
    const onScheduleTeamModule = vi.fn()
    render(createElement(TrainingPcbPage, { world, onScheduleTeamModule }))
    const buttons = screen.getAllByRole('button', { name: '+ Sesión' })
    const enabled = buttons.find((button) => !(button as HTMLButtonElement).disabled)!
    fireEvent.click(enabled)

    const modal = screen.getByRole('heading', { name: 'Nueva sesión' }).closest('section') as HTMLElement
    fireEvent.click(within(modal).getByRole('button', { name: 'Alta' }))
    fireEvent.click(within(modal).getByRole('button', { name: 'Guardar sesión' }))

    expect(onScheduleTeamModule).toHaveBeenCalledTimes(1)
    expect(onScheduleTeamModule.mock.calls[0]![0]).toMatchObject({ intensity: 'high' })
  })

  it('the session modal composes hour + minute selectors into a canonical HH:MM start time', () => {
    const world = createNewGame()
    const onScheduleTeamModule = vi.fn()
    render(createElement(TrainingPcbPage, { world, onScheduleTeamModule }))
    const buttons = screen.getAllByRole('button', { name: '+ Sesión' })
    const enabled = buttons.find((button) => !(button as HTMLButtonElement).disabled)!
    fireEvent.click(enabled)

    const modal = screen.getByRole('heading', { name: 'Nueva sesión' }).closest('section') as HTMLElement
    fireEvent.change(within(modal).getByLabelText('Inicio - hora'), { target: { value: '09' } })
    fireEvent.change(within(modal).getByLabelText('Inicio - minuto'), { target: { value: '30' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Guardar sesión' }))

    expect(onScheduleTeamModule.mock.calls[0]![0]).toMatchObject({ startTime: '09:30' })
  })

  it('the session modal hour + minute selectors initialize from an existing persisted session time', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const date = nextEligibleTrainingDate(base.currentDate)
    const world = { ...base, scheduledTrainingSessionsById: { existing: { id: 'existing', teamId: team.id, date, startTime: '17:05', durationMinutes: 60, scope: 'team' as const, definitionId: 'threePoint', intensity: 'normal' as const, status: 'scheduled' as const } } }
    render(createElement(TrainingPcbPage, { world }))

    fireEvent.click(screen.getByText('Three-Point Shooting'))

    const modal = screen.getByRole('heading', { name: 'Editar sesión' }).closest('section') as HTMLElement
    expect((within(modal).getByLabelText('Inicio - hora') as HTMLSelectElement).value).toBe('17')
    expect((within(modal).getByLabelText('Inicio - minuto') as HTMLSelectElement).value).toBe('05')
  })

  it('the Team planner disables scheduling for today/past dates and truthfully labels why', () => {
    const world = createNewGame()
    render(createElement(TrainingPcbPage, { world }))
    const buttons = screen.getAllByRole('button', { name: '+ Sesión' }) as HTMLButtonElement[]
    expect(buttons.some((button) => button.disabled)).toBe(true)
    expect(buttons.some((button) => !button.disabled)).toBe(true)
  })

  it('a user-created team module appears and is selectable in the Team planner session editor', () => {
    const base = createNewGame()
    const world = {
      ...base,
      userTrainingModulesById: {
        ...base.userTrainingModulesById,
        'team-user-module': { id: 'team-user-module', name: 'Mi Cohesión de Equipo', baseDefinitionId: 'teamCohesion', scope: 'team' as const, intensity: 'high' as const },
      },
    }
    const onScheduleTeamModule = vi.fn()
    render(createElement(TrainingPcbPage, { world, onScheduleTeamModule }))
    const buttons = screen.getAllByRole('button', { name: '+ Sesión' })
    const enabled = buttons.find((button) => !(button as HTMLButtonElement).disabled)!
    fireEvent.click(enabled)

    const modal = screen.getByRole('heading', { name: 'Nueva sesión' }).closest('section') as HTMLElement
    const typeSelect = within(modal).getByLabelText('Tipo') as HTMLSelectElement
    expect(within(typeSelect).getByText('Mi Cohesión de Equipo')).toBeInTheDocument()

    fireEvent.change(typeSelect, { target: { value: 'team-user-module' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Guardar sesión' }))

    expect(onScheduleTeamModule).toHaveBeenCalledTimes(1)
    expect(onScheduleTeamModule.mock.calls[0]![0]).toMatchObject({ moduleId: 'team-user-module' })
  })

  it('a scheduling collision from the store is caught and shown as inline feedback, not an uncaught error', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const date = nextEligibleTrainingDate(base.currentDate)
    const world = {
      ...base,
      scheduledTrainingSessionsById: {
        'existing-session': { id: 'existing-session', teamId: team.id, date, startTime: '10:00', durationMinutes: 90, scope: 'team' as const, definitionId: 'threePoint', intensity: 'normal' as const, status: 'scheduled' as const },
      },
    }
    const onScheduleTeamModule = vi.fn(() => {
      throw new RangeError('Session collides with existing session existing-session')
    })
    render(createElement(TrainingPcbPage, { world, onScheduleTeamModule }))
    const buttons = screen.getAllByRole('button', { name: '+ Sesión' });
    // Click the button for the day the colliding session already occupies.
    fireEvent.click(buttons[buttons.length - 1]!);

    const modal = screen.getByRole('heading', { name: 'Nueva sesión' }).closest('section') as HTMLElement
    expect(() => fireEvent.click(within(modal).getByRole('button', { name: 'Guardar sesión' }))).not.toThrow()
    expect(within(modal).getByText(/colides|colisiona|collides/i)).toBeInTheDocument()
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

  it('clicking a player row in Load Management selects it with an unmistakable selected state', () => {
    const world = createNewGame()
    render(createElement(TrainingPcbPage, { world, initialTab: 'load' }))

    const rows = screen.getAllByRole('radio')
    fireEvent.click(rows[0]!)
    expect(rows[0]).toHaveAttribute('aria-checked', 'true')
    expect(rows[0]!.className).toContain('is-selected')

    fireEvent.click(rows[1]!)
    expect(rows[1]).toHaveAttribute('aria-checked', 'true')
    expect(rows[0]).toHaveAttribute('aria-checked', 'false')
  })

  it('Recuperación uses the selected player to schedule recovery, and selection survives switching views', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const firstPlayerId = world.teams[team.id]!.rosterPlayerIds[0]!
    const onScheduleSession = vi.fn()
    render(createElement(TrainingPcbPage, { world, initialTab: 'load', onScheduleSession }))

    fireEvent.click(screen.getAllByRole('radio')[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Principal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Recuperación' }))

    fireEvent.click(screen.getByRole('button', { name: 'Programar recuperación' }))

    expect(onScheduleSession).toHaveBeenCalledTimes(1)
    expect(onScheduleSession.mock.calls[0]![0]).toMatchObject({ playerId: firstPlayerId, scope: 'individual' })
  })

  it('shows the ISO week number alongside the Mon-Sun range', () => {
    const world = { ...createNewGame(), currentDate: parseGameDate('2026-08-19') }
    render(createElement(TrainingPcbPage, { world }))
    expect(screen.getByText(/Semana 34 · 2026-08-17 - 2026-08-23/)).toBeInTheDocument()
  })

  it('marks match days in the planner and calendar and offers automatic week fill', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const match = getGamesForTeam(base, team.id).find((game) => game.date > base.currentDate)
    expect(match).toBeDefined()
    const [year, month, day] = match!.date.split('-').map(Number) as [number, number, number]
    const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    const weekStart = addDays(match!.date, -((jsDay === 0 ? 7 : jsDay) - 1))
    const world = { ...base, currentDate: weekStart }
    const onScheduleAutomaticWeek = vi.fn()
    render(createElement(TrainingPcbPage, { world, onScheduleAutomaticWeek }))

    expect(document.querySelector('.pcb-training__day.is-match')).not.toBeNull()
    expect(document.querySelector('.pcb-training__calendar-grid > span.is-match')).not.toBeNull()
    expect(screen.getAllByText(/Partido/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Entrenamientos automáticos' }))
    expect(onScheduleAutomaticWeek).toHaveBeenCalledWith(weekStart)
  })
})
