import type { Game } from '@/domain/game'
import type { SeasonId, TeamId } from '@/domain/ids'
import type { NcaaSchedulePolicy } from '@/domain/season'
import type { GameWorld } from '@/domain/world'

/**
 * Source-first NCAA 2026-27 hybrid.
 *
 * A conference with its entire official schedule replaces ONLY that
 * conference's generated matches. All other conferences and cross-conference
 * fixtures may be generated from an explicit policy. Partial source coverage
 * is refused here rather than duplicated or silently discarded.
 *
 * No historical fixture, club identity or real-world label is invented.
 */
export function mergeNcaaCompleteSourceConferences(
  world: GameWorld,
  seasonId: SeasonId,
  generated: readonly Game[],
  official: readonly Game[],
  policy: NcaaSchedulePolicy,
): Game[] {
  const season = world.seasons[seasonId]
  if (!season) throw new Error('NCAA hybrid season not found')
  const groups = new Map<string, TeamId[]>()
  const membership = new Map<TeamId, string>()
  for (const row of season.conferenceMembershipSnapshot ?? world.conferenceMemberships.filter(row => row.seasonId === seasonId)) {
    if (row.seasonId !== seasonId || membership.has(row.teamId)) throw new Error('NCAA hybrid requires unique conference membership')
    membership.set(row.teamId, row.conferenceId)
    const group = groups.get(row.conferenceId) ?? []
    group.push(row.teamId)
    groups.set(row.conferenceId, group)
  }
  if (membership.size !== (season.participantTeamIds?.length ?? 0)) throw new Error('NCAA hybrid requires complete program membership')
  const sourcedByConference = new Map<string, Game[]>()
  for (const game of official) {
    if (game.seasonId !== seasonId || game.status !== 'scheduled' || game.classification !== 'conference') {
      throw new Error('NCAA hybrid accepts only scheduled, officially sourced conference matches')
    }
    const conf = membership.get(game.homeTeamId)
    if (!conf || conf !== membership.get(game.awayTeamId)) {
      throw new Error('NCAA historical fixture crosses a gender, edition or conference')
    }
    const list = sourcedByConference.get(conf) ?? []
    list.push(game)
    sourcedByConference.set(conf, list)
  }
  for (const [conferenceId, matches] of sourcedByConference) {
    const teams = groups.get(conferenceId)!
    const target = policy.conferenceGamesPerTeam[conferenceId]
    if (!Number.isInteger(target) || target === undefined || target < 1) {
      throw new Error('NCAA sourced conference requires an explicit scheduled game quota')
    }
    const counts = new Map(teams.map(id => [id, 0]))
    const dates = new Set<string>()
    for (const match of matches) {
      counts.set(match.homeTeamId, (counts.get(match.homeTeamId) ?? 0) + 1)
      counts.set(match.awayTeamId, (counts.get(match.awayTeamId) ?? 0) + 1)
      for (const id of [match.homeTeamId, match.awayTeamId]) {
        const key = id + '|' + match.date
        if (dates.has(key)) throw new Error('NCAA source has two fixtures for one program on one date')
        dates.add(key)
      }
    }
    if ([...counts.values()].some(count => count !== target) || matches.length !== teams.length * target / 2) {
      throw new Error('NCAA sourced conference is PARTIAL: cannot replace generated matches without losing official fixtures')
    }
  }
  const sourceConferenceIds = new Set(sourcedByConference.keys())
  const synthetic = generated.filter(game =>
    game.classification !== 'conference' || !sourceConferenceIds.has(membership.get(game.homeTeamId) ?? ''),
  )
  const combined = [...synthetic, ...official].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const ids = new Set<string>()
  const perConference = new Map<TeamId, number>()
  const teamDays = new Set<string>()
  for (const game of combined) {
    if (ids.has(game.id)) throw new Error('NCAA hybrid calendar repeats a Game ID')
    ids.add(game.id)
    const a = membership.get(game.homeTeamId), b = membership.get(game.awayTeamId)
    if (!a || !b || (game.classification === 'conference' ? a !== b : a === b)) {
      throw new Error('NCAA generated schedule violates real program conference memberships')
    }
    if (game.classification === 'conference') {
      perConference.set(game.homeTeamId, (perConference.get(game.homeTeamId) ?? 0) + 1)
      perConference.set(game.awayTeamId, (perConference.get(game.awayTeamId) ?? 0) + 1)
    }
    for (const team of [game.homeTeamId, game.awayTeamId]) {
      const key = team + '|' + game.date
      if (teamDays.has(key)) throw new Error('NCAA hybrid calendar schedules one school twice on the same date')
      teamDays.add(key)
    }
  }
  for (const [team, conferenceId] of membership) {
    if ((perConference.get(team) ?? 0) !== policy.conferenceGamesPerTeam[conferenceId]) {
      throw new Error('NCAA hybrid did not preserve the school conference game quota')
    }
  }
  if (official.some(game => !ids.has(game.id))) throw new Error('NCAA official fixture lost in hybrid generation')
  return combined
}
