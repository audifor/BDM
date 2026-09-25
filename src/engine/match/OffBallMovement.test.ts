import { describe, expect, it } from 'vitest'

import { createGameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { generateWorld } from '@/engine/world'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { calculateDefensiveAssignments, controlBallByPlayer, createMatchPlayerProfile, createMatchSession, createOffBallCutIntent, selectOffBallCutter, stepMatchSession, stepPlayersTowardBaseSpacing, substitutePlayer, updateOffBallCutIntent } from './index'
import type { MatchPlayerProfiles, OffBallCutIntent, SpatialState } from './index'

describe('off-ball cut movement', () => {
  it('selects only an active off-ball player and moves toward the cut target using their kinematics', () => {
    const { state } = createFixture()
    const offenseKey = state.attackingTeamId === state.homeTeamId ? 'home' : 'away'
    const defenseKey = offenseKey === 'home' ? 'away' : 'home'
    const lineup = state.activeLineups[offenseKey]
    const defenseLineup = state.activeLineups[defenseKey]
    const handler = lineup[0]!
    const cutter = lineup[1]!
    const basket = state.attackingTeamId === state.homeTeamId ? state.spatial.court.baskets.right : state.spatial.court.baskets.left
    const playerProfiles = {
      ...state.playerProfiles,
      [offenseKey]: state.playerProfiles[offenseKey].map((profile) => ({ ...profile, tendencies: { ...profile.tendencies, CUT_FREQUENCY: profile.playerId === cutter || profile.playerId === handler ? 100 : 0 } })),
    }
    const spatial = createOpenCutSpatial(state, handler, cutter, basket)
    const matchups = calculateDefensiveAssignments(lineup, defenseLineup, [...playerProfiles.home, ...playerProfiles.away])
    const select = (random: RandomSource) => selectOffBallCutter({ teamId: state.attackingTeamId, lineup, profiles: playerProfiles[offenseKey], ballHandlerId: handler, matchups, spatial, attackingBasket: basket, random })
    const selected = select(new FixedRandom([0, 0]))
    expect(selected).toBe(cutter)
    expect(selected).not.toBe(handler)
    expect(select(new SeededRandomSource(99))).toBe(select(new SeededRandomSource(99)))

    const intent = createOffBallCutIntent({ teamId: state.attackingTeamId, playerId: cutter, spatial, attackingBasket: basket })
    const input = { homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, attackingTeamId: state.attackingTeamId, period: state.period, activeLineups: state.activeLineups, playerProfiles, spatial, ballHandlerId: handler }
    const baseTargets = stepPlayersTowardBaseSpacing(input, 0.5)
    const cutStep = stepPlayersTowardBaseSpacing(input, 0.5, [{ playerId: cutter, position: intent.target }])
    const cutterProfile = playerProfiles[offenseKey].find((profile) => profile.playerId === cutter)!
    const start = spatial.players.find((player) => player.playerId === cutter)!
    const moved = cutStep.players.find((player) => player.playerId === cutter)!
    const spacingMoved = baseTargets.players.find((player) => player.playerId === cutter)!
    expect(Math.hypot(moved.position.x - intent.target.x, moved.position.y - intent.target.y)).toBeLessThan(Math.hypot(start.position.x - intent.target.x, start.position.y - intent.target.y))

    const fasterProfiles = replaceKinematics(playerProfiles, offenseKey, cutter, { ...cutterProfile.kinematics, maxSpeedMps: 6.6, accelerationMps2: 3.6 })
    const slowerProfiles = replaceKinematics(playerProfiles, offenseKey, cutter, { ...cutterProfile.kinematics, maxSpeedMps: 5.4, accelerationMps2: 2.4 })
    const faster = stepPlayersTowardBaseSpacing({ ...input, playerProfiles: fasterProfiles }, 0.5, [{ playerId: cutter, position: intent.target }])
    const slower = stepPlayersTowardBaseSpacing({ ...input, playerProfiles: slowerProfiles }, 0.5, [{ playerId: cutter, position: intent.target }])
    const fasterPlayer = faster.players.find((player) => player.playerId === cutter)!
    const slowerPlayer = slower.players.find((player) => player.playerId === cutter)!
    expect(distance(start.position, fasterPlayer.position)).toBeGreaterThan(distance(start.position, slowerPlayer.position))
    expect(distance(start.position, fasterPlayer.position)).toBeLessThanOrEqual(6.6 * 0.5)
    expect(spacingMoved.position).not.toEqual(moved.position)
  })

  it('rejects a cut when defenders occupy the target or lane before reading tendency', () => {
    const { state } = createFixture()
    const offenseKey = state.attackingTeamId === state.homeTeamId ? 'home' : 'away'
    const defenseKey = offenseKey === 'home' ? 'away' : 'home'
    const lineup = state.activeLineups[offenseKey]
    const defenseLineup = state.activeLineups[defenseKey]
    const handler = lineup[0]!
    const cutter = lineup[1]!
    const basket = state.attackingTeamId === state.homeTeamId ? state.spatial.court.baskets.right : state.spatial.court.baskets.left
    const playerProfiles = {
      ...state.playerProfiles,
      [offenseKey]: state.playerProfiles[offenseKey].map((profile) => ({ ...profile, tendencies: { ...profile.tendencies, CUT_FREQUENCY: profile.playerId === cutter ? 100 : 0 } })),
    }
    const spatial = createOpenCutSpatial(state, handler, cutter, basket)
    const matchups = calculateDefensiveAssignments(lineup, defenseLineup, [...playerProfiles.home, ...playerProfiles.away])
    const target = createOffBallCutIntent({ teamId: state.attackingTeamId, playerId: cutter, spatial, attackingBasket: basket }).target
    const defenderId = matchups.find((matchup) => matchup.offensivePlayerId === cutter)!.defensivePlayerId
    const blockedSpatial = placePlayerAt(spatial, defenderId, target)

    expect(selectOffBallCutter({ teamId: state.attackingTeamId, lineup, profiles: playerProfiles[offenseKey], ballHandlerId: handler, matchups, spatial: blockedSpatial, attackingBasket: basket, random: new FixedRandom([0]) })).toBeUndefined()
  })

  it('completes on arrival or timeout and cancels on possession flip, handler change, or substitution', () => {
    const { state, session } = createFixture()
    const offenseKey = state.attackingTeamId === state.homeTeamId ? 'home' : 'away'
    const lineup = state.activeLineups[offenseKey]
    const handler = lineup[0]!
    const cutter = lineup[1]!
    const basket = state.attackingTeamId === state.homeTeamId ? state.spatial.court.baskets.right : state.spatial.court.baskets.left
    const intent = createOffBallCutIntent({ teamId: state.attackingTeamId, playerId: cutter, spatial: state.spatial, attackingBasket: basket, stepsRemaining: 1 })
    const atTarget = placePlayerAt(state.spatial, cutter, intent.target)

    expect(updateOffBallCutIntent(intent, { teamId: state.attackingTeamId, lineup, ballHandlerId: handler, spatial: atTarget })).toBeUndefined()
    expect(updateOffBallCutIntent({ ...intent, stepsRemaining: 1 }, { teamId: state.attackingTeamId, lineup, ballHandlerId: handler, spatial: state.spatial })).toBeUndefined()
    expect(updateOffBallCutIntent(intent, { teamId: state.homeTeamId === state.attackingTeamId ? state.awayTeamId : state.homeTeamId, lineup, ballHandlerId: handler, spatial: state.spatial })).toBeUndefined()
    expect(updateOffBallCutIntent(intent, { teamId: state.attackingTeamId, lineup, ballHandlerId: cutter, spatial: state.spatial })).toBeUndefined()
    expect(updateOffBallCutIntent(intent, { teamId: state.attackingTeamId, lineup: lineup.filter((id) => id !== cutter), ballHandlerId: handler, spatial: state.spatial })).toBeUndefined()

    const cutSession = { ...session, state: { ...state, spatial: controlBallByPlayer(state.spatial, handler), offBallCut: intent } }
    expect(stepMatchSession(cutSession).session.state.offBallCut).toBeUndefined()
    const teamId = state.attackingTeamId
    const benchId = state.squads[offenseKey].find((playerId) => !lineup.includes(playerId))!
    expect(substitutePlayer(cutSession, { teamId, playerOutId: cutter, playerInId: benchId }).state.offBallCut).toBeUndefined()
  })
})

function createFixture() {
  const generated = generateWorld({ seed: 12345, gender: 'female' })
  const scheduled = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  const world = createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), staffPeople: Object.values(generated.staffPeopleById), teamStaffAssignments: Object.values(generated.teamStaffAssignmentsById), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games: scheduled })
  const game = scheduled[0]!
  const lineups = { home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5), away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5) }
  const squads = { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds }
  const playerProfiles = { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) }
  const session = createMatchSession({ world, gameId: game.id, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, squads, playerProfiles, lineups, random: new FixedRandom([0]), decisionRandom: new FixedRandom([0]), actorRandom: new FixedRandom([0]) })
  return { session, state: session.state }
}

function replaceKinematics(profiles: MatchPlayerProfiles, side: 'home' | 'away', playerId: MatchPlayerProfiles['home'][number]['playerId'], kinematics: MatchPlayerProfiles['home'][number]['kinematics']): MatchPlayerProfiles {
  return { ...profiles, [side]: profiles[side].map((profile) => profile.playerId === playerId ? { ...profile, kinematics } : profile) }
}

function placePlayerAt(spatial: SpatialState, playerId: SpatialState['players'][number]['playerId'], position: OffBallCutIntent['target']): SpatialState {
  return { ...spatial, players: spatial.players.map((player) => player.playerId === playerId ? { ...player, position } : player) }
}

function createOpenCutSpatial(state: ReturnType<typeof createMatchSession>['state'], handler: SpatialState['players'][number]['playerId'], cutter: SpatialState['players'][number]['playerId'], basket: OffBallCutIntent['target']): SpatialState {
  const attacksRight = basket.x > state.spatial.court.lengthMeters / 2
  const cutterStart = { x: basket.x - (attacksRight ? 1 : -1) * 5.8, y: basket.y }
  const defenseIds = new Set((state.attackingTeamId === state.homeTeamId ? state.activeLineups.away : state.activeLineups.home))
  return {
    ...state.spatial,
    players: state.spatial.players.map((player) => player.playerId === handler
      ? { ...player, position: { x: basket.x - (attacksRight ? 1 : -1) * 9, y: basket.y } }
      : player.playerId === cutter
        ? { ...player, position: cutterStart }
        : defenseIds.has(player.playerId)
          ? { ...player, position: { x: state.spatial.court.lengthMeters / 2, y: player.position.y < basket.y ? 0.2 : state.spatial.court.widthMeters - 0.2 } }
          : player),
  }
}

function distance(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number { return Math.hypot(a.x - b.x, a.y - b.y) }

class FixedRandom implements RandomSource {
  private index = 0
  public constructor(private readonly values: readonly number[]) {}
  public next(): number { const value = this.values[this.index] ?? this.values.at(-1) ?? 0; this.index += 1; return value }
  public nextInt(minInclusive: number): number { return minInclusive }
  public nextFloat(minInclusive: number): number { return minInclusive }
  public chance(probability: number): boolean { return this.next() < probability }
  public pick<Item>(items: readonly Item[]): Item { return items[0]! }
}
