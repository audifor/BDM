import { getPlayerContractStatus } from '@/domain/contract'
import type { GameDate } from '@/domain/date'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
const rosterOwners = new WeakMap<GameWorld['teams'], ReadonlyMap<PlayerId, TeamId>>()
const contractsByPlayer = new WeakMap<GameWorld['contractsById'], ReadonlyMap<PlayerId, readonly GameWorld['contractsById'][keyof GameWorld['contractsById']][]>>()
export function getPlayerRosterTeamId(world: GameWorld, playerId: PlayerId): TeamId | undefined {
  let index = rosterOwners.get(world.teams)
  if (index === undefined) {
    const owners = new Map<PlayerId, TeamId>()
    for (const team of Object.values(world.teams)) for (const id of team.rosterPlayerIds) if (!owners.has(id)) owners.set(id, team.id)
    index = owners
    rosterOwners.set(world.teams, index)
  }
  return index.get(playerId)
}
export function isPlayerFreeAgent(world: GameWorld, playerId: PlayerId, onDate: GameDate = world.currentDate): boolean {
  if (world.players[playerId]?.careerEnd !== undefined || getPlayerRosterTeamId(world, playerId) !== undefined) return false
  let index = contractsByPlayer.get(world.contractsById)
  if (index === undefined) {
    const contracts = new Map<PlayerId, GameWorld['contractsById'][keyof GameWorld['contractsById']][]>()
    for (const contract of Object.values(world.contractsById)) {
      const records = contracts.get(contract.playerId) ?? []
      records.push(contract)
      contracts.set(contract.playerId, records)
    }
    index = contracts
    contractsByPlayer.set(world.contractsById, index)
  }
  return !(index.get(playerId) ?? []).some(contract => ['active', 'scheduled'].includes(getPlayerContractStatus(contract, onDate)))
}
export function getFreeAgents(world: GameWorld, onDate: GameDate = world.currentDate) {
  const rostered = new Set(Object.values(world.teams).flatMap(team => team.rosterPlayerIds))
  const bound = new Set(Object.values(world.contractsById)
    .filter(contract => ['active', 'scheduled'].includes(getPlayerContractStatus(contract, onDate)))
    .map(contract => contract.playerId))
  return Object.values(world.players).filter(player => player.careerEnd === undefined && !rostered.has(player.id) && !bound.has(player.id))
    .sort((a, b) => a.basketball.primaryPosition.localeCompare(b.basketball.primaryPosition) || a.lastName.localeCompare(b.lastName) || a.id.localeCompare(b.id))
}
export function getPlayerTransactions(world:GameWorld,playerId:PlayerId){return Object.values(world.playerTransactionsById).filter(t=>t.playerId===playerId).sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||a.id.localeCompare(b.id))}
