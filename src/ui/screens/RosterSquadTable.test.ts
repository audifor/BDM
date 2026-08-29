import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { SquadScreen } from './SquadScreen'
import { rosterViewColumns } from './RosterSquadTable'

describe('RosterSquadTable renderer', () => {
  it('renders a dedicated control strip and grid, not the generic data grid DOM', () => {
    const markup = renderToStaticMarkup(createElement(SquadScreen, { world: createNewGame() }))
    expect(markup).toContain('roster-toolbar')
    expect(markup).toContain('roster-squad-table__grid')
    expect(markup).toContain(getUserTeam(createNewGame())!.name)
    expect(markup).toContain('Filtros')
    expect(markup).toContain('Buscar jugador')
    expect(markup).toContain('Vista')
    expect(markup).not.toContain('bdm-data-grid')
    expect(markup).not.toContain('Available')
  })

  it('keeps overview operational and ratings complete without invented columns', () => {
    const overview = rosterViewColumns([{ id: 'overview', name: 'Overview', columnIds: ['status', 'name', 'position', 'age', 'height', 'finishing', 'fatigue', 'salary'] }, { id: 'ratings', name: 'Ratings', columnIds: ['status', 'name', 'position', 'age', 'finishing', 'shooting', 'playmaking', 'perimeterDefense', 'interiorDefense', 'rebounding', 'athleticism', 'fatigue'] }], 'overview')
    const ratings = rosterViewColumns([{ id: 'overview', name: 'Overview', columnIds: ['info'] }, { id: 'ratings', name: 'Ratings', columnIds: ['finishing', 'shooting', 'playmaking', 'perimeterDefense', 'interiorDefense', 'rebounding', 'athleticism'] }], 'ratings')
    expect(overview).toEqual(['status', 'name', 'position', 'age', 'height', 'finishing', 'fatigue', 'salary'])
    expect(ratings).toHaveLength(7)
  })

  it('has roster rows available to the renderer', () => {
    const world = createNewGame()
    expect(getTeamRoster(world, getUserTeam(world)!.id).length).toBeGreaterThan(0)
  })
})
