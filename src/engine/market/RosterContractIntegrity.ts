import { getPlayerContractStatus } from '@/domain/contract'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { WorldRepairReport } from '@/domain/repair'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { updateGameWorld, type GameWorld, contractsByPlayer, teamsByRosterPlayer } from '@/domain/world'

export interface RosterContractIntegrityResult {
  readonly world: GameWorld
  readonly reports: readonly WorldRepairReport[]
}

export type ActiveContractRosterStatus = 'VALID' | 'INVALID' | 'AMBIGUOUS' | 'UNKNOWN'

/** Answers whether a player's current active contract is safe to use for a contract action. */
export function assessActiveContractRosterIntegrity(world: GameWorld, playerId: PlayerId, onDate = world.currentDate): ActiveContractRosterStatus {
  const rosterTeamIds = Object.values(world.teams).filter((team) => team.rosterPlayerIds.includes(playerId)).map((team) => team.id)
  const activeContracts = Object.values(world.contractsById).filter((contract) => contract.playerId === playerId && getPlayerContractStatus(contract, onDate) === 'active')
  if (rosterTeamIds.length > 1 || activeContracts.length > 1) return 'AMBIGUOUS'
  if (activeContracts.length === 0) return 'UNKNOWN'
  return rosterTeamIds.length === 1 && rosterTeamIds[0] === activeContracts[0]!.teamId ? 'VALID' : 'INVALID'
}

/** Reconciles only roster drift proved by the canonical market transaction trail. */
export function repairRosterContractIntegrity(world: GameWorld, teamIds?: readonly TeamId[]): RosterContractIntegrityResult {
  let current = world
  const reports: WorldRepairReport[] = []
  const targetTeams = teamIds === undefined ? undefined : new Set(teamIds)
  const playerIds = [...new Set([
    ...Object.values(world.teams).filter((team) => targetTeams === undefined || targetTeams.has(team.id)).flatMap((team) => team.rosterPlayerIds),
    ...Object.values(world.contractsById).filter((contract) => (targetTeams === undefined || targetTeams.has(contract.teamId)) && ['active', 'scheduled'].includes(getPlayerContractStatus(contract, world.currentDate))).map((contract) => contract.playerId),
  ])].sort((a, b) => a.localeCompare(b))

  for (const playerId of playerIds) {
    // WSR2: per-collection indexes (same elements and order as scanning every team and contract; rebuilt when a repair changes them).
    const rosterTeamIds = (teamsByRosterPlayer(current.teams).get(playerId) ?? []).map((team) => team.id).sort((a, b) => a.localeCompare(b))
    const activeContracts = (contractsByPlayer(current.contractsById).get(playerId) ?? []).filter((contract) => getPlayerContractStatus(contract, current.currentDate) === 'active').sort((a, b) => a.id.localeCompare(b.id))
    const rosterTeamId = rosterTeamIds[0]
    const contract = activeContracts[0]

    if (rosterTeamIds.length > 1 || activeContracts.length > 1 && new Set(activeContracts.map((item) => item.teamId)).size > 1) {
      reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'UNRECOVERABLE', previous: `rosters=${rosterTeamIds.join(',') || 'none'}; activeContracts=${activeContracts.map((item) => `${item.id}@${item.teamId}`).join(',') || 'none'}`, action: 'No roster or contract authority was selected.', result: 'State unchanged.', diagnostic: { code: 'AMBIGUOUS_PLAYER_TEAM_AUTHORITY', message: 'Multiple active roster/contract team claims cannot be resolved without choosing an authority.' } }))
      continue
    }

    if (activeContracts.length > 1) {
      reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'UNRECOVERABLE', previous: `roster=${rosterTeamId ?? 'none'}; activeContracts=${activeContracts.map((item) => item.id).join(',')}`, action: 'No contract was selected.', result: 'State unchanged.', diagnostic: { code: 'MULTIPLE_ACTIVE_PLAYER_CONTRACTS', message: 'The player has multiple active contracts for the same team.' } }))
      continue
    }

    if (contract !== undefined && rosterTeamId === contract.teamId) {
      reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'ALREADY_VALID', previous: `roster=${rosterTeamId}; activeContract=${contract.id}@${contract.teamId}`, action: 'None.', result: 'Roster and active contract agree.' }))
      continue
    }

    if (contract !== undefined && rosterTeamId === undefined) {
      if (hasMatchingSigningTransaction(current, playerId, contract.id, contract.teamId, contract.term.startsOn) && current.players[playerId]?.gender === current.teams[contract.teamId]?.gender) {
        const target = current.teams[contract.teamId]!
        current = updateGameWorld(current, { teams: Object.values(current.teams).map((team) => team.id === target.id ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, playerId] } : team), lineupsByTeamId: clearPlayerFromAllLineups(current, playerId) })
        reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'RECOVERABLE', previous: `roster=none; activeContract=${contract.id}@${contract.teamId}`, action: `Restored roster membership to ${contract.teamId} from its matching signedFreeAgent transaction.`, result: `roster=${contract.teamId}; activeContract=${contract.id}@${contract.teamId}`, changed: true }))
      } else {
        reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'UNRECOVERABLE', previous: `roster=none; activeContract=${contract.id}@${contract.teamId}`, action: 'No roster membership was fabricated.', result: 'State unchanged.', diagnostic: { code: 'ACTIVE_CONTRACT_WITHOUT_ROSTER_EVIDENCE', message: 'The active contract has no matching canonical signing transaction to prove roster restoration.' } }))
      }
      continue
    }

    if (contract !== undefined && rosterTeamId !== undefined && rosterTeamId !== contract.teamId) {
      const departure = hasMatchingDeparture(current, playerId, rosterTeamId, contract.term.startsOn)
      const signing = hasMatchingSigningTransaction(current, playerId, contract.id, contract.teamId, contract.term.startsOn)
      if (departure && signing && current.players[playerId]?.gender === current.teams[contract.teamId]?.gender) {
        current = updateGameWorld(current, { teams: Object.values(current.teams).map((team) => team.id === rosterTeamId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== playerId) } : team.id === contract.teamId ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, playerId] } : team), lineupsByTeamId: clearPlayerFromAllLineups(current, playerId) })
        reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'RECOVERABLE', previous: `roster=${rosterTeamId}; activeContract=${contract.id}@${contract.teamId}`, action: `Applied the completed ${departure.kind} from ${rosterTeamId} and matching signedFreeAgent to ${contract.teamId}.`, result: `roster=${contract.teamId}; activeContract=${contract.id}@${contract.teamId}`, changed: true }))
      } else {
        reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'UNRECOVERABLE', previous: `roster=${rosterTeamId}; activeContract=${contract.id}@${contract.teamId}`, action: 'Neither roster membership nor contract authority was changed.', result: 'State unchanged.', diagnostic: { code: 'ROSTER_CONTRACT_TEAM_MISMATCH', message: 'No complete release/expiry and signing trail proves which team should own the roster membership.' } }))
      }
      continue
    }

    if (rosterTeamId !== undefined && hasFutureRosterContract(current, playerId, rosterTeamId)) {
      reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'ALREADY_VALID', previous: `roster=${rosterTeamId}; contract=scheduled`, action: 'None.', result: 'The roster has a scheduled contract with the same team.' }))
      continue
    }

    if (rosterTeamId !== undefined && !requiresProfessionalContract(current, rosterTeamId)) {
      reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'NOT_APPLICABLE', previous: `roster=${rosterTeamId}; activeContract=none`, action: 'None.', result: 'This roster has no player-contract requirement in its current competition context.' }))
      continue
    }

    if (rosterTeamId === undefined && contract === undefined) {
      reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'ALREADY_VALID', previous: 'roster=none; activeContract=none', action: 'None.', result: 'Player is not rostered and has no active contract.' }))
      continue
    }

    const endedContract = Object.values(current.contractsById).some((item) => item.playerId === playerId && item.teamId === rosterTeamId && ['expired', 'terminated'].includes(getPlayerContractStatus(item, current.currentDate)))
    if (!endedContract) {
      reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'NOT_APPLICABLE', previous: `roster=${rosterTeamId}; activeContract=none; contractHistory=none`, action: 'No contract or roster membership was fabricated.', result: 'There is no active contract relationship to reconcile; roster-only participation remains unchanged.' }))
      continue
    }
    reports.push(report({ repairKind: 'ROSTER_CONTRACT_INTEGRITY', targetEntity: String(playerId), classification: 'UNRECOVERABLE', previous: `roster=${rosterTeamId ?? 'none'}; activeContract=none`, action: 'No contract or roster membership was fabricated.', result: 'State unchanged.', diagnostic: { code: 'ROSTERED_WITHOUT_ACTIVE_CONTRACT', message: 'A roster still contains a player after the only contract evidence expired or was terminated.' } }))
  }
  return { world: current, reports: Object.freeze(reports) }
}

function hasMatchingSigningTransaction(world: GameWorld, playerId: PlayerId, contractId: string, teamId: TeamId, startsOn: string): boolean {
  return Object.values(world.playerTransactionsById).some((transaction) => transaction.playerId === playerId && transaction.kind === 'signedFreeAgent' && transaction.contractId === contractId && transaction.toTeamId === teamId && transaction.occurredOn === startsOn)
}

function hasMatchingDeparture(world: GameWorld, playerId: PlayerId, teamId: TeamId, signedOn: string): { kind: 'released' | 'contractExpired' } | undefined {
  const matches = Object.values(world.playerTransactionsById).filter((transaction) => transaction.playerId === playerId && transaction.fromTeamId === teamId && (transaction.kind === 'released' || transaction.kind === 'contractExpired') && transaction.occurredOn <= signedOn && transaction.contractId !== undefined)
  const evidenced = matches.filter((transaction) => {
    const oldContract = world.contractsById[transaction.contractId!]
    return oldContract !== undefined && oldContract.playerId === playerId && oldContract.teamId === teamId && getPlayerContractStatus(oldContract, world.currentDate) !== 'active'
  })
  return evidenced.length === 1 ? { kind: evidenced[0]!.kind as 'released' | 'contractExpired' } : undefined
}

function hasFutureRosterContract(world: GameWorld, playerId: PlayerId, teamId: TeamId): boolean {
  return (contractsByPlayer(world.contractsById).get(playerId) ?? []).some((contract) => contract.teamId === teamId && getPlayerContractStatus(contract, world.currentDate) === 'scheduled')
}

function requiresProfessionalContract(world: GameWorld, teamId: TeamId): boolean {
  return Object.values(world.competitions).some((competition) => competition.participantTeamIds.includes(teamId) && world.ecosystems[competition.ecosystemId]?.kind !== 'ncaaLike')
}

function clearPlayerFromAllLineups(world: GameWorld, playerId: PlayerId): GameWorld['lineupsByTeamId'] {
  return Object.fromEntries(Object.entries(world.lineupsByTeamId).map(([teamId, lineup]) => [teamId, clearPlayerFromLineup(lineup, playerId)]))
}

function report(input: { repairKind: string; targetEntity: string; classification: WorldRepairReport['classification']; previous: string; action: string; result: string; changed?: boolean; userActionRequired?: boolean; diagnostic?: WorldRepairReport['diagnostics'][number] }): WorldRepairReport {
  return { repairKind: input.repairKind, sourceDomain: 'MARKET_ROSTER_CONTRACT', targetEntity: input.targetEntity, classification: input.classification, previousStateSummary: input.previous, actionApplied: input.action, resultingStateSummary: input.result, diagnostics: input.diagnostic === undefined ? [] : [input.diagnostic], worldChanged: input.changed ?? false, userActionRequired: input.userActionRequired ?? false }
}
