import { describe, expect, it } from 'vitest'
import { createMatchEnginePort, type MatchNextResult } from '@/app/matchNext'
import { createWorkerPoolRunner, type MatchSimulationJob, type MatchSimulationReply } from '@/app/matchNext/MatchSimulationRunner'
import { createNewGame } from '@/app/game/createNewGame'
import { advanceGameDayWithResult, advanceGameDayWithResultAsync } from '@/app/game/advanceGameDay'
import { withShortGameFormat } from '@/app/game/testFixtures'
import { resolveDayGames } from '@/app/game/matchResolution'
import { NBA_GAME_FORMAT, NCAA_MEN_GAME_FORMAT, WNBA_GAME_FORMAT } from '@/domain/competition'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDay, getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { calculateStandings } from '@/engine/competition/standings'
import type { MatchSetup } from '@/engine/match-next'
import { simulateBackgroundMatch } from '@/engine/world-sim/background/BackgroundMatchModel'
import { BACKGROUND_MODEL_V1 } from '@/engine/world-sim/background/backgroundModelV1'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { completeBackgroundMatch } from './BackgroundMatchCompletion'
import { decideResolutions, DEFAULT_SIMULATION_DETAIL, type SimulationDetailSettings } from './SimulationResolutionPolicy'

const port = createMatchEnginePort('match-next')
const firstGameDay = (world: GameWorld): GameWorld => { let current = world; while (getScheduledGamesToday(current).length === 0) current = advanceDay(current); return current }
const world0 = firstGameDay(createNewGame())
const setupFor = (world: GameWorld, index = 0, seed = 11): MatchSetup => port.prepare(world, getScheduledGamesToday(world)[index]!, seed)
const withFormat = (world: GameWorld, format: typeof NBA_GAME_FORMAT): GameWorld => updateGameWorld(world, { competitions: Object.values(world.competitions).map((c) => ({ ...c, rules: { ...c.rules, gameFormat: format } })) })
const minimal: SimulationDetailSettings = { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' }

describe('WSR1 BACKGROUND match model', () => {
  it('is deterministic for (model version, setup, seed) and varies with the seed', () => {
    const setup = setupFor(world0)
    expect(JSON.stringify(simulateBackgroundMatch(setup))).toBe(JSON.stringify(simulateBackgroundMatch(setup)))
    expect(simulateBackgroundMatch(setup).modelVersion).toBe(BACKGROUND_MODEL_V1.version)
    const scores = new Set(Array.from({ length: 8 }, (_, s) => JSON.stringify(simulateBackgroundMatch({ ...setup, matchSeed: s }).score)))
    expect(scores.size).toBeGreaterThan(4)
  })

  it('produces a coherent canonical box score: players sum to the team, minutes to five players x the game, five starters', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const setup = { ...setupFor(world0, seed % 4), matchSeed: seed }
      const result = simulateBackgroundMatch(setup)
      expect(result.score.home).not.toBe(result.score.away)
      const gameSeconds = (setup.clockRules.periodCount * setup.clockRules.periodSeconds + (result.periods - setup.clockRules.periodCount) * setup.clockRules.overtimeSeconds) * 5
      for (const [side, squad] of [['home', result.squads.home], ['away', result.squads.away]] as const) {
        const lines = result.playerStats.filter((line) => squad.includes(line.playerId))
        const sum = (pick: (line: (typeof lines)[number]) => number) => lines.reduce((total, line) => total + pick(line), 0)
        expect(sum((l) => l.points)).toBe(result.score[side])
        expect(sum((l) => l.secondsPlayed)).toBe(gameSeconds)
        for (const l of lines) {
          expect(l.fieldGoalsAttempted).toBe(l.twoPointAttempted + l.threePointAttempted)
          expect(l.fieldGoalsMade).toBe(l.twoPointMade + l.threePointMade)
          expect(l.points).toBe(2 * l.twoPointMade + 3 * l.threePointMade + l.freeThrowsMade)
          expect(l.rebounds).toBe(l.offensiveRebounds + l.defensiveRebounds)
          expect(l.foulsCommitted).toBeLessThanOrEqual(setup.clockRules.foulRules?.personalFoulLimit ?? 5)
          expect(l.secondsPlayed).toBeGreaterThanOrEqual(0)
        }
        const detail = result.teamDetail[side]
        expect(detail.fieldGoalsByZone.rim.attempted + detail.fieldGoalsByZone.mid.attempted + detail.fieldGoalsByZone.three.attempted).toBe(sum((l) => l.fieldGoalsAttempted))
        expect(sum((l) => l.plusMinus)).toBe(5 * (result.score[side] - result.score[side === 'home' ? 'away' : 'home']))
      }
      expect(result.starters.home).toHaveLength(5)
      expect(result.starters.away).toHaveLength(5)
    }
  })

  it('uses only the players available for the match: an injured player never appears', () => {
    const game = getScheduledGamesToday(world0)[0]!
    const injuredId = getUserTeam(world0)!.rosterPlayerIds.find((id) => getScheduledGamesToday(world0)[0]!.homeTeamId === getUserTeam(world0)!.id ? true : id !== undefined)!
    const home = world0.teams[game.homeTeamId]!
    const target = home.rosterPlayerIds[0]!
    void injuredId
    const injured = updateGameWorld(world0, { injuries: [...Object.values(world0.injuriesById), createInjury({ id: injuryIdFromString(`injury:wsr1:${target}`), playerId: target, kind: 'ankleSprain', severity: 'moderate', injuredOn: world0.currentDate, expectedReturnDate: addDays(world0.currentDate, 20), sourceGameId: undefined as never })] })
    const setup = port.prepare(injured, game, 3)
    expect(setup.homeSquad).not.toContain(target)
    const result = simulateBackgroundMatch(setup)
    expect(result.playerStats.some((line) => line.playerId === target)).toBe(false)
  })

  it('follows the canonical rotation: starters play most, the bench plays, minutes vary from game to game', () => {
    const setup = setupFor(world0)
    const plan = setup.coachingPlans!.home
    const results = Array.from({ length: 30 }, (_, s) => simulateBackgroundMatch({ ...setup, matchSeed: s }))
    const minutes = (id: string) => results.map((r) => r.playerStats.find((l) => l.playerId === id)!.secondsPlayed / 60)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const starters = plan.startingLineup
    const bench = setup.homeSquad.filter((id) => !starters.includes(id) && (plan.expectedMinutesByPlayerId[id] ?? 0) > 0)
    for (const id of starters) expect(mean(minutes(id))).toBeGreaterThan(20)
    expect(bench.some((id) => mean(minutes(id)) > 3)).toBe(true)
    expect(new Set(minutes(starters[0]!).map((m) => Math.round(m))).size).toBeGreaterThan(3)
  })

  it('plays every competition format at its own length, overtime included', () => {
    for (const format of [NBA_GAME_FORMAT, NCAA_MEN_GAME_FORMAT, WNBA_GAME_FORMAT]) {
      const setup = setupFor(withFormat(world0, format))
      const result = simulateBackgroundMatch(setup)
      const seconds = result.playerStats.filter((l) => result.squads.home.includes(l.playerId)).reduce((s, l) => s + l.secondsPlayed, 0)
      const regulation = format.periodCount * format.periodMinutes * 60 * 5
      expect(seconds).toBe(regulation + (result.periods - format.periodCount) * format.overtimeMinutes * 60 * 5)
    }
    // Overtime: some seed ties regulation; its minutes include the overtime period.
    const setup = setupFor(world0)
    const overtime = Array.from({ length: 400 }, (_, s) => simulateBackgroundMatch({ ...setup, matchSeed: s })).find((r) => r.periods > setup.clockRules.periodCount)
    expect(overtime).toBeDefined()
    const total = overtime!.playerStats.filter((l) => overtime!.squads.home.includes(l.playerId)).reduce((s, l) => s + l.secondsPlayed, 0)
    expect(total).toBe((setup.clockRules.periodCount * setup.clockRules.periodSeconds + (overtime!.periods - setup.clockRules.periodCount) * setup.clockRules.overtimeSeconds) * 5)
  })

  it('keeps strength ordering and player and tactical identity', () => {
    const base = setupFor(world0)
    const scale = (setup: MatchSetup, k: number, home: boolean): MatchSetup => ({ ...setup, players: setup.players.map((p) => (p.teamId === setup.homeTeamId) !== home ? p : { ...p, offense: { ...p.offense, rimAttack: p.offense.rimAttack * k, shooting: p.offense.shooting * k, creation: p.offense.creation * k, ballSecurity: p.offense.ballSecurity * k }, defense: { ...p.defense, pointOfAttack: p.defense.pointOfAttack * k, interior: p.defense.interior * k, mobility: p.defense.mobility * k }, rebounding: { impact: p.rebounding.impact * k } }) })
    // Strength ordering is monotonic: a stronger home side wins more often, a weaker one less (FAST is the reference for how much).
    const winRate = (setup: MatchSetup) => Array.from({ length: 120 }, (_, s) => simulateBackgroundMatch({ ...setup, matchSeed: s })).filter((r) => r.score.home > r.score.away).length / 120
    const rates = [scale(scale(base, 0.9, true), 1.1, false), base, scale(scale(base, 1.1, true), 0.9, false), scale(scale(base, 1.15, true), 0.85, false)].map(winRate)
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]!).toBeGreaterThan(rates[i - 1]! + 0.05)
    // Player identity: the team's best creator takes far more shots than a deep reserve (who still gets some).
    const results = Array.from({ length: 40 }, (_, s) => simulateBackgroundMatch({ ...base, matchSeed: s }))
    const shots = (id: string) => results.reduce((sum, r) => sum + r.playerStats.find((l) => l.playerId === id)!.fieldGoalsAttempted, 0)
    const home = base.players.filter((p) => p.teamId === base.homeTeamId)
    const star = [...home].sort((a, b) => b.offense.creation - a.offense.creation)[0]!
    const plan = base.coachingPlans!.home.expectedMinutesByPlayerId
    const reserve = [...home].filter((p) => (plan[p.playerId] ?? 0) > 0).sort((a, b) => (plan[a.playerId] ?? 0) - (plan[b.playerId] ?? 0))[0]!
    expect(shots(star.playerId)).toBeGreaterThan(3 * shots(reserve.playerId))
    // Interior-minded rosters attack the rim more than perimeter ones.
    const tilt = (k: number) => ({ ...base, players: base.players.map((p) => p.teamId !== base.homeTeamId ? p : { ...p, offense: { ...p.offense, rimAttack: Math.min(99, p.offense.rimAttack + k), shooting: Math.max(20, p.offense.shooting - k) } }) })
    const rimShare = (setup: MatchSetup) => { let rim = 0, all = 0; for (let s = 0; s < 40; s += 1) { const d = simulateBackgroundMatch({ ...setup, matchSeed: s }).teamDetail.home.fieldGoalsByZone; rim += d.rim.attempted; all += d.rim.attempted + d.mid.attempted + d.three.attempted } return rim / all }
    expect(rimShare(tilt(15))).toBeGreaterThan(rimShare(tilt(-15)) + 0.03)
  })
})

describe('WSR1 resolution policy', () => {
  const games = getScheduledGamesToday(world0)
  const userTeam = getUserTeam(world0)!

  it('keeps the user game exact (FULL when watched), the user competition FAST, and is deterministic', () => {
    const decisions = decideResolutions(world0, games)
    for (const [index, game] of games.entries()) {
      const userGame = game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id
      if (userGame) expect(decisions[index]).toMatchObject({ resolution: 'FAST', reason: 'USER_GAME' })
    }
    const live = games.find((game) => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)
    if (live) expect(decideResolutions(world0, games, DEFAULT_SIMULATION_DETAIL, { liveGameId: live.id }).find((d) => d.gameId === live.id)!.resolution).toBe('FULL')
    expect(decideResolutions(world0, games)).toEqual(decisions)
  })

  it('honours MINIMAL detail, low-detail competitions, the exact budget and live scouting', () => {
    const others = games.filter((game) => game.homeTeamId !== userTeam.id && game.awayTeamId !== userTeam.id)
    expect(decideResolutions(world0, others, minimal).every((d) => d.resolution === 'BACKGROUND')).toBe(true)
    // Outside the user's competition: budget 1 -> one exact Game in schedule order, the rest BACKGROUND; low detail always BACKGROUND.
    const foreign = Object.values(world0.games).filter((game) => game.status === 'scheduled' && !world0.competitions[game.competitionId]!.participantTeamIds.includes(userTeam.id)).slice(0, 4)
    const budgeted = decideResolutions(world0, foreign, { ...DEFAULT_SIMULATION_DETAIL, exactBudgetPerDay: 1 })
    expect(budgeted.map((d) => d.resolution)).toEqual(['FAST', 'BACKGROUND', 'BACKGROUND', 'BACKGROUND'])
    expect(decideResolutions(world0, foreign, { ...DEFAULT_SIMULATION_DETAIL, lowDetailCompetitionIds: [foreign[0]!.competitionId] })[0]!.resolution).toBe('BACKGROUND')
    expect(decideResolutions(world0, foreign, { ...DEFAULT_SIMULATION_DETAIL, exactBudgetPerDay: 0, highDetailCompetitionIds: [foreign[3]!.competitionId] }).every((d) => d.resolution === 'BACKGROUND')).toBe(true)
    // A live scouting assignment raises one observed Game, not the rest.
    const observed = foreign[2]!
    const scouted = updateGameWorld(world0, { scoutingAssignments: [...Object.values(world0.scoutingAssignmentsById), { id: 'wsr1-scout', organizationId: Object.keys(world0.organizationsById)[0] as never, subjectPlayerId: world0.teams[observed.homeTeamId]!.rosterPlayerIds[0]!, evaluatorStaffId: Object.keys(world0.staffPeopleById)[0] as never, missionType: 'LIVE_GAME', requestedBy: 'USER' as never, priority: 'HIGH' as never, createdAt: world0.currentDate, status: 'ACTIVE', gameId: observed.id }] })
    const withScout = decideResolutions(scouted, foreign, { ...DEFAULT_SIMULATION_DETAIL, exactBudgetPerDay: 0 })
    expect(withScout.find((d) => d.gameId === observed.id)).toMatchObject({ resolution: 'FAST', reason: 'LIVE_SCOUTING' })
    expect(withScout.filter((d) => d.resolution === 'FAST')).toHaveLength(1)
  })
})

describe('WSR1 world integration', () => {
  it('a mixed day applies FAST and BACKGROUND results through one boundary, with provenance, standings and consequences', () => {
    const world = withShortGameFormat(world0)
    const games = getScheduledGamesToday(world)
    let seed = 500
    const after = resolveDayGames(world, games, () => seed++, undefined, minimal)
    const logs = games.map((game) => after.matchStatLogsByGameId[game.id]!)
    expect(logs.every((log) => log !== undefined)).toBe(true)
    expect(new Set(logs.map((log) => log.resolution))).toEqual(new Set(['FAST', 'BACKGROUND']))
    for (const log of logs.filter((l) => l.resolution === 'BACKGROUND')) {
      expect(log.backgroundModelVersion).toBe(BACKGROUND_MODEL_V1.version)
      expect(after.games[log.gameId]!.status).toBe('completed')
      // fatigue reaches career state for whoever played, as for exact results
      const played = log.playerLines.filter((l) => l.stats.secondsPlayed > 60)
      expect(played.some((l) => (after.careerFatigueByPlayerId[l.playerId] ?? 0) > (world.careerFatigueByPlayerId[l.playerId] ?? 0))).toBe(true)
    }
    for (const seasonId of new Set(games.map((g) => g.seasonId))) expect(calculateStandings(after, seasonId).reduce((s, l) => s + l.played, 0)).toBeGreaterThan(0)
  }, 300_000)

  it('switching resolution mid-season keeps every past result and history valid (no invented detail)', () => {
    let world = withShortGameFormat(world0)
    let seed = 900
    for (let day = 0; day < 2; day += 1) world = advanceGameDayWithResult(world, () => seed++, ['userGame'], { simulationDetail: minimal }).world
    const background = Object.values(world.matchStatLogsByGameId).filter((log) => log.resolution === 'BACKGROUND')
    expect(background.length).toBeGreaterThan(0)
    for (let day = 0; day < 2; day += 1) world = advanceGameDayWithResult(world, () => seed++).world
    for (const log of background) expect(world.matchStatLogsByGameId[log.gameId]).toEqual(log)
    expect(Object.values(world.matchStatLogsByGameId).some((log) => log.resolution === 'FAST' && !background.some((b) => b.gameId === log.gameId))).toBe(true)
  }, 600_000)

  it('saves and reloads results with their provenance', () => {
    const world = withShortGameFormat(world0)
    let seed = 700
    const after = resolveDayGames(world, getScheduledGamesToday(world), () => seed++, undefined, minimal)
    const reloaded = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(after, '2026-10-05T00:00:00.000Z'))))
    expect(reloaded.matchStatLogsByGameId).toEqual(after.matchStatLogsByGameId)
    expect(Object.values(reloaded.matchStatLogsByGameId).some((log) => log.resolution === 'BACKGROUND')).toBe(true)
  }, 300_000)

  it('a mixed day is the same world inline and on a pool that answers in reverse order', async () => {
    const world = withShortGameFormat(world0)
    const reversed = (() => {
      const pending: { readonly job: MatchSimulationJob; readonly reply: (reply: MatchSimulationReply) => void }[] = []
      let scheduled = false
      const flush = (): void => { scheduled = false; for (const item of pending.splice(0).reverse()) item.reply({ jobId: item.job.jobId, result: port.simulate(item.job.setup, 'FAST') as MatchNextResult }) }
      return createWorkerPoolRunner(() => {
        let listener: (reply: MatchSimulationReply) => void = () => {}
        return { post: (job) => { pending.push({ job, reply: (reply) => listener(reply) }); if (!scheduled) { scheduled = true; setTimeout(flush, 5) } }, onReply: (next) => { listener = next }, onFailure: () => {}, terminate: () => {} }
      }, 4)
    })()
    let a = 1, b = 1
    const inline = advanceGameDayWithResult(world, () => a++, ['userGame'], { simulationDetail: minimal })
    const pooled = await advanceGameDayWithResultAsync(world, reversed, () => b++, ['userGame'], { simulationDetail: minimal })
    expect(inline.status).toBe('COMPLETED')
    expect(JSON.stringify(pooled.world)).toBe(JSON.stringify(inline.world))
    const resolutions = Object.values(inline.world.matchStatLogsByGameId).map((log) => log.resolution)
    expect(resolutions).toContain('BACKGROUND')
  }, 600_000)

  it('a BACKGROUND result applies exactly once (fails closed on a second application)', () => {
    const setup = setupFor(world0, 1)
    const result = simulateBackgroundMatch(setup)
    const after = completeBackgroundMatch(world0, result)
    expect(() => completeBackgroundMatch(after, result)).toThrow()
  })
})
