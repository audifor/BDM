import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TrainingPcbPage, type TrainingPcbTab } from './TrainingPcbPage'
import { addTrainingSession, createTrainingPlan, deleteTrainingSession, updateTrainingSession } from './TrainingMigrationRepository'

const render = (initialTab: TrainingPcbTab) => renderToStaticMarkup(createElement(TrainingPcbPage, { initialTab }))
describe('TrainingPcbPage', () => {
  it('renders all five PCB tabs without the global PCB shell', () => { const markup = render('team'); for (const label of ['Equipo', 'Individual', 'Carga', 'Staff', 'Módulos']) expect(markup).toContain(label); for (const shell of ['Hub', 'Scouting', 'Mercado']) expect(markup).not.toContain(shell) })
  it.each<readonly [TrainingPcbTab, string]>([['team', 'Team Training'], ['personal', 'Personal Training'], ['load', 'Load Management'], ['staff', 'Staff Assignments'], ['modules', 'Training Modules']])('renders %s', (tab, label) => expect(render(tab)).toContain(label))
  it('uses presentation-only fixtures without GameWorld', async () => { const mocks = await import('./TrainingVisualMock'); expect(Object.keys(mocks).join(' ')).not.toContain('GameWorld') })
  it('keeps PCB planner create, edit and delete workflows in temporary state', () => { const initial = createTrainingPlan(); const added = addTrainingSession(initial, 0, { id: 'temporary', time: '12:00', focus: 'Tiro exterior', intensity: 'Alta' }); expect(added[0]!.sessions).toHaveLength(initial[0]!.sessions.length + 1); const edited = updateTrainingSession(added, 0, { id: 'temporary', time: '13:00', focus: 'Defensa individual', intensity: 'Baja' }); expect(edited[0]!.sessions.at(-1)?.time).toBe('13:00'); expect(deleteTrainingSession(edited, 0, 'temporary')[0]!.sessions).toHaveLength(initial[0]!.sessions.length) })
})
