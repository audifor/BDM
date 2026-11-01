import { addDays, parseGameDate, type GameDate } from '@/domain/date'
import { createCompetition } from '@/domain/competition'
import { createGame, type Game } from '@/domain/game'
import { competitionIdFromString, gameIdFromString, seasonIdFromString, type ConferenceId, type SeasonId, type TeamId } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { calculateConferenceStandings } from '@/engine/competition/standings/Standings'
import type { NcaaD1RealGender } from './NcaaD1Real2026Conferences'

const CATEGORY_SEASON = (gender: NcaaD1RealGender) => seasonIdFromString('season:USA:ncaa-d1-' + gender + ':2026-27')
const contestId = (gender: NcaaD1RealGender, conf: string) =>
  competitionIdFromString(`competition:USA:ncaa-d1-${gender}:2027:conference-tournament:${conf.split(':').at(-1)!}`)
const editionId = (gender: NcaaD1RealGender, conf: string) =>
  seasonIdFromString(`season:USA:ncaa-d1-${gender}:2027:conference-tournament:${conf.split(':').at(-1)!}`)
const asWinner = (game: Game): TeamId => {
  if (game.status !== 'completed' || game.result.homeScore === game.result.awayScore) throw new Error('NCAA tournament requires completed basketball game with decisive score')
  return game.result.homeScore > game.result.awayScore ? game.homeTeamId : game.awayTeamId
}
const stageName = (remaining: number) => remaining === 2 ? 'CONF_FINAL' : `CONF_ROUND_${remaining}`
const nextPow2 = (n: number) => 2 ** Math.floor(Math.log2(n))

/** Explicitly simulated fallback for NCAA conference championship formats not yet documented.
 * It is never a claim about real site/dates/byes/hosting or NCAA AQ legitimacy.
 * Conference identity, programme/gender and source season are real 2026-27.
 */
export function startNcaa2027ConferenceTournaments(world: GameWorld, gender: NcaaD1RealGender): GameWorld {
  const source = world.seasons[CATEGORY_SEASON(gender)]
  if (!source?.ncaaSchedulePolicy) throw new Error('NCAA conference tournament requires 2026-27 generated season policy')
  const sourceGames = Object.values(world.games).filter(g => g.seasonId === source.id)
  if (!sourceGames.length || sourceGames.some(g => g.status !== 'completed')) throw new Error('NCAA conference tournament requires all 2026-27 regular games completed')
  const byConf = new Map<ConferenceId, TeamId[]>()
  for (const m of source.conferenceMembershipSnapshot ?? []) {
    if (m.seasonId !== source.id) throw new Error('NCAA conference membership edition mismatch')
    const members = byConf.get(m.conferenceId) ?? []
    members.push(m.teamId); byConf.set(m.conferenceId, members)
  }
  if (byConf.size !== 32 || [...byConf.values()].reduce((n, teams) => n + teams.length, 0) !== (gender === 'men' ? 365 : 363)) throw new Error('NCAA D1 conference tournament requires its own 32 source conferences')
  const lastRegular = sourceGames.map(g => g.date).sort().at(-1)!
  const start = parseGameDate(addDays(lastRegular, 1) > '2027-03-01' ? addDays(lastRegular, 1) : '2027-03-01')
  const additions: { competitions: ReturnType<typeof createCompetition>[]; seasons: ReturnType<typeof createSeason>[]; games: Game[] } = { competitions: [], seasons: [], games: [] }
  for (const [conferenceId, original] of [...byConf].sort(([a], [b]) => a.localeCompare(b))) {
    const id = editionId(gender, conferenceId)
    if (world.seasons[id]) throw new Error('NCAA conference tournament edition already created: ' + id)
    const conference = world.conferencesById[conferenceId]
    if (!conference || conference.ecosystemId !== world.competitions[source.competitionId]!.ecosystemId) throw new Error('NCAA source conference identity mismatch: ' + conferenceId)
    const seed = calculateConferenceStandings(world, source.id, conferenceId).map(s => s.teamId)
    if (seed.length !== original.length || seed.length < 2 || new Set(seed).size !== seed.length) throw new Error('NCAA source conference seeding is incomplete')
    const compId = contestId(gender, conferenceId)
    additions.competitions.push(createCompetition({
      id: compId, name: `BDM simulated ${conference.name} 2027 ${gender} championship`,
      gender: gender === 'men' ? 'male' : 'female', ecosystemId: conference.ecosystemId,
      participantTeamIds: seed,
      rules: world.competitions[source.competitionId]!.rules,
    }))
    additions.seasons.push(createSeason({
      id, competitionId: compId, label: `2027 ${gender} ${conference.name} BDM simulated postseason`,
      startDate: start, endDate: parseGameDate('2027-03-15'), participantTeamIds: seed,
    }))
    const target = nextPow2(seed.length)
    const prelimCount = seed.length - target
    const first = prelimCount ? seed.slice(-2 * prelimCount) : seed
    const title = prelimCount ? 'CONF_PRELIM' : stageName(seed.length)
    additions.games.push(...makeRound(id, compId, title, first, start))
  }
  if (additions.seasons.some(s => s.startDate > s.endDate)) throw new Error('NCAA regular season ends too late for conference tournaments')
  return updateGameWorld(world, {
    competitions: [...Object.values(world.competitions), ...additions.competitions],
    seasons: [...Object.values(world.seasons), ...additions.seasons],
    games: [...Object.values(world.games), ...additions.games],
  })
}

function makeRound(seasonId: SeasonId, competitionId: ReturnType<typeof contestId>, stage: string, sortedSeeds: readonly TeamId[], date: GameDate): Game[] {
  if (sortedSeeds.length < 2 || sortedSeeds.length % 2) throw new Error('NCAA conference bracket round needs even seeded entrants')
  return Array.from({ length: sortedSeeds.length / 2 }, (_, i) => createGame({
    id: gameIdFromString(`ncaa2027:conference:${seasonId}:${stage}:${i + 1}`),
    seasonId, competitionId, date,
    homeTeamId: sortedSeeds[i]!, awayTeamId: sortedSeeds[sortedSeeds.length - i - 1]!,
    status: 'scheduled', result: null, stakes: sortedSeeds.length === 2 ? 'final' : 'elimination',
    competitionStageKey: stage, postseasonFixtureId: `${stage}:${i + 1}`, postseasonGameNo: 1,
  }))
}

/** Idempotent; existing played Games determine the next bracket. No hidden state. */
export function advanceNcaa2027ConferenceTournament(world: GameWorld, gender: NcaaD1RealGender, conferenceId: ConferenceId): GameWorld {
  const source = world.seasons[CATEGORY_SEASON(gender)]
  const id = editionId(gender, conferenceId), season = world.seasons[id]
  if (!source || !season) throw new Error('NCAA conference tournament has not been seeded')
  const games = Object.values(world.games).filter(g => g.seasonId === id)
  if (!games.length) throw new Error('NCAA conference tournament has no fixtures')
  const stages = [...new Set(games.map(g => g.competitionStageKey!))]
  const stage = stages.at(-1)!
  const last = games.filter(g => g.competitionStageKey === stage).sort((a,b) => a.id.localeCompare(b.id))
  if (last.some(g => g.status !== 'completed')) return world
  if (getNcaa2027ConferenceChampion(world, gender, conferenceId)) return world
  const seeds = calculateConferenceStandings(world, source.id, conferenceId).map(s => s.teamId)
  const ordinal = new Map(seeds.map((team, i) => [team, i]))
  const winners = last.map(asWinner)
  const byes = stage === 'CONF_PRELIM' ? seeds.slice(0, 2 * nextPow2(seeds.length) - seeds.length) : []
  const survivors = [...byes, ...winners].sort((a,b) => ordinal.get(a)! - ordinal.get(b)!)
  const nextStage = stageName(survivors.length)
  const nextDate = addDays(last[0]!.date, 2)
  if (nextDate > season.endDate) throw new Error('NCAA simulated conference tournament will overrun national selection')
  const next = makeRound(id, season.competitionId, nextStage, survivors, nextDate)
  return updateGameWorld(world, { games: [...Object.values(world.games), ...next] })
}

export function getNcaa2027ConferenceChampion(world: GameWorld, gender: NcaaD1RealGender, conferenceId: ConferenceId): TeamId | null {
  const id = editionId(gender, conferenceId), season = world.seasons[id]
  if (!season) return null
  const games = Object.values(world.games).filter(g => g.seasonId === id)
  if (games.length !== (season.participantTeamIds?.length ?? 0) - 1 || games.some(g => g.status !== 'completed')) return null
  const final = games.filter(g => g.competitionStageKey === 'CONF_FINAL')
  return final.length === 1 ? asWinner(final[0]!) : null
}

export function getNcaa2027ConferenceChampions(world: GameWorld, gender: NcaaD1RealGender): readonly TeamId[] {
  const source = world.seasons[CATEGORY_SEASON(gender)]
  if (!source) throw new Error('Missing NCAA 2026-27 source category')
  const conferences = [...new Set((source.conferenceMembershipSnapshot ?? []).map(m => m.conferenceId))].sort()
  if (conferences.length !== 32) throw new Error('Expected 32 NCAA source conferences')
  return conferences.map(id => {
    const winner = getNcaa2027ConferenceChampion(world, gender, id)
    if (!winner) throw new Error('NCAA automatic qualifier requires completed conference championship: ' + id)
    return winner
  })
}
