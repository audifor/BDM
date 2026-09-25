import { describe, expect, it } from 'vitest'

import { distanceBetween } from '@/domain/court'
import { playerIdFromString, teamIdFromString, type PlayerId } from '@/domain/ids'
import { PLAYER_TRUTH_TENDENCY_KEYS, type PlayerTruthTendencies } from '@/domain/player/PlayerTruthCatalog'
import type { BasketballPosition } from '@/domain/primitives'

import { applyTemporaryDefenderOverrides, createDefensiveAuthority, getEffectiveMatchups, getPrimaryDefender } from './DefensiveAuthority'
import { createDriveIntent } from './DribbleDrives'
import { resolveOnBallDefensiveIntent } from './OnBallDefense'
import { BASELINE_PLAYER_KINEMATIC_PROFILE, type MatchPlayerProfile, type MatchPlayerProfiles } from './MatchPlayerProfile'
import { assignBaseSpatialTargets, stepPlayersTowardBaseSpacing } from './BaseSpacing'
import { controlBallByPlayer, createInitialSpatialState, defendingBasketForTeam, type SpatialState } from './SpatialState'

const POSITIONS: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
const HOME_TEAM_ID = teamIdFromString('on-ball-home')
const AWAY_TEAM_ID = teamIdFromString('on-ball-away')
const NEUTRAL_TENDENCIES = Object.fromEntries(PLAYER_TRUTH_TENDENCY_KEYS.map((key) => [key, 50])) as unknown as PlayerTruthTendencies
const HOME_PROFILES = POSITIONS.map((position, index) => profile(`on-ball-home-${index}`, position))
const AWAY_PROFILES = POSITIONS.map((position, index) => profile(`on-ball-away-${index}`, position))
const LINEUPS = { home: HOME_PROFILES.map((entry) => entry.playerId), away: AWAY_PROFILES.map((entry) => entry.playerId) }
const PROFILES: MatchPlayerProfiles = { home: HOME_PROFILES, away: AWAY_PROFILES }
const ATTACKING_TEAM_ID = AWAY_TEAM_ID
const DEFENDING_TEAM_ID = HOME_TEAM_ID

function fixture(ownerId: PlayerId | null = LINEUPS.away[0]!, pointOfAttack = 50) {
  const playerProfiles = pointOfAttack === 50 ? PROFILES : {
    home: HOME_PROFILES.map((entry, index) => index === 0 ? { ...entry, defense: { ...entry.defense, pointOfAttack } } : entry),
    away: AWAY_PROFILES,
  }
  const spatial = createInitialSpatialState({ homeTeamId: HOME_TEAM_ID, awayTeamId: AWAY_TEAM_ID, lineups: LINEUPS, playerProfiles, ecosystemKind: 'fibaLike', category: 'men' })
  const authority = createDefensiveAuthority({ homeTeamId: HOME_TEAM_ID, awayTeamId: AWAY_TEAM_ID, attackingTeamId: ATTACKING_TEAM_ID, activeLineups: LINEUPS, playerProfiles, spatial })
  const withOwner = ownerId === null ? spatial : controlBallByPlayer(spatial, ownerId)
  const basket = defendingBasketForTeam({ teamId: DEFENDING_TEAM_ID, homeTeamId: HOME_TEAM_ID, awayTeamId: AWAY_TEAM_ID, period: 1, court: spatial.court })
  return { spatial: withOwner, authority, basket, playerProfiles }
}

function resolve(input: ReturnType<typeof fixture>, driveIntent?: ReturnType<typeof createDriveIntent>) {
  return resolveOnBallDefensiveIntent({
    attackingTeamId: ATTACKING_TEAM_ID,
    activeOffensiveLineup: LINEUPS.away,
    authority: input.authority,
    defensiveProfiles: input.playerProfiles.home,
    defendingBasket: input.basket,
    spatial: input.spatial,
    ...(driveIntent === undefined ? {} : { driveIntent }),
  })
}

function putPlayer(spatial: SpatialState, playerId: PlayerId, position: { readonly x: number; readonly y: number }): SpatialState {
  return { ...spatial, players: spatial.players.map((player) => player.playerId === playerId ? { ...player, position } : player) }
}

function profile(id: string, primaryPosition: BasketballPosition): MatchPlayerProfile {
  return {
    playerId: playerIdFromString(id), primaryPosition, tendencies: NEUTRAL_TENDENCIES as unknown as MatchPlayerProfile['tendencies'],
    physical: { heightCm: 200, weightKg: 100, wingspanCm: 205, standingReachCm: 250 },
    kinematics: BASELINE_PLAYER_KINEMATIC_PROFILE,
    offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 },
    defense: { pointOfAttack: 50, interior: 50, mobility: 50 }, rebounding: { impact: 50 },
  }
}

describe('on-ball defensive containment', () => {
  it('targets a point between the current handler and the defending basket', () => {
    const input = fixture()
    const handlerId = LINEUPS.away[0]!
    const defenderId = getPrimaryDefender(input.authority, handlerId)!
    const handlerPosition = { x: input.spatial.court.lengthMeters * 0.42, y: input.spatial.court.widthMeters * 0.48 }
    const dx = input.basket.x - handlerPosition.x
    const dy = input.basket.y - handlerPosition.y
    const length = Math.hypot(dx, dy)
    const defenderPosition = { x: handlerPosition.x + dx / length, y: handlerPosition.y + dy / length }
    let spatial = putPlayer(input.spatial, handlerId, handlerPosition)
    spatial = putPlayer(spatial, defenderId, defenderPosition)
    spatial = controlBallByPlayer(spatial, handlerId)
    const intent = resolve({ ...input, spatial })!
    const fromHandler = { x: intent.targetPosition.x - handlerPosition.x, y: intent.targetPosition.y - handlerPosition.y }
    const projection = (fromHandler.x * dx + fromHandler.y * dy) / (length * length)

    expect(projection).toBeGreaterThan(0)
    expect(projection).toBeLessThan(1)
    expect(Math.abs(fromHandler.x * dy - fromHandler.y * dx)).toBeLessThan(1e-6)
    expect(intent.targetPosition.x).toBeGreaterThanOrEqual(0)
    expect(intent.targetPosition.x).toBeLessThanOrEqual(input.spatial.court.lengthMeters)
    expect(intent.targetPosition.y).toBeGreaterThanOrEqual(0)
    expect(intent.targetPosition.y).toBeLessThanOrEqual(input.spatial.court.widthMeters)
    expect(intent.defenderId).toBe(defenderId)
  })

  it('follows the current ball owner to that player’s effective defender', () => {
    const firstOwner = LINEUPS.away[0]!
    const secondOwner = LINEUPS.away[1]!
    const input = fixture(firstOwner)
    const first = resolve(input)!
    const second = resolve({ ...input, spatial: controlBallByPlayer(input.spatial, secondOwner) })!

    expect(first.ballHandlerId).toBe(firstOwner)
    expect(second.ballHandlerId).toBe(secondOwner)
    expect(second.defenderId).toBe(getPrimaryDefender(input.authority, secondOwner))
    expect(first.defenderId).not.toBe(second.defenderId)
  })

  it('uses MG8A’s temporary effective defender during a switch', () => {
    const ownerId = LINEUPS.away[0]!
    const otherId = LINEUPS.away[1]!
    const input = fixture(ownerId)
    const ownerBaseDefender = getPrimaryDefender(input.authority, ownerId)!
    const otherBaseDefender = getPrimaryDefender(input.authority, otherId)!
    const switched = getEffectiveMatchups(input.authority).map((entry) => entry.offensivePlayerId === ownerId
      ? { ...entry, defensivePlayerId: otherBaseDefender }
      : entry.offensivePlayerId === otherId
        ? { ...entry, defensivePlayerId: ownerBaseDefender }
        : entry)
    const authority = applyTemporaryDefenderOverrides(input.authority, switched)

    expect(resolve({ ...input, authority })?.defenderId).toBe(otherBaseDefender)
  })

  it('tightens the gap for an active drive without taking over drive resolution', () => {
    const input = fixture()
    const intent = resolve(input)!
    const drive = createDriveIntent({ handlerId: intent.ballHandlerId, defenderId: intent.defenderId, spatial: input.spatial, attackingBasket: input.basket })
    const driveIntent = resolve(input, drive)!

    expect(driveIntent.context).toBe('drive')
    expect(driveIntent.targetPosition).not.toEqual(intent.targetPosition)
    expect(distanceBetween(driveIntent.targetPosition, input.spatial.players.find((player) => player.playerId === intent.ballHandlerId)!.position))
      .toBeLessThan(distanceBetween(intent.targetPosition, input.spatial.players.find((player) => player.playerId === intent.ballHandlerId)!.position))
  })

  it('uses the existing point-of-attack defense signal to adjust containment gap', () => {
    const lowDefense = fixture(LINEUPS.away[0]!, 20)
    const highDefense = fixture(LINEUPS.away[0]!, 80)
    const lowIntent = resolve(lowDefense)!
    const highIntent = resolve(highDefense)!
    const handlerPosition = lowDefense.spatial.players.find((player) => player.playerId === lowIntent.ballHandlerId)!.position

    expect(distanceBetween(highIntent.targetPosition, handlerPosition)).toBeLessThan(distanceBetween(lowIntent.targetPosition, handlerPosition))
  })

  it('lets a beaten defender trail and leaves its movement to MG6', () => {
    const input = fixture()
    const handlerId = LINEUPS.away[0]!
    const defenderId = getPrimaryDefender(input.authority, handlerId)!
    const handlerPosition = { x: input.spatial.court.lengthMeters * 0.48, y: input.spatial.court.widthMeters * 0.5 }
    const dx = input.basket.x - handlerPosition.x
    const dy = input.basket.y - handlerPosition.y
    const length = Math.hypot(dx, dy)
    const defenderPosition = { x: handlerPosition.x - dx / length * 3, y: handlerPosition.y - dy / length * 3 }
    let spatial = putPlayer(input.spatial, handlerId, handlerPosition)
    spatial = putPlayer(spatial, defenderId, defenderPosition)
    spatial = controlBallByPlayer(spatial, handlerId)
    const movedInput = { ...input, spatial }
    const intent = resolve(movedInput)!
    const alongAttackLine = (intent.targetPosition.x - handlerPosition.x) * dx + (intent.targetPosition.y - handlerPosition.y) * dy
    const before = spatial.players.find((player) => player.playerId === defenderId)!.position
    const afterSpatial = stepPlayersTowardBaseSpacing({
      homeTeamId: HOME_TEAM_ID, awayTeamId: AWAY_TEAM_ID, attackingTeamId: ATTACKING_TEAM_ID,
      period: 1, activeLineups: LINEUPS, playerProfiles: input.playerProfiles, spatial,
      ballHandlerId: handlerId,
    }, 0.4, [{ playerId: defenderId, position: intent.targetPosition }])
    const after = afterSpatial.players.find((player) => player.playerId === defenderId)!.position

    expect(intent.separation).toBe('BEATEN')
    expect(alongAttackLine).toBeLessThan(0)
    expect(after).not.toEqual(intent.targetPosition)
    expect(distanceBetween(after, intent.targetPosition)).toBeLessThan(distanceBetween(before, intent.targetPosition))
  })

  it('recalculates laterally from the handler’s current position and is deterministic', () => {
    const input = fixture()
    const ownerId = LINEUPS.away[0]!
    const first = resolve(input)!
    let shifted = putPlayer(input.spatial, ownerId, { x: input.spatial.court.lengthMeters * 0.4, y: input.spatial.court.widthMeters * 0.62 })
    shifted = controlBallByPlayer(shifted, ownerId)
    const next = resolve({ ...input, spatial: shifted })!

    expect(next.targetPosition.y).not.toBe(first.targetPosition.y)
    expect(resolve(input)).toEqual(first)
  })

  it('does not produce an on-ball intent without a valid current ball owner', () => {
    const input = fixture(null)
    expect(resolve(input)).toBeUndefined()
    expect(resolve({ ...input, spatial: { ...input.spatial, ball: { kind: 'playerControlled', teamId: HOME_TEAM_ID, playerId: LINEUPS.home[0]!, position: input.spatial.ball.position } } })).toBeUndefined()
  })
})
