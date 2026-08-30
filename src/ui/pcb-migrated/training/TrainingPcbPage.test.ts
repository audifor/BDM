import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { TrainingPcbPage, type TrainingPcbTab } from './TrainingPcbPage'
import { addTrainingSession, createTrainingPlan, deleteTrainingSession, updateTrainingSession } from './TrainingMigrationRepository'

const render = (initialTab: TrainingPcbTab) => renderToStaticMarkup(createElement(TrainingPcbPage, { initialTab }))
describe('TrainingPcbPage', () => {
  it('renders all five PCB tabs without the global PCB shell', () => { const markup = render('team'); for (const label of ['Equipo', 'Individual', 'Carga', 'Staff', 'Módulos']) expect(markup).toContain(label); for (const shell of ['Hub', 'Scouting', 'Mercado']) expect(markup).not.toContain(shell) })
  it.each<readonly [TrainingPcbTab, string]>([['team', 'Team Training'], ['personal', 'Entrenamiento individual'], ['load', 'Load Management'], ['staff', 'Staff Assignments'], ['modules', 'Training Modules']])('renders %s', (tab, label) => expect(render(tab)).toContain(label))
  it('keeps PCB planner create, edit and delete workflows in temporary state', () => { const initial = createTrainingPlan(); const added = addTrainingSession(initial, 0, { id: 'temporary', time: '12:00', focus: 'Tiro exterior', intensity: 'Alta' }); expect(added[0]!.sessions).toHaveLength(initial[0]!.sessions.length + 1); const edited = updateTrainingSession(added, 0, { id: 'temporary', time: '13:00', focus: 'Defensa individual', intensity: 'Baja' }); expect(edited[0]!.sessions.at(-1)?.time).toBe('13:00'); expect(deleteTrainingSession(edited, 0, 'temporary')[0]!.sessions).toHaveLength(initial[0]!.sessions.length) })

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

  it('TrainingVisualMock no longer exports fake player or staff fixtures', async () => {
    const mocks = await import('./TrainingVisualMock')
    const keys = Object.keys(mocks)
    expect(keys).not.toContain('TRAINING_PLAYERS')
    expect(keys).not.toContain('TRAINING_STAFF')
    expect(keys).not.toContain('TRAINING_MODULES')
    expect(keys.join(' ')).not.toContain('GameWorld')
  })
})
