import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { createTradeRules } from '@/domain/trade'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { proposeTradeNegotiation, respondToTradeNegotiation, tradeNegotiationResponseReadiness } from './TradeNegotiationService'
import { serializeGameWorldV2, deserializeGameWorldV2 } from '@/save/GameWorldSaveV2'
import { evaluateSimulationBreakpoints } from '@/app/game/SimulationBreakpoints'

function setup() {
  const base = createNewGame()
  const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
  const competition = base.competitions[season.competitionId]!
  const userTeamId = competition.participantTeamIds.find((teamId) => base.teams[teamId]!.coachId !== undefined)!
  const initial = updateGameWorld(base, {
    userCoachId: base.teams[userTeamId]!.coachId!,
    currentSeasonId: season.id,
    currentDate: season.startDate,
  })
  const user = getUserTeam(initial)!
  const partner = competition.participantTeamIds.map((teamId) => initial.teams[teamId]!).find((team) => team.id !== user.id)!
  const players = [user.rosterPlayerIds[0]!, user.rosterPlayerIds[1]!, partner.rosterPlayerIds[0]!, partner.rosterPlayerIds[1]!]
  const world = updateGameWorld(initial, { contracts: Object.values(initial.contractsById).map((contract) => players.includes(contract.playerId)
    ? { ...contract, compensation: { annualSalary: 1_000_000, years: [{ cashSalary: 1_000_000, capHit: 1_000_000, guaranteedAmount: 1_000_000 }] } }
    : contract) })
  const proposal = (leftPlayer: string, rightPlayer: string) => ({
    id: 'trade-negotiation-test-package', ecosystemId: competition.ecosystemId, seasonId: season.id,
    participantTeamIds: [user.id, partner.id],
    movements: [
      { asset: { kind: 'player' as const, playerId: leftPlayer as typeof user.rosterPlayerIds[number] }, fromTeamId: user.id, toTeamId: partner.id },
      { asset: { kind: 'player' as const, playerId: rightPlayer as typeof partner.rosterPlayerIds[number] }, fromTeamId: partner.id, toTeamId: user.id },
    ],
  })
  const staffPersonId = staffPersonIdFromString(`trade-negotiator-${partner.id}`)
  const assignment = { id: teamStaffAssignmentIdFromString(`trade-negotiator-assignment-${partner.id}`), staffPersonId, teamId: partner.id, role: 'generalManager' as const, assignedOn: world.currentDate }
  const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
  const staffed = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffPersonId, identity: { firstName: 'Trade', lastName: 'Negotiator' }, professional: { attributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), assignment],
  })
  const delegatedWorld = updateGameWorld(staffed, { responsibilities: [...Object.values(staffed.responsibilitiesById).filter((item) => item.id !== responsibilityIdForTeam(partner.id, 'negotiatePlayerTrade')), { id: responsibilityIdForTeam(partner.id, 'negotiatePlayerTrade'), teamId: partner.id, kind: 'negotiatePlayerTrade', mode: 'delegated', holderStaffId: staffPersonId }] })
  return { world, delegatedWorld, season, user, partner, assignment, proposal, players }
}

describe('TradeNegotiationService', () => {
  it('records a counter, requires independent authority, and agrees only on the exact current revision without execution', () => {
    const { world, delegatedWorld, user, partner, assignment, proposal, players } = setup()
    const originalRosters = Object.fromEntries([user, partner].map((team) => [team.id, [...team.rosterPlayerIds]]))
    const originalContracts = world.contractsById
    const first = proposeTradeNegotiation(delegatedWorld, proposal(players[0]!, players[2]!), user.id, { kind: 'USER' }, 'trade-pursuit:test')
    expect(first, JSON.stringify(first.reasons)).toMatchObject({ status: 'PROPOSED' })
    const negotiation = first.negotiation!
    expect(proposeTradeNegotiation(first.world, proposal(players[0]!, players[2]!), user.id, { kind: 'USER' }, 'trade-pursuit:test')).toMatchObject({ status: 'ALREADY_PROPOSED', world: first.world })
    expect(respondToTradeNegotiation(first.world, { negotiationId: negotiation.id, expectedRevisionId: negotiation.currentRevisionId, teamId: partner.id, actor: { kind: 'USER' }, action: 'COUNTER', counterPackage: proposal(players[1]!, players[3]!) }).status).toBe('NOT_AUTHORIZED')
    expect(tradeNegotiationResponseReadiness(first.world, negotiation, partner.id).status).toBe('MORE_INFORMATION_REQUIRED')
    const oldRevisionAccepted = respondToTradeNegotiation(first.world, { negotiationId: negotiation.id, expectedRevisionId: negotiation.currentRevisionId, teamId: user.id, actor: { kind: 'USER' }, action: 'ACCEPT' })
    expect(oldRevisionAccepted.status).toBe('ACCEPTED')

    const counter = respondToTradeNegotiation(oldRevisionAccepted.world, {
      negotiationId: negotiation.id, expectedRevisionId: negotiation.currentRevisionId, teamId: partner.id,
      actor: { kind: 'STAFF', staffPersonId: assignment.staffPersonId }, action: 'COUNTER', counterPackage: proposal(players[1]!, players[3]!),
    })
    expect(counter.status).toBe('COUNTERED')
    expect(counter.negotiation!.revisions).toHaveLength(2)
    expect(counter.negotiation!.actions.some((action) => action.revisionId === negotiation.currentRevisionId && action.teamId === user.id && action.kind === 'ACCEPT')).toBe(true)
    expect(counter.negotiation!.actions.some((action) => action.revisionId === counter.negotiation!.currentRevisionId && action.teamId === user.id && action.kind === 'ACCEPT')).toBe(false)
    expect(counter.negotiation!.actions.at(-1)).toMatchObject({ kind: 'COUNTER', teamId: partner.id, respondedToRevisionId: negotiation.currentRevisionId })
    expect(respondToTradeNegotiation(counter.world, { negotiationId: negotiation.id, expectedRevisionId: negotiation.currentRevisionId, teamId: partner.id, actor: { kind: 'STAFF', staffPersonId: assignment.staffPersonId }, action: 'COUNTER', counterPackage: proposal(players[1]!, players[3]!) })).toMatchObject({ status: 'ALREADY_APPLIED', world: counter.world })
    expect(respondToTradeNegotiation(counter.world, { negotiationId: negotiation.id, expectedRevisionId: negotiation.currentRevisionId, teamId: user.id, actor: { kind: 'USER' }, action: 'REJECT' }).status).toBe('STALE')
    const userAccepted = respondToTradeNegotiation(counter.world, { negotiationId: negotiation.id, expectedRevisionId: counter.negotiation!.currentRevisionId, teamId: user.id, actor: { kind: 'USER' }, action: 'ACCEPT' })
    expect(userAccepted.status).toBe('ACCEPTED')
    const agreed = respondToTradeNegotiation(userAccepted.world, { negotiationId: negotiation.id, expectedRevisionId: counter.negotiation!.currentRevisionId, teamId: partner.id, actor: { kind: 'STAFF', staffPersonId: assignment.staffPersonId }, action: 'ACCEPT' })
    expect(agreed, JSON.stringify(agreed.reasons)).toMatchObject({ status: 'AGREED' })
    expect(agreed.negotiation).toMatchObject({ status: 'AGREED', currentRevisionId: counter.negotiation!.currentRevisionId })
    expect(agreed.world.teams[user.id]!.rosterPlayerIds).toEqual(originalRosters[user.id])
    expect(agreed.world.teams[partner.id]!.rosterPlayerIds).toEqual(originalRosters[partner.id])
    expect(agreed.world.contractsById).toEqual(originalContracts)
    expect(Object.keys(agreed.world.tradeHistoryById)).toEqual(Object.keys(world.tradeHistoryById))
    expect(agreed.world.playerTransactionsById).toEqual(world.playerTransactionsById)
    expect(agreed.world.governanceDecisionsById).toEqual(world.governanceDecisionsById)
    const restored = deserializeGameWorldV2(serializeGameWorldV2(agreed.world, '2032-10-01T00:00:00.000Z'))
    expect(restored.tradeNegotiationsById[negotiation.id]).toEqual(agreed.negotiation)
  })

  it('allows a new negotiation on the trade deadline and blocks one after it', () => {
    const { delegatedWorld, user, proposal, players, season } = setup()
    const deadline = delegatedWorld.tradeRulesBySeasonId[season.id]!.tradeWindow!.closesOn!
    const onDeadline = proposeTradeNegotiation(updateGameWorld(delegatedWorld, { currentDate: deadline }), proposal(players[0]!, players[2]!), user.id, { kind: 'USER' }, 'trade-pursuit:deadline')
    expect(onDeadline, JSON.stringify(onDeadline.reasons)).toMatchObject({ status: 'PROPOSED' })
    const afterDeadline = proposeTradeNegotiation(updateGameWorld(delegatedWorld, { currentDate: addDays(deadline, 1) }), proposal(players[0]!, players[2]!), user.id, { kind: 'USER' }, 'trade-pursuit:deadline')
    expect(afterDeadline.status).toBe('BLOCKED')
    expect(afterDeadline.reasons).toEqual(['TRADE_WINDOW_CLOSED'])
  })

  it('blocks a response after a trade window closes and preserves an explicit rejection', () => {
    const { world, delegatedWorld, user, partner, assignment, proposal, players, season } = setup()
    const created = proposeTradeNegotiation(delegatedWorld, proposal(players[0]!, players[2]!), user.id, { kind: 'USER' })
    const closedRules = createTradeRules({ ...world.tradeRulesBySeasonId[season.id]!, tradeWindow: { opensOn: season.startDate, closesOn: season.startDate } })
    const closed = updateGameWorld(created.world, { currentDate: season.endDate, tradeRulesBySeasonId: { ...created.world.tradeRulesBySeasonId, [season.id]: closedRules } })
    const closedResponse = respondToTradeNegotiation(closed, { negotiationId: created.negotiation!.id, expectedRevisionId: created.negotiation!.currentRevisionId, teamId: partner.id, actor: { kind: 'STAFF', staffPersonId: assignment.staffPersonId }, action: 'REJECT' })
    expect(closedResponse.reasons).toContain('TRADE_WINDOW_CLOSED')
    const rejected = respondToTradeNegotiation(created.world, { negotiationId: created.negotiation!.id, expectedRevisionId: created.negotiation!.currentRevisionId, teamId: partner.id, actor: { kind: 'STAFF', staffPersonId: assignment.staffPersonId }, action: 'REJECT' })
    expect(rejected.status).toBe('REJECTED')
    expect(rejected.negotiation!.actions.at(-1)).toMatchObject({ kind: 'REJECT', teamId: partner.id })
  })

  it('blocks an acceptance when a player contract changes and rejects cash consideration', () => {
    const { world, user, proposal, players } = setup()
    const packageProposal = proposal(players[0]!, players[2]!)
    const created = proposeTradeNegotiation(world, packageProposal, user.id, { kind: 'USER' })
    const snapshottedContract = created.negotiation!.revisions[0]!.contractSnapshots[0]!
    const changed = updateGameWorld(created.world, { contracts: Object.values(created.world.contractsById).map((contract) => contract.id === snapshottedContract.id
      ? { ...contract, compensation: { annualSalary: 1_100_000, years: [{ cashSalary: 1_100_000, capHit: 1_100_000, guaranteedAmount: 1_100_000 }] } }
      : contract) })
    const stale = respondToTradeNegotiation(changed, { negotiationId: created.negotiation!.id, expectedRevisionId: created.negotiation!.currentRevisionId, teamId: user.id, actor: { kind: 'USER' }, action: 'ACCEPT' })
    expect(stale.status).toBe('BLOCKED')
    expect(stale.reasons).toContain('PLAYER_CONTRACT_CHANGED')
    const cash = proposeTradeNegotiation(world, { ...packageProposal, movements: [{ asset: { kind: 'cash' as const, amount: 100_000 }, fromTeamId: user.id, toTeamId: packageProposal.participantTeamIds[1]! }] }, user.id, { kind: 'USER' })
    expect(cash.status).toBe('BLOCKED')
    expect(cash.reasons).toContain('CASH_SETTLEMENT_UNAVAILABLE')
  })

  it('surfaces a current incoming package as an actionable user breakpoint', () => {
    const { delegatedWorld, user, partner, assignment, proposal, players } = setup()
    const incoming = proposeTradeNegotiation(delegatedWorld, proposal(players[0]!, players[2]!), partner.id, { kind: 'STAFF', staffPersonId: assignment.staffPersonId })
    expect(incoming.status).toBe('PROPOSED')
    expect(evaluateSimulationBreakpoints(incoming.world).candidates).toContainEqual(expect.objectContaining({
      level: 'ACTION_REQUIRED', reason: 'tradeNegotiationResponse', sourceId: incoming.negotiation!.id,
      route: 'trades', actionTarget: { negotiationId: incoming.negotiation!.id, revisionId: incoming.negotiation!.currentRevisionId },
    }))
  })
})
