import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getPlayersInScoutingTerritory, getTeamsInScoutingTerritory, isPlayerCurrentlyInTerritory, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

describe('scouting territory membership', () => {
  it('uses current team country and competition membership, never player nationality', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const player = world.players[playerId]!
    const otherCountryId = Object.keys(world.countries).find((id) => id !== team.countryId)!
    const changedBiography = { ...world, players: { ...world.players, [playerId]: { ...player, nationalityId: otherCountryId as typeof player.nationalityId } } }
    const countryTerritory = { kind: 'COUNTRY' as const, countryId: team.countryId }
    expect(isPlayerCurrentlyInTerritory(changedBiography, playerId, countryTerritory)).toBe(true)
    expect(getPlayersInScoutingTerritory(changedBiography, countryTerritory)).toContain(playerId)
    expect(isPlayerCurrentlyInTerritory(changedBiography, playerId, { kind: 'COUNTRY', countryId: otherCountryId as typeof team.countryId })).toBe(false)

    const competition = Object.values(world.competitions).find((candidate) => candidate.participantTeamIds.includes(team.id))!
    expect(getTeamsInScoutingTerritory(world, { kind: 'COMPETITION', competitionId: competition.id }).map((candidate) => candidate.id)).toContain(team.id)
    expect(getPlayersInScoutingTerritory(world, { kind: 'COMPETITION', competitionId: competition.id })).toContain(playerId)

    const participantIds = new Set(competition.participantTeamIds)
    const enteringPlayer = Object.values(world.teams).filter((candidate) => !participantIds.has(candidate.id)).flatMap((candidate) => candidate.rosterPlayerIds.map((id) => ({ team: candidate, playerId: id })))[0]
    const destination = getTeamsInScoutingTerritory(world, { kind: 'COMPETITION', competitionId: competition.id })[0]
    if (enteringPlayer !== undefined && destination !== undefined) {
      const movedPlayerWorld = updateGameWorld(world, {
        teams: Object.values(world.teams).map((candidate) => candidate.id === enteringPlayer.team.id
          ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.filter((id) => id !== enteringPlayer.playerId) }
          : candidate.id === destination.id
            ? { ...candidate, rosterPlayerIds: [...candidate.rosterPlayerIds, enteringPlayer.playerId] }
            : candidate),
      })
      expect(getPlayersInScoutingTerritory(movedPlayerWorld, { kind: 'COMPETITION', competitionId: competition.id })).toContain(enteringPlayer.playerId)
    }
  })
})
