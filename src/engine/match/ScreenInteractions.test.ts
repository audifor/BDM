import { describe, expect, it } from 'vitest'

import { createGameWorld } from '@/domain/world'
import { distanceFromBasket, isBeyondThreePointLine, isInsideCourt } from '@/domain/court'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { generateWorld } from '@/engine/world'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { advanceScreenIntent, applyTacticalPlanChange, assignBaseSpatialTargets, calculateDefensiveAssignments, controlBallByPlayer, createDefaultTacticalPlan, createMatchPlayerProfile, createMatchSession, createPostScreenIntent, createPostScreenTarget, createScreenIntent, coverageForCurrentScreen, reduceScreenedDefenderMovement, resolveDefensiveReaction, screenIntersectsDefenderRoute, selectScreenScreener, stepMatchSession, stepPlayersTowardBaseSpacing, substitutePlayer, type MatchPlayerProfiles, type MatchTacticalPlan, type ScreenIntent, type SpatialState } from './index'

describe('on-ball screen spatial foundation', () => {
  it('moves an eligible screener away from BaseSpacing toward a court-valid target with MG6B kinematics', () => {
    const { state } = createFixture()
    const { handlerId, screenerId, defenderId, basket, offenseKey } = participants(state)
    const lineup = state.activeLineups[offenseKey]
    const screenProfiles = state.playerProfiles[offenseKey].map((profile) => ({ ...profile, tendencies: { ...profile.tendencies, ON_BALL_SCREENING_FREQUENCY: 100 } }))
    const selectedScreener = selectScreenScreener(lineup, screenProfiles, handlerId, screenerId, new SeededRandomSource(2468))
    expect(selectedScreener).toBe(selectScreenScreener(lineup, screenProfiles, handlerId, screenerId, new SeededRandomSource(2468)))
    expect(selectedScreener).not.toBe(handlerId)
    expect(selectedScreener).not.toBe(screenerId)
    const intent = createScreenIntent({ screenerId, ballHandlerId: handlerId, defenderId, spatial: state.spatial, attackingBasket: basket })
    const input = spacingInput(state, handlerId)
    const base = stepPlayersTowardBaseSpacing(input, 0.5)
    const screened = stepPlayersTowardBaseSpacing(input, 0.5, [{ playerId: screenerId, position: intent.target }])
    const before = playerAt(state.spatial, screenerId)
    const after = playerAt(screened, screenerId)

    expect(intent.target.x).toBeGreaterThanOrEqual(0)
    expect(intent.target.x).toBeLessThanOrEqual(state.spatial.court.lengthMeters)
    expect(intent.target.y).toBeGreaterThanOrEqual(0)
    expect(intent.target.y).toBeLessThanOrEqual(state.spatial.court.widthMeters)
    expect(distance(after.position, intent.target)).toBeLessThan(distance(before.position, intent.target))
    expect(after.position).not.toEqual(playerAt(base, screenerId).position)
    expect(state.playerProfiles[offenseKey].find((profile) => profile.playerId === screenerId)!.kinematics.maxSpeedMps).toBeGreaterThan(0)
  })

  it('sets on arrival and slows only a defender whose BaseSpacing route crosses the set screen', () => {
    const { state } = createFixture()
    const { handlerId, screenerId, defenderId, basket } = participants(state)
    const intent = createScreenIntent({ screenerId, ballHandlerId: handlerId, defenderId, spatial: state.spatial, attackingBasket: basket })
    const atTarget = placePlayer(state.spatial, screenerId, intent.target)
    const setScreen = advanceScreenIntent(intent, atTarget)
    expect(setScreen).toMatchObject({ phase: 'set', stepsRemaining: 2 })
    expect(advanceScreenIntent(setScreen, atTarget)).toMatchObject({ phase: 'set', stepsRemaining: 1 })
    expect(advanceScreenIntent({ ...setScreen!, stepsRemaining: 1 }, atTarget)).toBeUndefined()

    const input = spacingInput(state, handlerId)
    const defenderTarget = assignBaseSpatialTargets(input).defensive.find((target) => target.playerId === defenderId)!.position
    const defenderStart = { x: defenderTarget.x + (defenderTarget.x < state.spatial.court.lengthMeters / 2 ? 2 : -2), y: defenderTarget.y }
    const routeMidpoint = { x: (defenderStart.x + defenderTarget.x) / 2, y: defenderTarget.y }
    const routeSpatial = placePlayer(placePlayer(state.spatial, defenderId, defenderStart), screenerId, routeMidpoint)
    const routeScreen: ScreenIntent = { ...setScreen!, target: routeMidpoint }
    expect(screenIntersectsDefenderRoute({ screen: routeScreen, spatial: routeSpatial, defenderTarget })).toBe(true)

    const reducedProfiles = reduceScreenedDefenderMovement(state.playerProfiles, defenderId)
    const baselineStep = stepPlayersTowardBaseSpacing({ ...input, spatial: routeSpatial }, 0.5)
    const screenedStep = stepPlayersTowardBaseSpacing({ ...input, playerProfiles: reducedProfiles, spatial: routeSpatial }, 0.5)
    const baselineProgress = distance(playerAt(routeSpatial, defenderId).position, playerAt(baselineStep, defenderId).position)
    const screenedProgress = distance(playerAt(routeSpatial, defenderId).position, playerAt(screenedStep, defenderId).position)
    expect(screenedProgress).toBeGreaterThan(0)
    expect(screenedProgress).toBeLessThan(baselineProgress)

    const farSpatial = placePlayer(routeSpatial, screenerId, farCornerFrom(routeSpatial, defenderStart, defenderTarget))
    const farScreenAffectsDefender = screenIntersectsDefenderRoute({ screen: routeScreen, spatial: farSpatial, defenderTarget })
    expect(farScreenAffectsDefender).toBe(false)
    const farProfiles = farScreenAffectsDefender ? reduceScreenedDefenderMovement(state.playerProfiles, defenderId) : state.playerProfiles
    expect(farProfiles).toEqual(state.playerProfiles)
  })

  it('cancels on possession or handler changes and when any screen participant is substituted', () => {
    const { session, state } = createFixture()
    const { handlerId, screenerId, defenderId, basket, offenseKey, defenseKey } = participants(state)
    const screenerDefenderId = calculateDefensiveAssignments(state.activeLineups[offenseKey], state.activeLineups[defenseKey], [...state.playerProfiles.home, ...state.playerProfiles.away], state.defensiveMatchups?.[defenseKey]).find((assignment) => assignment.offensivePlayerId === screenerId)!.defensivePlayerId
    const intent = createScreenIntent({ screenerId, ballHandlerId: handlerId, defenderId, screenerDefenderId, spatial: state.spatial, attackingBasket: basket })
    const heldSpatial = controlBallByPlayer(state.spatial, handlerId)
    const sessionWithScreen = { ...session, state: { ...state, spatial: heldSpatial, screenIntent: { ...intent, phase: 'postScreen' as const, stepsRemaining: 2, postScreenAction: 'roll' as const, postScreenTarget: intent.target } } }
    const screenOutId = screenerId
    const screenOutBenchId = state.squads[offenseKey].find((id) => !state.activeLineups[offenseKey].includes(id))!
    expect(substitutePlayer(sessionWithScreen, { teamId: state.attackingTeamId, playerOutId: screenOutId, playerInId: screenOutBenchId }).state.screenIntent).toBeUndefined()

    const handlerBenchId = state.squads[offenseKey].find((id) => !state.activeLineups[offenseKey].includes(id))!
    expect(substitutePlayer(sessionWithScreen, { teamId: state.attackingTeamId, playerOutId: handlerId, playerInId: handlerBenchId }).state.screenIntent).toBeUndefined()
    const defenderBenchId = state.squads[defenseKey].find((id) => !state.activeLineups[defenseKey].includes(id))!
    const defendingTeamId = state.attackingTeamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId
    expect(substitutePlayer(sessionWithScreen, { teamId: defendingTeamId, playerOutId: defenderId, playerInId: defenderBenchId }).state.screenIntent).toBeUndefined()
    expect(substitutePlayer(sessionWithScreen, { teamId: defendingTeamId, playerOutId: screenerDefenderId, playerInId: defenderBenchId }).state.screenIntent).toBeUndefined()

    const flippedSession = { ...sessionWithScreen, random: new FixedRandom(0) }
    expect(stepMatchSession(flippedSession).session.state.screenIntent).toBeUndefined()

    const newHandlerId = state.activeLineups[offenseKey][1]!
    const handlerChanged = { ...sessionWithScreen, state: { ...sessionWithScreen.state, spatial: controlBallByPlayer(heldSpatial, newHandlerId) }, decisionRandom: new FixedRandom(0.99) }
    expect(stepMatchSession(handlerChanged).session.state.screenIntent).toBeUndefined()
  })

  it('enters post-screen only after SET expires and controls roll versus pop from canonical tendencies', () => {
    const { state } = createFixture()
    const { handlerId, screenerId, defenderId, basket, offenseKey } = participants(state)
    const setIntent = { ...createScreenIntent({ screenerId, ballHandlerId: handlerId, defenderId, spatial: state.spatial, attackingBasket: basket }), phase: 'set' as const, stepsRemaining: 1 }
    const baseProfile = state.playerProfiles[offenseKey].find((profile) => profile.playerId === screenerId)!
    const rollProfile = { ...baseProfile, tendencies: { ...baseProfile.tendencies, PICK_AND_ROLL_ROLL_FREQUENCY: 100, PICK_AND_POP_FREQUENCY: 1 } }
    const popProfile = { ...baseProfile, tendencies: { ...baseProfile.tendencies, PICK_AND_ROLL_ROLL_FREQUENCY: 1, PICK_AND_POP_FREQUENCY: 100 } }

    expect(advanceScreenIntent(setIntent, state.spatial)).toBeUndefined()
    const rollIntent = createPostScreenIntent({ intent: setIntent, spatial: state.spatial, attackingBasket: basket, screener: rollProfile, random: new FixedRandom(0) })
    const popIntent = createPostScreenIntent({ intent: setIntent, spatial: state.spatial, attackingBasket: basket, screener: popProfile, random: new FixedRandom(0.99) })
    expect(rollIntent).toMatchObject({ phase: 'postScreen', postScreenAction: 'roll' })
    expect(popIntent).toMatchObject({ phase: 'postScreen', postScreenAction: 'pop' })
  })

  it('persists the post-screen choice through MatchEngine when a SET screen window expires', () => {
    const { session, state } = createFixture()
    const { handlerId, screenerId, defenderId, basket, offenseKey } = participants(state)
    const screen = { ...createScreenIntent({ screenerId, ballHandlerId: handlerId, defenderId, spatial: state.spatial, attackingBasket: basket }), phase: 'set' as const, stepsRemaining: 1 }
    const heldSpatial = controlBallByPlayer(state.spatial, handlerId)
    const playerProfiles = {
      ...state.playerProfiles,
      [offenseKey]: state.playerProfiles[offenseKey].map((profile) => profile.playerId === screenerId
        ? { ...profile, tendencies: { ...profile.tendencies, PICK_AND_ROLL_ROLL_FREQUENCY: 100, PICK_AND_POP_FREQUENCY: 1 } }
        : profile),
    }
    const sessionWithSet = {
      ...session,
      random: new SequenceRandom([0.99], [0.99, 0]),
      decisionRandom: new FixedRandom(0),
      actorRandom: new FixedRandom(0),
      state: { ...state, spatial: heldSpatial, playerProfiles, screenIntent: screen },
    }

    const stepped = stepMatchSession(sessionWithSet).session.state.screenIntent
    expect(stepped).toMatchObject({ phase: 'postScreen', postScreenAction: 'roll' })
  })

  it('moves a roller toward a near-hoop target and keeps a pop target farther out on this court arc', () => {
    const { state } = createFixture()
    const { handlerId, screenerId, defenderId, basket } = participants(state)
    const screen = createScreenIntent({ screenerId, ballHandlerId: handlerId, defenderId, spatial: state.spatial, attackingBasket: basket })
    const rollTarget = createPostScreenTarget({ action: 'roll', intent: screen, spatial: state.spatial, attackingBasket: basket })
    const popTarget = createPostScreenTarget({ action: 'pop', intent: screen, spatial: state.spatial, attackingBasket: basket })
    const rollIntent: ScreenIntent = { ...screen, phase: 'postScreen', stepsRemaining: 4, postScreenAction: 'roll', postScreenTarget: rollTarget }
    const before = playerAt(state.spatial, screenerId)
    const moved = stepPlayersTowardBaseSpacing(spacingInput(state, handlerId), 0.5, [{ playerId: screenerId, position: rollTarget }])

    expect(rollTarget).not.toEqual(popTarget)
    expect(distanceFromBasket(rollTarget, basket)).toBeLessThan(distanceFromBasket(popTarget, basket))
    expect(isInsideCourt(rollTarget, state.spatial.court)).toBe(true)
    expect(isInsideCourt(popTarget, state.spatial.court)).toBe(true)
    expect(isBeyondThreePointLine(popTarget, basket, state.spatial.court)).toBe(true)
    expect(distance(playerAt(moved, screenerId).position, rollTarget)).toBeLessThan(distance(before.position, rollTarget))

    const arrived = placePlayer(state.spatial, screenerId, popTarget)
    const popIntent: ScreenIntent = { ...rollIntent, postScreenAction: 'pop', postScreenTarget: popTarget }
    expect(advanceScreenIntent(popIntent, arrived)).toBeUndefined()
    const spacingResumes = stepPlayersTowardBaseSpacing({ ...spacingInput(state, handlerId), spatial: arrived }, 0.5)
    expect(playerAt(spacingResumes, screenerId).position).not.toEqual(popTarget)
  })

  it('derives distinct P&R coverages from the current tactical plan and active screen', () => {
    const { session, state } = createFixture()
    const { handlerId, screenerId, defenderId, basket, offenseKey, defenseKey } = participants(state)
    const baseScreen = createScreenIntent({ screenerId, ballHandlerId: handlerId, defenderId, spatial: state.spatial, attackingBasket: basket })
    const spatial = controlBallByPlayer(placePlayer(state.spatial, screenerId, baseScreen.target), handlerId)
    const screen: ScreenIntent = { ...baseScreen, phase: 'set', stepsRemaining: 2 }
    const offense = state.activeLineups[offenseKey]
    const defense = state.activeLineups[defenseKey]
    const assignments = calculateDefensiveAssignments(offense, defense, [...state.playerProfiles.home, ...state.playerProfiles.away], state.defensiveMatchups?.[defenseKey])
    const effective = (coverage: NonNullable<MatchTacticalPlan['defense']['pickAndRollCoverage']>) => ({
      ...createDefaultTacticalPlan(),
      defense: { ...createDefaultTacticalPlan().defense, pickAndRollCoverage: coverage },
    })
    const resolutions = new Map(['switch', 'drop', 'hedge', 'blitz'].map((coverage) => {
      const plan = effective(coverage as NonNullable<MatchTacticalPlan['defense']['pickAndRollCoverage']>)
      return [coverage, coverageForCurrentScreen({ plan, screen, offensiveLineup: offense, defensiveLineup: defense, assignments, spatial, attackingBasket: basket })!] as const
    }))
    const switchCoverage = resolutions.get('switch')!
    const handlerDefenderId = assignments.find((assignment) => assignment.offensivePlayerId === handlerId)!.defensivePlayerId
    const screenerDefenderId = assignments.find((assignment) => assignment.offensivePlayerId === screenerId)!.defensivePlayerId

    expect(switchCoverage.assignments.find((assignment) => assignment.offensivePlayerId === handlerId)?.defensivePlayerId).toBe(screenerDefenderId)
    expect(switchCoverage.assignments.find((assignment) => assignment.offensivePlayerId === screenerId)?.defensivePlayerId).toBe(handlerDefenderId)
    expect(resolutions.get('drop')!.targetOverrides).toHaveLength(1)
    expect(resolutions.get('hedge')!.targetOverrides).toHaveLength(1)
    expect(resolutions.get('blitz')!.targetOverrides).toHaveLength(2)
    expect(resolutions.get('blitz')!.targetOverrides[0]!.position).not.toEqual(resolutions.get('blitz')!.targetOverrides[1]!.position)
    const dropTarget = resolutions.get('drop')!.targetOverrides[0]!.position
    const hedgeTarget = resolutions.get('hedge')!.targetOverrides[0]!.position
    const blitzTarget = resolutions.get('blitz')!.targetOverrides.find((target) => target.playerId === screenerDefenderId)!.position
    expect(distance(dropTarget, basket)).toBeLessThan(distance(hedgeTarget, basket))
    expect(distance(dropTarget, basket)).toBeLessThan(distance(blitzTarget, basket))
    expect(distance(hedgeTarget, playerAt(spatial, handlerId).position)).toBeLessThan(distance(hedgeTarget, playerAt(spatial, screenerId).position))
    expect(distance(blitzTarget, playerAt(spatial, handlerId).position)).toBeLessThan(distance(blitzTarget, playerAt(spatial, screenerId).position))
    for (const resolution of resolutions.values()) for (const target of resolution.targetOverrides) expect(isInsideCourt(target.position, spatial.court)).toBe(true)
    expect(new Set([...resolutions.values()].map((resolution) => JSON.stringify(resolution.targetOverrides))).size).toBe(4)
    const coverageMovements = [...resolutions.values()].flatMap((resolution) => resolution.targetOverrides.map((target) => {
      const moved = stepPlayersTowardBaseSpacing({ ...spacingInput({ ...state, spatial }, handlerId), spatial }, 0.5, resolution.targetOverrides)
      expect(distance(playerAt(moved, target.playerId).position, target.position)).toBeLessThan(distance(playerAt(spatial, target.playerId).position, target.position))
      return playerAt(moved, target.playerId).position
    }))
    expect(new Set(coverageMovements.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)).size).toBeGreaterThan(3)

    const rollTarget = createPostScreenTarget({ action: 'roll', intent: screen, spatial, attackingBasket: basket })
    const postScreen = { ...screen, phase: 'postScreen' as const, postScreenAction: 'roll' as const, postScreenTarget: rollTarget }
    const hedgeRecovery = coverageForCurrentScreen({ plan: effective('hedge'), screen: postScreen, offensiveLineup: offense, defensiveLineup: defense, assignments, spatial, attackingBasket: basket })!
    expect(hedgeRecovery.state.phase).toBe('RECOVER')
    expect(hedgeRecovery.targetOverrides).toEqual([])
    expect(coverageForCurrentScreen({ plan: effective('blitz'), screen: undefined, offensiveLineup: offense, defensiveLineup: defense, assignments, spatial, attackingBasket: basket })).toBeUndefined()
    expect(coverageForCurrentScreen({ plan: effective('blitz'), screen, offensiveLineup: offense, defensiveLineup: defense, assignments, spatial: controlBallByPlayer(spatial, offense[1]!), attackingBasket: basket })).toBeUndefined()
    expect(coverageForCurrentScreen({ plan: effective('blitz'), screen, offensiveLineup: offense, defensiveLineup: defense, assignments, spatial: controlBallByPlayer(spatial, defense[0]!), attackingBasket: basket })).toBeUndefined()
    expect(coverageForCurrentScreen({ plan: effective('blitz'), screen, offensiveLineup: offense.filter((id) => id !== screenerId), defensiveLineup: defense, assignments, spatial, attackingBasket: basket })).toBeUndefined()

    const blitz = resolutions.get('blitz')!
    const spacing = assignBaseSpatialTargets(spacingInput({ ...state, spatial }, handlerId))
    const help = resolveDefensiveReaction({
      threat: { playerId: handlerId, type: 'drive', target: basket },
      assignments,
      defensiveLineup: defense,
      excludedDefenderIds: blitz.committedDefenderIds,
      baseTargets: spacing,
      spatial,
      attackingBasket: basket,
    }).reaction!
    expect(blitz.committedDefenderIds).not.toContain(help.defenderId)
    expect(blitz.committedDefenderIds).not.toContain(help.rotationDefenderId)

    const defensiveTeamId = defenseKey === 'home' ? state.homeTeamId : state.awayTeamId
    const blitzPlan = effective('blitz')
    const coachedSession = applyTacticalPlanChange(session, { teamId: defensiveTeamId, tacticalPlan: blitzPlan })
    const coachingSide = defenseKey
    expect(coachedSession.state.coachingState[coachingSide].currentTacticalPlan.defense.pickAndRollCoverage).toBe('blitz')
    expect(coverageForCurrentScreen({ plan: coachedSession.state.coachingState[coachingSide].currentTacticalPlan, screen, offensiveLineup: offense, defensiveLineup: defense, assignments, spatial, attackingBasket: basket })?.state.type).toBe('blitz')
  })
})

function createFixture() {
  const generated = generateWorld({ seed: 12345, gender: 'female' })
  const games = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  const world = createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), staffPeople: Object.values(generated.staffPeopleById), teamStaffAssignments: Object.values(generated.teamStaffAssignmentsById), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games })
  const game = games[0]!
  const lineups = { home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5), away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5) }
  const squads = { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds }
  const playerProfiles: MatchPlayerProfiles = {
    home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => ({ ...createMatchPlayerProfile(world.players[id]!), tendencies: { ...createMatchPlayerProfile(world.players[id]!).tendencies, ON_BALL_SCREENING_FREQUENCY: 1, CUT_FREQUENCY: 1, PASS_FIRST_BIAS: 100 } })),
    away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => ({ ...createMatchPlayerProfile(world.players[id]!), tendencies: { ...createMatchPlayerProfile(world.players[id]!).tendencies, ON_BALL_SCREENING_FREQUENCY: 1, CUT_FREQUENCY: 1, PASS_FIRST_BIAS: 100 } })),
  }
  const random = new FixedRandom(0)
  const session = createMatchSession({ world, gameId: game.id, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, squads, playerProfiles, lineups, random, decisionRandom: new FixedRandom(0.99), actorRandom: new FixedRandom(0.99) })
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
function distance(a: SpatialState['players'][number]['position'], b: SpatialState['players'][number]['position']): number { return Math.hypot(a.x - b.x, a.y - b.y) }

function farCornerFrom(spatial: SpatialState, start: SpatialState['players'][number]['position'], end: SpatialState['players'][number]['position']) {
  const corners = [{ x: 0.6, y: 0.6 }, { x: spatial.court.lengthMeters - 0.6, y: 0.6 }, { x: 0.6, y: spatial.court.widthMeters - 0.6 }, { x: spatial.court.lengthMeters - 0.6, y: spatial.court.widthMeters - 0.6 }]
  return corners.sort((left, right) => Math.min(distance(left, start), distance(left, end)) - Math.min(distance(right, start), distance(right, end))).at(-1)!
}

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
