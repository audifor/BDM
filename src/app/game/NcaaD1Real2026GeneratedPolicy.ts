import type { NcaaSchedulePolicy } from '@/domain/season/Season'
import { buildNcaaD1Real2026ConferenceSnapshot, type NcaaD1RealGender } from './NcaaD1Real2026Conferences'

/**
 * Explicit, deterministic NCAA 2026-27 *gameplay* scheduling policy.
 * School identities and memberships are sourced; synthetic unverified opponents,
 * dates and match counts must never be represented as official schedules.
 *
 * ASUN 14 conference games per school are source-complete (both genders).
 * For the remaining conferences use up to 18 games, limited by the existing
 * NCAA scheduler's two-meetings-per-opponent invariant. Twelve
 * nonconference rounds supply an approximately 20-30-game playable
 * regular season without inventing exact official fixture data.
 */
export function ncaaD1Real2026GameplayPolicy(gender: NcaaD1RealGender, seed: number): NcaaSchedulePolicy {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new RangeError('NCAA gameplay seed must be uint32')
  const snapshot = buildNcaaD1Real2026ConferenceSnapshot(gender)
  const teamsPerConference = new Map(snapshot.conferences.map(conf => [conf.id, 0]))
  for (const member of snapshot.memberships) {
    teamsPerConference.set(member.conferenceId, (teamsPerConference.get(member.conferenceId) ?? 0) + 1)
  }
  const conferenceGamesPerTeam = Object.fromEntries(snapshot.conferences.map(conf => {
    const count = teamsPerConference.get(conf.id)!
    if (count < 2) throw new Error('NCAA gameplay policy requires at least two source clubs per conference')
    const matches = conf.name === 'Atlantic Sun Conference' ? 14 : Math.min(18, 2 * (count - 1))
    if (matches > 2 * (count - 1)) throw new Error('NCAA source ASUN club count cannot support its 14 official games')
    return [conf.id, matches]
  }))
  return Object.freeze({ seed, nonConferenceRounds: 12, conferenceGamesPerTeam })
}
