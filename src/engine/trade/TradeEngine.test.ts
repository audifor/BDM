import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createFutureDraftPickRight, createPlayerRights, createTradeRules } from '@/domain/trade'
import { calculateTeamPayroll, getTeamRetainedSalary } from '@/engine/salary'
import { updateGameWorld } from '@/domain/world'

import { executeTrade, getTradeWindowStatus, validateTrade } from './TradeEngine'
import { materializeFutureDraftPickOwnership, resolveDraftPickSwapRight } from './DraftPickRightsResolution'

function tradeWorld() {
  const base = createNewGame()
  const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
  const teams = Object.values(base.teams).filter((team) => base.competitions[season.competitionId]!.participantTeamIds.includes(team.id))
  const world = updateGameWorld(base, {
    currentSeasonId: season.id,
    currentDate: season.startDate,
    tradeRulesBySeasonId: { ...base.tradeRulesBySeasonId, [season.id]: createTradeRules({ ...base.tradeRulesBySeasonId[season.id]!, tradeWindow: {} }) },
  })
  return { world, season, teams }
}

describe('TradeEngine', () => {
  it('executes a generic three-team package atomically and preserves contracts', () => {
    const { world, season, teams } = tradeWorld(); const [a, b, c] = teams
    const playerA = a!.rosterPlayerIds[0]!; const playerB = b!.rosterPlayerIds[0]!; const playerC = c!.rosterPlayerIds[0]!
    const equalWorld = updateGameWorld(world, { contracts: Object.values(world.contractsById).map((contract) => [playerA, playerB, playerC].includes(contract.playerId) ? { ...contract, compensation: { annualSalary: 1_000_000, years: [{ cashSalary: 1_000_000, capHit: 1_000_000, guaranteedAmount: 1_000_000 }] } } : contract) })
    const proposal = { id: 'three-team', ecosystemId: equalWorld.competitions[season.competitionId]!.ecosystemId, seasonId: season.id, participantTeamIds: [a!.id, b!.id, c!.id], movements: [{ asset: { kind: 'player' as const, playerId: playerA }, fromTeamId: a!.id, toTeamId: b!.id }, { asset: { kind: 'player' as const, playerId: playerB }, fromTeamId: b!.id, toTeamId: c!.id }, { asset: { kind: 'player' as const, playerId: playerC }, fromTeamId: c!.id, toTeamId: a!.id }] }
    const result = executeTrade(equalWorld, proposal)
    expect(result.validation.allowed).toBe(true); expect(result.world.teams[b!.id]!.rosterPlayerIds).toContain(playerA); expect(result.world.teams[a!.id]!.rosterPlayerIds).toContain(playerC)
    const sourceContract = Object.values(equalWorld.contractsById).find((contract) => contract.playerId === playerA)!
    const movedContract = result.world.contractsById[sourceContract.id]!
    expect(movedContract).toMatchObject({ ...sourceContract, teamId: b!.id })
    expect(movedContract.id).toBe(sourceContract.id)
    expect(Object.values(result.world.playerTransactionsById).filter((transaction) => transaction.kind === 'traded')).toContainEqual(expect.objectContaining({ playerId: playerA, fromTeamId: a!.id, toTeamId: b!.id, contractId: sourceContract.id }))
    expect(Object.keys(result.world.tradeHistoryById)).toHaveLength(1)
  })

  it('keeps retained salary with the old team while the same contract moves to the new team', () => {
    const { world, season, teams } = tradeWorld(); const [a, b] = teams; const playerA = a!.rosterPlayerIds[0]!; const playerB = b!.rosterPlayerIds[0]!
    const equalWorld = updateGameWorld(world, { contracts: Object.values(world.contractsById).map((contract) => [playerA, playerB].includes(contract.playerId) ? { ...contract, compensation: { annualSalary: 1_000_000, years: [{ cashSalary: 1_000_000, capHit: 1_000_000, guaranteedAmount: 1_000_000 }] } } : contract) })
    const proposal = { id: 'retained-salary', ecosystemId: equalWorld.competitions[season.competitionId]!.ecosystemId, seasonId: season.id, participantTeamIds: [a!.id, b!.id], movements: [{ asset: { kind: 'player' as const, playerId: playerA }, fromTeamId: a!.id, toTeamId: b!.id }, { asset: { kind: 'player' as const, playerId: playerB }, fromTeamId: b!.id, toTeamId: a!.id }], retainedSalary: [{ playerId: playerA, retainingTeamId: a!.id, receivingTeamId: b!.id, amount: 500_000 }] }
    const result = executeTrade(equalWorld, proposal)
    expect(result.validation.allowed).toBe(true)
    expect(result.world.tradeHistoryById[`trade:${season.id}:${proposal.id}`]!.retainedSalaryObligationIds).toHaveLength(1)
    const obligation = result.world.retainedSalaryObligationsById[result.world.tradeHistoryById[`trade:${season.id}:${proposal.id}`]!.retainedSalaryObligationIds[0]!]!
    expect(obligation).toMatchObject({ sourceTradeId: `trade:${season.id}:${proposal.id}`, retainingTeamId: a!.id, receivingTeamId: b!.id, seasonId: season.id, amount: 500_000 })
    expect(getTeamRetainedSalary(result.world, a!.id, season.id)).toBe(500_000)
    expect(result.world.contractsById[Object.values(equalWorld.contractsById).find((contract) => contract.playerId === playerA)!.id]!.teamId).toBe(b!.id)
    const retainedCap = calculateTeamPayroll([], equalWorld.currentDate, 0, getTeamRetainedSalary(result.world, a!.id, season.id))
    expect(retainedCap.totalCapHit).toBe(500_000)
  })

  it('fails closed when no trade window is configured and reports configured windows open or closed', () => {
    const { world, season, teams } = tradeWorld(); const [a, b] = teams; const playerA = a!.rosterPlayerIds[0]!; const playerB = b!.rosterPlayerIds[0]!
    const proposal = { id: 'window-state', ecosystemId: world.competitions[season.competitionId]!.ecosystemId, seasonId: season.id, participantTeamIds: [a!.id, b!.id], movements: [{ asset: { kind: 'player' as const, playerId: playerA }, fromTeamId: a!.id, toTeamId: b!.id }, { asset: { kind: 'player' as const, playerId: playerB }, fromTeamId: b!.id, toTeamId: a!.id }] }
    const noWindow = updateGameWorld(world, { tradeRulesBySeasonId: { ...world.tradeRulesBySeasonId, [season.id]: createTradeRules({ ...world.tradeRulesBySeasonId[season.id]!, tradeWindow: undefined }) } })
    expect(getTradeWindowStatus(noWindow, proposal)).toBe('NOT_CONFIGURED')
    expect(validateTrade(noWindow, proposal).globalReasons).toContain('TRADE_WINDOW_NOT_CONFIGURED')
    expect(executeTrade(noWindow, proposal).world).toBe(noWindow)
    const closed = updateGameWorld(world, { currentDate: season.endDate, tradeRulesBySeasonId: { ...world.tradeRulesBySeasonId, [season.id]: createTradeRules({ ...world.tradeRulesBySeasonId[season.id]!, tradeWindow: { closesOn: season.startDate } }) } })
    expect(getTradeWindowStatus(closed, proposal)).toBe('CLOSED')
    expect(validateTrade(closed, proposal).globalReasons).toContain('TRADE_WINDOW_CLOSED')
  })

  it('rejects duplicate assets without any mutation', () => {
    const { world, season, teams } = tradeWorld(); const [a, b] = teams; const player = a!.rosterPlayerIds[0]!
    const proposal = { id: 'duplicate', ecosystemId: world.competitions[season.competitionId]!.ecosystemId, seasonId: season.id, participantTeamIds: [a!.id, b!.id], movements: [{ asset: { kind: 'player' as const, playerId: player }, fromTeamId: a!.id, toTeamId: b!.id }, { asset: { kind: 'player' as const, playerId: player }, fromTeamId: a!.id, toTeamId: b!.id }] }
    expect(validateTrade(world, proposal).allowed).toBe(false); expect(executeTrade(world, proposal).world).toBe(world)
  })

  it('rejects cash consideration until it can settle atomically through finance ledgers', () => {
    const { world, season, teams } = tradeWorld(); const [a, b] = teams
    const cashWorld = updateGameWorld(world, { tradeRulesBySeasonId: { ...world.tradeRulesBySeasonId, [season.id]: createTradeRules({ ...world.tradeRulesBySeasonId[season.id]!, cashConsideration: { allowed: true, maximumAmount: 100_000 } }) } })
    const proposal = { id: 'cash-unsettled', ecosystemId: cashWorld.competitions[season.competitionId]!.ecosystemId, seasonId: season.id, participantTeamIds: [a!.id, b!.id], movements: [{ asset: { kind: 'cash' as const, amount: 50_000 }, fromTeamId: a!.id, toTeamId: b!.id }] }
    const result = executeTrade(cashWorld, proposal)
    expect(result.validation.teamResults.flatMap((item) => item.reasons)).toContain('CASH_SETTLEMENT_UNAVAILABLE')
    expect(result.world).toBe(cashWorld)
  })

  it('transfers cross-ecosystem rights without moving the player roster', () => {
    const { world, season, teams } = tradeWorld(); const [a, b] = teams; const fibaPlayer = Object.values(world.teams).find((team) => !teams.includes(team))!.rosterPlayerIds[0]!
    const withRights = updateGameWorld(world, { playerRights: [createPlayerRights({ id: 'rights:one', playerId: fibaPlayer, ecosystemId: world.competitions[season.competitionId]!.ecosystemId, ownerTeamId: a!.id, rightsType: 'international', acquiredAt: world.currentDate, status: 'active' })] })
    const result = executeTrade(withRights, { id: 'rights', ecosystemId: world.competitions[season.competitionId]!.ecosystemId, seasonId: season.id, participantTeamIds: [a!.id, b!.id], movements: [{ asset: { kind: 'playerRights', playerRightsId: 'rights:one' }, fromTeamId: a!.id, toTeamId: b!.id }] })
    expect(result.validation.allowed).toBe(true); expect(result.world.playerRightsById['rights:one']!.ownerTeamId).toBe(b!.id); expect(Object.values(result.world.teams).find((team) => team.rosterPlayerIds.includes(fibaPlayer))!.id).not.toBe(b!.id)
  })

  it('materializes future-pick ownership and resolves a swap without changing pick identity', () => {
    const { world, season, teams } = tradeWorld(); const [a, b] = teams; const ecosystemId = world.competitions[season.competitionId]!.ecosystemId
    const right = createFutureDraftPickRight({ id: 'future:a', ecosystemId, cycle: 2036, round: 1, originalTeamId: a!.id, ownerTeamId: b!.id })
    const future = updateGameWorld(world, { futureDraftPickRights: [right], draftPickSwapRights: [{ id: 'swap:one', ecosystemId, cycle: 2036, round: 1, holderTeamId: a!.id, counterpartTeamId: b!.id, status: 'active' }] })
    const picks = materializeFutureDraftPickOwnership(future, ecosystemId, 2036, [{ id: 'pick:a', draftId: 'draft:2036', round: 1, order: 9, originalTeamId: a!.id, ownerTeamId: a!.id }, { id: 'pick:b', draftId: 'draft:2036', round: 1, order: 3, originalTeamId: b!.id, ownerTeamId: b!.id }])
    expect(picks[0]!.ownerTeamId).toBe(b!.id)
    const withDraft = updateGameWorld(future, { drafts: [{ id: 'draft:2036', ecosystemId, sourceSeasonId: season.id, rules: { rounds: 1, orderMethod: 'reverseStandings', scheduledAfterDays: 0 }, scheduledOn: future.currentDate, status: 'scheduled', prospectPlayerIds: [] }], draftPicks: picks })
    const resolved = resolveDraftPickSwapRight(withDraft, 'swap:one', picks)
    expect(resolved.draftPicksById['pick:b']!.ownerTeamId).toBe(a!.id); expect(resolved.draftPickSwapRightsById['swap:one']!.status).toBe('resolved')
  })
})
