import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { isAcbSyntheticFreeAgentId } from '@/app/game/AcbSyntheticFreeAgentPool'
import { addDays, parseGameDate } from '@/domain/date'
import { getFreeAgents, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { releasePlayer } from '@/app/market'
import { createNegotiationContact, progressNegotiationContactResponses } from './MarketEngine'
import { ensureFreeAgentMarketTruthForPendingContacts, initializeFreeAgentMarketTruth } from './FreeAgentMarketTruth'

describe('F3 · hidden market truth of free agents', () => {
  const world = createAcbTestGame({ userTeamKey: 'ucm', careerStartDate: parseGameDate('2026-07-01'), playableMarket: true })

  it('the opening pool is identified, unsigned, deterministic and the only population with a market truth', () => {
    const pool = getFreeAgents(world)
    expect(pool).toHaveLength(15)
    expect(pool.every((player) => isAcbSyntheticFreeAgentId(player.id) && player.lastName.endsWith('[sintético]'))).toBe(true)
    const again = createAcbTestGame({ userTeamKey: 'ucm', careerStartDate: parseGameDate('2026-07-01'), playableMarket: true })
    expect(again.marketRealityByPlayerId).toEqual(world.marketRealityByPlayerId)
    expect(Object.keys(world.marketRealityByPlayerId).sort()).toEqual(pool.map((player) => player.id).sort())
    expect(Object.keys(createAcbTestGame({ userTeamKey: 'ucm' }).players)).toHaveLength(241) // the development fixture is unchanged
  })

  it('expected terms are the canonical market terms of the player and the willingness varies: nothing is tuned', () => {
    const realities = Object.values(world.marketRealityByPlayerId)
    expect(new Set(realities.map((reality) => reality.playerWillingness)).size).toBeGreaterThan(5)
    expect(realities.every((reality) => reality.availability === 'OPEN' && reality.expectedSalary % 10_000 === 0)).toBe(true)
  })

  it('is idempotent and never overwrites an existing truth', () => {
    const ids = getFreeAgents(world).map((player) => player.id)
    expect(initializeFreeAgentMarketTruth(world, ids)).toBe(world)
    expect(ensureFreeAgentMarketTruthForPendingContacts(world)).toBe(world)
  })

  it('serves a released player the manager contacts: the truth is derived on the day the answer is due, and only for the manager\'s own contacts', () => {
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[2]!
    const released = releasePlayer(world, team.id, playerId)
    expect(released.marketRealityByPlayerId[playerId]).toBeUndefined()
    const contact = createNegotiationContact(released, { organizationId: team.organizationId, teamId: team.id, playerId, startedOn: released.currentDate, actionKey: 'f3-released', responsibleActor: { kind: 'USER' }, sourcePlanId: 'plan:f3', sourceProposalId: 'proposal:f3' })
    expect(contact.status).toBe('CREATED')
    if (contact.status !== 'CREATED') return
    const waiting = updateGameWorld(contact.world, { currentDate: addDays(released.currentDate, 1) })
    const served = ensureFreeAgentMarketTruthForPendingContacts(waiting)
    expect(served.marketRealityByPlayerId[playerId]).toBeDefined()
    expect(progressNegotiationContactResponses(served).negotiationsById[contact.contact.id]).toHaveProperty('contactResponse')
    // The same call the day of the contact (not yet due) does nothing.
    expect(ensureFreeAgentMarketTruthForPendingContacts(contact.world)).toBe(contact.world)
  })
})
