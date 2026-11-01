import { withSingleWorldValidation, type GameWorld } from '@/domain/world'
import { seasonIdFromString } from '@/domain/ids'
import type { NcaaD1RealGender } from './NcaaD1Real2026Conferences'
import { startNcaa2027ConferenceTournaments, advanceNcaa2027ConferenceTournament, getNcaa2027ConferenceChampions } from './NcaaD1Real2027ConferenceTournaments'
import { startNcaa2027NationalTournament, advanceNcaa2027NationalTournament } from './NcaaD1Real2027NationalTournament'

const genders = ['men', 'women'] as const
const regularSeasonId = (gender: NcaaD1RealGender) => seasonIdFromString(`season:USA:ncaa-d1-${gender}:2026-27`)
const nationalId = (gender: NcaaD1RealGender) => seasonIdFromString(`season:USA:ncaa-d1-${gender}:2027:national-championship`)
const tournamentPrefix = (gender: NcaaD1RealGender) => `season:USA:ncaa-d1-${gender}:2027:conference-tournament:`

/**
 * Daily, idempotent NCAA 2027 postseason materialization.
 *
 * Uses only completed 2026-27 source Games and the existing real programme
 * memberships. Neither gender advances on the other gender's results.
 * A new fixture round is generated no more than once, and cannot be placed
 * earlier than the clock. The daily engine runs this BEFORE today's games.
 *
 * The 2027 generic conference brackets, at-large ranking, dates and region
 * assignments are explicitly BDM simulations, not official NCAA schedules.
 */
export function materializeNcaa2027PostseasonForDay(world: GameWorld): GameWorld {
  if (world.currentDate < '2027-03-01' || world.currentDate > '2027-04-06') return world
  if (genders.every(gender => !world.seasons[regularSeasonId(gender)])) return world
  return withSingleWorldValidation(world, input => {
    let current = input
    for (const gender of genders) {
      const source = current.seasons[regularSeasonId(gender)]
      if (!source?.ncaaSchedulePolicy) continue
      const championshipIds = Object.keys(current.seasons).filter(id => id.startsWith(tournamentPrefix(gender)))
      if (championshipIds.length === 0) {
        const regular = Object.values(current.games).filter(game => game.seasonId === source.id)
        if (!regular.length || regular.some(game => game.status !== 'completed')) continue
        if (current.currentDate > '2027-03-15') throw new Error('NCAA conference tournament cannot be seeded after national selection')
        current = startNcaa2027ConferenceTournaments(current, gender)
      } else if (championshipIds.length !== 32) {
        throw new Error('NCAA postseason has a partially materialized conference set')
      }
      const championships = Object.keys(current.seasons).filter(id => id.startsWith(tournamentPrefix(gender)))
      if (championships.length !== 32) throw new Error('NCAA postseason must have 32 conference championships per gender')
      const members = source.conferenceMembershipSnapshot ?? []
      const conferences = [...new Set(members.map(m => m.conferenceId))].sort()
      for (const conferenceId of conferences) {
        current = advanceNcaa2027ConferenceTournament(current, gender, conferenceId)
      }
      if (!current.seasons[nationalId(gender)]) {
        try {
          getNcaa2027ConferenceChampions(current, gender)
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('NCAA automatic qualifier requires completed')) continue
          throw error
        }
        if (current.currentDate > '2027-03-16') throw new Error('NCAA national championship cannot start after Opening Round')
        current = startNcaa2027NationalTournament(current, gender)
      }
      if (current.seasons[nationalId(gender)]) {
        current = advanceNcaa2027NationalTournament(current, gender)
      }
    }
    // Fails closed if a missed checkpoint would produce a past-dated fixture:
    // NEVER let NEW GAME silently schedule a March elimination on an April day.
    for (const game of Object.values(current.games)) {
      if (game.status === 'scheduled' && game.date < current.currentDate
          && (String(game.id).startsWith('ncaa2027:conference:') || String(game.id).startsWith('ncaa2027:national:'))) {
        throw new Error('NCAA postponed fixture must not be generated in the past: ' + game.id)
      }
    }
    return current
  })
}
