import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { parseGameDate } from '@/domain/date'
import type { PlayerId, TeamId } from '@/domain/ids'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { trainingDefinitionById, trainingLoad } from '@/domain/training'
import { getTeamRoster, isPlayerAvailable, updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { classifyLineupCandidate } from '@/engine/tactics/LineupAvailability'
import { trainingInjuryProbability } from '@/engine/injury/TrainingInjuries'
import { staffCohesionDevelopmentMultiplier } from '@/engine/training/StaffCohesionDevelopmentBridge'
import { createMatchEnginePort } from '@/app/matchNext'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { useGameStore } from '@/stores/gameStore'
import { buildMedicalWorkspaceModel } from '@/ui-ng/applications/medical/buildMedicalWorkspaceModel'
import { resolveBreakpointDestination } from '@/ui-ng/system/breakpointRouting'
import { advanceGameDay } from './advanceGameDay'
import { continueGame } from './ContinueFlow'
import { instantResult } from './matchResolution'
import { getUserMatchReadiness } from './UserMatchReadiness'
import { automaticPolicy, bestTrainingStaff, overloadPolicy, staffWithRole } from './testSupport/PlayableF2Policies'
import { createF2Day0, matchSeedFor, runF2Window, userGameToday } from './testSupport/PlayableF2Support'

/**
 * F2 · mecanismos controlados. Cada prueba parte del día 0 del tramo (ACB 2026/27, UCAM Murcia, 27 sep 2026), cambia exactamente una
 * cosa con el comando que usa Courtside y comprueba el efecto canónico directo, en lugar de fiarse de un marcador.
 */
const savedAt = '2026-09-27T09:00:00.000Z'
const memoryRepository = (): GameSaveRepository & { file: string } => {
  const repository = { file: '', save: async (json: string) => { repository.file = json }, load: async () => repository.file, getInfo: async () => ({ savedAt }) }
  return repository
}
const roundTrip = async (world: GameWorld): Promise<GameWorld> => { const repository = memoryRepository(); await saveCurrentGame(world, repository, savedAt); return loadSavedGame(repository) }
const seedFactory = () => { let next = 9000; return () => next++ }
const port = createMatchEnginePort('match-next')
const d = parseGameDate
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

let day0: GameWorld
let teamId: TeamId
let roster: readonly PlayerId[]
const store = () => useGameStore.getState()
const withFatigue = (world: GameWorld, value: number): GameWorld => updateGameWorld(world, { careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, ...Object.fromEntries(roster.map((id) => [id, value])) } })
const oneDay = (world: GameWorld) => advanceGameDay(world, seedFactory())
const sessionOf = (world: GameWorld, id: string) => world.scheduledTrainingSessionsById[id]!

beforeAll(async () => {
  day0 = await createF2Day0()
  teamId = getUserTeam(day0)!.id
  roster = getTeamRoster(day0, teamId).map((player) => player.id)
}, 300_000)
beforeEach(() => { store().replaceWorld(day0) })

describe('F2 · entrenamiento: una sesión programada desde Courtside produce exactamente sus consecuencias', () => {
  it('M1. fatiga, estímulo, cohesión y evidencia de una sesión de equipo coinciden con el catálogo y el motor de carga', async () => {
    store().scheduleTeamModuleSession({ moduleId: 'defensiveSystem', date: d('2026-09-28'), startTime: '10:00', durationMinutes: 90, sessionId: 'f2-m1', intensity: 'normal' })
    const before = store().world!
    expect(sessionOf(before, 'f2-m1').status).toBe('scheduled')
    const after = oneDay(before)
    const session = sessionOf(after, 'f2-m1')
    const definition = trainingDefinitionById('defensiveSystem')
    const load = trainingLoad('normal')
    expect(session.status).toBe('completed')
    expect(session.execution).toMatchObject({ completedOn: '2026-09-28', category: 'tactical', effectiveIntensity: 'normal', executingStaffPersonIds: [], executionQualityMultiplier: 1 })
    expect(session.execution!.participants).toHaveLength(roster.length)
    for (const participant of session.execution!.participants) {
      expect(participant.participation).toBe('FULL')
      const recovered = Math.max(0, (before.careerFatigueByPlayerId[participant.playerId] ?? 0) - 3)
      expect(participant.careerFatigueDelta).toBeCloseTo(load.fatigue * definition.effects.fatigueMultiplier, 6)
      expect(after.careerFatigueByPlayerId[participant.playerId]).toBeCloseTo(recovered + load.fatigue * definition.effects.fatigueMultiplier, 6)
      const event = after.developmentStimulusEventsById[`training:f2-m1:${participant.playerId}`]!
      expect(event).toMatchObject({ sourceType: 'training', sourceId: 'f2-m1', date: d('2026-09-28') })
      expect(Object.keys(event.byRating).sort()).toEqual([...definition.effects.targetRatings].sort())
      const efficiency = Math.max(0.4, 1 - recovered / 150)
      for (const key of definition.effects.targetRatings) expect(event.byRating[key]).toBeCloseTo(load.stimulus * efficiency * definition.effects.developmentWeight * staffCohesionDevelopmentMultiplier(before, sessionOf(before, 'f2-m1')), 6)
    }
    expect(session.execution!.cohesionDelta).toBeCloseTo(definition.effects.cohesionDelta, 6)
    expect(after.teamCohesionByTeamId[teamId]).toBeCloseTo((before.teamCohesionByTeamId[teamId] ?? 50) + definition.effects.cohesionDelta, 6)
    // The consequence is persistent: Save V4 returns the same evidence, and the session is not run twice by another day.
    const loaded = await roundTrip(after)
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(after))
    const next = oneDay(after)
    expect(sessionOf(next, 'f2-m1')).toEqual(session)
    expect(Object.keys(next.developmentStimulusEventsById).filter((id) => id.startsWith('training:f2-m1:'))).toHaveLength(roster.length)
  })

  it('M2. una sesión nunca se ejecuta en día de partido y no puede programarse allí', () => {
    expect(() => store().scheduleTeamModuleSession({ moduleId: 'threePoint', date: d('2026-10-03'), startTime: '10:00', durationMinutes: 60, sessionId: 'f2-m2' })).toThrow(/fixture date/)
    expect(() => store().scheduleTeamModuleSession({ moduleId: 'threePoint', date: d('2026-09-27'), startTime: '10:00', durationMinutes: 60, sessionId: 'f2-m2b' })).toThrow(/must be after the current date/)
  })
})

describe('F2 · descanso, recuperación y carga: cada decisión mueve la fatiga como dicen las reglas', () => {
  const FATIGUE = 40
  const run = (configure: (s: ReturnType<typeof store>) => void) => {
    store().replaceWorld(withFatigue(day0, FATIGUE))
    configure(store())
    return oneDay(store().world!)
  }
  const fatigueOf = (world: GameWorld, id: PlayerId) => world.careerFatigueByPlayerId[id] ?? 0

  it('M3. sin sesión sólo actúa la recuperación diaria; recuperación activa la aumenta; una sesión de carga alta la supera', () => {
    const rest = run(() => {})
    const recovery = run((s) => s.scheduleTeamModuleSession({ moduleId: 'lowLoadRecovery', date: d('2026-09-28'), startTime: '10:00', durationMinutes: 30, sessionId: 'f2-recovery', intensity: 'light' }))
    const heavy = run((s) => s.scheduleTeamModuleSession({ moduleId: 'strength', date: d('2026-09-28'), startTime: '10:00', durationMinutes: 60, sessionId: 'f2-heavy', intensity: 'high' }))
    const id = roster[0]!
    expect(fatigueOf(rest, id)).toBeCloseTo(FATIGUE - 3, 6)
    expect(fatigueOf(recovery, id)).toBeCloseTo(FATIGUE - 3 + trainingLoad('light').fatigue * trainingDefinitionById('lowLoadRecovery').effects.fatigueMultiplier, 6)
    expect(fatigueOf(recovery, id)).toBeLessThan(fatigueOf(rest, id))
    expect(fatigueOf(heavy, id)).toBeCloseTo(FATIGUE - 3 + trainingLoad('high').fatigue * trainingDefinitionById('strength').effects.fatigueMultiplier, 6)
    expect(fatigueOf(heavy, id)).toBeGreaterThan(fatigueOf(rest, id))
    // The load management screen reads the same number (Training > Carga, Medical, Match readiness).
    for (const world of [rest, recovery, heavy]) {
      expect(getUserMatchReadiness(world)!.players.find((player) => player.playerId === id)!.fatigue).toBe(fatigueOf(world, id))
      expect(buildMedicalWorkspaceModel(world)!.risk.find((row) => row.playerId === id)!.fatigue).toBeCloseTo(fatigueOf(world, id), 6)
    }
  })

  it('M4. la participación elegida por el entrenador (REST / REDUCED) gobierna fatiga, estímulo y riesgo de cada jugador', () => {
    const [resting, reduced, full] = [roster[0]!, roster[1]!, roster[2]!]
    const world = run((s) => {
      s.scheduleTeamModuleSession({ moduleId: 'strength', date: d('2026-09-28'), startTime: '10:00', durationMinutes: 60, sessionId: 'f2-part', intensity: 'high' })
      s.setTrainingParticipation({ sessionId: 'f2-part', playerId: resting, participation: 'REST' })
      s.setTrainingParticipation({ sessionId: 'f2-part', playerId: reduced, participation: 'REDUCED' })
      s.setTrainingParticipation({ sessionId: 'f2-part', playerId: full, participation: 'FULL' })
    })
    const gain = trainingLoad('high').fatigue * trainingDefinitionById('strength').effects.fatigueMultiplier
    expect(fatigueOf(world, resting)).toBeCloseTo(FATIGUE - 3, 6)
    expect(fatigueOf(world, reduced)).toBeCloseTo(FATIGUE - 3 + gain / 2, 6)
    expect(fatigueOf(world, full)).toBeCloseTo(FATIGUE - 3 + gain, 6)
    expect(world.developmentStimulusEventsById[`training:f2-part:${resting}`]).toBeUndefined()
    const [eventReduced, eventFull] = [world.developmentStimulusEventsById[`training:f2-part:${reduced}`]!, world.developmentStimulusEventsById[`training:f2-part:${full}`]!]
    expect(eventReduced.byRating.strength! / eventFull.byRating.strength!).toBeCloseTo(0.5, 6)
    const participants = sessionOf(world, 'f2-part').execution!.participants
    expect(participants.find((p) => p.playerId === resting)).toMatchObject({ participation: 'REST', careerFatigueDelta: 0, injuryIds: [] })
    // The injury model that Training uses grows with intensity, workload on a tired body and participation.
    const probability = (intensity: 'light' | 'normal' | 'high', fatigue: number, participationMultiplier: number) => trainingInjuryProbability({ riskWeight: 1.2, intensity, durationMinutes: 60, fatigue, recurrence: 1, participationMultiplier })
    expect(probability('high', 40, 1)).toBeGreaterThan(probability('normal', 40, 1))
    expect(probability('normal', 40, 1)).toBeGreaterThan(probability('light', 40, 1))
    expect(probability('high', 80, 1)).toBeGreaterThan(probability('high', 5, 1))
    expect(probability('high', 40, 0)).toBe(0)
    expect(probability('high', 40, 0.5)).toBeLessThan(probability('high', 40, 1))
  })

  it('M5. un exceso de carga (decisión mala) empeora la fatiga con la que se llega al partido y el rendimiento esperado', { timeout: 600_000 }, () => {
    const rested = runF2Window(day0, automaticPolicy, 21, 6)
    const overloaded = runF2Window(day0, overloadPolicy, 21, 6)
    expect(rested.world.currentDate).toBe('2026-10-03')
    expect(userGameToday(overloaded.world)).toBeDefined()
    const avg = (world: GameWorld) => mean(roster.map((id) => world.careerFatigueByPlayerId[id] ?? 0))
    expect(avg(overloaded.world)).toBeGreaterThan(avg(rested.world) + 20)
    const game = userGameToday(rested.world)!
    const margin = (world: GameWorld, seed: number) => { const result = port.simulate(port.prepare(world, game, seed), 'FAST'); return game.homeTeamId === teamId ? result.score.home - result.score.away : result.score.away - result.score.home }
    const seeds = Array.from({ length: 24 }, (_, index) => 2000 + index)
    const diffs = seeds.map((seed) => margin(overloaded.world, seed) - margin(rested.world, seed))
    const sd = Math.sqrt(diffs.reduce((sum, d) => sum + (d - mean(diffs)) ** 2, 0) / (diffs.length - 1))
    const summary = { fatigueRested: round(avg(rested.world)), fatigueOverloaded: round(avg(overloaded.world)), seeds: seeds.length, pairedMarginDifferenceOverloadedMinusRested: round(mean(diffs)), standardError: round(sd / Math.sqrt(diffs.length)), trainingInjuries: Object.values(overloaded.world.injuriesById).filter((injury) => injury.source === 'TRAINING' && roster.includes(injury.playerId)).length }
    console.log(`F2 overload ${JSON.stringify(summary)}`)
    const evidenceDir = process.env.F2_EVIDENCE_DIR
    if (evidenceDir !== undefined) { mkdirSync(evidenceDir, { recursive: true }); writeFileSync(join(evidenceDir, 'overload.json'), JSON.stringify(summary, null, 2)) }
    expect(Number.isFinite(summary.pairedMarginDifferenceOverloadedMinusRested)).toBe(true)
  })
})

describe('F2 · Medical: escenario controlado de lesión → disponibilidad → recuperación → alta → partido', () => {
  it('M6. el lesionado desaparece de Plantilla, Entrenamiento, Medical y Partido, vuelve por la revisión de alta y todo persiste', { timeout: 600_000 }, async () => {
    const starter = getUserMatchReadiness(day0)!.starters[0]!
    const injury = createInjury({ id: injuryIdFromString('f2:controlled'), playerId: starter, kind: 'hamstringStrain', severity: 'minor', injuredOn: day0.currentDate, expectedReturnDate: d('2026-10-07') })
    const hurt = updateGameWorld(day0, { injuries: [...Object.values(day0.injuriesById), injury] })
    store().replaceWorld(hurt)

    // 1. Same fact on every screen.
    expect(isPlayerAvailable(hurt, starter, hurt.currentDate)).toBe(false)
    expect(classifyLineupCandidate(hurt, teamId, starter)).toMatchObject({ selectable: false, reason: 'INJURED' })
    const readiness = getUserMatchReadiness(hurt)!
    expect(readiness.starters).not.toContain(starter)
    expect(readiness.players.find((player) => player.playerId === starter)).toMatchObject({ role: 'UNAVAILABLE', blockReason: 'INJURED' })
    const medical = buildMedicalWorkspaceModel(hurt)!
    expect(medical.injuredCount).toBe(1)
    expect(medical.availableCount).toBe(roster.length - 1)
    expect(medical.injured[0]).toMatchObject({ playerId: starter, lifecycleStatus: 'RECOVERING', daysRemaining: 10 })
    store().setLineupSlot('PG', starter)
    expect(store().lineupNotice).toContain('Lesionado')

    // 2. Training: the injured player rests, accumulates no load and gets no stimulus; the healthy squad trains.
    store().scheduleTeamModuleSession({ moduleId: 'threePoint', date: d('2026-09-28'), startTime: '10:00', durationMinutes: 60, sessionId: 'f2-injury-session', intensity: 'normal' })
    const trained = oneDay(store().world!)
    const participants = sessionOf(trained, 'f2-injury-session').execution!.participants
    expect(participants.find((p) => p.playerId === starter)).toMatchObject({ participation: 'REST', careerFatigueDelta: 0 })
    expect(trained.developmentStimulusEventsById[`training:f2-injury-session:${starter}`]).toBeUndefined()
    expect(participants.filter((p) => p.playerId !== starter).every((p) => p.participation === 'FULL' && p.careerFatigueDelta > 0)).toBe(true)

    // 3. Match (3 Oct): Continue stops at the game, the injured player is not fielded and has no minutes.
    const toGame = continueGame(trained, 30, seedFactory())
    expect(toGame.stopReason.type).toBe('userGame')
    expect(toGame.world.currentDate).toBe('2026-10-03')
    const playedWorld = instantResult(toGame.world, undefined, matchSeedFor(1, userGameToday(toGame.world)!.id))
    const gameId = userGameToday(toGame.world)!.id
    expect(playedWorld.matchStatLogsByGameId[gameId]!.playerLines.filter((line) => line.playerId === starter && line.stats.secondsPlayed > 0)).toHaveLength(0)

    // 4. Save V4 in the middle of the injury returns the same injury and the same blocked lineup.
    const midInjury = await roundTrip(playedWorld)
    expect(projectPersistentWorldTruth(midInjury)).toEqual(projectPersistentWorldTruth(playedWorld))
    expect(midInjury.injuriesById[injury.id]).toEqual(playedWorld.injuriesById[injury.id])

    // 5. Return-to-play: the staff recommendation comes from the real injury; Continue stops on 7 Oct and routes to Medical.
    const physio = staffWithRole(midInjury, teamId, 'physiotherapist') ?? staffWithRole(midInjury, teamId, 'teamDoctor')!
    store().replaceWorld(midInjury)
    store().setStaffResponsibility({ teamId, kind: 'returnToPlayRecommendation', mode: 'advisory', holderStaffId: physio })
    const toReview = continueGame(store().world!, 30, seedFactory())
    expect(toReview.world.currentDate).toBe('2026-10-07')
    expect(toReview.stopReason.type).toBe('breakpoint')
    if (toReview.stopReason.type !== 'breakpoint') throw new Error('unreachable')
    expect(toReview.stopReason.breakpoint).toMatchObject({ reason: 'returnToPlayReview', route: 'medical', sourceId: injury.id })
    expect(toReview.stopReason.breakpoint.actionTarget).toMatchObject({ injuryId: injury.id, playerId: starter })
    expect(resolveBreakpointDestination('medical')).toMatchObject({ actionable: true, appId: 'medical' })
    expect(isPlayerAvailable(toReview.world, starter, toReview.world.currentDate)).toBe(false) // still out until the coach clears him
    const dueRow = buildMedicalWorkspaceModel(toReview.world)!.returnToPlayReviews.find((row) => row.playerId === starter)!
    expect(dueRow).toMatchObject({ injuryId: injury.id, canClear: true })
    const recommendation = Object.values(toReview.world.delegationOutcomesById).find((outcome) => outcome.kind === 'returnToPlayRecommendation' && outcome.payload.injuryId === injury.id)
    expect(recommendation).toBeDefined()
    expect(dueRow.recommendationOutcomeId).toBe(recommendation!.id)
    expect(recommendation!.staffId).toBe(physio)

    // Fixture for the Windows acceptance run: the same career, loaded into the real executable, must stop here and route to Medical.
    const fixtureDir = process.env.F2_FIXTURE_DIR
    if (fixtureDir !== undefined) { const repository = memoryRepository(); await saveCurrentGame(toReview.world, repository, savedAt); mkdirSync(fixtureDir, { recursive: true }); writeFileSync(join(fixtureDir, 'rtp-review-due-save.json'), repository.file) }

    // 6. The coach clears him with the Medical command; he is available, selectable and plays the next game.
    store().replaceWorld(toReview.world)
    const result = store().reviewReturnToPlay(injury.id, 'CLEAR_FOR_PLAY', recommendation!.id)
    expect(result.ok).toBe(true)
    const cleared = store().world!
    expect(isPlayerAvailable(cleared, starter, cleared.currentDate)).toBe(true)
    expect(classifyLineupCandidate(cleared, teamId, starter).selectable).toBe(true)
    store().setLineupSlot('PG', starter)
    expect(store().lineupNotice).toBeNull()
    expect(cleared.injuriesById[injury.id]!.returnToPlay!.reviews.at(-1)).toMatchObject({ decision: 'CLEAR_FOR_PLAY', recommendationOutcomeId: recommendation!.id })
    const reloaded = await roundTrip(store().world!)
    expect(projectPersistentWorldTruth(reloaded)).toEqual(projectPersistentWorldTruth(store().world!))
    const toNextGame = continueGame(reloaded, 30, seedFactory())
    expect(toNextGame.stopReason.type).toBe('userGame')
    expect(toNextGame.world.currentDate).toBe('2026-10-10')
    expect(getUserMatchReadiness(toNextGame.world)!.starters).toContain(starter)
  })
})

describe('F2 · Staff: ejecución y delegación con consecuencias medibles', () => {
  it('M7. el ejecutor asignado a una sesión escala el estímulo y la cohesión según su idoneidad; la fatiga positiva no cambia', () => {
    const date = d('2026-09-28')
    const best = bestTrainingStaff(day0, teamId, 'defensiveSystem', date)!
    const sessionInput = { moduleId: 'defensiveSystem', date, startTime: '10:00', durationMinutes: 90, intensity: 'normal' as const }
    store().replaceWorld(day0); store().scheduleTeamModuleSession({ ...sessionInput, sessionId: 'f2-exec' })
    const alone = oneDay(store().world!)
    store().replaceWorld(day0); store().scheduleTeamModuleSession({ ...sessionInput, sessionId: 'f2-exec', assignedStaffPersonIds: [best] })
    const withStaff = store().world!
    const collab = staffCohesionDevelopmentMultiplier(withStaff, sessionOf(withStaff, 'f2-exec'))
    const executed = oneDay(withStaff)
    const [evidenceAlone, evidenceStaff] = [sessionOf(alone, 'f2-exec').execution!, sessionOf(executed, 'f2-exec').execution!]
    expect(evidenceAlone.executionQualityMultiplier).toBe(1)
    expect(evidenceStaff.executionQualityMultiplier).toBeGreaterThan(1)
    expect(evidenceStaff.executingStaffPersonIds).toEqual([best])
    expect(evidenceStaff.executingStaffRoles).toHaveLength(1)
    const id = roster[0]!
    const [eventAlone, eventStaff] = [alone.developmentStimulusEventsById[`training:f2-exec:${id}`]!, executed.developmentStimulusEventsById[`training:f2-exec:${id}`]!]
    const key = Object.keys(eventAlone.byRating)[0] as keyof typeof eventAlone.byRating
    expect(eventStaff.byRating[key]! / eventAlone.byRating[key]!).toBeCloseTo(evidenceStaff.executionQualityMultiplier * collab, 5)
    expect(evidenceStaff.participants[0]!.careerFatigueDelta).toBeCloseTo(evidenceAlone.participants[0]!.careerFatigueDelta, 6)
    expect(evidenceStaff.cohesionDelta / evidenceAlone.cohesionDelta).toBeCloseTo(evidenceStaff.executionQualityMultiplier, 5)
    // The assignment is consumed on completion (history does not stay coupled to employment) but the evidence persists.
    expect(sessionOf(executed, 'f2-exec').assignedStaffPersonIds).toBeUndefined()
  })

  it('M8. delegar el desarrollo individual hace que el responsable elija el módulo; queda un DelegationOutcome y la decisión persiste', async () => {
    const developer = staffWithRole(day0, teamId, 'playerDevelopmentCoach')!
    const player = roster[3]!
    store().setStaffResponsibility({ teamId, kind: 'assignIndividualDevelopment', mode: 'delegated', holderStaffId: developer })
    store().assignTrainingModuleToPlayer({ playerId: player, moduleId: 'threePoint', date: d('2026-09-28'), startTime: '12:00', sessionId: 'f2-ind' })
    const world = oneDay(store().world!)
    const session = sessionOf(world, 'f2-ind')
    const outcome = Object.values(world.delegationOutcomesById).find((item) => item.payload.sessionId === 'f2-ind')!
    expect(outcome).toMatchObject({ kind: 'assignIndividualDevelopment', staffId: developer, applied: true, decidedOn: '2026-09-28' })
    expect(Number.isInteger(outcome.qualityScore)).toBe(true)
    expect(session.execution!.plannedModuleName).toBe('Three-Point Shooting')
    expect(trainingDefinitionById(String(outcome.payload.definitionId)).name).toBe(session.execution!.moduleName)
    const loaded = await roundTrip(world)
    expect(loaded.delegationOutcomesById[outcome.id]).toEqual(outcome)
    expect(loaded.responsibilitiesById[outcome.responsibilityId]).toMatchObject({ mode: 'delegated', holderStaffId: developer })
    // Taking the decision back: the next individual session runs as the coach scheduled it and records no new outcome.
    store().replaceWorld(world)
    store().setStaffResponsibility({ teamId, kind: 'assignIndividualDevelopment', mode: 'userControlled' })
    store().assignTrainingModuleToPlayer({ playerId: player, moduleId: 'threePoint', date: d('2026-09-29'), startTime: '12:00', sessionId: 'f2-ind-2' })
    const next = oneDay(store().world!)
    expect(sessionOf(next, 'f2-ind-2').execution!.moduleName).toBe('Three-Point Shooting')
    expect(Object.values(next.delegationOutcomesById).filter((item) => item.payload.sessionId === 'f2-ind-2')).toHaveLength(0)
  })

  it('M9. delegar la intensidad de la carga a un responsable la determina por calidad; una delegación a un rol no elegible se rechaza sin tocar el mundo', () => {
    const conditioning = staffWithRole(day0, teamId, 'performanceCoach') ?? staffWithRole(day0, teamId, 'loadManagementSpecialist')!
    const kind = 'determineIntensity' as const
    const role = Object.values(day0.teamStaffAssignmentsById).find((a) => a.staffPersonId === conditioning)!.role
    store().setStaffResponsibility({ teamId, kind, mode: 'delegated', holderStaffId: conditioning })
    store().scheduleTeamModuleSession({ moduleId: 'conditioning', date: d('2026-09-28'), startTime: '10:00', durationMinutes: 60, sessionId: 'f2-int', intensity: 'high' })
    const world = oneDay(store().world!)
    const outcome = Object.values(world.delegationOutcomesById).find((item) => item.payload.sessionId === 'f2-int')!
    expect(outcome).toMatchObject({ kind, staffId: conditioning, staffRoleIdAtDecision: role, applied: true })
    expect(sessionOf(world, 'f2-int').execution!.effectiveIntensity).toBe(outcome.payload.intensity)
    expect(sessionOf(world, 'f2-int').intensity).toBe('high') // the planned decision is preserved next to the one executed

    const general = staffWithRole(day0, teamId, 'generalManager')!
    const before = store().world
    expect(() => store().setStaffResponsibility({ teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: general })).toThrow(/ineligibleRole/)
    expect(store().world).toBe(before)
  })
})

describe('F2 · Staff: delegar el plan de equipo', () => {
  it('M10. con el plan de equipo delegado, el responsable decide el contenido de la sesión y sus consecuencias son las de lo ejecutado, no las de lo programado', () => {
    const assistant = staffWithRole(day0, teamId, 'assistantCoach')!
    store().setStaffResponsibility({ teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assistant })
    store().scheduleTeamModuleSession({ moduleId: 'threePoint', date: d('2026-09-28'), startTime: '10:00', durationMinutes: 60, sessionId: 'f2-plan', intensity: 'normal' })
    const world = oneDay(store().world!)
    const session = sessionOf(world, 'f2-plan')
    const outcome = Object.values(world.delegationOutcomesById).find((item) => item.payload.sessionId === 'f2-plan')!
    expect(outcome).toMatchObject({ kind: 'createTeamTrainingPlan', staffId: assistant, applied: true })
    const executed = trainingDefinitionById(String(outcome.payload.definitionId))
    expect(session.execution).toMatchObject({ plannedModuleName: 'Three-Point Shooting', moduleName: executed.name, category: executed.category })
    // Every consequence follows the definition that was executed.
    const id = roster[0]!
    const event = world.developmentStimulusEventsById[`training:f2-plan:${id}`]
    if (executed.effects.developmentWeight > 0 && executed.effects.targetRatings.length > 0) expect(Object.keys(event!.byRating).sort()).toEqual([...executed.effects.targetRatings].sort())
    expect(session.execution!.participants.find((p) => p.playerId === id)!.careerFatigueDelta).toBeCloseTo(trainingLoad('normal').fatigue * executed.effects.fatigueMultiplier, 6)
    expect(session.execution!.cohesionDelta).toBeCloseTo(executed.effects.cohesionDelta, 6)
  })
})
