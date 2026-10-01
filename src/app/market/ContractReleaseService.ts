import { compareGameDates, type GameDate } from '@/domain/date'
import { getContractYearCompensation, getPlayerContractStatus, type PlayerContract } from '@/domain/contract'
import { contractIdFromString, playerTransactionIdFromString, type ContractId, type PlayerId, type TeamId } from '@/domain/ids'
import { getContractFinancialSchedule, getContractFinancialScheduleAmounts } from '@/domain/finance'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { getAvailableRosterPlayers, getActivePlayerContract, updateGameWorld, type GameWorld } from '@/domain/world'
import { reviewClubManagementPlanning } from '@/app/gmPlanning'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'

export type ContractReleaseBlocker = 'NO_ACTIVE_CONTRACT' | 'INTEGRITY_INVALID' | 'ROSTER_MINIMUM' | 'SUCCESSOR_CHAIN_INVALID' | 'ECONOMIC_TREATMENT_UNAVAILABLE' | 'FINANCE_REJECTED'

export interface ContractReleaseFinanceConsequence {
  readonly contractId: ContractId
  readonly effectiveOn: GameDate
  readonly amount: number
  readonly currencyCode?: string
}

export type ContractReleaseFinanceStatus = 'SCHEDULED' | 'CURRENCY_POLICY_REQUIRED'

export type ContractReleaseAssessment =
  | { readonly status: 'READY'; readonly teamId: TeamId; readonly playerId: PlayerId; readonly contractIds: readonly ContractId[]; readonly financeStatus: ContractReleaseFinanceStatus; readonly financeConsequences: readonly ContractReleaseFinanceConsequence[]; readonly capConsequence: { readonly policy: 'NOT_APPLICABLE'; readonly amount: 0 } }
  | { readonly status: 'ALREADY_TERMINATED'; readonly teamId: TeamId; readonly playerId: PlayerId; readonly contractIds: readonly ContractId[]; readonly financeStatus: ContractReleaseFinanceStatus; readonly financeConsequences: readonly ContractReleaseFinanceConsequence[]; readonly capConsequence: { readonly policy: 'NOT_APPLICABLE'; readonly amount: 0 } }
  | { readonly status: ContractReleaseBlocker; readonly teamId: TeamId; readonly playerId: PlayerId; readonly contractIds: readonly ContractId[]; readonly reason: string }

export type ContractReleaseExecution =
  | { readonly status: 'RELEASED'; readonly world: GameWorld; readonly assessment: Extract<ContractReleaseAssessment, { status: 'READY' }> }
  | { readonly status: 'ALREADY_TERMINATED'; readonly world: GameWorld; readonly assessment: Extract<ContractReleaseAssessment, { status: 'ALREADY_TERMINATED' }> }
  | { readonly status: ContractReleaseBlocker; readonly world: GameWorld; readonly assessment: Extract<ContractReleaseAssessment, { status: ContractReleaseBlocker }>; readonly reason: string }

/** Read-only release preview. The Finance schedule remains the authority for surviving cash obligations. */
export function assessContractRelease(world: GameWorld, teamId: TeamId, playerId: PlayerId): ContractReleaseAssessment {
  const team = world.teams[teamId]
  if (team === undefined || world.players[playerId] === undefined) return blocked('INTEGRITY_INVALID', teamId, playerId, [], 'Release target is missing from the current world')

  const rostered = team.rosterPlayerIds.includes(playerId)
  const contract = getActivePlayerContract(world, playerId)
  if (!rostered && (contract === undefined || contract.teamId !== teamId)) {
    const previousRelease = Object.values(world.playerTransactionsById).find((transaction) => transaction.playerId === playerId
      && transaction.kind === 'released' && transaction.fromTeamId === teamId
      && transaction.contractId !== undefined
      && world.contractsById[transaction.contractId]?.termination?.reason === 'released')
    if (previousRelease !== undefined) return { status: 'ALREADY_TERMINATED', teamId, playerId, contractIds: releasedChainIds(world, previousRelease.contractId!), financeStatus: 'SCHEDULED', financeConsequences: [], capConsequence: { policy: 'NOT_APPLICABLE', amount: 0 } }
    return blocked('NO_ACTIVE_CONTRACT', teamId, playerId, [], 'Player has no active contract with this team')
  }
  if (!rostered) {
    return blocked('INTEGRITY_INVALID', teamId, playerId, contract === undefined ? [] : [contract.id], 'Player roster and active contract state is not uniquely consistent')
  }
  if (contract === undefined) return blocked('NO_ACTIVE_CONTRACT', teamId, playerId, [], 'Rostered player has no active contract to release')
  if (contract.teamId !== teamId || assessActiveContractRosterIntegrity(world, playerId) !== 'VALID') return blocked('INTEGRITY_INVALID', teamId, playerId, [contract.id], 'Player roster and active contract state is not uniquely consistent')
  if (team.rosterPlayerIds.length <= 5 || getAvailableRosterPlayers(world, teamId).length <= 5) return blocked('ROSTER_MINIMUM', teamId, playerId, [contract.id], 'Release would leave the team with insufficient players')

  const chain = linkedSuccessorChain(world, contract)
  if (chain === undefined) return blocked('SUCCESSOR_CHAIN_INVALID', teamId, playerId, [contract.id], 'Binding successor chain is malformed or has a contract outside the release chain')
  const contractIds = chain.map((item) => item.id)
  if (chain.some((item) => item.playerId !== playerId || item.teamId !== teamId || (item.id !== contract.id && getPlayerContractStatus(item, world.currentDate) !== 'scheduled'))) {
    return blocked('SUCCESSOR_CHAIN_INVALID', teamId, playerId, contractIds, 'Every linked successor must be a same-team scheduled contract')
  }

  if (hasUnsupportedCapTreatment(world, chain)) return blocked('ECONOMIC_TREATMENT_UNAVAILABLE', teamId, playerId, contractIds, 'Release cap treatment is undefined for this capped contract; no dead-money rule authorizes a surviving cap charge')

  const profile = world.organizationFinancialProfilesById[team.organizationId]
  const consequences: ContractReleaseFinanceConsequence[] = []
  for (const item of chain) {
    try {
      const amountEntries = getContractFinancialScheduleAmounts(world, {
        contractId: item.id,
        includeConditional: false,
      })
      const futureAmounts = amountEntries.filter((entry) => compareGameDates(entry.effectiveOn, world.currentDate) >= 0)
      if (profile !== undefined && futureAmounts.length > 0) {
        const financeEntries = getContractFinancialSchedule(world, { contractId: item.id, currencyCode: profile.baseCurrencyCode, includeConditional: false })
        for (const entry of financeEntries) if (compareGameDates(entry.effectiveOn, world.currentDate) >= 0) {
          consequences.push({ contractId: item.id, effectiveOn: entry.effectiveOn, amount: entry.amount.minorUnits, currencyCode: entry.amount.currencyCode })
        }
      } else {
        for (const entry of futureAmounts) consequences.push({ contractId: item.id, effectiveOn: entry.effectiveOn, amount: entry.amountMinorUnits })
      }
    } catch (error) {
      return blocked('FINANCE_REJECTED', teamId, playerId, contractIds, error instanceof Error ? error.message : 'Finance rejected the guaranteed contract schedule')
    }
  }
  return { status: 'READY', teamId, playerId, contractIds, financeStatus: profile === undefined ? 'CURRENCY_POLICY_REQUIRED' : 'SCHEDULED', financeConsequences: Object.freeze(consequences), capConsequence: { policy: 'NOT_APPLICABLE', amount: 0 } }
}

/** Revalidates the preview and applies the entire linked contract termination atomically. */
export function executeContractRelease(world: GameWorld, teamId: TeamId, playerId: PlayerId): ContractReleaseExecution {
  const assessment = assessContractRelease(world, teamId, playerId)
  if (assessment.status === 'ALREADY_TERMINATED') return { status: 'ALREADY_TERMINATED', world, assessment }
  if (assessment.status !== 'READY') return { status: assessment.status, world, assessment, reason: assessment.reason }

  const terminatedOn = world.currentDate
  const affected = new Set(assessment.contractIds)
  const contracts = Object.values(world.contractsById).map((contract) => affected.has(contract.id)
    ? { ...contract, termination: { terminatedOn, reason: 'released' as const } }
    : contract)
  const promises = Object.values(world.rolePromisesById).map((promise) => promise.playerId === playerId
    && promise.teamOrganizationId === world.teams[teamId]!.organizationId && promise.status === 'ACTIVE'
    ? { ...promise, status: 'BROKEN' as const }
    : promise)
  const lineupsByTeamId = Object.fromEntries(Object.entries(world.lineupsByTeamId).map(([id, lineup]) => [id, clearPlayerFromLineup(lineup, playerId)]))
  const transactionId = playerTransactionIdFromString(`transaction:released:${assessment.contractIds[0]}`)
  const existingTransaction = world.playerTransactionsById[transactionId]
  if (existingTransaction !== undefined) return blockedExecution(world, assessment, 'INTEGRITY_INVALID', 'Release history already exists while the contract chain remains active')

  try {
    const changed = updateGameWorld(world, {
      contracts,
      teams: Object.values(world.teams).map((team) => team.id === teamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== playerId) } : team),
      lineupsByTeamId,
      playerTransactions: [...Object.values(world.playerTransactionsById), { id: transactionId, playerId, kind: 'released', occurredOn: terminatedOn, fromTeamId: teamId, contractId: assessment.contractIds[0]! }],
      rolePromises: promises,
    })
    const finalWorld = reviewClubManagementPlanning(changed, teamId, 'MATERIAL_ROSTER_CHANGE').world
    return { status: 'RELEASED', world: finalWorld, assessment }
  } catch (error) {
    return blockedExecution(world, assessment, 'INTEGRITY_INVALID', error instanceof Error ? error.message : 'Atomic release application was rejected')
  }
}

function linkedSuccessorChain(world: GameWorld, root: PlayerContract): readonly PlayerContract[] | undefined {
  const chain: PlayerContract[] = [root]
  const seen = new Set([String(root.id)])
  let current = root
  while (true) {
    const successors = Object.values(world.contractsById).filter((item) => item.predecessorContractId === current.id)
    if (successors.length > 1) return undefined
    const successor = successors[0]
    if (successor === undefined) break
    if (seen.has(String(successor.id)) || successor.playerId !== root.playerId || successor.teamId !== root.teamId
      || successor.term.startsOn !== current.term.expiresOn) return undefined
    chain.push(successor)
    seen.add(String(successor.id))
    current = successor
  }
  const chainSet = new Set(chain.map((item) => item.id))
  const detachedScheduled = Object.values(world.contractsById).some((item) => item.playerId === root.playerId && item.teamId === root.teamId
    && getPlayerContractStatus(item, world.currentDate) === 'scheduled' && !chainSet.has(item.id))
  return detachedScheduled ? undefined : Object.freeze(chain)
}

function hasUnsupportedCapTreatment(world: GameWorld, chain: readonly PlayerContract[]): boolean {
  const contractHasCappedTreatment = chain.some((contract) => contract.compensation.years?.some((year) => year.capTreatment?.policy !== undefined && year.capTreatment.policy !== 'NOT_APPLICABLE') ?? false)
  const teamId = chain[0]!.teamId
  const relevantCappedRules = Object.values(world.seasons).some((season) => {
    const participants = season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []
    if (!participants.includes(teamId) || !chain.some((contract) => contract.term.startsOn < season.endDate && season.startDate < contract.term.expiresOn)) return false
    const rules = world.salaryRulesBySeasonId[season.id]
    return rules !== undefined && rules.capAccounting !== 'NOT_APPLICABLE'
  })
  return contractHasCappedTreatment || relevantCappedRules
}

function releasedChainIds(world: GameWorld, contractId: ContractId): readonly ContractId[] {
  const root = world.contractsById[contractId]
  if (root === undefined) return Object.freeze([contractId])
  const ids: ContractId[] = [root.id]
  let current = root
  while (true) {
    const successor = Object.values(world.contractsById).find((item) => item.predecessorContractId === current.id)
    if (successor === undefined || ids.includes(successor.id) || successor.termination?.reason !== 'released') break
    ids.push(successor.id)
    current = successor
  }
  return Object.freeze(ids)
}

function blocked(status: ContractReleaseBlocker, teamId: TeamId, playerId: PlayerId, contractIds: readonly ContractId[], reason: string): ContractReleaseAssessment {
  return { status, teamId, playerId, contractIds: Object.freeze([...contractIds]), reason }
}

function blockedExecution(world: GameWorld, assessment: Extract<ContractReleaseAssessment, { status: 'READY' }>, status: ContractReleaseBlocker, reason: string): ContractReleaseExecution {
  return { status, world, assessment: blocked(status, assessment.teamId, assessment.playerId, assessment.contractIds, reason) as Extract<ContractReleaseAssessment, { status: ContractReleaseBlocker }>, reason }
}
