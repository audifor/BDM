import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import type { GameId, TeamId } from '@/domain/ids'
import { CANONICAL_RATING_KEYS } from '@/domain/player'
import { dailyWorkloadScore, trainingDefinitionById } from '@/domain/training'
import { getTeamLineup, getTeamRoster, type GameWorld } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { calculateStandings } from '@/engine/competition/standings'
import { createMatchState, tacticalIntent } from '@/engine/match-next'
import { createMatchEnginePort } from '@/app/matchNext'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { buildCompetitionWorkspaceModel } from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
import { automaticPolicy, managedPolicy } from './testSupport/PlayableF2Policies'
import { createF2Day0, F2_WINDOW_DAYS, matchSeedFor, runF2Window, stimulusTotals, type F2RunResult } from './testSupport/PlayableF2Support'

/**
 * F2 · gestión de 30 días y comparación contrafactual. Un mismo estado inicial (ACB 2026/27, UCAM Murcia, tras el primer partido) se
 * avanza 30 días dos veces, con las mismas semillas: A deja la gestión automática; B toma decisiones de entrenamiento, carga, descanso,
 * rotación y staff con los mismos comandos del store que usan las pantallas de Courtside. Esta batería comprueba la continuidad diaria,
 * la cadena decisión → ejecución → cambio persistente → consecuencia, Save V4 a mitad del recorrido y la comparación A/B.
 */
const SALT = 7
const savedAt = '2026-10-27T09:00:00.000Z'
const port = createMatchEnginePort('match-next')
const memoryRepository = (): GameSaveRepository & { file: string } => {
  const repository = { file: '', save: async (json: string) => { repository.file = json }, load: async () => repository.file, getInfo: async () => ({ savedAt }) }
  return repository
}
const roundTrip = async (world: GameWorld): Promise<GameWorld> => { const repository = memoryRepository(); await saveCurrentGame(world, repository, savedAt); return loadSavedGame(repository) }

let day0: GameWorld
let copyA: GameWorld
let copyB: GameWorld
let A: F2RunResult
let B: F2RunResult
let teamId: TeamId

const userSessions = (world: GameWorld, status: 'completed' | 'scheduled') => Object.values(world.scheduledTrainingSessionsById).filter((session) => session.teamId === teamId && session.status === status)
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

beforeAll(async () => {
  day0 = await createF2Day0()
  teamId = getUserTeam(day0)!.id
  copyA = await roundTrip(day0)
  copyB = await roundTrip(day0)
  A = runF2Window(copyA, automaticPolicy, SALT, F2_WINDOW_DAYS, 1, [15])
  B = runF2Window(copyB, managedPolicy(), SALT, F2_WINDOW_DAYS, 1, [15])
}, 900_000)

describe('F2 · el tramo real de 30 días y los dos mundos idénticos', () => {
  it('0. parten del mismo estado Save V4, abarcan 30 días de calendario ACB con cuatro partidos del usuario y registran sus semillas', async () => {
    expect(day0.currentDate).toBe('2026-09-27')
    const copy = await roundTrip(day0)
    expect(projectPersistentWorldTruth(copy)).toEqual(projectPersistentWorldTruth(day0))
    for (const run of [A, B]) {
      expect(run.snapshots).toHaveLength(F2_WINDOW_DAYS + 1)
      expect(run.snapshots[0]!.date).toBe('2026-09-27')
      expect(run.snapshots.at(-1)!.date).toBe(addDays(day0.currentDate, F2_WINDOW_DAYS))
      expect(run.games.map((game) => game.date)).toEqual(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24'])
    }
    // Same fixtures, same seeds in both arms (a pure function of salt and game id); the first game of the window was already played identically by both.
    expect(A.games.map((game) => game.gameId)).toEqual(B.games.map((game) => game.gameId))
    expect(A.games.map((game) => matchSeedFor(SALT, game.gameId))).toEqual(B.games.map((game) => matchSeedFor(SALT, game.gameId)))
    // A issues nothing; B's decisions are logged with date and command.
    expect(A.decisions).toHaveLength(0)
    expect(new Set(B.decisions.map((decision) => decision.action))).toEqual(new Set(['scheduleTeamModuleSession', 'assignTrainingModuleToPlayer', 'setStaffResponsibility', 'setLineupSlot']))
    // Equal starting conditions: both arms ran on their own Save V4 copy of day 0 and nothing was edited to provoke a difference.
    expect(projectPersistentWorldTruth(copyA)).toEqual(projectPersistentWorldTruth(copyB))
    expect(copyA.userCoachId).toBe(copyB.userCoachId)
  })
})

describe('F2 · avance diario: cada día se ejecuta una sola vez', () => {
  it('1. 30 días consecutivos, un partido por fecha del calendario y ninguna sesión, acta o resultado duplicados', () => {
    for (const run of [A, B]) {
      const dates = run.snapshots.map((snapshot) => snapshot.date)
      expect(dates.every((date, index) => index === 0 || date === addDays(dates[index - 1]!, 1))).toBe(true)
      const completed = Object.values(run.world.games).filter((game) => game.status === 'completed')
      expect(Object.keys(run.world.matchStatLogsByGameId).sort()).toEqual(completed.map((game) => game.id).sort())
      expect(completed.every((game) => game.date <= run.world.currentDate)).toBe(true)
      expect(Object.values(run.world.games).filter((game) => game.status === 'scheduled').every((game) => game.date >= run.world.currentDate)).toBe(true)
      const userCompleted = completed.filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
      expect(userCompleted).toHaveLength(5) // the first game (26 Sep) plus the four of the window
      expect(new Set(run.games.map((game) => game.gameId)).size).toBe(run.games.length)
      // Standings are conserved: one win and one loss per resolved game, points for = points against.
      const table = calculateStandings(run.world, completed[0]!.seasonId)
      expect(table.reduce((sum, row) => sum + row.wins, 0)).toBe(completed.length)
      expect(table.reduce((sum, row) => sum + row.losses, 0)).toBe(completed.length)
      expect(table.reduce((sum, row) => sum + row.pointsFor, 0)).toBe(table.reduce((sum, row) => sum + row.pointsAgainst, 0))
      // Training sessions: executed exactly once, on their own date, never on a fixture date.
      const done = Object.values(run.world.scheduledTrainingSessionsById).filter((session) => session.status === 'completed')
      expect(new Set(done.map((session) => session.id)).size).toBe(done.length)
      expect(done.every((session) => session.execution?.completedOn === session.date)).toBe(true)
      expect(done.every((session) => !Object.values(run.world.games).some((game) => game.date === session.date && (game.homeTeamId === session.teamId || game.awayTeamId === session.teamId)))).toBe(true)
      // A pending session in the past exists only as a blocked one (its facility could not host the work), never for the user's club here.
      const stale = Object.values(run.world.scheduledTrainingSessionsById).filter((session) => session.status === 'scheduled' && session.date < run.world.currentDate)
      expect(stale.every((session) => session.teamId !== teamId && session.physicalAttempt?.status === 'VERIFIED_UNAVAILABLE')).toBe(true)
    }
    // The rest of the league keeps training through the same daily boundary in both arms (the engine's own automatism).
    const others = (run: F2RunResult) => Object.values(run.world.scheduledTrainingSessionsById).filter((session) => session.status === 'completed' && session.teamId !== teamId).length
    expect(others(A)).toBeGreaterThan(0)
    expect(others(A)).toBe(others(B))
  })
})

describe('F2 · entrenamiento: planificación → sesión → avance → ejecución → consecuencia', () => {
  it('2. B ejecuta cada sesión programada en su fecha y cada una deja evidencia canónica de participación, carga y estímulo', () => {
    const planned = B.decisions.filter((decision) => decision.action === 'scheduleTeamModuleSession' || decision.action === 'assignTrainingModuleToPlayer')
    const executed = userSessions(B.world, 'completed')
    const dueInWindow = planned.filter((decision) => decision.detail.split(' ')[0]! <= B.world.currentDate)
    expect(executed.length).toBe(dueInWindow.length)
    expect(userSessions(A.world, 'completed')).toHaveLength(0)
    for (const session of executed) {
      const execution = session.execution!
      expect(execution.completedOn).toBe(session.date)
      expect(execution.participants.length).toBeGreaterThan(0)
      for (const participant of execution.participants) {
        if (participant.participation === 'REST') { expect(participant.careerFatigueDelta).toBe(0); expect(participant.developmentStimulusEventId).toBeUndefined() }
        if (participant.developmentStimulusEventId !== undefined) expect(B.world.developmentStimulusEventsById[participant.developmentStimulusEventId]).toMatchObject({ sourceType: 'training', sourceId: session.id, playerId: participant.playerId })
      }
    }
    // The aggregate stimulus of every player is exactly the sum of canonical events: no counter without evidence, in either world.
    for (const run of [A, B]) {
      for (const player of getTeamRoster(run.world, teamId)) {
        const events = Object.values(run.world.developmentStimulusEventsById).filter((event) => event.playerId === player.id)
        const before = day0.developmentStimulusByPlayerId[player.id]!.byRating
        const after = run.world.developmentStimulusByPlayerId[player.id]!.byRating
        const windowEvents = events.filter((event) => !(event.id in day0.developmentStimulusEventsById))
        for (const key of CANONICAL_RATING_KEYS) {
          const added = windowEvents.reduce((sum, event) => sum + (event.byRating[key] ?? 0), 0)
          expect(after[key]! - before[key]!).toBeCloseTo(added, 6)
        }
      }
    }
    const newTrainingEvents = (world: GameWorld) => Object.values(world.developmentStimulusEventsById).filter((event) => event.sourceType === 'training' && getTeamRoster(world, teamId).some((player) => player.id === event.playerId) && !(event.id in day0.developmentStimulusEventsById))
    expect(newTrainingEvents(A.world)).toHaveLength(0)
    expect(newTrainingEvents(B.world).length).toBeGreaterThan(0)
  })

  it('3. el estímulo, la fatiga y la cohesión de B proceden de las sesiones y quedan en el mundo (A permanece en su estado inicial)', () => {
    const executed = userSessions(B.world, 'completed')
    const trainingEvents = Object.values(B.world.developmentStimulusEventsById).filter((event) => event.sourceType === 'training' && executed.some((session) => session.id === event.sourceId))
    expect(trainingEvents.length).toBeGreaterThan(20)
    expect(Object.values(A.world.developmentStimulusEventsById).filter((event) => event.sourceType === 'training' && executed.some((session) => session.id === event.sourceId))).toHaveLength(0)
    // Cohesion: A is untouched; B's change is exactly the sum of the cohesion deltas recorded by its tactical sessions.
    const cohesionAdded = executed.reduce((sum, session) => sum + session.execution!.cohesionDelta, 0)
    expect(A.world.teamCohesionByTeamId[teamId] ?? 50).toBe(day0.teamCohesionByTeamId[teamId] ?? 50)
    expect((B.world.teamCohesionByTeamId[teamId] ?? 50) - (day0.teamCohesionByTeamId[teamId] ?? 50)).toBeCloseTo(cohesionAdded, 6)
    expect(cohesionAdded).toBeGreaterThan(10)
    // Load: B's sessions carry a measurable workload and positive/negative fatigue contributions.
    const load = executed.reduce((sum, session) => sum + dailyWorkloadScore(session.execution!.effectiveIntensity, session.durationMinutes, trainingDefinitionById(session.definitionId).effects.fatigueMultiplier), 0)
    expect(load).toBeGreaterThan(0)
    const deltas = executed.flatMap((session) => session.execution!.participants.map((participant) => participant.careerFatigueDelta))
    expect(deltas.some((delta) => delta > 0)).toBe(true)
    expect(deltas.some((delta) => delta < 0)).toBe(true) // recovery sessions lower fatigue
    expect(mean(B.snapshots.map((snapshot) => snapshot.avgFatigue))).toBeGreaterThan(mean(A.snapshots.map((snapshot) => snapshot.avgFatigue)))
  })

  it('4. la cohesión que produce el entrenamiento llega al motor como familiaridad táctica del siguiente partido', () => {
    const last = (run: F2RunResult) => run.games.at(-1)!
    for (const run of [A, B]) {
      const { preMatchWorld, gameId } = last(run)
      const game = preMatchWorld.games[gameId]!
      const setup = port.prepare(preMatchWorld, game, 1)
      const side = game.homeTeamId === teamId ? 'home' : 'away'
      const cohesion = preMatchWorld.teamCohesionByTeamId[teamId] ?? 50
      expect(setup.tacticalPlans[side].familiarity).toBe(cohesion)
      expect(tacticalIntent(createMatchState(setup), teamId).familiarity).toBeCloseTo(cohesion / 100, 6)
    }
    expect(tacticalIntent(createMatchState(port.prepare(last(B).preMatchWorld, last(B).preMatchWorld.games[last(B).gameId]!, 1)), teamId).familiarity)
      .toBeGreaterThan(tacticalIntent(createMatchState(port.prepare(last(A).preMatchWorld, last(A).preMatchWorld.games[last(A).gameId]!, 1)), teamId).familiarity)
  })

  it('5. la fatiga acumulada por actividad entra en el partido como estado inicial de cada jugador', () => {
    for (const run of [A, B]) {
      for (const line of run.games) {
        const game = line.preMatchWorld.games[line.gameId]!
        const setup = port.prepare(line.preMatchWorld, game, 3)
        const state = createMatchState(setup)
        for (const player of setup.players.filter((candidate) => candidate.teamId === teamId)) {
          expect(player.dynamicState?.careerFatigue).toBe(line.preMatchFatigue[player.playerId])
          expect(state.players.find((candidate) => candidate.playerId === player.playerId)!.fatigue).toBeCloseTo(line.preMatchFatigue[player.playerId]! * 0.5, 6)
        }
      }
    }
    // B arrived at its games with a different fatigue profile than A (training load and recovery sessions are the only difference in activity).
    const profile = (run: F2RunResult) => run.games.map((line) => round(mean(Object.values(line.preMatchFatigue)), 2))
    expect(profile(B)).not.toEqual(profile(A))
  })
})

describe('F2 · rotaciones: el quinteto persistido se usa en el encuentro siguiente', () => {
  it('6. los titulares del acta de B son los del quinteto guardado el día anterior y cada partido se resuelve una sola vez', () => {
    const lineups = B.decisions.filter((decision) => decision.action === 'setLineupSlot')
    expect(lineups).toHaveLength(B.games.length)
    for (const line of B.games) {
      const saved = getTeamLineup(line.preMatchWorld, teamId)
      const savedStarters = Object.values(saved.starters).sort()
      const log = B.world.matchStatLogsByGameId[line.gameId]!
      const started = log.playerLines.filter((entry) => entry.teamId === teamId && entry.started).map((entry) => entry.playerId).sort()
      expect(savedStarters).toHaveLength(5)
      expect(started).toEqual(savedStarters)
      expect(log.finalScore.home + log.finalScore.away).toBe(line.pointsFor + line.pointsAgainst)
      expect(B.world.games[line.gameId]!.status).toBe('completed')
    }
    // The tired starter the coach rested did not start that game.
    for (const decision of lineups.filter((item) => item.detail.includes('rested'))) {
      const line = B.games.find((game) => game.date === addDays(decision.date, 1))!
      const rested = decision.detail.match(/rested (\S+)/)![1]!
      const log = B.world.matchStatLogsByGameId[line.gameId]!
      expect(log.playerLines.find((entry) => entry.playerId.endsWith(rested) && entry.teamId === teamId)?.started ?? false).toBe(false)
    }
  })

  it('7. Home, Competition y calendario leen el mismo estado: cinco partidos del usuario y el siguiente encuentro del calendario', () => {
    for (const run of [A, B]) {
      const model = buildCompetitionWorkspaceModel(run.world, undefined, teamId)!
      const row = model.standings.find((entry) => entry.teamId === teamId)!
      expect(row.played).toBe(5)
      expect(row.wins + row.losses).toBe(5)
      const next = getNextUserGame(run.world)!
      expect(next.date).toBe('2026-10-31')
      expect(model.upcoming.some((candidate) => candidate.id === next.id)).toBe(true)
    }
  })
})

describe('F2 · Save V4 a mitad del recorrido', () => {
  it('8. guardar y cargar el día 15 y continuar produce exactamente el mismo mundo que el recorrido ininterrumpido (B)', { timeout: 600_000 }, async () => {
    const loaded = await roundTrip(B.checkpoints[15]!)
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(B.checkpoints[15]!))
    const resumed = runF2Window(loaded, managedPolicy(), SALT, F2_WINDOW_DAYS, 16)
    expect(resumed.world.currentDate).toBe(B.world.currentDate)
    expect(projectPersistentWorldTruth(resumed.world)).toEqual(projectPersistentWorldTruth(B.world))
    // Nothing is duplicated by the interruption: sessions, events, stat logs and games are the same set.
    expect(Object.keys(resumed.world.scheduledTrainingSessionsById).sort()).toEqual(Object.keys(B.world.scheduledTrainingSessionsById).sort())
    expect(Object.keys(resumed.world.developmentStimulusEventsById).sort()).toEqual(Object.keys(B.world.developmentStimulusEventsById).sort())
    expect(Object.keys(resumed.world.matchStatLogsByGameId).sort()).toEqual(Object.keys(B.world.matchStatLogsByGameId).sort())
    expect(Object.values(resumed.world.delegationOutcomesById).length).toBe(Object.values(B.world.delegationOutcomesById).length)
    expect(resumed.games.map((game) => `${game.gameId}:${game.pointsFor}-${game.pointsAgainst}`)).toEqual(B.games.filter((game) => game.date > '2026-10-12').map((game) => `${game.gameId}:${game.pointsFor}-${game.pointsAgainst}`))
  })

  it('9. los dos mundos finales sobreviven a guardar/cargar con sus diferencias intactas', { timeout: 120_000 }, async () => {
    const [loadedA, loadedB] = [await roundTrip(A.world), await roundTrip(B.world)]
    expect(projectPersistentWorldTruth(loadedA)).toEqual(projectPersistentWorldTruth(A.world))
    expect(projectPersistentWorldTruth(loadedB)).toEqual(projectPersistentWorldTruth(B.world))
    expect(userSessions(loadedB, 'completed').length).toBe(userSessions(B.world, 'completed').length)
    expect(userSessions(loadedA, 'completed')).toHaveLength(0)
    expect(loadedB.teamCohesionByTeamId[teamId]).toBe(B.world.teamCohesionByTeamId[teamId])
    expect(loadedA.teamCohesionByTeamId[teamId] ?? 50).toBe(A.world.teamCohesionByTeamId[teamId] ?? 50)
    expect(loadedB.responsibilitiesById).toEqual(B.world.responsibilitiesById)
    expect(loadedB.careerFatigueByPlayerId).toEqual(B.world.careerFatigueByPlayerId)
    expect(getTeamLineup(loadedB, teamId)).toEqual(getTeamLineup(B.world, teamId))
    expect(getTeamLineup(loadedA, teamId)).toEqual(getTeamLineup(A.world, teamId))
  })
})

describe('F2 · comparación A/B · gestión automática frente a gestión activa', () => {
  it('10. cada diferencia relevante se traza a una decisión, un comando, un hecho canónico y su conservación; la tabla se publica', async () => {
    const roster = getTeamRoster(day0, teamId).map((player) => player.id)
    const executedB = userSessions(B.world, 'completed')
    const teamAvg = (world: GameWorld) => mean(roster.map((id) => world.careerFatigueByPlayerId[id] ?? 0))
    const minutesTotals = (run: F2RunResult) => Object.fromEntries(roster.map((id) => [id, round(run.games.reduce((sum, game) => sum + (game.minutes[id] ?? 0), 0), 1)]))
    const minutesA = minutesTotals(A)
    const minutesB = minutesTotals(B)
    const outcomes = Object.values(B.world.delegationOutcomesById).filter((outcome) => outcome.applied)
    const trainingStimulus = (world: GameWorld) => Object.values(world.developmentStimulusEventsById).filter((event) => event.sourceType === 'training' && roster.includes(event.playerId) && !(event.id in day0.developmentStimulusEventsById)).reduce((sum, event) => sum + Object.values(event.byRating).reduce((inner, value) => inner + (value ?? 0), 0), 0)
    const matchStimulus = (world: GameWorld) => Object.values(world.developmentStimulusEventsById).filter((event) => event.sourceType === 'match' && roster.includes(event.playerId) && !(event.id in day0.developmentStimulusEventsById)).reduce((sum, event) => sum + Object.values(event.byRating).reduce((inner, value) => inner + (value ?? 0), 0), 0)
    const wins = (run: F2RunResult) => run.games.filter((game) => game.pointsFor > game.pointsAgainst).length
    const standing = (world: GameWorld) => calculateStandings(world, world.currentSeasonId).findIndex((row) => row.teamId === teamId) + 1
    const executionQuality = executedB.filter((session) => session.execution!.executingStaffPersonIds.length > 0).map((session) => session.execution!.executionQualityMultiplier)

    const row = (indicator: string, d0: string | number, a: string | number, b: string | number, cause: string) => ({ indicator, day0: d0, A: a, B: b, difference: typeof a === 'number' && typeof b === 'number' ? round(b - a, 2) : '—', cause })
    const table = [
      row('Fatiga media del plantel (día 30)', round(teamAvg(day0)), round(teamAvg(A.world)), round(teamAvg(B.world)), 'B programó sesiones (scheduleTeamModuleSession) cuyo careerFatigueDelta queda en execution.participants; la recuperación diaria es común'),
      row('Fatiga media diaria (promedio 30 días)', round(A.snapshots[0]!.avgFatigue), round(mean(A.snapshots.map((s) => s.avgFatigue))), round(mean(B.snapshots.map((s) => s.avgFatigue))), 'Carga de las sesiones menos recuperación (CAREER_FATIGUE_RECOVERY 3/día) y sesiones de recuperación'),
      row('Fatiga máxima alcanzada (jugador, 30 días)', round(A.snapshots[0]!.maxFatigue), round(Math.max(...A.snapshots.map((s) => s.maxFatigue))), round(Math.max(...B.snapshots.map((s) => s.maxFatigue))), 'Sesión de intensidad alta del miércoles de las semanas pares'),
      row('Recuperación: alivio de fatiga por sesiones de recuperación', 0, 0, round(-executedB.flatMap((s) => s.execution!.participants.map((p) => Math.min(0, p.careerFatigueDelta))).reduce((x, y) => x + y, 0)), 'activeRecovery / lowLoadRecovery (fatigueMultiplier < 0) programadas por B'),
      row('Carga de entrenamiento (puntuación de carga diaria acumulada)', 0, 0, round(executedB.reduce((sum, s) => sum + dailyWorkloadScore(s.execution!.effectiveIntensity, s.durationMinutes, trainingDefinitionById(s.definitionId).effects.fatigueMultiplier), 0)), 'dailyWorkloadScore de cada sesión ejecutada (intensidad × duración × multiplicador)'),
      row('Sesiones completadas (club del usuario)', 0, userSessions(A.world, 'completed').length, executedB.length, 'Planificación semanal de B: executeScheduledTrainingSessions en la fase TRAINING del día'),
      row('Estímulo de desarrollo procedente de entrenamientos', 0, round(trainingStimulus(A.world), 1), round(trainingStimulus(B.world), 1), 'DevelopmentStimulusEvent sourceType=training, uno por jugador y sesión'),
      row('Estímulo de desarrollo procedente de partidos', 0, round(matchStimulus(A.world), 1), round(matchStimulus(B.world), 1), 'Minutos jugados: el reparto de minutos cambia entre A y B'),
      row('Cohesión del equipo (familiaridad táctica del motor)', round(day0.teamCohesionByTeamId[teamId] ?? 50), round(A.world.teamCohesionByTeamId[teamId] ?? 50), round(B.world.teamCohesionByTeamId[teamId] ?? 50), 'cohesionDelta de las sesiones tácticas; el partido la lee como plan.familiarity'),
      row('Disponibilidad: jugadores disponibles (mínimo en 30 días)', A.snapshots[0]!.available, Math.min(...A.snapshots.map((s) => s.available)), Math.min(...B.snapshots.map((s) => s.available)), 'Lesiones del plantel (ninguna fabricada; las naturales de partido y entrenamiento aplican las mismas reglas)'),
      row('Jugadores que juegan ≥ 10 minutos por partido (media)', '—', round(mean(A.games.map((g) => Object.values(g.minutes).filter((m) => m >= 10).length))), round(mean(B.games.map((g) => Object.values(g.minutes).filter((m) => m >= 10).length))), 'Quinteto y banquillo guardados por B (setLineupSlot) frente a la selección contextual del entrenador (A)'),
      row('Minutos del titular más cargado (media por partido)', '—', round(mean(A.games.map((g) => Math.max(...Object.values(g.minutes))))), round(mean(B.games.map((g) => Math.max(...Object.values(g.minutes))))), 'Descanso del titular más fatigado antes de cada partido'),
      row('Ejecución del staff: sesiones con ejecutor asignado', 0, 0, executionQuality.length, 'assignedStaffPersonIds de cada sesión programada; el ejecutor deja executingStaffRoles'),
      row('Ejecución del staff: multiplicador de calidad medio', '—', 1, round(mean(executionQuality), 3), 'trainingStaffExecutionMultiplier (rol × competencia del ejecutor), 0.90–1.18'),
      row('Decisiones delegadas registradas (DelegationOutcome)', 0, 0, outcomes.length, 'assignIndividualDevelopment delegada: el responsable elige el módulo de cada sesión individual'),
      row('Rendimiento colectivo: puntos a favor − en contra (4 partidos)', '—', A.games.reduce((s, g) => s + g.pointsFor - g.pointsAgainst, 0), B.games.reduce((s, g) => s + g.pointsFor - g.pointsAgainst, 0), 'Resultado del motor con las mismas semillas; no se atribuye causalidad a un marcador (ver tabla multisemilla)'),
      row('Resultados: victorias (4 partidos)', '—', wins(A), wins(B), 'Idem'),
      row('Clasificación del usuario tras el día 30', '—', standing(A.world), standing(B.world), 'calculateStandings sobre GameWorld'),
    ]
    const areaTraining = executedB.length > 0 && userSessions(A.world, 'completed').length === 0 && trainingStimulus(B.world) > 0 && trainingStimulus(A.world) === 0
    const areaRotationStaff = B.decisions.filter((d) => d.action === 'setLineupSlot').length === B.games.length && executionQuality.length > 0 && outcomes.length > 0
    expect(areaTraining).toBe(true)
    expect(areaRotationStaff).toBe(true)
    expect(B.world.teamCohesionByTeamId[teamId]!).toBeGreaterThan(A.world.teamCohesionByTeamId[teamId] ?? 50)
    expect(minutesA).not.toEqual(minutesB)
    expect(outcomes.every((outcome) => outcome.kind === 'assignIndividualDevelopment' && B.world.responsibilitiesById[outcome.responsibilityId]?.mode === 'delegated')).toBe(true)

    const evidenceDir = process.env.F2_EVIDENCE_DIR
    if (evidenceDir !== undefined) {
      mkdirSync(evidenceDir, { recursive: true })
      writeFileSync(join(evidenceDir, 'ab-comparison.json'), JSON.stringify({
        window: { from: '2026-09-27', days: F2_WINDOW_DAYS, universe: 'ACB 2026/27', club: 'UCAM Murcia', salt: SALT, matchSeeds: A.games.map((g) => ({ gameId: g.gameId, seed: matchSeedFor(SALT, g.gameId) })) },
        decisionsB: B.decisions, table,
        games: { A: A.games.map(({ preMatchWorld: _a, ...game }) => game), B: B.games.map(({ preMatchWorld: _b, ...game }) => game) },
        minutes: { A: minutesA, B: minutesB }, dailyFatigue: { A: A.snapshots, B: B.snapshots }, stimulusByRating: { A: stimulusTotals(A.world, teamId).byRating, B: stimulusTotals(B.world, teamId).byRating },
      }, null, 2))
    }
    console.log(`F2 A/B\n${table.map((r) => `${r.indicator} | ${r.day0} | ${r.A} | ${r.B} | ${r.difference}`).join('\n')}`)
  })
})

describe('F2 · control del azar: varias semillas sobre los estados reales previos a cada partido', () => {
  const SEEDS = Array.from({ length: 10 }, (_, index) => 1000 + index)
  const marginOf = (world: GameWorld, gameId: GameId, seed: number): number => {
    const game = world.games[gameId]!
    const result = port.simulate(port.prepare(world, game, seed), 'FAST')
    return game.homeTeamId === teamId ? result.score.home - result.score.away : result.score.away - result.score.home
  }

  it('11. el partido registrado se reproduce con su semilla y cada brazo llega al motor con entradas distintas', { timeout: 300_000 }, () => {
    for (const run of [A, B]) {
      for (const line of run.games) {
        expect(marginOf(line.preMatchWorld, line.gameId, matchSeedFor(SALT, line.gameId))).toBe(line.pointsFor - line.pointsAgainst)
      }
    }
    // What differs at the engine boundary: initial lineups, pre-match fatigue and tactical familiarity.
    let differing = 0
    for (let index = 0; index < A.games.length; index += 1) {
      const [a, b] = [A.games[index]!, B.games[index]!]
      const [setupA, setupB] = [port.prepare(a.preMatchWorld, a.preMatchWorld.games[a.gameId]!, 1), port.prepare(b.preMatchWorld, b.preMatchWorld.games[b.gameId]!, 1)]
      const side = a.isHome ? 'home' : 'away'
      const differs = setupA.initialLineups[side].join() !== setupB.initialLineups[side].join()
        || setupA.tacticalPlans[side].familiarity !== setupB.tacticalPlans[side].familiarity
        || JSON.stringify(a.preMatchFatigue) !== JSON.stringify(b.preMatchFatigue)
      if (differs) differing += 1
    }
    expect(differing).toBe(A.games.length)
  })

  it('12. con las mismas 10 semillas, el efecto agregado de las decisiones se mide frente a la variación aleatoria', { timeout: 900_000 }, () => {
    const rows = A.games.map((lineA, index) => {
      const lineB = B.games[index]!
      const a = SEEDS.map((seed) => marginOf(lineA.preMatchWorld, lineA.gameId, seed))
      const b = SEEDS.map((seed) => marginOf(lineB.preMatchWorld, lineB.gameId, seed))
      return { date: lineA.date, meanA: mean(a), meanB: mean(b), winsA: a.filter((m) => m > 0).length, winsB: b.filter((m) => m > 0).length, diffs: b.map((m, i) => m - a[i]!) }
    })
    const diffs = rows.flatMap((row) => row.diffs)
    const sd = Math.sqrt(mean(diffs.map((d) => (d - mean(diffs)) ** 2)) * diffs.length / (diffs.length - 1))
    const se = sd / Math.sqrt(diffs.length)
    const summary = {
      seeds: SEEDS, games: rows.map((row) => ({ date: row.date, meanMarginA: round(row.meanA, 2), meanMarginB: round(row.meanB, 2), winsA: row.winsA, winsB: row.winsB })),
      pairedMeanDifferenceBminusA: round(mean(diffs), 2), standardError: round(se, 2), interval95: [round(mean(diffs) - 1.96 * se, 2), round(mean(diffs) + 1.96 * se, 2)], pairs: diffs.length,
    }
    console.log(`F2 multi-seed ${JSON.stringify(summary)}`)
    expect(rows).toHaveLength(4)
    expect(Number.isFinite(summary.pairedMeanDifferenceBminusA)).toBe(true)
    const evidenceDir = process.env.F2_EVIDENCE_DIR
    if (evidenceDir !== undefined) { mkdirSync(evidenceDir, { recursive: true }); writeFileSync(join(evidenceDir, 'multi-seed.json'), JSON.stringify(summary, null, 2)) }
  })
})
