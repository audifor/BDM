import { compareGameDates, type GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { Season } from '@/domain/season'
import type { GameWorld } from '@/domain/world'

/**
 * Canonical answer to "what is the active CompetitionSeason for Team X on GameDate Y?".
 *
 * A club's editions are the CompetitionSeasons it is actually entered in: the edition's own
 * participant snapshot when it has one, otherwise its Competition's participants. An edition is
 * active for the club while the GameDate is inside the edition's own window. Editions are returned
 * most-recent first (then by id) so a club that shares two overlapping windows still resolves
 * deterministically; when the date falls between editions the club has no active season at all.
 */
export function resolveActiveCompetitionSeasonsForTeam(world: GameWorld, teamId: TeamId, date: GameDate): readonly Season[] {
  return Object.values(world.seasons)
    .filter((season) => {
      const competition = world.competitions[season.competitionId]
      if (competition === undefined) return false
      const participants = season.participantTeamIds?.length ? season.participantTeamIds : competition.participantTeamIds
      return participants.includes(teamId) && compareGameDates(date, season.startDate) >= 0 && compareGameDates(date, season.endDate) <= 0
    })
    .sort((a, b) => compareGameDates(b.startDate, a.startDate) || a.id.localeCompare(b.id))
}

export function resolveActiveCompetitionSeasonForTeam(world: GameWorld, teamId: TeamId, date: GameDate): Season | undefined {
  return resolveActiveCompetitionSeasonsForTeam(world, teamId, date)[0]
}
