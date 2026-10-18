import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createPlayerRepertoire, WORLDDB_PLAYER_REPERTOIRE_VERSION } from '@/domain/player/PlayerRepertoire'
import { createMatchState, type MatchState } from '@/engine/match-next'
import { createRngState } from '../rng'
import { integrateMatchPlayers } from '../movement/PlayerKinematics'
import { CROSSOVER_RULES_D5B } from './TechniqueRules'
import { attemptCrossoverOnDrive } from './TechniqueExecution'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'

function actualDrive(proficiency = 95, usageTendency = 100) {
  const world = createNewGame()
  const game = Object.values(world.games).find(item => item.status === 'scheduled')!
  const setup = createMatchEnginePort('match-next').prepare(world, game, 46111)
  const base = createMatchState(setup)
  const playerId = setup.initialLineups.home[0]!
  const defenderId = setup.initialLineups.away[0]!
  const driver = base.players.find(p => p.playerId === playerId)!
  const defender = base.players.find(p => p.playerId === defenderId)!
  const right = base.court.baskets.right
  const actorPoint = { x: right.x - 9, y: base.court.widthMeters / 2 }
  const guardPoint = { x: actorPoint.x + 1.1, y: actorPoint.y }
  const repertoire = createPlayerRepertoire({
    playerId,
    version: WORLDDB_PLAYER_REPERTOIRE_VERSION,
    contextualTraits: [],
    technicalMoves: [{ code: 'CROSSOVER', proficiency, usageTendency, asOfOn: world.currentDate }],
    basketballSpecializationTraits: [],
  })
  const actionId = 'match-action-technique-scene'
  const action = { id: actionId, kind: 'DRIVE' as const, playerId, teamId: driver.teamId, startedT: base.t,
    status: 'ACTIVE' as const, phase: 'DRIVING' as const, startPosition: actorPoint,
    targetBasket: right, target: { x: right.x - 1, y: right.y } }
  const scene: MatchState = {
    ...base,
    actions: [action],
    players: base.players.map(p => p.playerId === playerId
      ? { ...p, position: actorPoint, repertoire }
      : p.playerId === defenderId ? { ...p, position: guardPoint } : p),
    ball: { kind: 'HELD', ownerPlayerId: playerId, ownerTeamId: driver.teamId,
      position: actorPoint, heightMeters: 1.1, dribble: 'live' },
    defensiveStructure: {
      assignments: [{ attackerPlayerId: playerId, defenderPlayerId: defenderId }],
      onBallDefenderPlayerId: defenderId,
    } as unknown as NonNullable<MatchState['defensiveStructure']>,
  }
  return { scene, playerId, defenderId, actionId, right, driver, defender }
}

describe('PLAYER 2.4-D5B real spatial CROSSOVER', () => {
  it('attempts only once on a live active DRIVE with a defender in front and a real canonical move', () => {
    const { scene, playerId, defenderId, actionId, right } = actualDrive()
    const executed = attemptCrossoverOnDrive(scene, playerId, actionId, right)
    const recorded = executed.events.slice(scene.events.length)
    expect(recorded.map(e => e.type)).toEqual(['techniqueAttempted', 'techniqueResolved'])
    expect(recorded.every(e => e.actionId === actionId && e.moveCode === 'CROSSOVER' && e.victimPlayerId === defenderId)).toBe(true)
    expect(['EXECUTED', 'FAILED']).toContain(recorded[1]!.techniqueOutcome)
    expect(attemptCrossoverOnDrive(executed, playerId, actionId, right)).toBe(executed)

    const behind = { ...scene, players: scene.players.map(p => p.playerId === defenderId
      ? { ...p, position: { x: scene.players.find(x => x.playerId === playerId)!.position.x - 1.2, y: right.y } } : p) }
    expect(attemptCrossoverOnDrive(behind, playerId, actionId, right)).toBe(behind)
    const away = { ...scene, players: scene.players.map(p => p.playerId === defenderId
      ? { ...p, position: { x: right.x - 2.4, y: right.y } } : p) }
    expect(attemptCrossoverOnDrive(away, playerId, actionId, right)).toBe(away)
    const noRepertoire = { ...scene, players: scene.players.map(p => p.playerId === playerId
      ? { ...p, repertoire: undefined } : p) }
    expect(attemptCrossoverOnDrive(noRepertoire, playerId, actionId, right)).toBe(noRepertoire)
    const stopped = { ...scene, ball: { ...scene.ball, dribble: 'picked' as const } }
    expect(attemptCrossoverOnDrive(stopped, playerId, actionId, right)).toBe(stopped)
  }, 20_000)

  it('separates usage-based attempt frequency from proficiency-based physical execution', () => {
    const lowUsage = actualDrive(100, 0)
    expect(attemptCrossoverOnDrive(lowUsage.scene, lowUsage.playerId, lowUsage.actionId, lowUsage.right)).toBe(lowUsage.scene)
    const low = actualDrive(0, 100)
    const high = actualDrive(100, 100)
    let highMade = 0
    let lowMade = 0
    for (let seed = 1; seed <= 75; seed += 1) {
      const slow = attemptCrossoverOnDrive({ ...low.scene, rng: createRngState(seed) }, low.playerId, low.actionId, low.right)
      const fast = attemptCrossoverOnDrive({ ...high.scene, rng: createRngState(seed) }, high.playerId, high.actionId, high.right)
      expect(slow.events.at(-2)?.type).toBe('techniqueAttempted')
      expect(fast.events.at(-2)?.type).toBe('techniqueAttempted')
      lowMade += slow.events.at(-1)?.techniqueOutcome === 'EXECUTED' ? 1 : 0
      highMade += fast.events.at(-1)?.techniqueOutcome === 'EXECUTED' ? 1 : 0
    }
    expect(highMade).toBeGreaterThan(lowMade)
    expect(highMade).toBeGreaterThan(0)
    expect(lowMade).toBeLessThan(50)
  }, 20_000)

  it('executes a bounded and temporary real defender movement penalty, with no automatic basket', () => {
    const { scene, playerId, defenderId, actionId, right } = actualDrive(100, 100)
    const completed = Array.from({ length: 90 }, (_, index) => index + 1)
      .map(seed => attemptCrossoverOnDrive({ ...scene, rng: createRngState(seed) }, playerId, actionId, right))
      .find(state => state.events.at(-1)?.techniqueOutcome === 'EXECUTED')!
    expect(completed).toBeDefined()
    const defender = completed.players.find(p => p.playerId === defenderId)!
    expect(defender.techniqueBalanceUntilT).toBe(completed.t + CROSSOVER_RULES_D5B.maximumFootworkTicks)
    expect(completed.score).toEqual(scene.score)
    expect(completed.events.slice(scene.events.length).every(e => e.type.startsWith('technique'))).toBe(true)
    const movementIntent = { playerId: defenderId, target: { x: defender.position.x - 5, y: defender.position.y + 1 },
      urgency: 'sprint' as const, facing: { kind: 'BALL' as const },
      provenance: { owner: 'defensiveStructure' as const, responsibilityId: 'guard-action-1', decisionId: 'decision:guard-action-1' } }
    const untreated = integrateMatchPlayers({ ...scene, movementIntents: [movementIntent] })
    const affected = integrateMatchPlayers({ ...completed, movementIntents: [movementIntent] })
    const slow = affected.find(p => p.playerId === defenderId)!
    const regular = untreated.find(p => p.playerId === defenderId)!
    const displacement = (p: typeof regular) => Math.hypot(p.position.x - defender.position.x, p.position.y - defender.position.y)
    expect(displacement(slow)).toBeLessThan(displacement(regular))
    const expired = integrateMatchPlayers({ ...completed, t: completed.t + 7, movementIntents: [movementIntent] })
    expect(expired.find(p => p.playerId === defenderId)!.position).toEqual(regular.position)
  }, 20_000)
})
