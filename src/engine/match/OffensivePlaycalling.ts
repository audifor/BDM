import { distanceBetween, isInsideCourt } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { RandomSource } from '@/engine/random'
import type { CourtPosition } from '@/domain/court'
import { createBackDownTarget, isPostUpContextValid } from './PostUpMovement'
import { driveOpportunity } from './DribbleDrives'
import { HANDOFF_RULES_V1 } from './HandoffOffense'
import { getViableOffBallCutCandidates } from './OffBallMovement'
import type { OffensiveAction } from './OffensiveActions'
import { createOffensiveAction } from './OffensiveActions'
import { PASS_RESOLUTION_V1 } from './PassingResolution'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import type { PlayerMatchup } from './Matchups'
import { createScreenIntent } from './ScreenInteractions'
import type { MatchTacticalPlan } from './tactics/MatchTacticalPlan'
import { tacticalUsageWeight } from './tactics/TacticalEffects'
import type { SpatialState } from './SpatialState'
import { chooseWeighted } from './WeightedChoice'

const MAXIMUM_HANDOFF_CALL_DISTANCE_METERS = HANDOFF_RULES_V1.transferDistanceMeters * 2

interface OffensiveActionCandidate {
  readonly action: OffensiveAction
  readonly weight: number
}

type PlaycallKind = 'PICK_AND_ROLL' | 'ISOLATION' | 'POST_UP' | 'HANDOFF' | 'CUT'

/** Selects and creates the next primary half-court action for the canonical ball owner. */
export function selectNextOffensiveAction(input: {
  readonly teamId: TeamId
  readonly activeLineup: readonly PlayerId[]
  readonly profiles: readonly MatchPlayerProfile[]
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly matchups: readonly PlayerMatchup[]
  readonly tacticalPlan: MatchTacticalPlan
  readonly random: RandomSource
  readonly passesThisPossession: number
  readonly excludedPlayerIds?: readonly PlayerId[]
  readonly allowCut?: boolean
}): OffensiveAction | undefined {
  const ball = input.spatial.ball
  if (ball.kind !== 'playerControlled' || ball.teamId !== input.teamId || !input.activeLineup.includes(ball.playerId)) return undefined

  const handlerId = ball.playerId
  const handler = input.profiles.find((profile) => profile.playerId === handlerId)
  const handlerSpatial = input.spatial.players.find((player) => player.playerId === handlerId && player.teamId === input.teamId)
  const handlerDefenderId = input.matchups.find((matchup) => matchup.offensivePlayerId === handlerId)?.defensivePlayerId
  const handlerDefenderSpatial = handlerDefenderId === undefined
    ? undefined
    : input.spatial.players.find((player) => player.playerId === handlerDefenderId && player.teamId !== input.teamId)
  if (handler === undefined || handlerSpatial === undefined || !isInsideCourt(handlerSpatial.position, input.spatial.court)
    || handlerDefenderId === undefined || handlerDefenderSpatial === undefined || !isInsideCourt(handlerDefenderSpatial.position, input.spatial.court)) return undefined

  const profileById = new Map(input.profiles.map((profile) => [profile.playerId, profile]))
  const spatialById = new Map(input.spatial.players.map((player) => [player.playerId, player]))
  const defenderByPlayerId = new Map(input.matchups.map((matchup) => [matchup.offensivePlayerId, matchup.defensivePlayerId]))
  const excluded = new Set(input.excludedPlayerIds ?? [])
  const candidates: OffensiveActionCandidate[] = []
  const addCandidate = (kind: PlaycallKind, participantIds: readonly PlayerId[], baseWeight: number) => {
    if (!Number.isFinite(baseWeight) || baseWeight <= 0) return
    const action = createOffensiveAction({ kind, teamId: input.teamId, initiatorId: kind === 'CUT' ? participantIds[0]! : handlerId, participantIds, activeLineup: input.activeLineup })
    const weight = participantIds.reduce((current, playerId) => tacticalUsageWeight(playerId, current, input.activeLineup, input.tacticalPlan), baseWeight)
    candidates.push({ action, weight })
  }
  const hasPassTarget = input.passesThisPossession < PASS_RESOLUTION_V1.maximumPassesPerPossession
    && input.activeLineup.some((playerId) => playerId !== handlerId
      && spatialById.get(playerId)?.teamId === input.teamId
      && isInsideCourt(spatialById.get(playerId)!.position, input.spatial.court))
  const handlerDriveOpportunity = driveOpportunity({ handlerId, defenderId: handlerDefenderId, spatial: input.spatial, attackingBasket: input.attackingBasket })
  const handlerCanContinue = (handler.tendencies.DRIVE_FREQUENCY > 0 && handlerDriveOpportunity !== undefined)
    || Math.max(handler.tendencies.SHOT_FREQUENCY, handler.tendencies.PULLUP_FREQUENCY) > 0
    || (hasPassTarget && handler.tendencies.ADVANTAGE_PASS_FREQUENCY > 0)

  if (handler.tendencies.PICK_AND_ROLL_HANDLER_FREQUENCY > 0) {
    for (const screenerId of input.activeLineup) {
      if (screenerId === handlerId || excluded.has(screenerId)) continue
      const screener = profileById.get(screenerId)
      const screenerSpatial = spatialById.get(screenerId)
      const screenerDefenderId = defenderByPlayerId.get(screenerId)
      const screenerDefenderSpatial = screenerDefenderId === undefined ? undefined : spatialById.get(screenerDefenderId)
      if (screener === undefined || screener.tendencies.ON_BALL_SCREENING_FREQUENCY <= 0
        || screenerSpatial?.teamId !== input.teamId || !isInsideCourt(screenerSpatial.position, input.spatial.court)
        || screenerDefenderSpatial?.teamId === input.teamId || screenerDefenderSpatial === undefined || !isInsideCourt(screenerDefenderSpatial.position, input.spatial.court)) continue
      const screen = createScreenIntent({ screenerId, ballHandlerId: handlerId, defenderId: handlerDefenderId, screenerDefenderId, spatial: input.spatial, attackingBasket: input.attackingBasket })
      if (!isInsideCourt(screen.target, input.spatial.court)) continue
      addCandidate('PICK_AND_ROLL', [handlerId, screenerId], handler.tendencies.PICK_AND_ROLL_HANDLER_FREQUENCY * screener.tendencies.ON_BALL_SCREENING_FREQUENCY / 100)
    }
  }

  if (handlerCanContinue) {
    addCandidate('ISOLATION', [handlerId], handler.tendencies.ISOLATION_FREQUENCY)
  }

  if (handler.tendencies.POST_UP_FREQUENCY > 0
    && isPostUpContextValid({ postPlayerId: handlerId, defenderId: handlerDefenderId, spatial: input.spatial, attackingBasket: input.attackingBasket })) {
    const hasBackDown = createBackDownTarget({ postPlayerId: handlerId, defenderId: handlerDefenderId, spatial: input.spatial, attackingBasket: input.attackingBasket }) !== undefined
    const hasPostContinuation = hasBackDown
      || Math.max(handler.tendencies.RIM_ATTEMPT_FREQUENCY, handler.tendencies.SHOT_FREQUENCY) > 0
      || (hasPassTarget && handler.tendencies.ADVANTAGE_PASS_FREQUENCY > 0)
    if (hasPostContinuation) addCandidate('POST_UP', [handlerId], handler.tendencies.POST_UP_FREQUENCY)
  }

  if (handler.tendencies.ADVANTAGE_PASS_FREQUENCY > 0) {
    for (const receiverId of input.activeLineup) {
      if (receiverId === handlerId || excluded.has(receiverId)) continue
      const receiver = profileById.get(receiverId)
      const receiverSpatial = spatialById.get(receiverId)
      const receiverDefenderId = defenderByPlayerId.get(receiverId)
      const receiverDefender = receiverDefenderId === undefined ? undefined : spatialById.get(receiverDefenderId)
      if (receiver === undefined || receiverSpatial?.teamId !== input.teamId || receiverDefender === undefined || receiverDefender.teamId === input.teamId
        || !isInsideCourt(receiverSpatial.position, input.spatial.court) || !isInsideCourt(receiverDefender.position, input.spatial.court)
        || distanceBetween(handlerSpatial.position, receiverSpatial.position) > MAXIMUM_HANDOFF_CALL_DISTANCE_METERS) continue
      const receiverDriveOpportunity = receiverDefenderId === undefined ? undefined
        : driveOpportunity({ handlerId: receiverId, defenderId: receiverDefenderId, spatial: input.spatial, attackingBasket: input.attackingBasket })
      const receiverContinuationWeight = Math.max(
        receiverDriveOpportunity === undefined ? 0 : receiver.tendencies.DRIVE_FREQUENCY * receiverDriveOpportunity,
        receiver.tendencies.SHOT_FREQUENCY,
        receiver.tendencies.PULLUP_FREQUENCY,
        input.passesThisPossession < PASS_RESOLUTION_V1.maximumPassesPerPossession
          && input.activeLineup.some((playerId) => playerId !== receiverId && spatialById.get(playerId)?.teamId === input.teamId)
          ? receiver.tendencies.ADVANTAGE_PASS_FREQUENCY : 0,
      )
      if (receiverContinuationWeight > 0) {
        addCandidate('HANDOFF', [handlerId, receiverId], handler.tendencies.ADVANTAGE_PASS_FREQUENCY * receiverContinuationWeight / 100)
      }
    }
  }

  if (input.allowCut !== false) {
    const cutCandidates = getViableOffBallCutCandidates({ teamId: input.teamId, lineup: input.activeLineup, profiles: input.profiles, ballHandlerId: handlerId, excludedPlayerIds: [...excluded], matchups: input.matchups, spatial: input.spatial, attackingBasket: input.attackingBasket })
    for (const cutter of cutCandidates) addCandidate('CUT', [cutter.playerId, handlerId], cutter.weight)
  }

  if (candidates.length === 0) return undefined
  return chooseWeighted(candidates.map(({ action, weight }) => ({ item: action, weight })), input.random)
}
