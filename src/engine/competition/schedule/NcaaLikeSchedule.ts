import { addDays, compareGameDates } from '@/domain/date'
import { createGame, type Game } from '@/domain/game'
import type { ConferenceMembership } from '@/domain/conference'
import { gameIdFromString, type SeasonId, type TeamId } from '@/domain/ids'
import { getCompetition, getSeason, type GameWorld } from '@/domain/world'
import { SeededRandomSource, hashStringToSeed } from '@/engine/random'

export type { NcaaSchedulePolicy as NcaaGeneratedSchedulePolicy } from '@/domain/season/Season'
import type { NcaaSchedulePolicy as NcaaGeneratedSchedulePolicy } from '@/domain/season/Season'

/** Generates dates and pairings using explicitly supplied conference game counts.
 * A generated pairing is not an official historical fixture or a claim that
 * opponent selection matrices and postseason rules have been certified. */
export function generateNcaaConfiguredSchedule(world: GameWorld, seasonId: SeasonId, policy: NcaaGeneratedSchedulePolicy): Game[] {
  const season = getSeason(world, seasonId)
  const competition = getCompetition(world, season.competitionId)
  if (world.ecosystems[competition.ecosystemId]?.kind !== 'ncaaLike') throw new Error('NCAA schedule requires an NCAA-like competition')
  if (!Number.isInteger(policy.seed) || policy.seed < 0 || policy.seed > 0xffff_ffff ||
      !Number.isInteger(policy.nonConferenceRounds) || policy.nonConferenceRounds < 0) throw new RangeError('Invalid NCAA schedule seed or nonconference rounds')
  const memberships = season.conferenceMembershipSnapshot ?? world.conferenceMemberships.filter(m => m.seasonId === seasonId)
  const participants = season.participantTeamIds ?? competition.participantTeamIds
  const grouped = new Map<string, TeamId[]>()
  const seen = new Set<TeamId>()
  for (const membership of memberships) {
    if (membership.seasonId !== seasonId || seen.has(membership.teamId) || !participants.includes(membership.teamId)) throw new Error('NCAA conference memberships must uniquely match the season participants')
    seen.add(membership.teamId)
    const group = grouped.get(membership.conferenceId) ?? []
    group.push(membership.teamId)
    grouped.set(membership.conferenceId, group)
  }
  if (seen.size !== participants.length || grouped.size < 2 || Object.keys(policy.conferenceGamesPerTeam).length !== grouped.size) throw new Error('NCAA schedule requires one explicit policy per populated conference')
  const random = new SeededRandomSource(hashStringToSeed(`${policy.seed}:${seasonId}`))
  const shuffle = <T>(values: readonly T[]): T[] => {
    const result = [...values]
    for (let i = result.length - 1; i > 0; i--) { const j = random.nextInt(0, i); [result[i], result[j]] = [result[j]!, result[i]!] }
    return result
  }
  const groups = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([id, teams]) => ({ id, teams: shuffle([...teams].sort()) }))
  const rounds: Array<Array<{ home: TeamId; away: TeamId; classification: 'conference' | 'nonConference' }>> = []
  const nonConferenceParticipants = new Set<TeamId>()
  const venueBalance = new Map<TeamId, number>()
  for (let round = 0; round < policy.nonConferenceRounds; round++) {
    // When a prior odd round left a bye, prefer that team in the next round.
    const buckets = groups.map(group => shuffle(group.teams).sort((a, b) => Number(nonConferenceParticipants.has(b)) - Number(nonConferenceParticipants.has(a))))
    const matches: typeof rounds[number] = []
    while (true) {
      const available = buckets.map((bucket, index) => ({ bucket, index })).filter(x => x.bucket.length > 0)
        .sort((a, b) => b.bucket.length - a.bucket.length || ((a.index + round) % groups.length) - ((b.index + round) % groups.length))
      if (available.length < 2) break
      const a = available[0]!.bucket.pop()!, b = available[1]!.bucket.pop()!
      nonConferenceParticipants.add(a); nonConferenceParticipants.add(b)
      const aBalance = venueBalance.get(a) ?? 0, bBalance = venueBalance.get(b) ?? 0
      const aHosts = aBalance < bBalance || (aBalance === bBalance && round % 2 === 0)
      const home = aHosts ? a : b, away = aHosts ? b : a
      venueBalance.set(home, (venueBalance.get(home) ?? 0) + 1)
      venueBalance.set(away, (venueBalance.get(away) ?? 0) - 1)
      matches.push({ home, away, classification: 'nonConference' })
    }
    rounds.push(matches)
  }
  if (policy.nonConferenceRounds > 1 && nonConferenceParticipants.size !== participants.length) throw new Error('NCAA nonconference rounds cannot cover every participant')
  const conferenceStart = rounds.length
  for (const group of groups) {
    const n = group.teams.length, count = policy.conferenceGamesPerTeam[group.id]
    if (count === undefined || !Number.isInteger(count) || count < 2 || count % 2 !== 0 || count > 2 * (n - 1)) {
      throw new Error(`NCAA conference ${group.id} requires a supported explicit even game count`)
    }
    const offsets = Math.floor((n - 1) / 2)
    const firstCount = Math.min(count, offsets * 2)
    const firstOffsets = firstCount / 2
    const remaining = count - firstCount
    const cycles: Array<{ offset: number; reverse: boolean; antipodal?: boolean }> = []
    for (let offset = 1; offset <= firstOffsets; offset++) cycles.push({ offset, reverse: false })
    let extra = remaining
    if (n % 2 === 0 && extra >= 2) {
      cycles.push({ offset: n / 2, reverse: false, antipodal: true }, { offset: n / 2, reverse: true, antipodal: true })
      extra -= 2
    }
    for (let offset = 1; offset <= extra / 2; offset++) cycles.push({ offset, reverse: true })
    const local: typeof rounds = []
    for (const cycle of cycles) {
      const edges = cycle.antipodal ? n / 2 : n
      const cycleRounds: typeof rounds = []
      for (let i = 0; i < edges; i++) {
        const first = group.teams[i]!, second = group.teams[(i + cycle.offset) % n]!
        const home = cycle.reverse ? second : first, away = cycle.reverse ? first : second
        let target = cycleRounds.find(r => r.every(g => g.home !== home && g.away !== home && g.home !== away && g.away !== away))
        if (target === undefined) { target = []; cycleRounds.push(target) }
        target.push({ home, away, classification: 'conference' })
      }
      local.push(...cycleRounds)
    }
    for (let i = 0; i < local.length; i++) {
      const index = conferenceStart + i
      if (rounds[index] === undefined) rounds[index] = []
      rounds[index]!.push(...local[i]!)
    }
  }
  let sequence = 0
  const games = rounds.flatMap((round, index) => round.map(match => createGame({
    id: gameIdFromString(`schedule-${season.id}-game-${String(++sequence).padStart(5, '0')}`),
    seasonId, competitionId: competition.id, date: addDays(season.startDate, 4 * (index + 1)),
    homeTeamId: match.home, awayTeamId: match.away, classification: match.classification,
    status: 'scheduled', result: null,
  })))
  if (games.some(game => compareGameDates(game.date, season.endDate) > 0)) throw new RangeError('NCAA generated schedule does not fit the season window')
  return games
}

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
