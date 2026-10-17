import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { createPlayerRepertoire, WORLDDB_PLAYER_REPERTOIRE_VERSION } from '@/domain/player/PlayerRepertoire'
import { updateGameWorld } from '@/domain/world'
import { trainingDefinitionById } from '@/domain/training'
import { getPlayerKnowledgeSummary } from '@/engine/scouting/ScoutingEngine'
import { buildTrainingPlanningContext } from '@/engine/training/TrainingPlanning'
import { getRepertoireScoutingBrief, REPERTOIRE_MOVE_TRAINING, recommendRepertoireTraining } from './RepertoireAdvice'

const MONDAY = parseGameDate('2032-10-04')

function setup() {
  const base = createNewGame()
  const own = Object.values(base.teams).find(team => team.coachId === base.userCoachId)!
  const rival = Object.values(base.teams).find(team => team.organizationId !== own.organizationId)!
  const playerId = own.rosterPlayerIds[0]!
  const rivalPlayerId = rival.rosterPlayerIds[0]!
  const repertoire = createPlayerRepertoire({
    playerId,
    version: WORLDDB_PLAYER_REPERTOIRE_VERSION,
    contextualTraits: [{ code: 'HIGH_MOTOR', strength: 87, startedOn: '2032-10-01' }],
    technicalMoves: [
      { code: 'CROSSOVER', proficiency: 34, usageTendency: 70, asOfOn: '2032-10-01' },
      { code: 'STEPBACK', proficiency: 42, usageTendency: 48, asOfOn: '2032-10-01' },
      { code: 'EURO_STEP', proficiency: 88, usageTendency: 80, asOfOn: '2032-10-01' },
    ],
    basketballSpecializationTraits: [{ code: 'SHOOTING_GRAVITY', startedOn: '2032-10-01' }],
  })
  const rivalRepertoire = createPlayerRepertoire({
    ...repertoire, playerId: rivalPlayerId,
  })
  const world = updateGameWorld(base, {
    currentDate: MONDAY,
    games: [],
    playerRepertoireByPlayerId: { [playerId]: repertoire, [rivalPlayerId]: rivalRepertoire },
  })
  return { world, own, rival, playerId, rivalPlayerId, repertoire }
}

describe('PLAYER 2.4-D4 controlled consumer views', () => {
  it('keeps all 60 historical moves explicitly mapped to already-existing training definitions', () => {
    const codes = Object.keys(REPERTOIRE_MOVE_TRAINING)
    expect(codes).toHaveLength(60)
    expect(new Set(codes).size).toBe(60)
    expect(REPERTOIRE_MOVE_TRAINING.CROSSOVER).toBe('ballControl')
    expect(REPERTOIRE_MOVE_TRAINING.STEPBACK).toBe('shotCreation')
    expect(REPERTOIRE_MOVE_TRAINING.HOOK_SHOT).toBe('postScoring')
    for (const moduleId of Object.values(REPERTOIRE_MOVE_TRAINING)) {
      expect(trainingDefinitionById(moduleId).scope).not.toBe('team')
    }
  })
  it('reveals verified repertoire ONLY to own roster; opponent technical values never leak through Scouting', () => {
    const { world, own, rival, playerId, rivalPlayerId, repertoire } = setup()
    const ownBrief = getRepertoireScoutingBrief(world, own.organizationId, playerId)
    expect(ownBrief.status).toBe('OWN_TEAM_VERIFIED')
    expect(ownBrief.technicalMoves).toContainEqual({ code: 'CROSSOVER', proficiency: 34, usageTendency: 70 })
    expect(ownBrief.contextualTraits).toContainEqual({ code: 'HIGH_MOTOR', strength: 87 })
    expect(ownBrief.basketballSpecializationTraits).toEqual(['SHOOTING_GRAVITY'])
    const opponentBrief = getRepertoireScoutingBrief(world, own.organizationId, rivalPlayerId)
    expect(opponentBrief).toMatchObject({
      status: 'OPPONENT_UNOBSERVED',
      technicalMoves: [],
      contextualTraits: [],
      basketballSpecializationTraits: [],
      suggestedMission: 'LIVE_GAME',
    })
    expect(getPlayerKnowledgeSummary(world, own.organizationId, rivalPlayerId))
      .toMatchObject({ repertoireStatus: 'OPPONENT_UNOBSERVED', suggestedRepertoireMission: 'LIVE_GAME' })
    const rivalOwnBrief = getRepertoireScoutingBrief(world, rival.organizationId, rivalPlayerId)
    expect(rivalOwnBrief.status).toBe('OWN_TEAM_VERIFIED')
    expect(JSON.stringify(opponentBrief)).not.toContain(repertoire.technicalMoves[0]!.code)
    expect(JSON.stringify(opponentBrief)).not.toContain('HIGH_MOTOR')
    const legacy = updateGameWorld(createNewGame(), { currentDate: MONDAY, games: [] })
    const old = getPlayerKnowledgeSummary(legacy, own.organizationId, playerId)
    expect(old).not.toHaveProperty('repertoireStatus')
    expect(getRepertoireScoutingBrief(legacy, own.organizationId, playerId).status).toBe('NO_SOURCE')
  }, 15_000)
  it('advises individual modules deterministically, without auto-scheduling, changing ratings or consuming fatigue', () => {
    const { world, own, playerId } = setup()
    const before = JSON.stringify(world)
    const advice = recommendRepertoireTraining(world, own.id, MONDAY)
    expect(advice.some(item => item.playerId === playerId && item.moveCode === 'CROSSOVER' && item.moduleId === 'ballControl')).toBe(true)
    expect(advice.some(item => item.playerId === playerId && item.moveCode === 'STEPBACK' && item.moduleId === 'shotCreation')).toBe(true)
    expect(advice.some(item => item.moveCode === 'EURO_STEP')).toBe(false) // proficiency already high
    expect(recommendRepertoireTraining(world, own.id, MONDAY)).toEqual(advice)
    const context = buildTrainingPlanningContext(world, own.id, MONDAY)
    expect(context.repertoireAdvice).toEqual(advice)
    expect(JSON.stringify(world)).toBe(before)
    expect(Object.keys(world.scheduledTrainingSessionsById)).toHaveLength(0)
  })
  it('never recommends training on match day, with high fatigue, out-of-position moves or future-dated evidence', () => {
    const { world, own, playerId, repertoire } = setup()
    const fatigued = updateGameWorld(world, { careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, [playerId]: 92 } })
    expect(recommendRepertoireTraining(fatigued, own.id, MONDAY).some(item => item.playerId === playerId)).toBe(false)
    const positionsOnly = createPlayerRepertoire({
      ...repertoire,
      technicalMoves: [{ code: 'HOOK_SHOT', proficiency: 20, usageTendency: 75, asOfOn: '2032-10-01' }],
    })
    // GameWorld's source immutability is active: changing imported facts fails closed.
    expect(() => updateGameWorld(world, { playerRepertoireByPlayerId: { ...world.playerRepertoireByPlayerId, [playerId]: positionsOnly } })).toThrow(/must not overwrite/)
    const fresh = createNewGame()
    const guard = Object.values(fresh.players).find(player => player.basketball.primaryPosition === 'PG')!
    const team = Object.values(fresh.teams).find(item => item.rosterPlayerIds.includes(guard.id))!
    const withPost = updateGameWorld(fresh, {
      currentDate: MONDAY, games: [],
      playerRepertoireByPlayerId: { [guard.id]: createPlayerRepertoire({ ...positionsOnly, playerId: guard.id }) },
    })
    expect(recommendRepertoireTraining(withPost, team.id, MONDAY).some(item => item.moveCode === 'HOOK_SHOT')).toBe(false)
    const future = createPlayerRepertoire({
      ...repertoire,
      technicalMoves: [{ code: 'CROSSOVER', proficiency: 20, usageTendency: 90, asOfOn: '2035-01-01' }],
    })
    const withFuture = updateGameWorld(fresh, {
      currentDate: MONDAY, games: [],
      playerRepertoireByPlayerId: { [guard.id]: createPlayerRepertoire({ ...future, playerId: guard.id }) },
    })
    expect(recommendRepertoireTraining(withFuture, team.id, MONDAY)).toEqual([])
  })
})
