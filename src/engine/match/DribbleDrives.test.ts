import { describe, expect, it } from 'vitest'

import { createGameWorld } from '@/domain/world'
import { distanceBetween, isInsideCourt } from '@/domain/court'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { generateWorld } from '@/engine/world'
import { type RandomSource } from '@/engine/random'
import {
  advanceDriveIntent,
  advancePlayerTowardTarget,
  assignBaseSpatialTargets,
  calculateDefensiveAssignments,
  controlBallByPlayer,
  createDriveTarget,
  detectDefensiveThreat,
  createMatchPlayerProfile,
  createMatchSession,
  driveMovementFactor,
  isSpatialStateInsideCourt,
  reduceDriveHandlerMovement,
  reduceScreenedDefenderMovement,
  resolveDefensiveReaction,
  screenIntersectsDefenderRoute,
  stepMatchSession,
  stepPlayersTowardBaseSpacing,
  substitutePlayer,
  type DriveIntent,
  type MatchPlayerProfiles,
  type SpatialState,
} from './index'

describe('ball-handler drive foundation', () => {
  it('uses the drive target instead of BaseSpacing and keeps the controlled ball with the moving handler', () => {
    const { session, state } = createFixture()
    const { handlerId, defenderId, basket, offenseKey } = participants(state)
    const baseProfiles = state.playerProfiles[offenseKey]
    const playerProfiles: MatchPlayerProfiles = {
      ...state.playerProfiles,
      [offenseKey]: baseProfiles.map((profile) => ({
        ...profile,
        tendencies: { ...profile.tendencies, ON_BALL_SCREENING_FREQUENCY: 1, CUT_FREQUENCY: 1, ...(profile.playerId === handlerId ? { DRIVE_FREQUENCY: 100 } : {}) },
      })),
    }
    const heldSpatial = controlBallByPlayer(state.spatial, handlerId)
    const target = createDriveTarget({ handlerId, defenderId, spatial: heldSpatial, attackingBasket: basket })
    const controlledSession = {
      ...session,
      random: new SequenceRandom([0.99], [0.99, 0]),
      decisionRandom: new SequenceRandom([], [0.99, 0.99, 0]),
      actorRandom: new FixedRandom(0),
      state: { ...state, spatial: heldSpatial, playerProfiles },
    }
    const result = stepMatchSession(controlledSession).session.state
    const handler = playerAt(result.spatial, handlerId)
    const baseStep = stepPlayersTowardBaseSpacing({ ...spacingInput(state, handlerId), playerProfiles, spatial: heldSpatial }, 8)

    expect(distanceBetween(handler.position, target)).toBeLessThan(distanceBetween(playerAt(heldSpatial, handlerId).position, target))
    expect(handler.position).not.toEqual(playerAt(baseStep, handlerId).position)
    expect(result.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: handlerId, teamId: state.attackingTeamId, position: handler.position })
    expect(isSpatialStateInsideCourt(result.spatial)).toBe(true)
  })

  it('uses a deterministic, court-valid near-rim target on the open side of the primary defender', () => {
    const { state } = createFixture()
    const { handlerId, defenderId, basket } = participants(state)
    const first = createDriveTarget({ handlerId, defenderId, spatial: state.spatial, attackingBasket: basket })
    const second = createDriveTarget({ handlerId, defenderId, spatial: state.spatial, attackingBasket: basket })

    expect(first).toEqual(second)
    expect(isInsideCourt(first, state.spatial.court)).toBe(true)
    expect(distanceBetween(first, basket)).toBeLessThan(3)
  })

  it('bounds the ball-handling movement penalty and preserves more speed for a stronger handler', () => {
    const { state } = createFixture()
    const { handlerId, defenderId, basket, offenseKey } = participants(state)
    const baselineProfiles = state.playerProfiles
    const baseProfile = baselineProfiles[offenseKey].find((profile) => profile.playerId === handlerId)!
    const withSkill = (ballHandling: number): MatchPlayerProfiles => ({
      ...baselineProfiles,
      [offenseKey]: baselineProfiles[offenseKey].map((profile) => profile.playerId === handlerId ? { ...profile, ballHandling } : profile),
    })
    const low = reduceDriveHandlerMovement(withSkill(0), handlerId)[offenseKey].find((profile) => profile.playerId === handlerId)!
    const high = reduceDriveHandlerMovement(withSkill(100), handlerId)[offenseKey].find((profile) => profile.playerId === handlerId)!
    const controlledSpatial = controlBallByPlayer(state.spatial, handlerId)
    const target = createDriveTarget({ handlerId, defenderId, spatial: controlledSpatial, attackingBasket: basket })
    const lowStep = advancePlayerTowardTarget(controlledSpatial, handlerId, target, 1, low.kinematics)
    const highStep = advancePlayerTowardTarget(controlledSpatial, handlerId, target, 1, high.kinematics)

    expect(driveMovementFactor(0)).toBe(0.85)
    expect(driveMovementFactor(100)).toBe(1)
    expect(low.kinematics.maxSpeedMps).toBeLessThan(high.kinematics.maxSpeedMps)
    expect(low.kinematics.maxSpeedMps).toBeCloseTo(baseProfile.kinematics.maxSpeedMps * 0.85)
    expect(low.kinematics.brakingMps2).toBe(baseProfile.kinematics.brakingMps2)
    expect(distanceBetween(playerAt(highStep, handlerId).position, playerAt(controlledSpatial, handlerId).position)).toBeGreaterThan(distanceBetween(playerAt(lowStep, handlerId).position, playerAt(controlledSpatial, handlerId).position))
  })

  it('lets a set screen create separation while the handler drives without adding a drive bonus', () => {
    const { state } = createFixture()
    const { handlerId, screenerId, defenderId, basket } = participants(state)
    const midpointY = state.spatial.court.widthMeters / 2
    const attackSign = basket.x > state.spatial.court.lengthMeters / 2 ? 1 : -1
    const handlerStart = { x: basket.x - attackSign * 10, y: midpointY }
    const defenderStart = { x: handlerStart.x - attackSign * 2, y: midpointY }
    let spatial = placePlayer(state.spatial, handlerId, handlerStart)
    spatial = placePlayer(spatial, defenderId, defenderStart)
    const input = { ...spacingInput(state, handlerId), spatial: controlBallByPlayer(spatial, handlerId) }
    const defenderTarget = assignBaseSpatialTargets(input).defensive.find((target) => target.playerId === defenderId)!.position
    const screenerStart = { x: (defenderStart.x + defenderTarget.x) / 2, y: (defenderStart.y + defenderTarget.y) / 2 }
    spatial = placePlayer(spatial, screenerId, screenerStart)
    const driveTarget = createDriveTarget({ handlerId, defenderId, spatial, attackingBasket: basket })
    const screenIntent = { screenerId, ballHandlerId: handlerId, defenderId, target: screenerStart, phase: 'set' as const, stepsRemaining: 1 }
    const screenAffectsDefender = screenIntersectsDefenderRoute({ screen: screenIntent, spatial, defenderTarget })
    const driveProfiles = reduceDriveHandlerMovement(state.playerProfiles, handlerId)
    const withoutScreen = stepPlayersTowardBaseSpacing({ ...input, spatial, playerProfiles: driveProfiles }, 1, [
      { playerId: handlerId, position: driveTarget },
      { playerId: screenerId, position: screenerStart },
    ])
    const withScreen = stepPlayersTowardBaseSpacing({ ...input, spatial, playerProfiles: reduceScreenedDefenderMovement(driveProfiles, defenderId) }, 1, [
      { playerId: handlerId, position: driveTarget },
      { playerId: screenerId, position: screenerStart },
    ])
    const separationWithoutScreen = distanceBetween(playerAt(withoutScreen, handlerId).position, playerAt(withoutScreen, defenderId).position)
    const separationWithScreen = distanceBetween(playerAt(withScreen, handlerId).position, playerAt(withScreen, defenderId).position)

    expect(screenAffectsDefender, JSON.stringify({ basket, handlerStart, defenderStart, defenderTarget, screenerStart })).toBe(true)
    expect(separationWithScreen).toBeGreaterThan(separationWithoutScreen)
  })

  it('ends at arrival or timeout and cancels on a changed handler, possession flip or participant substitution', () => {
    const { session, state } = createFixture()
    const { handlerId, defenderId, basket, offenseKey, defenseKey, screenerId } = participants(state)
    const target = createDriveTarget({ handlerId, defenderId, spatial: state.spatial, attackingBasket: basket })
    const drive: DriveIntent = { handlerId, defenderId, target, stepsRemaining: 3 }
    expect(advanceDriveIntent(drive, placePlayer(state.spatial, handlerId, target))).toBeUndefined()
    expect(advanceDriveIntent({ ...drive, stepsRemaining: 1 }, state.spatial)).toBeUndefined()

    const withDrive = { ...session, state: { ...state, spatial: controlBallByPlayer(state.spatial, handlerId), driveIntent: drive } }
    const handlerBenchId = state.squads[offenseKey].find((id) => !state.activeLineups[offenseKey].includes(id))!
    const defenderBenchId = state.squads[defenseKey].find((id) => !state.activeLineups[defenseKey].includes(id))!
    expect(substitutePlayer(withDrive, { teamId: state.attackingTeamId, playerOutId: handlerId, playerInId: handlerBenchId }).state.driveIntent).toBeUndefined()
    const defenseTeamId = state.attackingTeamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId
    expect(substitutePlayer(withDrive, { teamId: defenseTeamId, playerOutId: defenderId, playerInId: defenderBenchId }).state.driveIntent).toBeUndefined()

    const nextHandlerId = state.activeLineups[offenseKey][1]!
    const handlerChanged = { ...withDrive, state: { ...withDrive.state, spatial: controlBallByPlayer(withDrive.state.spatial, nextHandlerId) } }
    expect(stepMatchSession(handlerChanged).session.state.driveIntent).toBeUndefined()

    const possessionFlip = {
      ...withDrive,
      random: new FixedRandom(0),
      actorRandom: new FixedRandom(0.99),
      state: { ...withDrive.state, defensiveReaction: { defenderId, protectedPlayerId: screenerId, threatPlayerId: handlerId, type: 'drive' as const, target: basket, phase: 'HELP' as const } },
    }
    const flippedState = stepMatchSession(possessionFlip).session.state
    expect(flippedState.driveIntent).toBeUndefined()
    expect(flippedState.defensiveReaction).toBeUndefined()
  })

  it('sends one secondary defender to help on a drive, exposes an assignment, then recovers through BaseSpacing', () => {
    const { session, state } = createFixture()
    const { handlerId, defenderId, basket, offenseKey, defenseKey } = participants(state)
    const centerY = state.spatial.court.widthMeters / 2
    const attackDirection = basket.x > state.spatial.court.lengthMeters / 2 ? 1 : -1
    const spatial = controlBallByPlayer(placePlayer(state.spatial, handlerId, { x: basket.x - attackDirection * 6, y: centerY }), handlerId)
    const target = createDriveTarget({ handlerId, defenderId, spatial, attackingBasket: basket })
    const drive: DriveIntent = { handlerId, defenderId, target, stepsRemaining: 3 }
    const liveProfiles: MatchPlayerProfiles = {
      ...state.playerProfiles,
      [offenseKey]: state.playerProfiles[offenseKey].map((profile) => profile.playerId === handlerId
        ? { ...profile, tendencies: { ...profile.tendencies, PASS_FIRST_BIAS: 100 } }
        : profile),
    }
    const live = {
      ...session,
      random: new SequenceRandom([0.26, 0], []),
      decisionRandom: new FixedRandom(0.99),
      actorRandom: new FixedRandom(0),
      state: { ...state, spatial, playerProfiles: liveProfiles, driveIntent: drive },
    }
    const lineup = state.activeLineups[offenseKey]
    const defenders = state.activeLineups[defenseKey]
    const assignments = calculateDefensiveAssignments(lineup, defenders, [...state.playerProfiles.home, ...state.playerProfiles.away], state.defensiveMatchups?.[defenseKey])
    const baseInput = { ...spacingInput(state, handlerId), spatial, activeLineups: state.activeLineups }
    const baseTargets = assignBaseSpatialTargets(baseInput)
    const threat = detectDefensiveThreat({ drive: { playerId: handlerId, target }, spatial, attackingBasket: basket })
    const reaction = resolveDefensiveReaction({ threat, assignments, defensiveLineup: defenders, baseTargets, spatial, attackingBasket: basket }).reaction!
    const withoutHelp = stepPlayersTowardBaseSpacing(baseInput, 12, [{ playerId: handlerId, position: target }])
    const withHelp = stepPlayersTowardBaseSpacing(baseInput, 12, [
      { playerId: handlerId, position: target },
      { playerId: reaction.defenderId, position: reaction.target },
      ...(reaction.rotationDefenderId === undefined || reaction.rotationTarget === undefined ? [] : [{ playerId: reaction.rotationDefenderId, position: reaction.rotationTarget }]),
    ])
    const result = stepMatchSession(live).session.state
    const helperAfter = playerAt(result.spatial, reaction.defenderId)
    const protectedPosition = playerAt(result.spatial, reaction.protectedPlayerId).position

    expect(reaction.phase).toBe('HELP')
    expect(reaction.defenderId).not.toBe(defenderId)
    expect(result.spatial.players.find((player) => player.playerId === reaction.defenderId)!.position).not.toEqual(
      playerAt(withoutHelp, reaction.defenderId).position,
    )
    expect(distanceBetween(helperAfter.position, playerAt(result.spatial, handlerId).position)).toBeLessThan(
      distanceBetween(playerAt(withoutHelp, reaction.defenderId).position, playerAt(withoutHelp, handlerId).position),
    )
    expect(distanceBetween(helperAfter.position, protectedPosition)).toBeGreaterThan(
      distanceBetween(playerAt(withoutHelp, reaction.defenderId).position, playerAt(withoutHelp, reaction.protectedPlayerId).position),
    )
    expect(reaction.rotationDefenderId).toBeDefined()
    expect(reaction.rotationDefenderId).not.toBe(reaction.defenderId)
    expect(distanceBetween(playerAt(withHelp, reaction.rotationDefenderId!).position, playerAt(spatial, reaction.protectedPlayerId).position)).toBeLessThan(
      distanceBetween(playerAt(withoutHelp, reaction.rotationDefenderId!).position, playerAt(spatial, reaction.protectedPlayerId).position),
    )
    expect(resolveDefensiveReaction({ previous: reaction, assignments, defensiveLineup: defenders, baseTargets, spatial: result.spatial, attackingBasket: basket }).reaction?.phase).toBe('RECOVER')

    const recoverInput = { ...baseInput, spatial: result.spatial, ballHandlerId: result.spatial.ball.kind === 'playerControlled' ? result.spatial.ball.playerId : undefined }
    const recoverTargets = assignBaseSpatialTargets(recoverInput).defensive
    const beforeRecovery = distanceBetween(helperAfter.position, recoverTargets.find((entry) => entry.playerId === reaction.defenderId)!.position)
    const recoveredSpatial = stepPlayersTowardBaseSpacing(recoverInput, 12)
    expect(distanceBetween(playerAt(recoveredSpatial, reaction.defenderId).position, recoverTargets.find((entry) => entry.playerId === reaction.defenderId)!.position)).toBeLessThan(beforeRecovery)
  })

  it('does not react to ordinary spacing or a pop and clears help references on substitution', () => {
    const { session, state } = createFixture()
    const { handlerId, defenderId, basket, offenseKey, defenseKey } = participants(state)
    const defenders = state.activeLineups[defenseKey]
    const assignments = calculateDefensiveAssignments(state.activeLineups[offenseKey], defenders, [...state.playerProfiles.home, ...state.playerProfiles.away])
    expect(detectDefensiveThreat({ spatial: state.spatial, attackingBasket: basket })).toBeUndefined()
    expect(detectDefensiveThreat({ roll: { playerId: state.activeLineups[offenseKey][1]!, action: 'pop', target: basket }, spatial: state.spatial, attackingBasket: basket })).toBeUndefined()
    const attackDirection = basket.x > state.spatial.court.lengthMeters / 2 ? 1 : -1
    const nearRim = placePlayer(state.spatial, state.activeLineups[offenseKey][1]!, { x: basket.x - attackDirection * 4, y: state.spatial.court.widthMeters / 2 })
    const rimwardTarget = { x: basket.x - attackDirection * 1.5, y: state.spatial.court.widthMeters / 2 }
    expect(detectDefensiveThreat({ drive: { playerId: state.activeLineups[offenseKey][1]!, target: { x: basket.x - attackDirection * 6, y: state.spatial.court.widthMeters / 2 } }, spatial: nearRim, attackingBasket: basket })).toBeUndefined()
    expect(detectDefensiveThreat({ cut: { playerId: state.activeLineups[offenseKey][1]!, type: 'rimCut', target: rimwardTarget }, spatial: nearRim, attackingBasket: basket })).toMatchObject({ type: 'rimCut' })
    expect(detectDefensiveThreat({ roll: { playerId: state.activeLineups[offenseKey][1]!, action: 'roll', target: rimwardTarget }, spatial: nearRim, attackingBasket: basket })).toMatchObject({ type: 'roll' })
    const farAway = placePlayer(state.spatial, handlerId, { x: basket.x - attackDirection * 12, y: state.spatial.court.widthMeters / 2 })
    expect(detectDefensiveThreat({ drive: { playerId: handlerId, target: { x: basket.x - attackDirection * 2.25, y: basket.y } }, spatial: farAway, attackingBasket: basket })).toBeUndefined()

    const helperId = defenders.find((id) => id !== defenderId)!
    const protectedId = assignments.find((assignment) => assignment.defensivePlayerId === helperId)!.offensivePlayerId
    const reaction = { defenderId: helperId, protectedPlayerId: protectedId, threatPlayerId: handlerId, type: 'drive' as const, target: playerAt(state.spatial, handlerId).position, phase: 'HELP' as const }
    const withReaction = { ...session, state: { ...state, defensiveReaction: reaction } }
    const benchId = state.squads[defenseKey].find((id) => !state.activeLineups[defenseKey].includes(id))!
    expect(substitutePlayer(withReaction, { teamId: defenseKey === 'home' ? state.homeTeamId : state.awayTeamId, playerOutId: helperId, playerInId: benchId }).state.defensiveReaction).toBeUndefined()
  })
})

function createFixture() {
  const generated = generateWorld({ seed: 54321, gender: 'female' })
  const games = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  const world = createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), staffPeople: Object.values(generated.staffPeopleById), teamStaffAssignments: Object.values(generated.teamStaffAssignmentsById), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games })
  const game = games[0]!
  const lineups = { home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5), away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5) }
  const squads = { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds }
  const playerProfiles: MatchPlayerProfiles = {
    home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)),
    away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)),
  }
  const session = createMatchSession({ world, gameId: game.id, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, squads, playerProfiles, lineups, random: new FixedRandom(0), decisionRandom: new FixedRandom(0.99), actorRandom: new FixedRandom(0.99) })
  return { session, state: session.state }
}

function participants(state: ReturnType<typeof createFixture>['state']) {
  const offenseKey: 'home' | 'away' = state.attackingTeamId === state.homeTeamId ? 'home' : 'away'
  const defenseKey: 'home' | 'away' = offenseKey === 'home' ? 'away' : 'home'
  const lineup = state.activeLineups[offenseKey]
  const defense = state.activeLineups[defenseKey]
  const handlerId = lineup[0]!
  const defenderId = calculateDefensiveAssignments(lineup, defense, [...state.playerProfiles.home, ...state.playerProfiles.away], state.defensiveMatchups?.[defenseKey]).find((matchup) => matchup.offensivePlayerId === handlerId)!.defensivePlayerId
  return { offenseKey, defenseKey, handlerId, screenerId: lineup[1]!, defenderId, basket: offenseKey === 'home' ? state.spatial.court.baskets.right : state.spatial.court.baskets.left }
}

function spacingInput(state: ReturnType<typeof createFixture>['state'], handlerId: MatchPlayerProfiles['home'][number]['playerId']) {
  return { homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, attackingTeamId: state.attackingTeamId, period: state.period, activeLineups: state.activeLineups, playerProfiles: state.playerProfiles, spatial: controlBallByPlayer(state.spatial, handlerId), ballHandlerId: handlerId }
}

function placePlayer(spatial: SpatialState, playerId: SpatialState['players'][number]['playerId'], position: SpatialState['players'][number]['position']): SpatialState {
  return { ...spatial, players: spatial.players.map((player) => player.playerId === playerId ? { ...player, position } : player) }
}

function playerAt(spatial: SpatialState, playerId: SpatialState['players'][number]['playerId']) { return spatial.players.find((player) => player.playerId === playerId)! }

class FixedRandom implements RandomSource {
  public constructor(private readonly value: number) {}
  public next(): number { return this.value }
  public nextInt(minInclusive: number): number { return minInclusive }
  public nextFloat(minInclusive: number): number { return minInclusive }
  public chance(probability: number): boolean { return this.value < probability }
  public pick<Item>(items: readonly Item[]): Item { return items[0]! }
}

class SequenceRandom implements RandomSource {
  public constructor(private readonly nextValues: number[], private readonly chanceValues: number[]) {}
  public next(): number { return this.nextValues.shift() ?? 0.99 }
  public nextInt(minInclusive: number): number { return minInclusive }
  public nextFloat(minInclusive: number): number { return minInclusive }
  public chance(probability: number): boolean { return (this.chanceValues.shift() ?? 0.99) < probability }
  public pick<Item>(items: readonly Item[]): Item { return items[0]! }
}
