import type { PlayerId, TeamId } from '@/domain/ids'
import type { CourtPosition } from '@/domain/court'
import type { RandomSource } from '@/engine/random'
import { chooseWeighted } from './WeightedChoice'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import type { SpatialState } from './SpatialState'

export const MAX_OFF_BALL_CUT_STEPS = 3
const CUT_ARRIVAL_TOLERANCE_METERS = 0.35
const RIM_CUT_OFFSET_METERS = 1.5
const RIM_CUT_LATERAL_OFFSET_METERS = 1
const SPACE_CUT_DEPTH_METERS = 4.5
const SPACE_CUT_MARGIN_METERS = 1.5

export interface OffBallCutIntent {
  readonly type: 'rimCut' | 'spaceCut'
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly target: CourtPosition
  readonly stepsRemaining: number
}

/** Selects a cutter using the canonical CUT_FREQUENCY tendency and the existing decision stream. */
export function selectOffBallCutter(
  lineup: readonly PlayerId[],
  profiles: readonly MatchPlayerProfile[],
  ballHandlerId: PlayerId,
  random: RandomSource,
): PlayerId | undefined {
  const candidates = lineup
    .filter((playerId) => playerId !== ballHandlerId)
    .map((playerId) => profiles.find((profile) => profile.playerId === playerId))
    .filter((profile): profile is MatchPlayerProfile => profile !== undefined && profile.tendencies.CUT_FREQUENCY > 0)
  if (candidates.length === 0) return undefined

  const highestFrequency = Math.max(...candidates.map((profile) => profile.tendencies.CUT_FREQUENCY))
  if (!random.chance(highestFrequency / 100)) return undefined
  return chooseWeighted(candidates.map((profile) => ({ item: profile.playerId, weight: profile.tendencies.CUT_FREQUENCY })), random)
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
