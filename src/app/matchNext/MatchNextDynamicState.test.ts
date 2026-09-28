import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { distanceBetween } from '@/domain/court'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { createNewGame } from '@/app/game'
import { recoverCareerFatigueForDay } from '@/engine/training/TrainingEngine'
import { createMatchState, shotMakeProbability, stepPlayerKinematics } from '@/engine/match-next'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createMatchEnginePort } from './MatchEnginePortFactory'
import { deriveMatchNextDynamicConsequences } from './MatchNextDynamicConsequences'

describe('Match Next player dynamic state connection', () => {
  it('maps persisted pre-match fatigue into the transient MatchSession fatigue baseline', () => {
    const { world, game, port } = fixture()
    const playerId = world.teams[game.homeTeamId]!.rosterPlayerIds[0]!
    const tired = updateGameWorld(world, { careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, [playerId]: 72 } })
    const setup = port.prepare(tired, game, 3498342002)
    const profile = setup.players.find((item) => item.playerId === playerId)!
    const state = createMatchState(setup)
    const sessionPlayer = state.players.find((item) => item.playerId === playerId)

    expect(profile.dynamicState).toEqual({ careerFatigue: 72 })
    expect(sessionPlayer).toMatchObject({ preMatchCareerFatigue: 72, initialFatigue: 36, fatigue: 36 })
  })

  it('turns played minutes and canonical action workload into fatigue and development stimulus, but leaves unused players alone', () => {
    const { world, game, port } = fixture()
    const starterId = world.teams[game.homeTeamId]!.rosterPlayerIds[0]!
    const unusedId = world.teams[game.homeTeamId]!.rosterPlayerIds.at(-1)!
    const preMatch = updateGameWorld(world, { careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, [starterId]: 40, [unusedId]: 18 } })
    const setup = shortSetup(port.prepare(preMatch, game, 3498342002))
    const result = port.runInstant(setup)
    const consequences = deriveMatchNextDynamicConsequences(preMatch, result)
    const starter = consequences.find((item) => item.playerId === starterId)!
    const unused = consequences.find((item) => item.playerId === unusedId)!
    const completed = port.complete(preMatch, result)

    expect(result.playerStats.find((item) => item.playerId === starterId)!.secondsPlayed).toBeGreaterThan(0)
    expect(starter.minutesPlayed).toBeGreaterThan(0)
    expect(starter.workload.eventLoad).toBeGreaterThan(0)
    expect(starter.matchFatigueAfter).toBeGreaterThan(starter.matchFatigueBefore)
    expect(starter.careerFatigueDelta).toBeGreaterThan(0)
    expect(completed.careerFatigueByPlayerId[starterId]).toBeGreaterThan(preMatch.careerFatigueByPlayerId[starterId]!)
    expect(unused.minutesPlayed).toBe(0)
    expect(unused.careerFatigueDelta).toBe(0)
    expect(unused.developmentStimulusDelta).toEqual({})
    expect(completed.careerFatigueByPlayerId[unusedId]).toBe(preMatch.careerFatigueByPlayerId[unusedId])
    expect(Object.values(starter.developmentStimulusDelta).some((value) => value > 0)).toBe(true)
    expect(completed.developmentStimulusByPlayerId[starterId]).not.toEqual(preMatch.developmentStimulusByPlayerId[starterId])
    expect(completed.players).toEqual(preMatch.players)
  })

  it('produces identical persistent consequences for Live and Instant and refuses a second application', () => {
    const { world, game, port } = fixture()
    const setup = shortSetup(port.prepare(world, game, 3498342002))
    const liveResult = port.createLiveSession(setup).skipToEnd()
    const instantResult = port.runInstant(setup)
    const liveWorld = port.complete(world, liveResult)
    const instantWorld = port.complete(world, instantResult)

    expect(liveResult).toEqual(instantResult)
    expect(liveWorld.careerFatigueByPlayerId).toEqual(instantWorld.careerFatigueByPlayerId)
    expect(liveWorld.developmentStimulusByPlayerId).toEqual(instantWorld.developmentStimulusByPlayerId)
    expect(() => port.complete(liveWorld, liveResult)).toThrow(/MatchStatLog already exists|Cannot apply result to completed Game/)
  })

  it('recovers match load through the existing daily career-fatigue recovery authority', () => {
    const { world, game, port } = fixture()
    const playerId = world.teams[game.homeTeamId]!.rosterPlayerIds[0]!
    const setup = shortSetup(port.prepare(world, game, 3498342002))
    const completed = port.complete(world, port.runInstant(setup))
    const recovered = recoverCareerFatigueForDay(completed)

    expect(completed.careerFatigueByPlayerId[playerId]).toBeGreaterThan(0)
    expect(recovered.careerFatigueByPlayerId[playerId]).toBe(Math.max(0, completed.careerFatigueByPlayerId[playerId]! - 3))
  })

  it('keeps injury availability authoritative, permits fatigue without ineligibility, and round-trips match consequences through Save V4', () => {
    const { world, game, port } = fixture()
    const home = world.teams[game.homeTeamId]!
    const injuredId = home.rosterPlayerIds.at(-1)!
    const tiredAvailableId = home.rosterPlayerIds[0]!
    const injuredWorld = updateGameWorld(world, {
      careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, [tiredAvailableId]: 100 },
      injuries: [...Object.values(world.injuriesById), createInjury({ id: injuryIdFromString('bs5-match-availability'), playerId: injuredId, kind: 'ankleSprain', severity: 'moderate', injuredOn: world.currentDate, expectedReturnDate: addDays(world.currentDate, 10) })],
    })
    const setup = port.prepare(injuredWorld, game, 3498342002)
    const roundTrip = deserializeGameWorldV4(serializeGameWorldV4(port.complete(injuredWorld, port.runInstant(shortSetup(setup))), '2032-01-02T00:00:00.000Z'))

    expect(setup.homeSquad).not.toContain(injuredId)
    expect(setup.homeSquad).toContain(tiredAvailableId)
    expect(roundTrip.careerFatigueByPlayerId).toEqual(expect.objectContaining({ [tiredAvailableId]: injuredWorld.careerFatigueByPlayerId[tiredAvailableId] }))
    expect(roundTrip.developmentStimulusByPlayerId).toEqual(expect.objectContaining({ [tiredAvailableId]: expect.objectContaining({ playerId: tiredAvailableId }) }))
    expect(roundTrip.players[tiredAvailableId]).toEqual(injuredWorld.players[tiredAvailableId])
  })

  it('uses fatigue in movement, shooting, passing, defense and rebounding projections without changing Player Truth', () => {
    const { world, game, port } = fixture()
    const setup = port.prepare(world, game, 3498342002)
    const state = createMatchState(setup)
    const player = state.players[0]!
    const intent = { playerId: player.playerId, target: { x: Math.min(state.court.lengthMeters - 1, player.position.x + 8), y: player.position.y }, urgency: 'sprint' as const, facing: { kind: 'TRAVEL' as const }, provenance: { responsibilityId: 'r', decisionId: 'd', owner: 'offensiveStructure' as const } }
    const fresh = stepPlayerKinematics(player, player.kinematics, intent, state.ball.position, state.court.baskets.right, [], state.court)
    const tired = stepPlayerKinematics({ ...player, fatigue: 80 }, player.kinematics, intent, state.ball.position, state.court.baskets.right, [], state.court)

    expect(distanceBetween(player.position, tired.position)).toBeLessThan(distanceBetween(player.position, fresh.position))
    expect(shotMakeProbability(70, 4, 2, 0, 80)).toBeLessThan(shotMakeProbability(70, 4, 2, 0, 0))
  })
})

function fixture() {
  const world = createNewGame()
  const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
  const port = createMatchEnginePort('match-next')
  return { world, game, port }
}

function shortSetup(setup: ReturnType<ReturnType<typeof createMatchEnginePort>['prepare']>) {
  return { ...setup, clockRules: { ...setup.clockRules, periodCount: 2, periodSeconds: 30, overtimeSeconds: 20 } }
}
