import type { PlayerId, TeamId } from '@/domain/ids'
import { distanceBetween, distanceFromBasket, isInsideCourt, type CourtPosition } from '@/domain/court'
import type { RandomSource } from '@/engine/random'
import { chooseWeighted } from './WeightedChoice'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import type { PlayerMatchup } from './Matchups'
import type { SpatialState } from './SpatialState'

export const MAX_OFF_BALL_CUT_STEPS = 3
const CUT_ARRIVAL_TOLERANCE_METERS = 0.35
const RIM_CUT_OFFSET_METERS = 1.5
const RIM_CUT_LATERAL_OFFSET_METERS = 1
const SPACE_CUT_DEPTH_METERS = 4.5
const SPACE_CUT_MARGIN_METERS = 1.5
const CUT_TARGET_CLEARANCE_METERS = 1.25
const CUT_LANE_CLEARANCE_METERS = 0.75
const MINIMUM_CUT_ADVANCE_METERS = 0.75

export interface OffBallCutIntent {
  readonly type: 'rimCut' | 'spaceCut'
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly target: CourtPosition
  readonly stepsRemaining: number
}

export interface OffBallCutCandidate {
  readonly playerId: PlayerId
  readonly weight: number
}

/** Filters for a clear spatial cut first, then applies CUT_FREQUENCY and canonical RNG. */
export function selectOffBallCutter(input: {
  readonly teamId: TeamId
  readonly lineup: readonly PlayerId[]
  readonly profiles: readonly MatchPlayerProfile[]
  readonly ballHandlerId: PlayerId
  readonly excludedPlayerIds?: readonly PlayerId[]
  readonly matchups: readonly PlayerMatchup[]
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly random: RandomSource
}): PlayerId | undefined {
  const candidates = getViableOffBallCutCandidates(input)
  if (candidates.length === 0) return undefined

  const highestFrequency = Math.max(...candidates.map((candidate) => candidate.weight))
  if (!input.random.chance(highestFrequency / 100)) return undefined
  return chooseWeighted(candidates.map(({ playerId, weight }) => ({ item: playerId, weight })), input.random)
}

/** Returns the valid active cutters in lineup order so primary playcalling can weigh CUT alongside other actions. */
export function getViableOffBallCutCandidates(input: {
  readonly teamId: TeamId
  readonly lineup: readonly PlayerId[]
  readonly profiles: readonly MatchPlayerProfile[]
  readonly ballHandlerId: PlayerId
  readonly excludedPlayerIds?: readonly PlayerId[]
  readonly matchups: readonly PlayerMatchup[]
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): readonly OffBallCutCandidate[] {
  const excluded = new Set(input.excludedPlayerIds ?? [])
  const defenders = input.spatial.players.filter((player) => player.teamId !== input.teamId)
  return input.lineup
    .filter((playerId) => playerId !== input.ballHandlerId && !excluded.has(playerId))
    .map((playerId) => {
      const profile = input.profiles.find((candidate) => candidate.playerId === playerId)
      const spatialPlayer = input.spatial.players.find((candidate) => candidate.playerId === playerId)
      const defenderId = input.matchups.find((matchup) => matchup.offensivePlayerId === playerId)?.defensivePlayerId
      const defender = defenderId === undefined ? undefined : defenders.find((candidate) => candidate.playerId === defenderId)
      const ownsBall = input.spatial.ball.kind === 'playerControlled' && input.spatial.ball.playerId === playerId
      if (profile === undefined || profile.tendencies.CUT_FREQUENCY <= 0 || spatialPlayer?.teamId !== input.teamId || !isInsideCourt(spatialPlayer.position, input.spatial.court) || ownsBall || defender === undefined) return undefined
      const intent = createOffBallCutIntent({ teamId: input.teamId, playerId, spatial: input.spatial, attackingBasket: input.attackingBasket })
      return isViableCut(input.spatial, spatialPlayer.position, intent.target, input.attackingBasket, defenders)
        ? { playerId, weight: profile.tendencies.CUT_FREQUENCY }
        : undefined
    })
    .filter((candidate): candidate is OffBallCutCandidate => candidate !== undefined)
}

/** Builds one of two deterministic targets from the active player's location and court geometry. */
export function createOffBallCutIntent(input: {
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly stepsRemaining?: number
}): OffBallCutIntent {
  const player = input.spatial.players.find((candidate) => candidate.playerId === input.playerId)
  if (player === undefined) throw new Error(`Cutting player ${input.playerId} is not active`)
  const court = input.spatial.court
  const attackDirection = input.attackingBasket.x > court.lengthMeters / 2 ? 1 : -1
  const isNearBasket = Math.hypot(player.position.x - input.attackingBasket.x, player.position.y - input.attackingBasket.y) <= court.lengthMeters * 0.2
  const type = isNearBasket ? 'spaceCut' : 'rimCut'
  const target = type === 'rimCut'
    ? {
        x: input.attackingBasket.x - attackDirection * RIM_CUT_OFFSET_METERS,
        y: clamp(input.attackingBasket.y + (player.position.y < court.widthMeters / 2 ? 1 : -1) * RIM_CUT_LATERAL_OFFSET_METERS, 0, court.widthMeters),
      }
    : {
        x: input.attackingBasket.x - attackDirection * SPACE_CUT_DEPTH_METERS,
        y: player.position.y < court.widthMeters / 2 ? court.widthMeters - SPACE_CUT_MARGIN_METERS : SPACE_CUT_MARGIN_METERS,
      }
  return { type, teamId: input.teamId, playerId: input.playerId, target, stepsRemaining: input.stepsRemaining ?? MAX_OFF_BALL_CUT_STEPS }
}

/** Keeps only eligible intents and ends them on arrival or after the bounded movement step. */
export function updateOffBallCutIntent(
  intent: OffBallCutIntent | undefined,
  input: { readonly teamId: TeamId; readonly lineup: readonly PlayerId[]; readonly ballHandlerId: PlayerId; readonly spatial: SpatialState },
): OffBallCutIntent | undefined {
  if (intent === undefined || intent.teamId !== input.teamId || intent.playerId === input.ballHandlerId || !input.lineup.includes(intent.playerId)) return undefined
  const player = input.spatial.players.find((candidate) => candidate.playerId === intent.playerId)
  if (player === undefined || Math.hypot(player.position.x - intent.target.x, player.position.y - intent.target.y) <= CUT_ARRIVAL_TOLERANCE_METERS || intent.stepsRemaining <= 1) return undefined
  return { ...intent, stepsRemaining: intent.stepsRemaining - 1 }
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }

function isViableCut(spatial: SpatialState, playerPosition: CourtPosition, target: CourtPosition, basket: CourtPosition, defenders: SpatialState['players']): boolean {
  if (!isInsideCourt(playerPosition, spatial.court) || !isInsideCourt(target, spatial.court) || distanceFromBasket(playerPosition, basket) <= distanceFromBasket(target, basket) + MINIMUM_CUT_ADVANCE_METERS) return false
  if (defenders.some((defender) => distanceBetween(defender.position, target) < CUT_TARGET_CLEARANCE_METERS)) return false
  return defenders.every((defender) => distanceToSegment(defender.position, playerPosition, target) >= CUT_LANE_CLEARANCE_METERS)
}

function distanceToSegment(point: CourtPosition, start: CourtPosition, end: CourtPosition): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return distanceBetween(point, start)
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return distanceBetween(point, { x: start.x + projection * dx, y: start.y + projection * dy })
}
