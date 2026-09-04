import { updateGameWorld } from '@/domain/world'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'

/** Test/dev helper: grow the user roster without changing production game rules. */
export function buildLargeRosterTestWorld(minPlayers = 40) {
  let world = createNewGame()
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) return world

  while (getUserTeam(world)!.rosterPlayerIds.length < minPlayers) {
    const currentUser = getUserTeam(world)!
    const donor = Object.values(world.teams).find(
      (team) => team.id !== currentUser.id && team.rosterPlayerIds.length > 5,
    )
    if (donor === undefined) break

    const playerId = donor.rosterPlayerIds[0]!
    world = updateGameWorld(world, {
      teams: Object.values(world.teams).map((team) => {
        if (team.id === donor.id) {
          return { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== playerId) }
        }
        if (team.id === currentUser.id) {
          return { ...team, rosterPlayerIds: [...team.rosterPlayerIds, playerId] }
        }
        return team
      }),
    })
  }

  return world
}
