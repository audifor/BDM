import type { GameDate } from '@/domain/date'
import { getPlayerContractStatus } from '@/domain/contract'
import { playerTransactionIdFromString } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
export function reconcileExpiredPlayerContracts(world: GameWorld, onDate: GameDate): GameWorld {
  const removals = new Map<string, string>()
  const transactions = []
  for (const team of Object.values(world.teams)) for (const playerId of team.rosterPlayerIds) {
    const contracts = Object.values(world.contractsById).filter((contract) => contract.playerId === playerId && contract.teamId === team.id)
    if (contracts.some((contract) => ['active', 'scheduled'].includes(getPlayerContractStatus(contract, onDate)))) continue
    const expired = contracts.filter((contract) => getPlayerContractStatus(contract, onDate) === 'expired').sort((a, b) => b.term.expiresOn.localeCompare(a.term.expiresOn))[0]
    if (expired === undefined) continue
    removals.set(playerId, team.id)
    const id = playerTransactionIdFromString(`transaction:contractExpired:${expired.id}`)
    if (world.playerTransactionsById[id] === undefined) transactions.push({ id, playerId, kind: 'contractExpired' as const, occurredOn: expired.term.expiresOn, fromTeamId: team.id, contractId: expired.id })
  }
  if (!removals.size && !transactions.length) return world
  return updateGameWorld(world, {
    teams: Object.values(world.teams).map((team) => ({ ...team, rosterPlayerIds: team.rosterPlayerIds.filter((playerId) => !removals.has(playerId)) })),
    playerTransactions: [...Object.values(world.playerTransactionsById), ...transactions],
  })
}
