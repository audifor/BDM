import { addDays, compareGameDates } from '@/domain/date'
import { createGame, type Game } from '@/domain/game'
import type { ConferenceMembership } from '@/domain/conference'
import { gameIdFromString, type SeasonId, type TeamId } from '@/domain/ids'
import { getCompetition, getSeason, type GameWorld } from '@/domain/world'

/** Deterministic NCAA-like schedule: one conference round robin plus cross-conference games. */
export function generateNcaaLikeSchedule(world: GameWorld, seasonId: SeasonId): Game[] {
  const season = getSeason(world, seasonId); const competition = getCompetition(world, season.competitionId)
  const memberships = season.conferenceMembershipSnapshot ?? world.conferenceMemberships.filter((membership) => membership.seasonId === season.id)
  const groups = [...new Set(memberships.map((membership) => membership.conferenceId))].sort().map((conferenceId) => memberships.filter((membership) => membership.conferenceId === conferenceId).map((membership) => membership.teamId).sort())
  if (groups.length < 2 || groups.some((group) => group.length < 2)) throw new RangeError('NCAA-like schedule requires multiple populated conferences')
  const games: Game[] = []; let sequence = 1
  const add = (dateOffset: number, homeTeamId: TeamId, awayTeamId: TeamId, classification: 'conference' | 'nonConference') => games.push(createGame({ id: gameIdFromString(`schedule-${season.id}-game-${String(sequence++).padStart(4, '0')}`), seasonId, competitionId: competition.id, date: addDays(season.startDate, dateOffset), homeTeamId, awayTeamId, status: 'scheduled', result: null, classification }))
  // Cross-conference rounds occur first, giving this ecosystem its own calendar window.
  groups.forEach((group, index) => { const next = groups[(index + 1) % groups.length]!; if (group[0] !== undefined && next[0] !== undefined) add(10 + index * 4, group[0], next[0], 'nonConference') })
  groups.forEach((group) => { for (let pair = 0; pair + 1 < group.length; pair += 2) add(35, group[pair]!, group[pair + 1]!, 'conference') })
  if (games.some((game) => compareGameDates(game.date, season.endDate) > 0)) throw new RangeError('NCAA-like schedule does not fit season window')
  return games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

export function classifyNcaaGame(memberships: readonly ConferenceMembership[], game: Pick<Game, 'seasonId' | 'homeTeamId' | 'awayTeamId'>): 'conference' | 'nonConference' {
  const home = memberships.find((membership) => membership.seasonId === game.seasonId && membership.teamId === game.homeTeamId)
  const away = memberships.find((membership) => membership.seasonId === game.seasonId && membership.teamId === game.awayTeamId)
  return home !== undefined && home.conferenceId === away?.conferenceId ? 'conference' : 'nonConference'
}
