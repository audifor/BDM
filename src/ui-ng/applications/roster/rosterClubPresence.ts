import { getPlayerContractStatus } from '@/domain/contract'
import type { Player } from '@/domain/player'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getTeamRoster } from '@/domain/world'

/** A club's roster plus players with a verified active contract to that team, not global free agents. */
export function getClubRosterCandidates(world: GameWorld, teamId: TeamId): readonly Player[] {
  const roster = getTeamRoster(world,teamId)
  const seen = new Set<PlayerId>(roster.map(player=>player.id))
  const linked: Player[] = []
  for (const contract of Object.values(world.contractsById)) {
    if(contract.teamId!==teamId || getPlayerContractStatus(contract,world.currentDate)!=='active')continue
    if(seen.has(contract.playerId))continue
    const player=world.players[contract.playerId]
    if(player===undefined || player.careerEnd!==undefined)continue
    linked.push(player)
    seen.add(player.id)
  }
  return [...roster,...linked]
}
export function isPlayerInClubRoster(world: GameWorld, teamId: TeamId, player: Player): boolean {
  return world.teams[teamId]?.rosterPlayerIds.includes(player.id) ?? false
}
