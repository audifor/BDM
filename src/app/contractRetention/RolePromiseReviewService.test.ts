import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays, type GameDate } from '@/domain/date'
import { injuryIdFromString, type TeamId } from '@/domain/ids'
import type { Game } from '@/domain/game'
import type { RolePromise } from '@/domain/market'
import type { MatchStatLog, PlayerGameStatLine } from '@/domain/stats/MatchStatLog'
import { relationshipKey } from '@/domain/relationships'
import { SEMANTIC_PERSONALITY_DIMENSIONS } from '@/domain/personality/SemanticPersonality'
import { updateGameWorld } from '@/domain/world'
import { createInjury } from '@/domain/injury'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { deriveRetentionPlayerResponse } from '@/engine/contractRetention/ContractRetentionEngine'
import { progressRolePromiseSeasonReviews } from './RolePromiseReviewService'
import { decideUserHumanSituation, getUserHumanSituations, synchronizeHumanSimulation } from '@/app/hrpg/HumanSimulationService'
import { calculateSeasonStandings } from '@/domain/season/calculateStandings'

const base = createNewGame()
type Mode = 'STAR_STEADY' | 'STARTER_BREACH' | 'ROTATION_HIGH' | 'ROTATION_NO_USE'
interface Scenario { readonly world: ReturnType<typeof createNewGame>; readonly promise: RolePromise; readonly teamId: TeamId; readonly playerIds: readonly string[]; readonly seasonEnd: GameDate; readonly cutoff: GameDate }

function createWorld(mode: Mode, targetIndices: readonly number[] = [mode === 'ROTATION_HIGH' || mode === 'ROTATION_NO_USE' ? 5 : 0], throughEnd = true): Scenario {
  const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
  const competition = Object.values(base.competitions).find((item) => item.participantTeamIds.includes(team.id))!
  const season = Object.values(base.seasons).find((item) => item.competitionId === competition.id
    && (item.participantTeamIds ?? competition.participantTeamIds).includes(team.id))!
  const teamGames = Object.values(base.games).filter((game) => game.competitionId === competition.id && game.seasonId === season.id && (game.homeTeamId === team.id || game.awayTeamId === team.id))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
  const cutoff = throughEnd ? season.endDate : teamGames[Math.floor(teamGames.length / 2)]!.date
  const playerIds = targetIndices.map((index) => team.rosterPlayerIds[index]!)
  const rolePromises: RolePromise[] = playerIds.map((playerId) => ({ id: `role-promise:review-test:${mode}:${playerId}`, playerId, teamOrganizationId: team.organizationId,
    role: mode === 'STAR_STEADY' ? 'STAR' as const : mode === 'STARTER_BREACH' ? 'STARTER' as const : 'ROTATION' as const,
    acceptedOn: season.startDate, status: 'ACTIVE' as const }))
  const rolePromise = rolePromises[0]!
  const targetByPlayer = new Map<string, Mode>(playerIds.map((id) => [id, mode]))
  const logs: MatchStatLog[] = []
  const games: Game[] = Object.values(base.games).map((game) => {
    if (game.date > cutoff || game.status !== 'scheduled') return game
    const home = base.teams[game.homeTeamId]!
    const away = base.teams[game.awayTeamId]!
    const homeScore = 100
    const awayScore = 95
    const completed = { ...game, status: 'completed' as const, result: { homeScore, awayScore } }
    const regulationSeconds = base.competitions[game.competitionId]!.rules.gameFormat.periodCount
      * base.competitions[game.competitionId]!.rules.gameFormat.periodMinutes * 60
    const homeLines = makeTeamLines(home.rosterPlayerIds, home.id, away.id, true, regulationSeconds, home.id === team.id ? targetByPlayer : new Map(), homeScore)
    const awayLines = makeTeamLines(away.rosterPlayerIds, away.id, home.id, false, regulationSeconds, away.id === team.id ? targetByPlayer : new Map(), awayScore)
    logs.push({ gameId: game.id, competitionId: game.competitionId, seasonId: game.seasonId, gameDate: game.date,
      homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, finalScore: { home: homeScore, away: awayScore }, playerLines: [...homeLines, ...awayLines] })
    return completed
  })
  const contracts = Object.values(base.contractsById).map((contract) => playerIds.includes(contract.playerId) && contract.teamId === team.id
    ? { ...contract, term: { startsOn: season.startDate, expiresOn: addDays(season.endDate, 30) }, termination: undefined }
    : contract)
  const interim = updateGameWorld(base, { games, matchStatLogs: logs })
  const seasonHistory = Object.values(interim.seasons).filter(candidate => {
    const seasonGames = Object.values(interim.games).filter(game => game.seasonId === candidate.id)
    return seasonGames.length > 0 && seasonGames.every(game => game.status === 'completed')
  })
    .map(candidate => {
      const finalStandings = calculateSeasonStandings(interim, candidate.id)
      return { seasonId: candidate.id, competitionId: candidate.competitionId, completedOn: candidate.endDate,
        championTeamId: finalStandings[0]!.teamId, finalStandings }
    })
  const world = updateGameWorld(interim, { currentDate: addDays(cutoff, 1), rolePromises, contracts, seasonHistory })
  return { world, promise: rolePromise, teamId: team.id, playerIds, seasonEnd: season.endDate, cutoff }
}

function makeTeamLines(roster: readonly string[], teamId: string, opponentTeamId: string, isHome: boolean, regulation: number,
  targets: ReadonlyMap<string, Mode>, points: number): PlayerGameStatLine[] {
  const ids = targets.size === 0 ? [] : [...targets.keys()]
  let active: { id: string; started: boolean; seconds: number }[]
  if (ids.length >= 2 && [...targets.values()].every((mode) => mode === 'STARTER_BREACH')) {
    const starters = roster.filter((id) => !targets.has(id)).slice(0, 5)
    active = [...starters.map(id => ({ id, started: true, seconds: regulation * 0.9 })), ...ids.map(id => ({ id, started: false, seconds: regulation * 0.25 }))]
  } else if (ids.length > 0 && targets.get(ids[0]!) === 'STAR_STEADY') {
    active = [...roster.slice(0, 5).map(id => ({ id, started: true, seconds: regulation * 0.8 })),
      ...roster.slice(5, 7).map(id => ({ id, started: false, seconds: regulation * 0.5 }))]
  } else if (ids.length > 0 && targets.get(ids[0]!) === 'STARTER_BREACH') {
    const target = ids[0]!
    const starters = roster.filter(id => id !== target).slice(0, 5)
    const reserve = roster.find(id => id !== target && !starters.includes(id))!
    active = [...starters.map(id => ({ id, started: true, seconds: regulation * 0.9 })),
      { id: target, started: false, seconds: regulation * 0.25 }, { id: reserve, started: false, seconds: regulation * 0.25 }]
  } else if (ids.length > 0 && targets.get(ids[0]!) === 'ROTATION_HIGH') {
    const target = ids[0]!
    const starters = roster.filter(id => id !== target).slice(0, 5)
    const reserve = roster.find(id => id !== target && !starters.includes(id))!
    active = [...starters.map(id => ({ id, started: true, seconds: regulation * 0.8 })),
      { id: target, started: false, seconds: regulation * 0.6 }, { id: reserve, started: false, seconds: regulation * 0.4 }]
  } else if (ids.length > 0 && targets.get(ids[0]!) === 'ROTATION_NO_USE') {
    const target = ids[0]!
    const starters = roster.filter(id => id !== target).slice(0, 5)
    const reserve = roster.find(id => id !== target && !starters.includes(id))!
    active = [...starters.map(id => ({ id, started: true, seconds: regulation * 0.9 })), { id: reserve, started: false, seconds: regulation * 0.5 }]
  } else {
    active = [...roster.slice(0, 5).map(id => ({ id, started: true, seconds: regulation * 0.9 })),
      { id: roster[5]!, started: false, seconds: regulation * 0.5 }]
  }
  const sum = active.reduce((total, item) => total + item.seconds, 0)
  if (sum !== regulation * 5 || active.filter(item => item.started).length !== 5) throw new Error(`Invalid synthetic minutes for ${teamId}: ${sum}/${regulation * 5}`)
  return active.map((item, index) => ({ playerId: item.id as never, teamId: teamId as never, opponentTeamId: opponentTeamId as never,
    isHome, started: item.started, stats: { playerId: item.id as never, secondsPlayed: item.seconds, points: index === 0 ? points : 0,
      fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointMade: 0, twoPointAttempted: 0, threePointMade: 0, threePointAttempted: 0,
      freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0,
      steals: 0, blocks: 0, turnovers: 0, foulsCommitted: 0, plusMinus: 0 } }))
}

describe('seasonal RolePromise consequences', () => {
  it('records reasonable STAR use from a relative minutes leader without conflict and keeps the promise active', () => {
    const scenario = createWorld('STAR_STEADY')
    const reviewed = progressRolePromiseSeasonReviews(scenario.world)
    const playerMemory = Object.values(reviewed.memoriesById).find(item => item.owner.id === scenario.promise.playerId && item.context.rolePromiseId === scenario.promise.id)
    expect(playerMemory).toMatchObject({ type: 'support', context: { reviewStatus: 'REASONABLE', role: 'STAR' } })
    expect(reviewed.moraleByPersonId[scenario.promise.playerId]!.value).toBeGreaterThan(scenario.world.moraleByPersonId[scenario.promise.playerId]!.value)
    expect(reviewed.rolePromisesById[scenario.promise.id]!.status).toBe('ACTIVE')
  })

  it('recognizes a starter losing the place over a season and affects morale, coach relationship, and later retention', () => {
    const scenario = createWorld('STARTER_BREACH')
    const coachId = scenario.world.teams[scenario.teamId]!.coachId!
    const key = relationshipKey(scenario.promise.playerId, coachId)
    const reviewed = progressRolePromiseSeasonReviews(scenario.world)
    expect(Object.values(reviewed.memoriesById).some(item => item.context.rolePromiseId === scenario.promise.id && item.context.reviewStatus === 'SUSTAINED_BREACH')).toBe(true)
    expect(reviewed.moraleByPersonId[scenario.promise.playerId]!.value).toBeLessThan(scenario.world.moraleByPersonId[scenario.promise.playerId]!.value)
    expect(reviewed.relationshipsByKey[key]!.value).toBeLessThan(scenario.world.relationshipsByKey[key]?.value ?? 0)
    expect(reviewed.rolePromisesById[scenario.promise.id]!.status).toBe('ACTIVE')
    const contract = Object.values(reviewed.contractsById).find(item => item.playerId === scenario.promise.playerId && item.teamId === scenario.teamId)!
    const response = deriveRetentionPlayerResponse(reviewed, { teamId: scenario.teamId as never, playerId: scenario.promise.playerId, predecessorContractId: contract.id },
      { salary: Math.ceil(contract.compensation.annualSalary * 0.95), years: 1, role: 'DEPTH' })
    expect(response.factors.morale).toBeLessThan(1)
    expect(response.factors.relationship).toBeLessThan(1)
  })

  it('accepts a sixth-man rotation role with frequent, meaningful minutes and no starts', () => {
    const scenario = createWorld('ROTATION_HIGH')
    const reviewed = progressRolePromiseSeasonReviews(scenario.world)
    const memory = Object.values(reviewed.memoriesById).find(item => item.context.rolePromiseId === scenario.promise.id)
    expect(memory?.context.reviewStatus).toBe('REASONABLE')
  })

  it('recognizes a rotation player benched by the coach while still available', () => {
    const scenario = createWorld('ROTATION_NO_USE')
    const reviewed = progressRolePromiseSeasonReviews(scenario.world)
    expect(Object.values(reviewed.memoriesById).find(item => item.owner.id === scenario.promise.playerId)?.context.reviewStatus).toBe('SUSTAINED_BREACH')
  })

  it('lets the existing HRPG surface a match-backed concern for the coach to discuss', () => {
    const scenario = createWorld('STARTER_BREACH')
    const reviewed = progressRolePromiseSeasonReviews(scenario.world)
    const syncBefore = updateGameWorld(scenario.world, { currentDate: scenario.seasonEnd })
    const synchronized = synchronizeHumanSimulation(syncBefore, reviewed)
    const coachMemoryId = Object.values(reviewed.memoriesById).find(item => item.owner.kind === 'coach' && item.context.rolePromiseId === scenario.promise.id)!.id
    const conversation = getUserHumanSituations(synchronized).find(item => item.source.id === coachMemoryId)
    expect(conversation?.narration.description).toContain('Role promise review: SUSTAINED_BREACH')
    const coachId = synchronized.teams[scenario.teamId]!.coachId!
    const key = relationshipKey(scenario.promise.playerId, coachId)
    const before = synchronized.relationshipsByKey[key]?.value ?? 0
    const discussed = decideUserHumanSituation(synchronized, conversation!.id, 'discuss')
    expect(discussed.status).toBe('APPLIED')
    expect(discussed.world.relationshipsByKey[key]!.value).toBeGreaterThan(before)
  })

  it('lets PERSON50 modulate comparable sustained-breach morale consequences', () => {
    const scenario = createWorld('STARTER_BREACH', [0, 1])
    const personalities = { ...scenario.world.personalitiesByPersonId }
    for (const [index, playerId] of scenario.playerIds.entries()) {
      const personality = personalities[playerId]!
      const values = { ...personality.values }
      for (const key of SEMANTIC_PERSONALITY_DIMENSIONS) values[key] = index === 0 ? 0 : 100
      personalities[playerId] = { ...personality, values }
    }
    const varied = updateGameWorld(scenario.world, { personalitiesByPersonId: personalities })
    const reviewed = progressRolePromiseSeasonReviews(varied)
    const deltas = scenario.playerIds.map(playerId => reviewed.moraleByPersonId[playerId]!.value - varied.moraleByPersonId[playerId]!.value)
    expect(deltas[0]).not.toBe(deltas[1])
  })

  it('requires sufficient complete games and excludes injury time from the expectation denominator', () => {
    const scenario = createWorld('STAR_STEADY')
    const targetGames = Object.values(scenario.world.games).filter(game => game.seasonId !== undefined &&
      (game.homeTeamId === scenario.teamId || game.awayTeamId === scenario.teamId) && game.status === 'completed')
      .sort((left, right) => left.date.localeCompare(right.date))
    const injuredThrough = targetGames[3]!.date
    const injury = createInjury({ id: injuryIdFromString('injury:role-promise-review-test'), playerId: scenario.promise.playerId,
      kind: 'ankleSprain', severity: 'minor', injuredOn: targetGames[0]!.date, expectedReturnDate: addDays(injuredThrough, 1),
      returnToPlay: { reviewDueOn: addDays(injuredThrough, 1), clearedOn: addDays(injuredThrough, 1), reviews: [] } })
    const injuredWorld = updateGameWorld(scenario.world, { injuries: [...Object.values(scenario.world.injuriesById), injury] })
    const injuryReview = progressRolePromiseSeasonReviews(injuredWorld)
    expect(Object.values(injuryReview.memoriesById).find(item => item.context.rolePromiseId === scenario.promise.id)?.context.reviewStatus).toBe('REASONABLE')
    const incomplete = updateGameWorld(scenario.world, { matchStatLogs: Object.values(scenario.world.matchStatLogsByGameId)
      .filter(log => !targetGames.slice(0, 4).some(game => game.id === log.gameId)) })
    expect(Object.values(progressRolePromiseSeasonReviews(incomplete).memoriesById).some(item => item.context.rolePromiseId === scenario.promise.id)).toBe(false)
    const noEvidence = createWorld('ROTATION_HIGH', [5], false)
    expect(Object.values(progressRolePromiseSeasonReviews(noEvidence.world).memoriesById).some(item => item.context.rolePromiseId === noEvidence.promise.id)).toBe(false)
  })

  it('replays a midpoint Save V4 to one seasonal event and does not apply it again after load', () => {
    const partial = createWorld('STARTER_BREACH', [0], false)
    const loadedMidseason = deserializeGameWorldV4(serializeGameWorldV4(partial.world, '2026-11-02T12:00:00.000Z'))
    expect(progressRolePromiseSeasonReviews(loadedMidseason).memoriesById).toEqual(loadedMidseason.memoriesById)
    const finished = createWorld('STARTER_BREACH')
    const nextGames = Object.values(finished.world.games).filter(game => game.status === 'completed' && game.date > partial.cutoff)
    const nextLogs = Object.values(finished.world.matchStatLogsByGameId).filter(log => nextGames.some(game => game.id === log.gameId))
    const continued = updateGameWorld(loadedMidseason, { currentDate: addDays(finished.seasonEnd, 1),
      games: Object.values(loadedMidseason.games).map(game => finished.world.games[game.id] ?? game),
      matchStatLogs: [...Object.values(loadedMidseason.matchStatLogsByGameId), ...nextLogs],
      seasonHistory: Object.values(finished.world.seasonHistoryBySeasonId) })
    const reviewed = progressRolePromiseSeasonReviews(continued)
    const loadedAfterReview = deserializeGameWorldV4(serializeGameWorldV4(reviewed, '2026-11-02T12:00:00.000Z'))
    const replayed = progressRolePromiseSeasonReviews(loadedAfterReview)
    expect(Object.values(replayed.memoriesById).filter(item => item.context.rolePromiseId === finished.promise.id && item.owner.kind === 'player')).toHaveLength(1)
    expect(replayed.moraleByPersonId[finished.promise.playerId]).toEqual(loadedAfterReview.moraleByPersonId[finished.promise.playerId])
  })
})
