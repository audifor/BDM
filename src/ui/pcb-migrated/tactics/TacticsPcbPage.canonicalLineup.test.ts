// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamLineup, getTeamRoster, updateGameWorld } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { getLineupAssignments } from '@/domain/tactics'
import { TacticsPcbPage } from './TacticsPcbPage'

/** Extends the user's roster past 12 by moving real generated players off another team's roster onto it (test-only; real GameWorld player records, not fabricated, and each player still belongs to exactly one roster). */
function withOversizedRoster(world: import('@/domain/world').GameWorld) {
  const team = getUserTeam(world)!
  const donor = Object.values(world.teams).find((candidate) => candidate.id !== team.id && candidate.gender === team.gender)!
  const movedPlayerIds = donor.rosterPlayerIds.slice(0, 4)
  return updateGameWorld(world, {
    teams: Object.values(world.teams).map((candidate) => {
      if (candidate.id === team.id) return { ...candidate, rosterPlayerIds: [...candidate.rosterPlayerIds, ...movedPlayerIds] }
      if (candidate.id === donor.id) return { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.filter((id) => !movedPlayerIds.includes(id)) }
      return candidate
    }),
  })
}

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

describe('TacticsPcbPage / canonical lineup as single source of truth', () => {
  it('Pizarra board reflects a starter assigned through the canonical lineup, not local index-based seeding', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    // Deliberately assign a player who is NOT roster[0..4] (index-based logic would miss this).
    const nonIndexStarter = roster[7] ?? roster[roster.length - 1]!
    const world = setLineupSlot(base, team.id, 'C', nonIndexStarter.id)

    render(createElement(TacticsPcbPage, { world }))
    // The court slot renders the player's rating badge; assert their name shows on the board (starter, not bench).
    expect(screen.getAllByText(`${nonIndexStarter.firstName} ${nonIndexStarter.lastName}`).length).toBeGreaterThan(0)
  })

  it('user assignments via the engine are the sole authority: two sequential assignments to the same slot leave exactly one occupant', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const [first, second] = roster

    let world = setLineupSlot(base, team.id, 'PG', first!.id)
    world = setLineupSlot(world, team.id, 'PG', second!.id)

    const lineup = getTeamLineup(world, team.id)
    expect(lineup.starters.PG).toBe(second!.id)
    const assignments = getLineupAssignments(lineup)
    expect(assignments.filter((a) => a.playerId === first!.id)).toHaveLength(0)
    expect(assignments.filter((a) => a.playerId === second!.id)).toHaveLength(1)
  })

  it('Rotaciones starter minutes derive from the canonical lineup, not from roster array position', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    // Put roster[0] on the bench and a later player (roster[9]) at PG, inverting index order.
    const benchedFirst = roster[0]!
    const promoted = roster[9] ?? roster[roster.length - 1]!
    let world = setLineupSlot(base, team.id, 'PG', promoted.id)
    world = setLineupSlot(world, team.id, 'B1', benchedFirst.id)

    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    const promotedRow = screen.getByText(new RegExp(`${promoted.firstName} ${promoted.lastName}$`)).closest('div')!
    const benchedRow = screen.getByText(new RegExp(`${benchedFirst.firstName} ${benchedFirst.lastName}$`)).closest('div')!
    const promotedQ1 = promotedRow.querySelector('input[type="number"]') as HTMLInputElement
    const benchedQ1 = benchedRow.querySelector('input[type="number"]') as HTMLInputElement

    expect(Number(promotedQ1.value)).toBe(8)
    expect(Number(benchedQ1.value)).toBe(0)
  })

  it('rosters larger than 12 leave extra players unassigned without error, and excluded from Rotaciones', () => {
    const base = withOversizedRoster(createNewGame())
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    expect(roster.length).toBeGreaterThan(12)

    let world = base
    const slots = ['PG', 'SG', 'SF', 'PF', 'C', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const
    for (const [index, slot] of slots.entries()) {
      world = setLineupSlot(world, team.id, slot, roster[index]!.id)
    }
    const lineup = getTeamLineup(world, team.id)
    expect(getLineupAssignments(lineup)).toHaveLength(12)

    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))
    // The 13th+ roster players must not silently receive rotation minutes: exactly 12 rows render.
    const rows = document.querySelectorAll('.pcb-tactics__rotation-grid > div:not(.is-head)')
    expect(rows).toHaveLength(12)
  })

  it('Rotaciones contains exactly the canonical active 12, in PG..C, B1..B7 order', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    let world = base
    const slots = ['PG', 'SG', 'SF', 'PF', 'C', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const
    for (const [index, slot] of slots.entries()) {
      world = setLineupSlot(world, team.id, slot, roster[index]!.id)
    }

    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    const rows = document.querySelectorAll('.pcb-tactics__rotation-grid > div:not(.is-head)')
    expect(rows).toHaveLength(12)
    slots.forEach((_, index) => {
      const expected = roster[index]!
      expect(rows[index]!.textContent).toContain(`${expected.firstName} ${expected.lastName}`)
    })
  })
})
