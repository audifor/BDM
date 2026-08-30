// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { PlantillaPcbPage } from './PlantillaPcbPage'
import { TacticsPcbPage } from '../tactics/TacticsPcbPage'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())
beforeEach(() => useGameStore.getState().resetGame())

/**
 * Real production wiring: both pages read `world` from the store and call the
 * store's own `setLineupSlot`/`clearLineupSlot` actions, exactly like
 * `DesktopAppHost`/`App.tsx` wire them. No manual engine call after a UI event -
 * the store subscription is what drives the re-render.
 */
function PlantillaHost() {
  const world = useGameStore((state) => state.world)
  const setLineupSlot = useGameStore((state) => state.setLineupSlot)
  const clearLineupSlot = useGameStore((state) => state.clearLineupSlot)
  if (world === null) return null
  return createElement(PlantillaPcbPage, { world, onLineupSlotChange: setLineupSlot, onLineupSlotClear: clearLineupSlot })
}
function TacticsHost() {
  const world = useGameStore((state) => state.world)
  const setLineupSlot = useGameStore((state) => state.setLineupSlot)
  const clearLineupSlot = useGameStore((state) => state.clearLineupSlot)
  if (world === null) return null
  return createElement(TacticsPcbPage, { world, onLineupSlotChange: setLineupSlot, onLineupSlotClear: clearLineupSlot })
}

describe('Canonical lineup / real UI -> store -> world -> UI synchronization', () => {
  it('Plantilla selector change -> store action -> GameWorld -> Tactics reads the changed world', () => {
    useGameStore.getState().newGame()
    const team = getUserTeam(useGameStore.getState().world!)!
    const player = getTeamRoster(useGameStore.getState().world!, team.id)[0]!

    render(createElement(PlantillaHost))
    fireEvent.change(screen.getAllByLabelText(`Rotación ${player.firstName} ${player.lastName}`)[0]!, { target: { value: 'PG' } })

    // The store itself now reflects the assignment - proving the real production
    // callback path (store action), not a manual post-hoc engine call.
    expect(useGameStore.getState().world!.lineupsByTeamId[team.id]!.starters.PG).toBe(player.id)
    cleanup()

    render(createElement(TacticsHost))
    expect(screen.getAllByText(`${player.firstName} ${player.lastName}`).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))
    expect(screen.getAllByText(`${player.firstName} ${player.lastName}`).length).toBeGreaterThan(0)
  })

  it('Tactics lineup change -> GameWorld -> Plantilla selector reflects it', () => {
    useGameStore.getState().newGame()
    const team = getUserTeam(useGameStore.getState().world!)!
    const [first, second] = getTeamRoster(useGameStore.getState().world!, team.id)

    render(createElement(TacticsHost))
    const dataTransfer = { setData: () => undefined, effectAllowed: '' }
    fireEvent.dragStart(screen.getAllByText(`${second!.firstName} ${second!.lastName}`)[0]!.closest('.tactics-board-player')!, { dataTransfer })
    fireEvent.drop(screen.getByText('PG', { selector: '.tactics-board-slot-label' }).closest('.tactics-board-slot')!, { dataTransfer })

    expect(useGameStore.getState().world!.lineupsByTeamId[team.id]!.starters.PG).toBe(second!.id)
    cleanup()

    render(createElement(PlantillaHost))
    const secondSelects = screen.getAllByLabelText(`Rotación ${second!.firstName} ${second!.lastName}`) as HTMLSelectElement[]
    expect(secondSelects.some((select) => select.value === 'PG')).toBe(true)

    if (first !== undefined) {
      const firstSelects = screen.getAllByLabelText(`Rotación ${first.firstName} ${first.lastName}`) as HTMLSelectElement[]
      expect(firstSelects.every((select) => select.value !== 'PG')).toBe(true)
    }
  })
})
