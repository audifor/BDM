// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamLineup, getTeamRoster, updateGameWorld, type GameWorld } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { BENCH_SLOTS } from '@/domain/tactics'
import { TacticsPcbPage } from './TacticsPcbPage'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

const dataTransfer = () => ({ setData: () => undefined, effectAllowed: '' })

/** Assigns every canonical starter+bench slot to a distinct real roster player. */
function withFullTwelve(world: GameWorld) {
  const team = getUserTeam(world)!
  const roster = getTeamRoster(world, team.id)
  const slots = ['PG', 'SG', 'SF', 'PF', 'C', ...BENCH_SLOTS] as const
  return slots.reduce((next, slot, index) => setLineupSlot(next, team.id, slot, roster[index]!.id), world)
}

describe('PcbTacticsBoard / canonical bench semantics', () => {
  it('BANQUILLO shows only players in canonical B1-B7 slots, in exact B1..B7 order', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    // Assign bench slots out of roster order to prove the board follows the slot, not array position.
    let world = setLineupSlot(base, team.id, 'B1', roster[3]!.id)
    world = setLineupSlot(world, team.id, 'B2', roster[1]!.id)
    world = setLineupSlot(world, team.id, 'B3', roster[5]!.id)

    render(createElement(TacticsPcbPage, { world }))
    const names = Array.from(document.querySelectorAll('.tactics-board-panel-body')[0]!.querySelectorAll('.tactics-board-player-name')).map((el) => el.textContent)
    expect(names).toEqual([
      `${roster[3]!.firstName} ${roster[3]!.lastName}`,
      `${roster[1]!.firstName} ${roster[1]!.lastName}`,
      `${roster[5]!.firstName} ${roster[5]!.lastName}`,
    ])
  })

  it('a player with no lineup slot is absent from BANQUILLO', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const unassignedPlayer = roster[0]!
    const world = setLineupSlot(base, team.id, 'B1', roster[1]!.id)

    render(createElement(TacticsPcbPage, { world }))
    const benchBody = document.querySelectorAll('.tactics-board-panel-body')[0]!
    expect(benchBody.textContent).not.toContain(`${unassignedPlayer.firstName} ${unassignedPlayer.lastName}`)
    expect(screen.getByText('BANQUILLO').closest('.tactics-board-panel-header')!.textContent).toContain('1')
  })

  it('court -> bench drag calls onLineupSlotChange with B1 (first free slot), never a synthetic bench id', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const world = setLineupSlot(base, team.id, 'PG', roster[0]!.id)
    const calls: [string, string][] = []

    render(createElement(TacticsPcbPage, { world, onLineupSlotChange: (slot, playerId) => calls.push([slot, playerId]) }))
    const dt = dataTransfer()
    const courtPlayer = screen.getByText(`${roster[0]!.firstName} ${roster[0]!.lastName}`).closest('.tactics-board-slot')!.querySelector('.tactics-board-slot-player')!
    fireEvent.dragStart(courtPlayer, { dataTransfer: dt })
    fireEvent.drop(screen.getByText('BANQUILLO').closest('.tactics-board-panel')!, { dataTransfer: dt })

    expect(calls).toContainEqual(['B1', roster[0]!.id])
  })

  it('bench -> starter drag removes the player from their B slot via the canonical engine', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const world = setLineupSlot(base, team.id, 'B1', roster[0]!.id)
    const calls: [string, string][] = []

    render(createElement(TacticsPcbPage, { world, onLineupSlotChange: (slot, playerId) => calls.push([slot, playerId]) }))
    const dt = dataTransfer()
    const benchPlayer = screen.getByText(`${roster[0]!.firstName} ${roster[0]!.lastName}`).closest('.tactics-board-player')!
    fireEvent.dragStart(benchPlayer, { dataTransfer: dt })
    fireEvent.drop(screen.getByText('PG', { selector: '.tactics-board-slot-label' }).closest('.tactics-board-slot')!, { dataTransfer: dt })

    // assignLineupSlot('PG', player) is the sole call - it vacates B1 as part of the
    // same canonical conflict resolution, so no separate B1-clear call should occur.
    expect(calls).toEqual([['PG', roster[0]!.id]])
    const nextWorld = setLineupSlot(world, team.id, 'PG', roster[0]!.id)
    expect(getTeamLineup(nextWorld, team.id).bench.B1).toBeUndefined()
  })

  it('when the bench is full, a court -> bench drop does not fabricate bench membership', () => {
    const base = withFullTwelve(createNewGame())
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const calls: [string, string][] = []

    render(createElement(TacticsPcbPage, { world: base, onLineupSlotChange: (slot, playerId) => calls.push([slot, playerId]) }))
    const dt = dataTransfer()
    const courtPlayer = screen.getByText(`${roster[0]!.firstName} ${roster[0]!.lastName}`).closest('.tactics-board-slot')!.querySelector('.tactics-board-slot-player')!
    fireEvent.dragStart(courtPlayer, { dataTransfer: dt })
    fireEvent.drop(screen.getByText('BANQUILLO').closest('.tactics-board-panel')!, { dataTransfer: dt })

    expect(calls).toHaveLength(0)
    // Player must still be shown on the court (starter), not silently vanished.
    expect(screen.getAllByText(`${roster[0]!.firstName} ${roster[0]!.lastName}`).length).toBeGreaterThan(0)
  })

  it('a full canonical 12-player lineup never mixes unassigned players into BANQUILLO', () => {
    const world = withFullTwelve(createNewGame())
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const lineup = getTeamLineup(world, team.id)
    const benchIds = new Set(Object.values(lineup.bench))

    render(createElement(TacticsPcbPage, { world }))
    const benchBody = document.querySelectorAll('.tactics-board-panel-body')[0]!
    for (const player of roster) {
      const onBench = benchBody.textContent!.includes(`${player.firstName} ${player.lastName}`)
      expect(onBench).toBe(benchIds.has(player.id))
    }
  })
})
