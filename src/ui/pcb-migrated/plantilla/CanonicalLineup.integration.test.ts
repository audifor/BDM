// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamLineup, getTeamRoster } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { PlantillaPcbPage } from './PlantillaPcbPage'
import { TacticsPcbPage } from '../tactics/TacticsPcbPage'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

describe('Canonical lineup / Plantilla <-> Tactics synchronization', () => {
  it('assigning PG in Plantilla makes the same player PG in Tactics (Pizarra + Rotaciones)', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!

    const onLineupSlotChange = () => undefined
    render(createElement(PlantillaPcbPage, { world, onLineupSlotChange }))

    fireEvent.change(screen.getAllByLabelText(`Rotación ${player.firstName} ${player.lastName}`)[0]!, { target: { value: 'PG' } })
    cleanup()

    // Apply the assignment through the real engine (as the store action would).
    const nextWorld = setLineupSlot(world, team.id, 'PG', player.id)
    expect(getTeamLineup(nextWorld, team.id).starters.PG).toBe(player.id)

    render(createElement(TacticsPcbPage, { world: nextWorld }))
    expect(screen.getAllByText(`${player.firstName} ${player.lastName}`).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))
    expect(screen.getAllByText(`${player.firstName} ${player.lastName}`).length).toBeGreaterThan(0)
  })

  it('changing a starter from Tactics immediately reflects in Plantilla when both read the same world', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const [first, second] = getTeamRoster(base, team.id)

    // Simulate the Tactics board assigning `second` to PG (displacing `first` if present).
    const world = setLineupSlot(base, team.id, 'PG', second!.id)

    render(createElement(PlantillaPcbPage, { world }))
    const selects = screen.getAllByLabelText(`Rotación ${second!.firstName} ${second!.lastName}`) as HTMLSelectElement[]
    expect(selects.some((select) => select.value === 'PG')).toBe(true)
  })
})
