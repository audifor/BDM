import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createNegotiationContact, openNegotiation } from '@/engine/market/MarketEngine'
import { getAddressableScoutingPlayerIds, requestPlayerScouting } from '@/app/scouting/ScoutingOperationsService'
import { validateTrade } from '@/engine/trade/TradeEngine'
import { getEcosystemForTeam, isPlayerTeamCategoryCompatible, requirePlayerTeamCategory } from '@/domain/world'

it('keeps professional market contacts, formal offers and scouting within the receiving team category', () => {
  const world = createNewGame()
  const team = Object.values(world.teams).find(value => value.coachId === world.userCoachId)!
  const same = Object.values(world.players).find(value => value.gender === team.gender)!
  const opposite = Object.values(world.players).find(value => value.gender !== team.gender)!
  expect(isPlayerTeamCategoryCompatible(world, same.id, team.id)).toBe(true)
  expect(isPlayerTeamCategoryCompatible(world, opposite.id, team.id)).toBe(false)
  expect(() => requirePlayerTeamCategory(world, same.id, team.id)).not.toThrow()
  expect(() => requirePlayerTeamCategory(world, opposite.id, team.id)).toThrow('PLAYER_TEAM_CATEGORY_MISMATCH')
  const contact = createNegotiationContact(world, {
    organizationId: team.organizationId, teamId: team.id, playerId: opposite.id,
    startedOn: world.currentDate, actionKey: 'cross-category', sourcePlanId: 'test-plan',
    sourceProposalId: 'test-proposal', responsibleActor: { kind: 'HEAD_COACH' },
  } as Parameters<typeof createNegotiationContact>[1])
  expect(contact.status).toBe('BLOCKED')
  if (contact.status === 'BLOCKED') expect(contact.reason).toBe('PLAYER_TEAM_CATEGORY_MISMATCH')
  expect(() => openNegotiation(world, {
    organizationId: team.organizationId, teamId: team.id, playerId: opposite.id,
    salary: 100_000, years: 1, actionKey: 'cross-category',
    sourcePlanId: 'test-plan', sourceProposalId: 'test-proposal',
    offerResponsibleActor: { kind: 'HEAD_COACH' },
  } as Parameters<typeof openNegotiation>[1])).toThrow('PLAYER_TEAM_CATEGORY_MISMATCH')
  const candidates = getAddressableScoutingPlayerIds(world, team.id)
  expect(candidates).toContain(team.rosterPlayerIds[0])
  expect(candidates.every(id => world.players[id]!.gender === team.gender)).toBe(true)
  expect(() => requestPlayerScouting(world, {
    teamId: team.id, playerId: opposite.id, missionType: 'QUICK_LOOK',
  })).toThrow('PLAYER_TEAM_CATEGORY_MISMATCH')
})

it('rejects a cross-category player trade before roster mutation', () => {
  const world = createNewGame()
  const men = Object.values(world.teams).find(team => team.gender === 'male')!
  const women = Object.values(world.teams).find(team => team.gender === 'female')!
  const proposal = {
    id: 'cross-category-trade', ecosystemId: getEcosystemForTeam(world, men.id)!.id,
    seasonId: world.currentSeasonId,
    participantTeamIds: [men.id, women.id],
    movements: [{ fromTeamId: men.id, toTeamId: women.id,
      asset: { kind: 'player' as const, playerId: men.rosterPlayerIds[0]! } }],
  }
  const validation = validateTrade(world, proposal)
  expect(validation.allowed).toBe(false)
  expect(validation.teamResults.find(result => result.teamId === women.id)?.reasons)
    .toContain('PLAYER_CATEGORY_MISMATCH')
})
