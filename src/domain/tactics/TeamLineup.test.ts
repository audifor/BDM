import { describe, expect, it } from 'vitest'
import type { PlayerId, TeamId } from '@/domain/ids'
import {
  assignLineupSlot,
  BENCH_SLOTS,
  clearLineupSlot,
  clearPlayerFromLineup,
  createDefaultTeamLineup,
  getLineupAssignments,
  getLineupSlotForPlayer,
  validateTeamLineup,
} from './TeamLineup'

const teamId = 'team-1' as TeamId
const playerId = (n: number) => `player-${n}` as PlayerId

describe('TeamLineup', () => {
  it('creates an empty default lineup for a team', () => {
    const lineup = createDefaultTeamLineup(teamId)
    expect(lineup.teamId).toBe(teamId)
    expect(getLineupAssignments(lineup)).toEqual([])
  })

  it('assigns a player to a starter slot', () => {
    const lineup = assignLineupSlot(createDefaultTeamLineup(teamId), 'PG', playerId(1))
    expect(lineup.starters.PG).toBe(playerId(1))
    expect(getLineupSlotForPlayer(lineup, playerId(1))).toBe('PG')
  })

  it('assigns a player to a bench slot and preserves B1-B7 identity', () => {
    let lineup = createDefaultTeamLineup(teamId)
    for (const [index, slot] of BENCH_SLOTS.entries()) {
      lineup = assignLineupSlot(lineup, slot, playerId(index))
    }
    for (const [index, slot] of BENCH_SLOTS.entries()) {
      expect(lineup.bench[slot]).toBe(playerId(index))
    }
  })

  it('reassigning a player to an occupied slot replaces the former occupant cleanly, leaving them unassigned', () => {
    let lineup = assignLineupSlot(createDefaultTeamLineup(teamId), 'PG', playerId(1))
    lineup = assignLineupSlot(lineup, 'PG', playerId(2))

    expect(lineup.starters.PG).toBe(playerId(2))
    expect(getLineupSlotForPlayer(lineup, playerId(1))).toBeUndefined()
    expect(getLineupSlotForPlayer(lineup, playerId(2))).toBe('PG')
  })

  it('assigning a player already in one slot to a new slot vacates the old slot (same player cannot occupy two slots)', () => {
    let lineup = assignLineupSlot(createDefaultTeamLineup(teamId), 'PG', playerId(1))
    lineup = assignLineupSlot(lineup, 'SG', playerId(1))

    expect(lineup.starters.PG).toBeUndefined()
    expect(lineup.starters.SG).toBe(playerId(1))
    expect(getLineupAssignments(lineup)).toEqual([{ slot: 'SG', playerId: playerId(1) }])
  })

  it('deterministic conflict reassignment: swapping two players between slots via sequential assigns ends in a consistent, single-owner state', () => {
    let lineup = createDefaultTeamLineup(teamId)
    lineup = assignLineupSlot(lineup, 'PG', playerId(1))
    lineup = assignLineupSlot(lineup, 'SG', playerId(2))

    // Move player 2 into PG (occupied by player 1); player 1 becomes unassigned.
    lineup = assignLineupSlot(lineup, 'PG', playerId(2))

    expect(lineup.starters.PG).toBe(playerId(2))
    expect(lineup.starters.SG).toBeUndefined()
    expect(getLineupSlotForPlayer(lineup, playerId(1))).toBeUndefined()
    const assignments = getLineupAssignments(lineup)
    expect(assignments).toHaveLength(1)
  })

  it('removing a role leaves that player unassigned', () => {
    let lineup = assignLineupSlot(createDefaultTeamLineup(teamId), 'C', playerId(5))
    lineup = clearLineupSlot(lineup, 'C')

    expect(lineup.starters.C).toBeUndefined()
    expect(getLineupSlotForPlayer(lineup, playerId(5))).toBeUndefined()
  })

  it('clearPlayerFromLineup removes a player regardless of which slot type they hold', () => {
    let lineup = assignLineupSlot(createDefaultTeamLineup(teamId), 'B3', playerId(9))
    lineup = clearPlayerFromLineup(lineup, playerId(9))

    expect(lineup.bench.B3).toBeUndefined()
  })

  it('supports rosters larger than 12: players beyond the 12 assigned slots remain unassigned without error', () => {
    let lineup = createDefaultTeamLineup(teamId)
    const slots = ['PG', 'SG', 'SF', 'PF', 'C', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const
    for (const [index, slot] of slots.entries()) {
      lineup = assignLineupSlot(lineup, slot, playerId(index))
    }
    // 13th, 14th, 15th players never get assigned - no error, simply absent from the lineup.
    const extraIds = [playerId(12), playerId(13), playerId(14)]
    for (const id of extraIds) {
      expect(getLineupSlotForPlayer(lineup, id)).toBeUndefined()
    }
    expect(getLineupAssignments(lineup)).toHaveLength(12)
  })

  it('getLineupAssignments always returns slots in canonical PG..C, B1..B7 order regardless of assignment order', () => {
    let lineup = createDefaultTeamLineup(teamId)
    lineup = assignLineupSlot(lineup, 'B2', playerId(1))
    lineup = assignLineupSlot(lineup, 'C', playerId(2))
    lineup = assignLineupSlot(lineup, 'PG', playerId(3))

    expect(getLineupAssignments(lineup).map((a) => a.slot)).toEqual(['PG', 'C', 'B2'])
  })

  it('validateTeamLineup passes for a lineup whose players all belong to the roster with no duplicates', () => {
    const lineup = assignLineupSlot(assignLineupSlot(createDefaultTeamLineup(teamId), 'PG', playerId(1)), 'SG', playerId(2))
    expect(() => validateTeamLineup(lineup, [playerId(1), playerId(2), playerId(3)])).not.toThrow()
  })

  it('validateTeamLineup throws if a slot references a player outside the roster', () => {
    const lineup = assignLineupSlot(createDefaultTeamLineup(teamId), 'PG', playerId(99))
    expect(() => validateTeamLineup(lineup, [playerId(1), playerId(2)])).toThrow()
  })

  it('validateTeamLineup throws if the same player somehow appears in two slots (duplicate slot/player conflict cannot persist)', () => {
    const lineup: import('./TeamLineup').TeamLineup = { teamId, starters: { PG: playerId(1), SG: playerId(1) }, bench: {} }
    expect(() => validateTeamLineup(lineup, [playerId(1)])).toThrow()
  })
})
