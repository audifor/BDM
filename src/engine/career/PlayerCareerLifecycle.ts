import { clearPlayerFromLineup } from '@/domain/tactics'
import { getPlayerContractStatus } from '@/domain/contract'
import { calculateAge } from '@/domain/player'
import { playerIdFromString, type PlayerId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { endPlayerEnrollment } from '@/engine/eligibility/EligibilityEngine'

export const PLAYER_CAREER_AGE_LIMIT = 45

export function isPlayerCareerActive(world: GameWorld, playerId: PlayerId | string): boolean {
  return world.players[playerIdFromString(playerId)]?.careerEnd === undefined
}

/** Ends a sporting career while preserving the Player, Person, and all historical records. */
export function endPlayerCareer(world: GameWorld, playerId: PlayerId | string, reason: 'ageLimit' | 'manual' = 'manual'): GameWorld {
  const player = world.players[playerIdFromString(playerId)]
  if (player === undefined || player.careerEnd !== undefined) return world
  let current = updateGameWorld(world, {
    players: Object.values(world.players).map((item) => item.id === playerId ? { ...item, careerEnd: { endedOn: world.currentDate, reason } } : item),
    teams: Object.values(world.teams).map((team) => team.rosterPlayerIds.includes(player.id) ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== player.id) } : team),
    lineupsByTeamId: Object.fromEntries(Object.entries(world.lineupsByTeamId).map(([teamId, lineup]) => [teamId, world.teams[teamId as keyof GameWorld['teams']]?.rosterPlayerIds.includes(player.id) ? clearPlayerFromLineup(lineup, player.id) : lineup])),
    playerRights: Object.values(world.playerRightsById).map(item => item.playerId === player.id && item.status === 'active' ? { ...item, status: 'expired' as const, expiresAt: world.currentDate } : item),
    playerRegistrations: Object.values(world.playerRegistrationsById).map((item) => item.playerId === player.id && item.endsOn === undefined ? { ...item, endsOn: world.currentDate } : item),
    transferPortalEntries: Object.values(world.transferPortalEntriesById).map((item) => item.playerId === player.id && (item.status === 'noticePending' || item.status === 'authorized') ? { ...item, status: 'withdrawn' as const } : item),
    recruitProfiles: Object.values(world.recruitProfilesById).map((item) => item.playerId === player.id && ['open', 'committed', 'incoming'].includes(item.status) ? { ...item, status: 'unsigned' as const } : item),
    contracts: Object.values(world.contractsById).map((contract) => contract.playerId === player.id && ['active', 'scheduled'].includes(getPlayerContractStatus(contract, world.currentDate))
      ? { ...contract, termination: { terminatedOn: world.currentDate, reason: 'retired' as const } }
      : contract),
  })
  for (const enrollment of Object.values(current.playerEnrollmentsById)) {
    if (enrollment.playerId === player.id && enrollment.status === 'active') current = endPlayerEnrollment(current, enrollment.id)
  }
  return current
}

/** The age cap is a structural exit safeguard, not a tuned demographic target. */
export function progressPlayerCareerEnds(world: GameWorld): GameWorld {
  const due = Object.values(world.players).filter((player) => player.careerEnd === undefined && calculateAge(player.bio.dateOfBirth, world.currentDate) > PLAYER_CAREER_AGE_LIMIT)
  return due.reduce((current, player) => endPlayerCareer(current, player.id, 'ageLimit'), world)
}
