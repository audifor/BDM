import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { addDays } from '@/domain/date'
import type { Game } from '@/domain/game'
import type { PlayerId, TeamId } from '@/domain/ids'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { calculateSeasonStandings } from '@/domain/season'
import { getLineupAssignments } from '@/domain/tactics'
import { getTeamLineup, getTeamRoster, updateGameWorld, type GameWorld } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { calculateStandings } from '@/engine/competition/standings'
import { type MatchTacticalPlan } from '@/engine/match'
import { createMatchState, creatorStanding, tacticalIntent, tick, type MatchNextEvent } from '@/engine/match-next'
import { clearLineupSlot, setLineupSlot } from '@/engine/tactics/LineupEngine'
import { LineupSelectionError } from '@/engine/tactics/LineupAvailability'
import { createMatchEnginePort, type MatchNextResult } from '@/app/matchNext'
import { createInlineMatchRunner } from '@/app/matchNext/MatchSimulationRunner'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { useGameStore } from '@/stores/gameStore'
import { buildCompetitionWorkspaceModel } from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
import { teamRecordLabel } from '@/ui-ng/applications/match/engine/matchPresentation'
import { latestUserMatchLog } from '@/ui-ng/applications/match/MatchReportPanel'
import { continueGameAsync } from './ContinueFlow'
import { createConfiguredGameAsync } from './createConfiguredGame'
import { instantResult } from './matchResolution'
import { setTacticalInstruction } from './TacticalPlanning'
import { getUserMatchReadiness } from './UserMatchReadiness'

/**
 * F1 · partido jugable e integrado. One real ACB 2026/27 career (UCAM Murcia, 2026-09-26, away at Casademont Zaragoza) is taken to the
 * user's first game through the production Continue flow; every test below prepares, plays and applies that game through the same
 * authorities the Courtside app uses (game store actions, Match Next port, Save V4 service).
 */
const coach = {
  firstName: 'Elena', lastName: 'Piloto', dateOfBirth: '1990-01-01', gender: 'female',
  nationalityCountryCode: 'ESP', background: 'rookie', ambition: 'firstTitle',
  coachingStyle: 'balanced', disposition: 'balanced', biography: 'F1 synthetic test coach.',
} as const
const SEED = 20260926
const port = createMatchEnginePort('match-next')
const savedAt = '2026-09-26T09:00:00.000Z'
const NEUTRAL_PLAN: MatchTacticalPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0, pickAndRollCoverage: 'drop' } }

let base: GameWorld
let team: ReturnType<typeof getUserTeam> & object
let game: Game
let isHome: boolean
let ids: PlayerId[]
const side = () => (isHome ? 'home' : 'away') as 'home' | 'away'
const seedFactory = () => { let next = 5000; return () => next++ }

function memoryRepository(): GameSaveRepository & { file: string } {
  const repository = { file: '', save: async (json: string) => { repository.file = json }, load: async () => repository.file, getInfo: async () => ({ savedAt }) }
  return repository
}
function injure(world: GameWorld, playerId: PlayerId, days = 20): GameWorld {
  const injury = createInjury({ id: injuryIdFromString(`f1:${playerId}`), playerId, kind: 'ankleSprain', severity: 'minor', injuredOn: world.currentDate, expectedReturnDate: addDays(world.currentDate, days) })
  return updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), injury] })
}
const play = (world: GameWorld, seed = SEED, mode: 'FAST' | 'FULL' = 'FAST') => port.simulate(port.prepare(world, game, seed), mode)
const userStats = (result: MatchNextResult) => result.playerStats.filter((line) => ids.includes(line.playerId))
function withLineup(world: GameWorld, starters: readonly PlayerId[], bench: readonly PlayerId[]): GameWorld {
  const slots = ['PG', 'SG', 'SF', 'PF', 'C'] as const
  const benchSlots = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const
  let next = world
  slots.forEach((slot, index) => { next = setLineupSlot(next, team.id, slot, starters[index]!) })
  bench.forEach((playerId, index) => { next = setLineupSlot(next, team.id, benchSlots[index]!, playerId) })
  return next
}

beforeAll(async () => {
  const initial = await createConfiguredGameAsync({ universeId: ACB_TEST_UNIVERSE_ID, userTeamKey: 'ucm', userCoachCreation: coach })
  base = (await continueGameAsync(initial, createInlineMatchRunner(), 120, seedFactory())).world
  team = getUserTeam(base)!
  game = getNextUserGame(base)!
  isHome = game.homeTeamId === team.id
  ids = getTeamRoster(base, team.id).map((player) => player.id)
}, 180_000)

beforeEach(() => { useGameStore.getState().replaceWorld(base) })

describe('F1 · el primer partido del usuario está listo en el universo ACB real', () => {
  it('llega al 26 de septiembre contra Casademont Zaragoza con datos canónicos', () => {
    expect(base.currentDate).toBe('2026-09-26')
    expect(game.date).toBe('2026-09-26')
    expect(base.teams[game.homeTeamId]!.name).toBe('Casademont Zaragoza')
    expect(team.name).toBe('UCAM Murcia')
    const readiness = getUserMatchReadiness(base)!
    expect(readiness.isToday).toBe(true)
    expect(readiness.blockedReason).toBeUndefined()
    expect(readiness.competitionName).toBe(base.competitions[game.competitionId]!.name)
    expect(readiness.players).toHaveLength(16)
  })
})

describe('F1 · plantilla y quinteto', () => {
  it('1. acepta un quinteto válido y rechaza al lesionado, al no elegible y a los ajenos sin tocar el mundo', () => {
    const readiness = getUserMatchReadiness(base)!
    expect(readiness.lineupSource).toBe('CONTEXTUAL_COACH_SELECTION')
    expect(new Set(readiness.starters).size).toBe(5)
    expect(readiness.players.filter((player) => player.role === 'UNAVAILABLE')).toHaveLength(0)

    const injured = injure(base, ids[3]!)
    let refusal: unknown
    try { setLineupSlot(injured, team.id, 'PG', ids[3]!) } catch (error) { refusal = error }
    expect(refusal).toBeInstanceOf(LineupSelectionError)
    expect((refusal as LineupSelectionError).status).toMatchObject({ reason: 'INJURED', selectable: false })
    expect(getTeamLineup(injured, team.id)).toEqual(getTeamLineup(base, team.id))

    const stranger = Object.values(base.teams).find((candidate) => candidate.id !== team.id)!.rosterPlayerIds[0]!
    expect(() => setLineupSlot(base, team.id, 'PG', stranger)).toThrow(/not on team/)

    // The store (what Plantilla and Pizarra call) refuses with a visible reason and keeps the lineup.
    useGameStore.getState().replaceWorld(injured)
    useGameStore.getState().setLineupSlot('PG', ids[3]!)
    expect(useGameStore.getState().lineupNotice).toContain('Lesionado')
    expect(getTeamLineup(useGameStore.getState().world!, team.id).starters.PG).toBeUndefined()
    useGameStore.getState().setLineupSlot('PG', ids[1]!)
    expect(useGameStore.getState().lineupNotice).toBeNull()
    expect(getTeamLineup(useGameStore.getState().world!, team.id).starters.PG).toBe(ids[1])
    const refreshed = getUserMatchReadiness(useGameStore.getState().world!)!
    expect(refreshed.players.find((player) => player.playerId === ids[3])).toMatchObject({ role: 'UNAVAILABLE', blockReason: 'INJURED' })
  })

  it('1b. nunca duplica a un jugador y avisa si un titular guardado deja de estar disponible', () => {
    let world = setLineupSlot(base, team.id, 'PG', ids[1]!)
    world = setLineupSlot(world, team.id, 'SG', ids[1]!)
    const assignments = getLineupAssignments(getTeamLineup(world, team.id))
    expect(assignments.filter((assignment) => assignment.playerId === ids[1])).toHaveLength(1)
    expect(getTeamLineup(world, team.id).starters.PG).toBeUndefined()

    const starters = [ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!]
    const saved = withLineup(base, starters, [ids[0]!, ids[2]!])
    const hurt = injure(saved, ids[8]!)
    const readiness = getUserMatchReadiness(hurt)!
    expect(readiness.starters).not.toContain(ids[8])
    expect(readiness.issues.join(' ')).toContain('no puede jugar este partido')
    const setup = port.prepare(hurt, game, SEED)
    expect(setup.initialLineups[side()]).not.toContain(ids[8])
    expect(new Set(setup.initialLineups[side()]).size).toBe(5)
    expect(setup.initialLineups[side()].every((playerId) => setup.players.some((profile) => profile.playerId === playerId && profile.teamId === team.id))).toBe(true)
  })

  it('2. Plantilla, Tácticas y el motor comparten la misma selección: quinteto, suplentes, minutos y plan', () => {
    const store = useGameStore.getState()
    const starters = [ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!]
    const bench = [ids[0]!, ids[2]!, ids[3]!, ids[4]!, ids[6]!, ids[7]!, ids[9]!]
    ;(['PG', 'SG', 'SF', 'PF', 'C'] as const).forEach((slot, index) => store.setLineupSlot(slot, starters[index]!))
    ;(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const).forEach((slot, index) => store.setLineupSlot(slot, bench[index]!))
    const periodMinutes = [7, 7, 7, 7, 7, 6, 5, 4, 0, 0, 0, 0]
    const minutes = Object.fromEntries([...starters, ...bench].map((playerId, index) => [playerId, [periodMinutes[index]!, periodMinutes[index]!, periodMinutes[index]!, periodMinutes[index]!]]))
    store.updateRotationMinutes(minutes)
    const plan: MatchTacticalPlan = { pace: 1, shotProfile: { rim: 1, midRange: -1, threePoint: 2 }, defense: { interior: 2, perimeter: -1, pickAndRollCoverage: 'hedge' }, featuredPlayerId: starters[1]! }
    store.updateTeamTacticalPlan(plan)
    const world = useGameStore.getState().world!

    const readiness = getUserMatchReadiness(world)!
    expect(readiness.lineupSource).toBe('SAVED_USER_LINEUP')
    expect(readiness.starters).toEqual(starters)
    expect(readiness.rotationSource).toBe('USER_MINUTES')
    expect(readiness.tactics).toMatchObject(plan)
    expect(readiness.players.filter((player) => player.role === 'STARTER').map((player) => player.playerId)).toEqual(expect.arrayContaining(starters))

    const setup = port.prepare(world, game, SEED)
    expect(setup.initialLineups[side()]).toEqual(starters)
    expect(setup.coachingPlans![side()].minutesByPeriod).toEqual(minutes)
    expect(setup.coachingPlans![side()].startingLineup).toEqual(starters)
    expect(setup.tacticalPlans[side()]).toMatchObject(plan)

    // The five that open the game on the court are the saved five. The staff then takes the planned minutes as its target: every
    // voluntary change brings in a player the plan gives minutes to (only a foul-out may call on someone outside the plan).
    const result = port.simulate(setup, 'FAST')
    const seconds = (playerId: PlayerId) => result.playerStats.find((line) => line.playerId === playerId)?.secondsPlayed ?? 0
    expect(starters.every((playerId) => seconds(playerId) > 0)).toBe(true)
    const substitutions = result.events.filter((event) => event.type === 'substitution')
    expect(substitutions.length).toBeGreaterThan(0)
    expect(substitutions.every((event) => event.t > 0)).toBe(true)
    const planned = new Set(Object.entries(minutes).filter(([, byPeriod]) => byPeriod.some((value) => value > 0)).map(([playerId]) => playerId))
    for (const event of substitutions.filter((candidate) => candidate.teamId === team.id && candidate.substitutionReason !== 'fouled out')) {
      expect(planned.has(event.playerId!)).toBe(true)
      expect(event.expectedMinutes).toBe(minutes[event.outgoingPlayerId!]![event.period - 1])
    }
  }, 120_000)

  it('2b. el orden de suplentes elegido (B1..B7) decide quién recibe los minutos del banquillo', () => {
    const starters = [ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!]
    const world = withLineup(base, starters, [ids[4]!, ids[7]!, ids[10]!])
    const plan = port.prepare(world, game, SEED).coachingPlans![side()]
    const minutes = (playerId: PlayerId) => plan.expectedMinutesByPlayerId[playerId] ?? 0
    expect([ids[4]!, ids[7]!, ids[10]!].every((playerId) => minutes(playerId) >= 1)).toBe(true)
    expect(minutes(ids[4]!)).toBeGreaterThanOrEqual(minutes(ids[7]!))
    expect(minutes(ids[7]!)).toBeGreaterThanOrEqual(minutes(ids[10]!))
    const total = Object.values(plan.expectedMinutesByPlayerId).reduce<number>((sum, value) => sum + (value ?? 0), 0)
    const readiness = getUserMatchReadiness(world)!
    expect(total).toBe(readiness.periodCount * readiness.periodMinutes * 5)
  })

  it('2c. los minutos guardados se descartan al cambiar a los jugadores activos y se conservan al reordenar', () => {
    const starters = [ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!]
    const bench = [ids[0]!, ids[2]!, ids[3]!, ids[4]!, ids[6]!, ids[7]!, ids[9]!]
    useGameStore.getState().replaceWorld(withLineup(base, starters, bench))
    const store = useGameStore.getState()
    const periods = [7, 7, 7, 7, 7, 6, 5, 4, 0, 0, 0, 0]
    store.updateRotationMinutes(Object.fromEntries([...starters, ...bench].map((playerId, index) => [playerId, [periods[index]!, periods[index]!, periods[index]!, periods[index]!]])))
    const keyed = () => Object.keys(useGameStore.getState().world!.rotationPlansByTeamId[team.id]?.minutesByPeriod ?? {}).length
    expect(keyed()).toBe(12)
    expect(getUserMatchReadiness(useGameStore.getState().world!)).toMatchObject({ rotationSource: 'USER_MINUTES', issues: [] })
    // Reordering the same twelve (B1 <-> B2 through the board's slot moves) keeps the allocation: it still describes the team.
    store.setLineupSlot('B1', ids[2]!)
    useGameStore.getState().setLineupSlot('B2', ids[0]!)
    expect(getUserMatchReadiness(useGameStore.getState().world!)).toMatchObject({ rotationSource: 'USER_MINUTES', issues: [] })
    // A different active player: the saved allocation no longer describes this team, so the staff plans the minutes and says so.
    useGameStore.getState().setLineupSlot('B7', ids[12]!)
    const stale = useGameStore.getState().world!
    expect(getUserMatchReadiness(stale)).toMatchObject({ rotationSource: 'COACH_PLAN' })
    expect(getUserMatchReadiness(stale)!.issues.join(' ')).toContain('Los minutos guardados ya no encajan')
    const staleSetup = port.prepare(stale, game, SEED)
    expect(Object.keys(staleSetup.coachingPlans![side()].minutesByPeriod)).toContain(ids[12])
    expect(staleSetup.coachingPlans![side()].startingLineup).toEqual(starters)
    // The twelve are valid again once the user restores them or saves minutes for the new twelve.
    useGameStore.getState().setLineupSlot('B7', ids[9]!)
    expect(getUserMatchReadiness(useGameStore.getState().world!)).toMatchObject({ rotationSource: 'USER_MINUTES', issues: [] })
  })
})

describe('F1 · las tácticas llegan al motor', () => {
  it('3. cada instrucción soportada se lee del plan de GameWorld y gobierna decisiones del kernel', { timeout: 240_000 }, () => {
    const worldWith = (plan: MatchTacticalPlan) => setTacticalInstruction(base, team.id, plan)
    const intentOf = (plan: MatchTacticalPlan) => {
      const setup = port.prepare(worldWith(plan), game, SEED)
      expect(setup.tacticalPlans[side()]).toMatchObject(plan)
      return tacticalIntent(createMatchState({ ...setup, autonomousActions: true }), team.id)
    }
    // Where each instruction lands in the kernel's tactical intent (the identity every decision reads).
    expect(intentOf({ ...NEUTRAL_PLAN, pace: 2 }).offense.tempo).toBeGreaterThan(intentOf({ ...NEUTRAL_PLAN, pace: -2 }).offense.tempo)
    const threes = intentOf({ ...NEUTRAL_PLAN, shotProfile: { rim: -2, midRange: -2, threePoint: 2 } }).offense.interior
    const rim = intentOf({ ...NEUTRAL_PLAN, shotProfile: { rim: 2, midRange: 0, threePoint: -2 } }).offense.interior
    expect(rim).toBeGreaterThan(threes)
    expect(intentOf({ ...NEUTRAL_PLAN, defense: { interior: -1, perimeter: 2, pickAndRollCoverage: 'drop' } }).defense.pressure)
      .toBeGreaterThan(intentOf({ ...NEUTRAL_PLAN, defense: { interior: 2, perimeter: -1, pickAndRollCoverage: 'drop' } }).defense.pressure)
    expect(intentOf({ ...NEUTRAL_PLAN, defense: { ...NEUTRAL_PLAN.defense, pickAndRollCoverage: 'blitz' } }).defense.coverage).toBe('blitz')
    expect(intentOf({ ...NEUTRAL_PLAN, defense: { ...NEUTRAL_PLAN.defense, pickAndRollCoverage: 'switch' } }).defense.coverage).toBe('switch')

    // Played evidence, deterministic seeds: ball-screen coverage and shot profile change what happens on the floor.
    const seeds = [11, 12, 13]
    const blitzShare = (coverage: 'blitz' | 'drop') => {
      const shares = seeds.map((seed) => {
        const result = play(worldWith({ ...NEUTRAL_PLAN, defense: { ...NEUTRAL_PLAN.defense, pickAndRollCoverage: coverage } }), seed)
        const screensAgainstUs = result.events.filter((event: MatchNextEvent) => event.type === 'screenSet' && event.teamId !== team.id)
        return screensAgainstUs.length === 0 ? 0 : screensAgainstUs.filter((event) => event.screenCoverage === 'blitz').length / screensAgainstUs.length
      })
      return shares.reduce((a, b) => a + b, 0) / shares.length
    }
    expect(blitzShare('blitz')).toBeGreaterThan(0.9)
    expect(blitzShare('drop')).toBeLessThan(0.1)
    const threePointAttempts = (plan: MatchTacticalPlan) => seeds.map((seed) => userStats(play(worldWith(plan), seed)).reduce((sum, line) => sum + line.threePointAttempted, 0)).reduce((a, b) => a + b, 0)
    expect(threePointAttempts({ ...NEUTRAL_PLAN, shotProfile: { rim: -2, midRange: -2, threePoint: 2 } }))
      .toBeGreaterThan(threePointAttempts({ ...NEUTRAL_PLAN, shotProfile: { rim: 2, midRange: 0, threePoint: -2 } }))
    // The featured player: the kernel ranks him higher as a creator (+4) and as a pass target, so he touches the ball more.
    const featured = getUserMatchReadiness(base)!.starters[4]!
    const standing = (plan: MatchTacticalPlan) => {
      const state = createMatchState({ ...port.prepare(worldWith(plan), game, SEED), autonomousActions: true })
      return creatorStanding(state, state.players.find((player) => player.playerId === featured)!)
    }
    expect(standing({ ...NEUTRAL_PLAN, featuredPlayerId: featured }) - standing(NEUTRAL_PLAN)).toBe(4)
    const receptions = (plan: MatchTacticalPlan) => seeds.map((seed) => play(worldWith(plan), seed).events.filter((event) => event.type === 'passReceived' && event.receiverPlayerId === featured).length).reduce((a, b) => a + b, 0)
    expect(receptions({ ...NEUTRAL_PLAN, featuredPlayerId: featured })).toBeGreaterThan(receptions(NEUTRAL_PLAN))
  })

  it('3b. el ajuste de un partido (TeamGamePlan) manda sobre el plan del equipo y desaparece al quitarlo', () => {
    const store = useGameStore.getState()
    store.updateTeamTacticalPlan({ ...NEUTRAL_PLAN, pace: -1 })
    store.updateGamePlanTacticalOverride({ ...NEUTRAL_PLAN, pace: 2, defense: { interior: 2, perimeter: -1, pickAndRollCoverage: 'blitz' } })
    let world = useGameStore.getState().world!
    expect(getUserMatchReadiness(world)).toMatchObject({ hasGameTacticalOverride: true, tactics: { pace: 2 } })
    expect(port.prepare(world, game, SEED).tacticalPlans[side()]).toMatchObject({ pace: 2, defense: { pickAndRollCoverage: 'blitz' } })
    store.clearGamePlanTacticalOverride()
    world = useGameStore.getState().world!
    expect(getUserMatchReadiness(world)).toMatchObject({ hasGameTacticalOverride: false, tactics: { pace: -1 } })
    expect(() => store.updateTeamTacticalPlan({ ...NEUTRAL_PLAN, defense: { interior: 1, perimeter: 1 } })).toThrow()
  })
})

describe('F1 · partido completo, estadísticas y resultado', () => {
  let fast: MatchNextResult
  let applied: GameWorld
  beforeAll(() => {
    const starters = [ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!]
    const world = withLineup(base, starters, [ids[0]!, ids[2]!, ids[3]!, ids[4]!])
    fast = play(world, SEED)
    applied = port.complete(world, fast)
  }, 120_000)

  it('4. se disputa hasta el final reglamentario, con periodos consecutivos y un ganador', () => {
    const periodStarts = fast.events.filter((event) => event.type === 'periodStart').map((event) => event.period)
    expect(periodStarts.slice(0, 4)).toEqual([1, 2, 3, 4])
    expect(periodStarts.every((period, index) => index === 0 || period === periodStarts[index - 1]! + 1)).toBe(true)
    expect(fast.events.filter((event) => event.type === 'gameEnd')).toHaveLength(1)
    expect(fast.events.at(-1)!.type).toBe('gameEnd')
    expect(fast.score.home).not.toBe(fast.score.away)
    expect(fast.finalState.isComplete).toBe(true)
    if (periodStarts.length > 4) expect(fast.score.home + fast.score.away).toBeGreaterThan(0)
  })

  it('4b. un empate al final del tiempo reglamentario continúa en la prórroga del reglamento ACB y termina al desempatar', () => {
    const setup = port.prepare(base, game, SEED)
    expect(setup.clockRules).toMatchObject({ periodCount: 4, periodSeconds: 600, overtimeSeconds: 300 })
    const tiedEnd = tick({ ...createMatchState(setup), period: 4, gameClockTenths: 1, clock: { gameRunning: true, shotRunning: false }, score: { home: 80, away: 80 } })
    expect(tiedEnd).toMatchObject({ period: 5, gameClockTenths: 3000, isComplete: false })
    expect(tiedEnd.events.at(-1)?.type).toBe('periodStart')
    const separated = tick({ ...tiedEnd, gameClockTenths: 1, clock: { gameRunning: true, shotRunning: false }, score: { home: 82, away: 80 } })
    expect(separated.isComplete).toBe(true)
    expect(separated.events.at(-1)?.type).toBe('gameEnd')
  })

  it('5. sustituciones y rotaciones: siempre cinco distintos en pista, del equipo y solo desde el banquillo', () => {
    const setup = port.prepare(withLineup(base, [ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!], [ids[0]!, ids[2]!, ids[3]!, ids[4]!]), game, SEED)
    const court = { home: new Set(setup.initialLineups.home), away: new Set(setup.initialLineups.away) }
    const teamOf = new Map(setup.players.map((profile) => [profile.playerId, profile.teamId]))
    let substitutions = 0
    const deadBallTimes = new Set(fast.events.filter((event) => event.type === 'ballDead' || event.type === 'periodStart' || event.type === 'periodEnd' || event.type === 'foul' || event.type === 'freeThrowSequenceStarted').map((event) => event.t))
    for (const event of fast.events) {
      if (event.type !== 'substitution') continue
      substitutions += 1
      const incoming = event.playerId!
      const outgoing = event.outgoingPlayerId!
      const sideOfTeam = teamOf.get(incoming) === setup.homeTeamId ? 'home' : 'away'
      expect(teamOf.get(outgoing)).toBe(teamOf.get(incoming))
      expect(court[sideOfTeam].has(outgoing)).toBe(true)
      expect(court[sideOfTeam].has(incoming)).toBe(false)
      expect(deadBallTimes.has(event.t)).toBe(true)
      court[sideOfTeam].delete(outgoing)
      court[sideOfTeam].add(incoming)
      expect(court[sideOfTeam].size).toBe(5)
    }
    expect(substitutions).toBeGreaterThan(0)
    // Nobody who fouled out played afterwards.
    const fouledOut = new Set(fast.events.filter((event) => event.type === 'foulOut').map((event) => event.playerId))
    for (const playerId of fouledOut) expect(court.home.has(playerId!) || court.away.has(playerId!)).toBe(false)
  })

  it('6. las estadísticas coinciden con el acta, con los eventos ejecutados y con el marcador', () => {
    const log = applied.matchStatLogsByGameId[game.id]!
    expect(log.finalScore).toEqual(fast.score)
    expect(applied.games[game.id]).toMatchObject({ status: 'completed', result: { homeScore: fast.score.home, awayScore: fast.score.away } })
    for (const teamId of [game.homeTeamId, game.awayTeamId] as const) {
      const lines = log.playerLines.filter((line) => line.teamId === teamId)
      const points = lines.reduce((sum, line) => sum + line.stats.points, 0)
      expect(points).toBe(teamId === game.homeTeamId ? fast.score.home : fast.score.away)
      for (const { stats } of lines) {
        expect(stats.fieldGoalsMade).toBe(stats.twoPointMade + stats.threePointMade)
        expect(stats.points).toBe(2 * stats.twoPointMade + 3 * stats.threePointMade + stats.freeThrowsMade)
        expect(stats.rebounds).toBe(stats.offensiveRebounds + stats.defensiveRebounds)
      }
      // Event-derived points: baskets and free throws of that team.
      const fromEvents = fast.events.filter((event) => event.type === 'shotMade' && event.teamId === teamId).reduce((sum, event) => sum + (event.points ?? 0), 0)
        + fast.events.filter((event) => event.type === 'freeThrowMade' && event.teamId === teamId).length
      expect(fromEvents).toBe(points)
      // Five players on the court for the whole game (regulation + any overtime).
      const seconds = lines.reduce((sum, line) => sum + line.stats.secondsPlayed, 0)
      const periods = fast.events.filter((event) => event.type === 'periodStart').length
      const gameSeconds = Math.min(periods, 4) * 600 + Math.max(0, periods - 4) * 300
      expect(seconds).toBe(5 * gameSeconds)
    }
    expect(Object.keys(applied.matchStatLogsByGameId).filter((id) => id === game.id)).toHaveLength(1)
    expect(log.playerLines.filter((line) => line.started && line.teamId === team.id).map((line) => line.playerId).sort()).toEqual([ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!].sort())
  })

  it('7. el resultado se aplica exactamente una vez: repetirlo falla sin tocar victorias, derrotas ni estadísticas', () => {
    const before = projectPersistentWorldTruth(applied)
    expect(() => port.complete(applied, fast)).toThrow(/already exists/)
    expect(projectPersistentWorldTruth(applied)).toEqual(before)
    const standings = calculateStandings(applied, game.seasonId)
    const played = standings.reduce((sum, row) => sum + row.played, 0)
    expect(played).toBe(2)
    const winner = fast.score.home > fast.score.away ? game.homeTeamId : game.awayTeamId
    const loser = winner === game.homeTeamId ? game.awayTeamId : game.homeTeamId
    expect(standings.find((row) => row.teamId === winner)).toMatchObject({ played: 1, wins: 1, losses: 0 })
    expect(standings.find((row) => row.teamId === loser)).toMatchObject({ played: 1, wins: 0, losses: 1 })
    expect(standings.find((row) => row.teamId === winner)!.pointsFor).toBe(Math.max(fast.score.home, fast.score.away))
    expect(standings.find((row) => row.teamId === loser)!.pointsAgainst).toBe(Math.max(fast.score.home, fast.score.away))
  })

  it('8. Home, Calendario y Competition leen el mismo resultado del GameWorld (issue #22 sigue resuelta)', () => {
    const model = buildCompetitionWorkspaceModel(applied, undefined, team.id)!
    const season = applied.seasons[game.seasonId]!
    // Competition: every team, result and standing comes from GameWorld, never from fixtures.
    expect(model.standings.map((row) => row.teamId).sort()).toEqual(Object.keys(applied.teams).sort())
    const row = model.dateGroups.flatMap((group) => group.games).find((candidate) => candidate.id === game.id)!
    expect(row).toMatchObject({ status: 'completed', homeName: applied.teams[game.homeTeamId]!.name, awayName: applied.teams[game.awayTeamId]!.name })
    expect(row.scoreLabel).toContain(String(fast.score.home))
    expect(row.scoreLabel).toContain(String(fast.score.away))
    expect(model.upcoming.some((candidate) => candidate.id === game.id)).toBe(false)
    // Three independent projections agree team by team: engine standings, season standings and the record shown in the match header.
    const engine = calculateStandings(applied, season.id)
    const domain = calculateSeasonStandings(applied, season.id)
    for (const line of engine) {
      expect(domain.find((entry) => entry.teamId === line.teamId)).toMatchObject({ wins: line.wins, losses: line.losses })
      expect(model.standings.find((entry) => entry.teamId === line.teamId)).toMatchObject({ wins: line.wins, losses: line.losses, played: line.played })
      expect(teamRecordLabel(applied, line.teamId)).toBe(`${line.wins}-${line.losses}`)
    }
    // Acta of the user's game and the next fixture.
    const last = latestUserMatchLog(applied)!
    expect(last.game.id).toBe(game.id)
    expect(last.log.finalScore).toEqual(fast.score)
    expect(getNextUserGame(applied)!.id).not.toBe(game.id)
    expect(getNextUserGame(applied)!.date > game.date).toBe(true)
  })
})

describe('F1 · determinismo y equivalencia de modalidades', () => {
  it('11. misma semilla y mismas condiciones dan el mismo partido; otra semilla da otro', { timeout: 120_000 }, () => {
    const starters = [ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!]
    const world = withLineup(base, starters, [ids[0]!, ids[2]!])
    const a = play(world, SEED)
    const b = play(world, SEED)
    expect(a.score).toEqual(b.score)
    expect(a.playerStats).toEqual(b.playerStats)
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events))
    const other = play(world, SEED + 1)
    expect(JSON.stringify(other.events)).not.toBe(JSON.stringify(a.events))
  })

  it('12. simulación rápida, visualización por fotogramas y resultado instantáneo producen el mismo resultado canónico', { timeout: 240_000 }, () => {
    const world = withLineup(base, [ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!], [ids[0]!, ids[2]!])
    const fastResult = play(world, SEED, 'FAST')
    const fullResult = play(world, SEED, 'FULL')
    // The viewer advances in chunks exactly as the Courtside screen does.
    const setup = port.prepare(world, game, SEED)
    const controller = port.createLiveSession(setup)
    while (!controller.advanceTicks(200).isComplete) { /* chunked playback */ }
    const watched = controller.result()
    for (const other of [fullResult, watched]) {
      expect(other.score).toEqual(fastResult.score)
      expect(other.playerStats).toEqual(fastResult.playerStats)
      expect(other.events.length).toBe(fastResult.events.length)
    }
    const viaFast = port.complete(world, fastResult, 'FAST')
    const viaFull = port.complete(world, watched, 'FULL')
    const instant = instantResult(world, undefined, SEED)
    for (const completed of [viaFull, instant]) {
      expect(completed.games[game.id]).toMatchObject({ status: 'completed', result: { homeScore: fastResult.score.home, awayScore: fastResult.score.away } })
      expect(completed.matchStatLogsByGameId[game.id]!.playerLines).toEqual(viaFast.matchStatLogsByGameId[game.id]!.playerLines)
      expect(calculateStandings(completed, game.seasonId)).toEqual(calculateStandings(viaFast, game.seasonId))
    }
    expect(viaFull.matchStatLogsByGameId[game.id]!.resolution).toBe('FULL')
    expect(viaFast.matchStatLogsByGameId[game.id]!.resolution).toBe('FAST')
  })
})

describe('F1 · Save V4 conserva decisiones y consecuencias', () => {
  it('10A. antes del encuentro: plantilla, rotación y tácticas vuelven exactamente y producen el mismo partido', { timeout: 240_000 }, async () => {
    const store = useGameStore.getState()
    const starters = [ids[1]!, ids[5]!, ids[8]!, ids[11]!, ids[14]!]
    const bench = [ids[0]!, ids[2]!, ids[3]!, ids[4]!, ids[6]!, ids[7]!, ids[9]!]
    ;(['PG', 'SG', 'SF', 'PF', 'C'] as const).forEach((slot, index) => store.setLineupSlot(slot, starters[index]!))
    ;(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const).forEach((slot, index) => store.setLineupSlot(slot, bench[index]!))
    const periods = [7, 7, 7, 7, 7, 6, 5, 4, 0, 0, 0, 0]
    store.updateRotationMinutes(Object.fromEntries([...starters, ...bench].map((playerId, index) => [playerId, [periods[index]!, periods[index]!, periods[index]!, periods[index]!]])))
    store.updateTeamTacticalPlan({ ...NEUTRAL_PLAN, pace: 1, shotProfile: { rim: 0, midRange: 0, threePoint: 1 } })
    store.updateGamePlanTacticalOverride({ ...NEUTRAL_PLAN, pace: -1, defense: { interior: -1, perimeter: 2, pickAndRollCoverage: 'blitz' } })
    store.updateGamePlanMatchups([{ ourPlayerId: ids[1]!, opponentPlayerId: Object.values(base.teams[isHome ? game.awayTeamId : game.homeTeamId]!.rosterPlayerIds)[0]! }])
    const prepared = useGameStore.getState().world!

    const repository = memoryRepository()
    await saveCurrentGame(prepared, repository, savedAt)
    const loaded = await loadSavedGame(repository)
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(prepared))
    expect(getTeamLineup(loaded, team.id)).toEqual(getTeamLineup(prepared, team.id))
    expect(loaded.rotationPlansByTeamId[team.id]).toEqual(prepared.rotationPlansByTeamId[team.id])
    expect(loaded.tacticalPlansByTeamId[team.id]).toEqual(prepared.tacticalPlansByTeamId[team.id])
    expect(loaded.gamePlansByKey).toEqual(prepared.gamePlansByKey)
    expect(getUserMatchReadiness(loaded)).toEqual(getUserMatchReadiness(prepared))
    // The restored career plays the very same game from the same seed.
    const a = play(prepared, SEED)
    const b = play(loaded, SEED)
    expect(b.score).toEqual(a.score)
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events))
  })

  it('10B/C. después del encuentro: resultado, acta y clasificación vuelven y la carrera continúa sin repetirlo', { timeout: 240_000 }, async () => {
    const played = instantResult(base, undefined, SEED)
    const repository = memoryRepository()
    await saveCurrentGame(played, repository, savedAt)
    const loaded = await loadSavedGame(repository)
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(played))
    expect(loaded.games[game.id]).toEqual(played.games[game.id])
    expect(loaded.matchStatLogsByGameId[game.id]).toEqual(played.matchStatLogsByGameId[game.id])
    expect(calculateStandings(loaded, game.seasonId)).toEqual(calculateStandings(played, game.seasonId))
    expect(latestUserMatchLog(loaded)!.log.finalScore).toEqual(played.matchStatLogsByGameId[game.id]!.finalScore)
    expect(getNextUserGame(loaded)!.id).not.toBe(game.id)

    // 9. Continuing plays the calendar on: the next user game is a different one, the first is untouched, nothing is applied twice.
    const continued = await continueGameAsync(loaded, createInlineMatchRunner(), 60, seedFactory())
    expect(continued.stopReason.type).toBe('userGame')
    const next = getNextUserGame(continued.world)!
    expect(next.id).not.toBe(game.id)
    expect(next.status).toBe('scheduled')
    expect(continued.world.games[game.id]).toEqual(loaded.games[game.id])
    expect(continued.world.matchStatLogsByGameId[game.id]).toEqual(loaded.matchStatLogsByGameId[game.id])
    const second = instantResult(continued.world, undefined, SEED + 1)
    const table = calculateStandings(second, game.seasonId)
    const userRow = table.find((row) => row.teamId === team.id)!
    expect(userRow.played).toBe(2)
    expect(userRow.wins + userRow.losses).toBe(2)
    const completedGames = Object.values(second.games).filter((candidate) => candidate.status === 'completed')
    expect(Object.keys(second.matchStatLogsByGameId).sort()).toEqual(completedGames.map((candidate) => candidate.id).sort())
    expect(table.reduce((sum, row) => sum + row.wins, 0)).toBe(completedGames.length)
    expect(table.reduce((sum, row) => sum + row.losses, 0)).toBe(completedGames.length)
    expect(table.reduce((sum, row) => sum + row.pointsFor, 0)).toBe(table.reduce((sum, row) => sum + row.pointsAgainst, 0))
  })
})
