import { getContractYearCapHit, getPlayerContractStatus } from '@/domain/contract'
import { consumeSalaryException, createTeamSalaryException } from '@/domain/salary'
import type { RetainedSalaryTerm, TradeAssetMovement, TradeProposal, TradeRules } from '@/domain/trade'
import type { TeamId } from '@/domain/ids'
import { playerTransactionIdFromString } from '@/domain/ids'
import { createRetainedSalaryObligation, createTradeRecord } from '@/domain/trade'
import { getEcosystemForTeam, getTeamsForEcosystem, updateGameWorld, type GameWorld } from '@/domain/world'
import { calculateTeamPayroll, calculateTeamSalaryStatus, getIncomingSalaryLimit } from '@/engine/salary'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'

export type TradeWindowStatus = 'OPEN' | 'CLOSED' | 'NOT_CONFIGURED'
export type TradeValidationReason = 'RULES_UNAVAILABLE' | 'TRADE_WINDOW_CLOSED' | 'TRADE_WINDOW_NOT_CONFIGURED' | 'INVALID_PARTICIPANT' | 'TOO_MANY_TEAMS' | 'EMPTY_PARTICIPANT' | 'ASSET_TYPE_NOT_ALLOWED' | 'ASSET_NOT_OWNED' | 'PLAYER_NOT_ON_TEAM' | 'PLAYER_CONTRACT_NOT_ACTIVE' | 'PLAYER_CONTRACT_ROSTER_INTEGRITY' | 'BINDING_SUCCESSOR_UNRESOLVED' | 'DUPLICATE_ASSET' | 'SAME_TEAM_MOVEMENT' | 'INVALID_FUTURE_PICK' | 'FUTURE_PICK_HORIZON_EXCEEDED' | 'INVALID_SWAP_RIGHT' | 'CASH_NOT_ALLOWED' | 'CASH_LIMIT_EXCEEDED' | 'CASH_SETTLEMENT_UNAVAILABLE' | 'RETAINED_SALARY_NOT_ALLOWED' | 'RETAINED_SALARY_LIMIT_EXCEEDED' | 'EXCEPTION_UNAVAILABLE' | 'SALARY_MATCHING_FAILED'
export interface TeamTradeValidation { readonly teamId: string; readonly outgoingSalary: number; readonly incomingSalary: number; readonly incomingSalaryLimit?: number; readonly projectedPayroll?: number; readonly reasons: readonly TradeValidationReason[] }
export interface TradeValidationResult { readonly allowed: boolean; readonly globalReasons: readonly TradeValidationReason[]; readonly teamResults: readonly TeamTradeValidation[] }
export interface TradeExecutionResult { readonly validation: TradeValidationResult; readonly world: GameWorld }

export function validateTrade(world: GameWorld, proposal: TradeProposal): TradeValidationResult {
  const rules = world.tradeRulesBySeasonId[proposal.seasonId]
  const globalReasons: TradeValidationReason[] = []
  if (rules === undefined || rules.ecosystemId !== proposal.ecosystemId) globalReasons.push('RULES_UNAVAILABLE')
  const windowStatus = getTradeWindowStatus(world, proposal)
  if (windowStatus === 'NOT_CONFIGURED') globalReasons.push('TRADE_WINDOW_NOT_CONFIGURED')
  if (windowStatus === 'CLOSED') globalReasons.push('TRADE_WINDOW_CLOSED')
  const participants = [...new Set(proposal.participantTeamIds)]
  if (participants.length < 2 || participants.length !== proposal.participantTeamIds.length) globalReasons.push('INVALID_PARTICIPANT')
  if (rules !== undefined && participants.length > rules.maxTeamsPerTrade) globalReasons.push('TOO_MANY_TEAMS')
  const ecosystemTeams = new Set(getTeamsForEcosystem(world, proposal.ecosystemId).map((team) => team.id))
  if (participants.some((teamId) => world.teams[teamId] === undefined || !ecosystemTeams.has(teamId))) globalReasons.push('INVALID_PARTICIPANT')
  const assetKeys = new Set<string>()
  const teamReasons = new Map(participants.map((teamId) => [teamId, [] as TradeValidationReason[]]))
  const add = (teamId: TeamId, reason: TradeValidationReason) => teamReasons.get(teamId)?.push(reason)
  for (const movement of proposal.movements) {
    if (!participants.includes(movement.fromTeamId) || !participants.includes(movement.toTeamId)) { add(movement.fromTeamId, 'INVALID_PARTICIPANT'); continue }
    if (movement.fromTeamId === movement.toTeamId) add(movement.fromTeamId, 'SAME_TEAM_MOVEMENT')
    const key = assetKey(movement)
    if (assetKeys.has(key)) add(movement.fromTeamId, 'DUPLICATE_ASSET'); else assetKeys.add(key)
    validateAssetOwnership(world, proposal, rules, movement, add)
  }
  for (const teamId of participants) if (!proposal.movements.some((movement) => movement.fromTeamId === teamId || movement.toTeamId === teamId)) add(teamId, 'EMPTY_PARTICIPANT')
  const salaries = new Map(participants.map((teamId) => [teamId, { outgoing: 0, incoming: 0, retained: 0 }]))
  for (const movement of proposal.movements) if (movement.asset.kind === 'player') { const playerId = movement.asset.playerId; const contract = Object.values(world.contractsById).find((item) => item.playerId === playerId && item.teamId === movement.fromTeamId && getPlayerContractStatus(item, world.currentDate) === 'active'); const capHit = contract === undefined ? 0 : getContractYearCapHit(contract, world.currentDate); salaries.get(movement.fromTeamId)!.outgoing += capHit; salaries.get(movement.toTeamId)!.incoming += capHit }
  for (const term of proposal.retainedSalary ?? []) { const source = salaries.get(term.retainingTeamId); const target = salaries.get(term.receivingTeamId); if (source !== undefined) source.retained += term.amount; if (target !== undefined) target.incoming -= term.amount; validateRetainedSalary(world, proposal, rules, term, add) }
  for (const use of proposal.exceptionUses ?? []) { const exception = world.salaryExceptionsById[use.exceptionId]; if (exception === undefined || exception.teamId !== use.teamId || exception.seasonId !== proposal.seasonId || exception.status !== 'active' || use.amount > exception.remainingAmount) add(use.teamId, 'EXCEPTION_UNAVAILABLE') }
  const teamResults = participants.map((teamId) => salaryResult(world, proposal, rules, teamId, salaries.get(teamId)!, teamReasons.get(teamId)!))
  return { allowed: globalReasons.length === 0 && teamResults.every((result) => result.reasons.length === 0), globalReasons: Object.freeze(globalReasons), teamResults: Object.freeze(teamResults) }
}

export function getTradeWindowStatus(world: GameWorld, proposal: Pick<TradeProposal, 'seasonId' | 'ecosystemId'>): TradeWindowStatus {
  const rules = world.tradeRulesBySeasonId[proposal.seasonId]
  if (rules === undefined || rules.ecosystemId !== proposal.ecosystemId || rules.tradeWindow === undefined) return 'NOT_CONFIGURED'
  const season = world.seasons[proposal.seasonId]
  if (season === undefined || world.currentDate < season.startDate || world.currentDate > season.endDate) return 'CLOSED'
  const opensOn = rules.tradeWindow.opensOn ?? season.startDate
  const closesOn = rules.tradeWindow.closesOn ?? season.endDate
  return world.currentDate >= opensOn && world.currentDate <= closesOn ? 'OPEN' : 'CLOSED'
}

export function executeTrade(world: GameWorld, proposal: TradeProposal): TradeExecutionResult {
  const validation = validateTrade(world, proposal)
  if (!validation.allowed) return { validation, world }
  const teams = Object.values(world.teams).map((team) => ({ ...team, rosterPlayerIds: team.rosterPlayerIds.filter((playerId) => !proposal.movements.some((movement) => movement.asset.kind === 'player' && movement.asset.playerId === playerId && movement.fromTeamId === team.id)) }))
  for (const movement of proposal.movements) if (movement.asset.kind === 'player') { const team = teams.find((item) => item.id === movement.toTeamId)!; team.rosterPlayerIds = [...team.rosterPlayerIds, movement.asset.playerId] }
  const contracts = Object.values(world.contractsById).map((contract) => {
    const movement = proposal.movements.find((item) => item.asset.kind === 'player' && item.asset.playerId === contract.playerId && item.fromTeamId === contract.teamId)
    return movement === undefined || getPlayerContractStatus(contract, world.currentDate) !== 'active' ? contract : { ...contract, teamId: movement.toTeamId }
  })
  const picks = Object.values(world.draftPicksById).map((pick) => { const movement = proposal.movements.find((item) => item.asset.kind === 'draftPick' && item.asset.draftPickId === pick.id); return movement === undefined ? pick : { ...pick, ownerTeamId: movement.toTeamId } })
  const rights = Object.values(world.playerRightsById).map((right) => { const movement = proposal.movements.find((item) => item.asset.kind === 'playerRights' && item.asset.playerRightsId === right.id); return movement === undefined ? right : { ...right, ownerTeamId: movement.toTeamId } })
  const future = Object.values(world.futureDraftPickRightsById).map((right) => { const movement = proposal.movements.find((item) => item.asset.kind === 'futureDraftPick' && item.asset.futureDraftPickRightId === right.id); return movement === undefined ? right : { ...right, ownerTeamId: movement.toTeamId } })
  const swaps = Object.values(world.draftPickSwapRightsById).map((right) => { const movement = proposal.movements.find((item) => item.asset.kind === 'draftPickSwapRight' && item.asset.draftPickSwapRightId === right.id); return movement === undefined ? right : { ...right, holderTeamId: movement.toTeamId } })
  const exceptions = { ...world.salaryExceptionsById }
  for (const use of proposal.exceptionUses ?? []) exceptions[use.exceptionId] = consumeSalaryException(exceptions[use.exceptionId]!, use.amount)
  const tradeRecordId = `trade:${proposal.seasonId}:${proposal.id}`
  const retained = (proposal.retainedSalary ?? []).map((term) => createRetainedSalaryObligation({ id: `retained:${tradeRecordId}:${term.playerId}:${term.retainingTeamId}`, sourceTradeId: tradeRecordId, playerId: term.playerId, retainingTeamId: term.retainingTeamId, receivingTeamId: term.receivingTeamId, seasonId: proposal.seasonId, amount: term.amount }))
  const generated = createTradeExceptions(world, proposal)
  for (const exception of generated) exceptions[exception.id] = exception
  const record = createTradeRecord({ id: tradeRecordId, proposalId: proposal.id, ecosystemId: proposal.ecosystemId, seasonId: proposal.seasonId, executedAt: world.currentDate, participantTeamIds: proposal.participantTeamIds, movements: proposal.movements, createdExceptionIds: generated.map((item) => item.id), retainedSalaryObligationIds: retained.map((item) => item.id) })
  const movedPlayerIds = proposal.movements.flatMap((movement) => movement.asset.kind === 'player' ? [movement.asset.playerId] : [])
  const playerTransactions = proposal.movements.flatMap((movement) => {
    if (movement.asset.kind !== 'player') return []
    const playerId = movement.asset.playerId
    const contract = Object.values(world.contractsById).find((item) => item.playerId === playerId && item.teamId === movement.fromTeamId && getPlayerContractStatus(item, world.currentDate) === 'active')!
    return [{ id: playerTransactionIdFromString(`transaction:trade:${proposal.id}:${playerId}`), playerId, kind: 'traded' as const, occurredOn: world.currentDate, fromTeamId: movement.fromTeamId, toTeamId: movement.toTeamId, contractId: contract.id, sourceTradeId: tradeRecordId }]
  })
  const lineupsByTeamId = Object.fromEntries(Object.entries(world.lineupsByTeamId).map(([teamId, lineup]) => [teamId, movedPlayerIds.reduce((current, playerId) => clearPlayerFromLineup(current, playerId), lineup)]))
  return { validation, world: updateGameWorld(world, { teams, contracts, playerTransactions: [...Object.values(world.playerTransactionsById), ...playerTransactions], lineupsByTeamId, draftPicks: picks, playerRights: rights, futureDraftPickRights: future, draftPickSwapRights: swaps, salaryExceptions: Object.values(exceptions), retainedSalaryObligations: [...Object.values(world.retainedSalaryObligationsById), ...retained], tradeHistory: [...Object.values(world.tradeHistoryById), record] }) }
}

function validateAssetOwnership(world: GameWorld, proposal: TradeProposal, rules: TradeRules | undefined, movement: TradeAssetMovement, add: (teamId: TeamId, reason: TradeValidationReason) => void): void {
  if (rules !== undefined && !rules.allowedAssetKinds.includes(movement.asset.kind)) add(movement.fromTeamId, 'ASSET_TYPE_NOT_ALLOWED')
  if (movement.asset.kind === 'player') {
    const playerId = movement.asset.playerId
    if (!world.teams[movement.fromTeamId]?.rosterPlayerIds.includes(playerId) || getEcosystemForTeam(world, movement.fromTeamId)?.id !== proposal.ecosystemId) add(movement.fromTeamId, 'PLAYER_NOT_ON_TEAM')
    const integrity = assessActiveContractRosterIntegrity(world, playerId)
    if (integrity !== 'VALID') add(movement.fromTeamId, integrity === 'UNKNOWN' ? 'PLAYER_CONTRACT_NOT_ACTIVE' : 'PLAYER_CONTRACT_ROSTER_INTEGRITY')
    else if (!Object.values(world.contractsById).some((contract) => contract.playerId === playerId && contract.teamId === movement.fromTeamId && getPlayerContractStatus(contract, world.currentDate) === 'active')) add(movement.fromTeamId, 'PLAYER_CONTRACT_NOT_ACTIVE')
    if (Object.values(world.contractsById).some((contract) => contract.playerId === playerId && contract.teamId === movement.fromTeamId
      && getPlayerContractStatus(contract, world.currentDate) === 'active'
      && (contract.predecessorContractId !== undefined || Object.values(world.contractsById).some((successor) => successor.predecessorContractId === contract.id)))) add(movement.fromTeamId, 'BINDING_SUCCESSOR_UNRESOLVED')
  }
  if (movement.asset.kind === 'draftPick' && world.draftPicksById[movement.asset.draftPickId]?.ownerTeamId !== movement.fromTeamId) add(movement.fromTeamId, 'ASSET_NOT_OWNED')
  if (movement.asset.kind === 'playerRights' && world.playerRightsById[movement.asset.playerRightsId]?.ownerTeamId !== movement.fromTeamId) add(movement.fromTeamId, 'ASSET_NOT_OWNED')
  if (movement.asset.kind === 'draftPickSwapRight' && world.draftPickSwapRightsById[movement.asset.draftPickSwapRightId]?.holderTeamId !== movement.fromTeamId) add(movement.fromTeamId, 'INVALID_SWAP_RIGHT')
  if (movement.asset.kind === 'futureDraftPick') { const right = world.futureDraftPickRightsById[movement.asset.futureDraftPickRightId]; if (right === undefined || right.ownerTeamId !== movement.fromTeamId) add(movement.fromTeamId, 'INVALID_FUTURE_PICK'); else if (rules !== undefined && right.cycle - cycleYear(proposal.seasonId) > rules.maxFutureDraftCyclesTradable) add(movement.fromTeamId, 'FUTURE_PICK_HORIZON_EXCEEDED') }
  if (movement.asset.kind === 'cash') {
    if (rules === undefined || !rules.cashConsideration.allowed) add(movement.fromTeamId, 'CASH_NOT_ALLOWED')
    else if (movement.asset.amount > rules.cashConsideration.maximumAmount) add(movement.fromTeamId, 'CASH_LIMIT_EXCEEDED')
    else add(movement.fromTeamId, 'CASH_SETTLEMENT_UNAVAILABLE')
  }
}
function validateRetainedSalary(world: GameWorld, proposal: TradeProposal, rules: TradeRules | undefined, term: RetainedSalaryTerm, add: (teamId: TeamId, reason: TradeValidationReason) => void): void { const movement = proposal.movements.find((item) => item.asset.kind === 'player' && item.asset.playerId === term.playerId && item.fromTeamId === term.retainingTeamId && item.toTeamId === term.receivingTeamId); const contract = Object.values(world.contractsById).find((item) => item.playerId === term.playerId && item.teamId === term.retainingTeamId && getPlayerContractStatus(item, world.currentDate) === 'active'); const capHit = contract === undefined ? 0 : getContractYearCapHit(contract, world.currentDate); if (rules === undefined || !rules.retainedSalary.allowed) add(term.retainingTeamId, 'RETAINED_SALARY_NOT_ALLOWED'); else if (movement === undefined || !Number.isInteger(term.amount) || term.amount < 1 || term.amount > Math.floor(capHit * rules.retainedSalary.maximumPercentage) || Object.values(world.retainedSalaryObligationsById).filter((item) => item.retainingTeamId === term.retainingTeamId).length >= rules.retainedSalary.maximumContractsPerTeam) add(term.retainingTeamId, 'RETAINED_SALARY_LIMIT_EXCEEDED') }
function salaryResult(world: GameWorld, proposal: TradeProposal, rules: TradeRules | undefined, teamId: string, salary: { outgoing: number; incoming: number; retained: number }, reasons: TradeValidationReason[]): TeamTradeValidation { const salaryRules = world.salaryRulesBySeasonId[proposal.seasonId]; if (rules === undefined || salaryRules === undefined) return { teamId, outgoingSalary: salary.outgoing, incomingSalary: salary.incoming, reasons: Object.freeze(reasons) }; const contracts = Object.values(world.contractsById).filter((contract) => contract.teamId === teamId); const dead = Object.values(world.deadMoneyChargesById).filter((charge) => charge.teamId === teamId && charge.seasonId === proposal.seasonId).reduce((sum, charge) => sum + charge.amount, 0); const retained = Object.values(world.retainedSalaryObligationsById).filter((item) => item.retainingTeamId === teamId && item.seasonId === proposal.seasonId).reduce((sum, item) => sum + item.amount, 0) + salary.retained; const status = calculateTeamSalaryStatus(salaryRules, calculateTeamPayroll(contracts, world.currentDate, dead, retained)); const limit = getIncomingSalaryLimit(salaryRules, status, salary.outgoing).maximumIncomingSalary; const exception = (proposal.exceptionUses ?? []).filter((item) => item.teamId === teamId).reduce((sum, item) => sum + item.amount, 0); if (salary.incoming > limit + exception) reasons.push('SALARY_MATCHING_FAILED'); return { teamId, outgoingSalary: salary.outgoing, incomingSalary: salary.incoming, incomingSalaryLimit: limit, projectedPayroll: status.payroll.totalCapHit - salary.outgoing + salary.incoming, reasons: Object.freeze(reasons) } }
function createTradeExceptions(world: GameWorld, proposal: TradeProposal) { const rules = world.tradeRulesBySeasonId[proposal.seasonId]!; if (!rules.createTradeException.enabled) return []; const totals = new Map<string, { outgoing: number; incoming: number }>(); for (const teamId of proposal.participantTeamIds) totals.set(teamId, { outgoing: 0, incoming: 0 }); for (const movement of proposal.movements) if (movement.asset.kind === 'player') { const playerId = movement.asset.playerId; const contract = Object.values(world.contractsById).find((item) => item.playerId === playerId && item.teamId === movement.fromTeamId); const hit = contract === undefined ? 0 : getContractYearCapHit(contract, world.currentDate); totals.get(movement.fromTeamId)!.outgoing += hit; totals.get(movement.toTeamId)!.incoming += hit } return [...totals.entries()].filter(([, total]) => total.outgoing > total.incoming).map(([teamId, total]) => createTeamSalaryException({ id: `trade-exception:${proposal.id}:${teamId}`, ruleId: 'trade-generated', teamId: teamId as TeamId, seasonId: proposal.seasonId, originalAmount: total.outgoing - total.incoming, remainingAmount: total.outgoing - total.incoming, expiresAfterSeasonId: proposal.seasonId, status: 'active', sourceTradeId: proposal.id })) }
function assetKey(movement: TradeAssetMovement): string { const asset = movement.asset; return asset.kind === 'player' ? `player:${asset.playerId}` : asset.kind === 'draftPick' ? `pick:${asset.draftPickId}` : asset.kind === 'futureDraftPick' ? `future:${asset.futureDraftPickRightId}` : asset.kind === 'playerRights' ? `rights:${asset.playerRightsId}` : asset.kind === 'draftPickSwapRight' ? `swap:${asset.draftPickSwapRightId}` : `cash:${movement.fromTeamId}:${movement.toTeamId}:${asset.amount}` }
function cycleYear(seasonId: string): number { const found = seasonId.match(/(\d{4})/); return found === null ? 0 : Number(found[1]) }
