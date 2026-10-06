import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { createTradeRules } from '@/domain/trade'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { addDays } from '@/domain/date'
import { serializeGameWorldV3, deserializeGameWorldV3 } from '@/save/GameWorldSaveV3'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { serializeGameWorldV2 } from '@/save/GameWorldSaveV2'
import { getUserTeam } from '@/engine/calendar'
import { proposeTradeNegotiation, respondToTradeNegotiation } from './TradeNegotiationService'
import { assessTradeCommitmentReadiness, completeAgreedTrade, ensureTradeCommitmentDecision, recordTradeCommitmentEvent, startUserTradeCommitment } from './TradeGovernanceExecutionService'

function fixture() {
  const base = createNewGame()
  const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
  const competition = base.competitions[season.competitionId]!
  const userTeamId = competition.participantTeamIds.find((teamId) => base.teams[teamId]!.coachId !== undefined)!
  const partnerId = competition.participantTeamIds.find((teamId) => teamId !== userTeamId && base.teams[teamId]!.coachId !== undefined)!
  const userTeam = base.teams[userTeamId]!, partner = base.teams[partnerId]!
  const teams = [userTeam, partner]
  const players = [userTeam.rosterPlayerIds[0]!, partner.rosterPlayerIds[0]!]
  const staffByTeam = new Map(teams.map((team) => [team.id, {
    proposer: staffPersonIdFromString(`trade-governance:${team.id}:proposer`),
    approver: staffPersonIdFromString(`trade-governance:${team.id}:approver`),
  }]))
  const institutions = teams.map((team) => ({ id: `trade-institution:${team.id}`, universe: 'PROFESSIONAL_CLUB' as const, name: `${team.name} governance`, teamIds: [team.id] }))
  const bodies = teams.flatMap((team) => {
    const institutionId = `trade-institution:${team.id}`
    return [
      { id: `trade-owner:${team.id}`, institutionId, kind: 'OWNERSHIP' as const, name: 'Owner' },
      { id: `trade-executive:${team.id}`, institutionId, kind: 'EXECUTIVE' as const, name: 'Executive' },
      { id: `trade-board:${team.id}`, institutionId, kind: 'BOARD' as const, name: 'Board' },
    ]
  })
  const grants = teams.flatMap((team) => [
    { id: `trade-propose-execute:${team.id}`, fromBodyId: `trade-owner:${team.id}`, toBodyId: `trade-executive:${team.id}`, decision: 'PLAYER_TRADE_COMMITMENT' as const, grantedOn: season.startDate },
    { id: `trade-approve:${team.id}`, fromBodyId: `trade-owner:${team.id}`, toBodyId: `trade-board:${team.id}`, decision: 'PLAYER_TRADE_COMMITMENT' as const, grantedOn: season.startDate },
  ])
  const participations = teams.flatMap((team) => [
    { id: `trade-right-propose:${team.id}`, authorityGrantId: `trade-propose-execute:${team.id}`, bodyId: `trade-executive:${team.id}`, edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
    { id: `trade-right-execute:${team.id}`, authorityGrantId: `trade-propose-execute:${team.id}`, bodyId: `trade-executive:${team.id}`, edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
    { id: `trade-right-approve:${team.id}`, authorityGrantId: `trade-approve:${team.id}`, bodyId: `trade-board:${team.id}`, edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const },
  ])
  const appointments = teams.flatMap((team) => {
    const actors = staffByTeam.get(team.id)!
    return [
      { id: `trade-appointment-proposer:${team.id}`, bodyId: `trade-executive:${team.id}`, actor: team.id === userTeamId ? { kind: 'COACH' as const, id: base.teams[team.id]!.coachId! } : { kind: 'STAFF' as const, id: actors.proposer }, role: 'CEO' as const, startedOn: season.startDate },
      { id: `trade-appointment-approver:${team.id}`, bodyId: `trade-board:${team.id}`, actor: { kind: 'STAFF' as const, id: actors.approver }, role: 'BOARD_MEMBER' as const, startedOn: season.startDate },
    ]
  })
  const assignments = teams.flatMap((team) => {
    const actors = staffByTeam.get(team.id)!
    return [actors.proposer, actors.approver].map((staffPersonId) => ({ id: teamStaffAssignmentIdFromString(`trade-governance-assignment:${staffPersonId}`), staffPersonId, teamId: team.id, role: staffPersonId === actors.proposer ? 'generalManager' as const : 'assistantGeneralManager' as const, assignedOn: season.startDate }))
  })
  const staffPeople = [...staffByTeam.values()].flatMap(({ proposer, approver }) => [proposer, approver].map((id) => ({ id, identity: { firstName: 'Trade', lastName: 'Officer' }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> } })))
  const opened = updateGameWorld(base, {
    userCoachId: userTeam.coachId!, currentSeasonId: season.id, currentDate: season.startDate,
    contracts: Object.values(base.contractsById).map((contract) => players.includes(contract.playerId) ? { ...contract, compensation: { annualSalary: 1_000_000, years: [{ cashSalary: 1_000_000, capHit: 1_000_000, guaranteedAmount: 1_000_000 }] } } : contract),
    governanceInstitutions: institutions, governanceBodies: bodies, governanceAppointments: appointments, governanceAuthorityGrants: grants, governanceDecisionParticipationGrants: participations,
    staffPeople: [...Object.values(base.staffPeopleById), ...staffPeople], teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), ...assignments],
    responsibilities: [...Object.values(base.responsibilitiesById).filter((item) => !(item.teamId === partner.id && (item.kind === 'negotiatePlayerTrade' || item.kind === 'executePlayerTrade'))),
      { id: responsibilityIdForTeam(partner.id, 'negotiatePlayerTrade'), teamId: partner.id, kind: 'negotiatePlayerTrade', mode: 'delegated', holderStaffId: staffByTeam.get(partner.id)!.proposer },
      { id: responsibilityIdForTeam(partner.id, 'executePlayerTrade'), teamId: partner.id, kind: 'executePlayerTrade', mode: 'delegated', holderStaffId: staffByTeam.get(partner.id)!.proposer }],
  })
  const proposal = { id: 'test-trade-package', ecosystemId: competition.ecosystemId, seasonId: season.id, participantTeamIds: [userTeam.id, partner.id], movements: [
    { asset: { kind: 'player' as const, playerId: players[0]! }, fromTeamId: userTeam.id, toTeamId: partner.id },
    { asset: { kind: 'player' as const, playerId: players[1]! }, fromTeamId: partner.id, toTeamId: userTeam.id },
  ] }
  const proposed = proposeTradeNegotiation(opened, proposal, userTeam.id, { kind: 'USER' }, 'trade-governance-test')
  const acceptUser = respondToTradeNegotiation(proposed.world, { negotiationId: proposed.negotiation!.id, expectedRevisionId: proposed.negotiation!.currentRevisionId, teamId: userTeam.id, actor: { kind: 'USER' }, action: 'ACCEPT' })
  const agreed = respondToTradeNegotiation(acceptUser.world, { negotiationId: proposed.negotiation!.id, expectedRevisionId: proposed.negotiation!.currentRevisionId, teamId: partner.id, actor: { kind: 'STAFF', staffPersonId: staffByTeam.get(partner.id)!.proposer }, action: 'ACCEPT' })
  return { world: agreed.world, userTeam, partner, players, staffByTeam, negotiation: agreed.negotiation! }
}

function startBoth(f: ReturnType<typeof fixture>) {
  const user = startUserTradeCommitment(f.world, { negotiationId: f.negotiation.id, expectedRevisionId: f.negotiation.currentRevisionId, teamId: f.userTeam.id })
  const ai = ensureTradeCommitmentDecision(user.world, { negotiationId: f.negotiation.id, expectedRevisionId: f.negotiation.currentRevisionId, teamId: f.partner.id, initiator: { kind: 'STAFF', id: f.staffByTeam.get(f.partner.id)!.proposer } })
  return { world: ai.world, userDecisionId: user.decision!.id, aiDecisionId: ai.decision!.id }
}

describe('trade Governance and atomic execution', () => {
  it('creates independent exact-revision commitments and completes one atomic engine exchange after the final real approval', () => {
    const f = fixture(), started = startBoth(f)
    expect(started.userDecisionId).not.toBe(started.aiDecisionId)
    expect(started.world.governanceDecisionsById[started.userDecisionId]!.subject).toMatchObject({ kind: 'GENERIC', referenceId: expect.stringContaining(encodeURIComponent(f.negotiation.currentRevisionId)) })
    expect(assessTradeCommitmentReadiness(started.world, f.negotiation.id, f.negotiation.currentRevisionId).status).toBe('REQUIRES_APPROVAL')
    const first = recordTradeCommitmentEvent(started.world, { decisionId: started.userDecisionId, kind: 'APPROVED', bodyId: `trade-board:${f.userTeam.id}`, actor: { kind: 'STAFF', id: f.staffByTeam.get(f.userTeam.id)!.approver } })
    expect(first.status).toBe('REQUIRES_APPROVAL')
    expect(first.world.tradeNegotiationsById[f.negotiation.id]!.status).toBe('AGREED')
    const beforeContractId = Object.values(first.world.contractsById).find((contract) => contract.playerId === f.players[0])!.id
    const done = recordTradeCommitmentEvent(first.world, { decisionId: started.aiDecisionId, kind: 'APPROVED', bodyId: `trade-board:${f.partner.id}`, actor: { kind: 'STAFF', id: f.staffByTeam.get(f.partner.id)!.approver } })
    expect(done.status).toBe('EXECUTED')
    expect(done.world.tradeNegotiationsById[f.negotiation.id]).toMatchObject({ status: 'EXECUTED', currentRevisionId: f.negotiation.currentRevisionId })
    expect(Object.values(done.world.tradeHistoryById)).toHaveLength(Object.keys(f.world.tradeHistoryById).length + 1)
    expect(Object.values(done.world.playerTransactionsById).filter((transaction) => transaction.kind === 'traded')).toHaveLength(2)
    expect(Object.values(done.world.contractsById).find((contract) => contract.id === beforeContractId)).toMatchObject({ teamId: f.partner.id })
    expect(Object.values(done.world.governanceDecisionEventsById).filter((event) => event.kind === 'EXECUTED')).toHaveLength(2)
    expect(Object.values(done.world.playerTransactionsById).filter((transaction) => transaction.kind === 'traded')).toEqual(expect.arrayContaining([expect.objectContaining({ sourceTradeId: done.world.tradeNegotiationsById[f.negotiation.id]!.tradeRecordId })]))
    expect(deserializeGameWorldV3(serializeGameWorldV3(done.world, '2032-10-01T00:00:00.000Z')).tradeNegotiationsById[f.negotiation.id]).toMatchObject({ status: 'EXECUTED', tradeRecordId: done.world.tradeNegotiationsById[f.negotiation.id]!.tradeRecordId })
    const currentSave = deserializeGameWorldV4(serializeGameWorldV4(done.world, '2032-10-01T00:00:00.000Z'))
    expect(currentSave.tradeNegotiationsById[f.negotiation.id]).toEqual(done.world.tradeNegotiationsById[f.negotiation.id])
    expect(currentSave.governanceDecisionsById[started.userDecisionId]).toEqual(done.world.governanceDecisionsById[started.userDecisionId])
    expect(Object.values(currentSave.governanceDecisionEventsById).filter((event) => event.kind === 'EXECUTED')).toHaveLength(2)
    expect(Object.values(currentSave.tradeHistoryById)).toHaveLength(Object.keys(f.world.tradeHistoryById).length + 1)
    expect(() => serializeGameWorldV2(done.world, '2032-10-01T00:00:00.000Z')).toThrow('Executed trade negotiations require Save V3 Governance state')
    expect(completeAgreedTrade(done.world, { negotiationId: f.negotiation.id, expectedRevisionId: f.negotiation.currentRevisionId })).toMatchObject({ status: 'ALREADY_EXECUTED', world: done.world })
    expect(respondToTradeNegotiation(done.world, { negotiationId: f.negotiation.id, expectedRevisionId: f.negotiation.currentRevisionId, teamId: f.userTeam.id, actor: { kind: 'USER' }, action: 'WITHDRAW' }).status).toBe('CONFLICT')
  })

  it('rejects missing authority and never lets the other club approve this club commitment', () => {
    const f = fixture()
    expect(startUserTradeCommitment(f.world, { negotiationId: f.negotiation.id, expectedRevisionId: f.negotiation.currentRevisionId, teamId: f.userTeam.id }).status).toBe('REQUIRES_APPROVAL')
    const started = startBoth(f)
    const foreign = recordTradeCommitmentEvent(started.world, { decisionId: started.userDecisionId, kind: 'APPROVED', bodyId: `trade-board:${f.partner.id}`, actor: { kind: 'STAFF', id: f.staffByTeam.get(f.partner.id)!.approver } })
    expect(foreign.status).toBe('NO_AUTHORITY')
    expect(foreign.world).toBe(started.world)
  })

  it('blocks a closed window, changed contract or stale revision without mutating the world', () => {
    const f = fixture()
    // The negotiation's own edition carries the authority; a window that ended before today is CLOSED.
    const rules = f.world.tradeRulesBySeasonId[f.negotiation.seasonId]!
    const closed = updateGameWorld(f.world, { currentDate: addDays(f.world.currentDate, 1), tradeRulesBySeasonId: { ...f.world.tradeRulesBySeasonId, [rules.seasonId]: createTradeRules({ ...rules, tradeWindow: { opensOn: rules.tradeWindow!.opensOn!, closesOn: f.world.currentDate } }) } })
    expect(completeAgreedTrade(closed, { negotiationId: f.negotiation.id, expectedRevisionId: f.negotiation.currentRevisionId }).status).toBe('WINDOW_CLOSED')
    const snapshot = f.negotiation.revisions[0]!.contractSnapshots[0]!
    const changed = updateGameWorld(f.world, { contracts: Object.values(f.world.contractsById).map((contract) => contract.id === snapshot.id ? { ...contract, compensation: { ...contract.compensation, annualSalary: contract.compensation.annualSalary + 1 } } : contract) })
    expect(completeAgreedTrade(changed, { negotiationId: f.negotiation.id, expectedRevisionId: f.negotiation.currentRevisionId })).toMatchObject({ status: 'ASSET_CONFLICT', world: changed })
    expect(completeAgreedTrade(f.world, { negotiationId: f.negotiation.id, expectedRevisionId: 'old-revision' }).status).toBe('STALE_PACKAGE')
  })

  it('requires an AI operational executor and never creates one automatically', () => {
    const f = fixture()
    const withoutExecutor = updateGameWorld(f.world, { responsibilities: Object.values(f.world.responsibilitiesById).filter((item) => item.id !== responsibilityIdForTeam(f.partner.id, 'executePlayerTrade')) })
    const user = startUserTradeCommitment(withoutExecutor, { negotiationId: f.negotiation.id, expectedRevisionId: f.negotiation.currentRevisionId, teamId: f.userTeam.id })
    const ai = ensureTradeCommitmentDecision(user.world, { negotiationId: f.negotiation.id, expectedRevisionId: f.negotiation.currentRevisionId, teamId: f.partner.id, initiator: { kind: 'STAFF', id: f.staffByTeam.get(f.partner.id)!.proposer } })
    expect(assessTradeCommitmentReadiness(ai.world, f.negotiation.id, f.negotiation.currentRevisionId)).toMatchObject({ status: 'NO_EXECUTION_OWNER' })
    const first = recordTradeCommitmentEvent(ai.world, { decisionId: user.decision!.id, kind: 'APPROVED', bodyId: `trade-board:${f.userTeam.id}`, actor: { kind: 'STAFF', id: f.staffByTeam.get(f.userTeam.id)!.approver } })
    const last = recordTradeCommitmentEvent(first.world, { decisionId: ai.decision!.id, kind: 'APPROVED', bodyId: `trade-board:${f.partner.id}`, actor: { kind: 'STAFF', id: f.staffByTeam.get(f.partner.id)!.approver } })
    expect(last.status).toBe('NO_EXECUTION_OWNER')
    expect(last.world.tradeNegotiationsById[f.negotiation.id]!.status).toBe('AGREED')
    expect(Object.values(last.world.governanceDecisionEventsById).filter((event) => event.kind === 'APPROVED')).toHaveLength(2)
    expect(Object.values(last.world.governanceDecisionEventsById).filter((event) => event.kind === 'EXECUTED')).toHaveLength(0)
  })
})
