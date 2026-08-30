import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { TrainingPcbPage, type TrainingPcbTab } from './TrainingPcbPage'

const render = (initialTab: TrainingPcbTab) => renderToStaticMarkup(createElement(TrainingPcbPage, { initialTab }))
describe('TrainingPcbPage', () => {
  it('renders all five PCB tabs without the global PCB shell', () => { const markup = render('team'); for (const label of ['Equipo', 'Individual', 'Carga', 'Staff', 'Módulos']) expect(markup).toContain(label); for (const shell of ['Hub', 'Scouting', 'Mercado']) expect(markup).not.toContain(shell) })
  it.each<readonly [TrainingPcbTab, string]>([['team', 'Team Training'], ['personal', 'Entrenamiento individual'], ['load', 'Load Management'], ['staff', 'Staff Assignments'], ['modules', 'Training Modules']])('renders %s', (tab, label) => expect(render(tab)).toContain(label))

  it('renders real GameWorld roster data instead of fixtures', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const markup = renderToStaticMarkup(createElement(TrainingPcbPage, { world, initialTab: 'personal' }))
    for (const player of roster) {
      expect(markup).toContain(`${player.firstName} ${player.lastName}`)
    }
  })

  it('no fake player/opponent fixture names remain reachable in production rendering', () => {
    const world = createNewGame()
    const markup = renderToStaticMarkup(createElement(TrainingPcbPage, { world, initialTab: 'personal' }))
    for (const fakeName of ['Sergio De Larrea', 'Lucas Langarita', 'Santi Yusta', 'Jahlil Okafor', 'Trae Bell-Haynes', 'Álvaro Quirós', 'Marta Vidal', 'Javier Nieto', 'Sara Rivas']) {
      expect(markup).not.toContain(fakeName)
    }
  })

  it('renders the real built-in training catalog in the Modules tab instead of a fake token catalog', () => {
    const markup = render('modules')
    expect(markup).toContain('Three-Point Shooting')
    expect(markup).toContain('Rim Protection')
    expect(markup).toContain('Team Cohesion')
  })

  it('renders real scheduled sessions from GameWorld in the Team tab, not a local scratchpad plan', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const world = { ...base, scheduledTrainingSessionsById: { 'session:test': { id: 'session:test', teamId: team.id, date: base.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'team' as const, definitionId: 'threePoint', intensity: 'normal' as const, status: 'scheduled' as const } } }
    const markup = renderToStaticMarkup(createElement(TrainingPcbPage, { world, initialTab: 'team' }))
    expect(markup).toContain('Three-Point Shooting')
    expect(markup).toContain('09:00')
  })
})
