import type { GameDate } from '@/domain/date'
import type { OrganizationId, PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { isPlayerAvailable } from '@/domain/world'
import { trainingDefinitionById } from '@/domain/training'

/**
 * PLAYER 2.4-D4: scouting must NEVER surface opponent's canonical repertoire
 * simply because the WorldDB knows it. Reports currently observe rating
 * dimensions, NOT individual technical moves or traits.
 */
export type RepertoireObservationStatus =
  | 'NO_SOURCE'
  | 'OWN_TEAM_VERIFIED'
  | 'OPPONENT_UNOBSERVED'
  | 'OPPONENT_GENERAL_SCOUTED'

export interface RepertoireScoutingBrief {
  readonly playerId: PlayerId
  readonly organizationId: OrganizationId
  readonly status: RepertoireObservationStatus
  readonly generalReportIds: readonly string[]
  readonly contextualTraits: readonly { readonly code: string; readonly strength: number }[]
  readonly technicalMoves: readonly { readonly code: string; readonly proficiency: number; readonly usageTendency: number }[]
  readonly basketballSpecializationTraits: readonly string[]
  /** Existing LIVE_GAME mission can gather general evidence, not a new move observation. */
  readonly suggestedMission?: 'LIVE_GAME'
}

export function getRepertoireScoutingBrief(
  world: GameWorld,
  organizationId: OrganizationId,
  playerId: PlayerId,
): RepertoireScoutingBrief {
  if (world.players[playerId] === undefined) throw new RangeError('Repertoire scouting requires a known PLAYER')
  const ownsPlayer = Object.values(world.teams).some((team) =>
    team.organizationId === organizationId && team.rosterPlayerIds.includes(playerId))
  const repertoire = world.playerRepertoireByPlayerId[playerId]
  const generalReportIds = Object.values(world.evaluatorReportsById)
    .filter((report) => report.organizationId === organizationId && report.subjectPlayerId === playerId)
    .map((report) => report.id).sort()
  const status: RepertoireObservationStatus = repertoire === undefined ? 'NO_SOURCE'
    : ownsPlayer ? 'OWN_TEAM_VERIFIED'
      : generalReportIds.length > 0 ? 'OPPONENT_GENERAL_SCOUTED' : 'OPPONENT_UNOBSERVED'

  const own = status === 'OWN_TEAM_VERIFIED' ? repertoire : undefined
  return {
    playerId,
    organizationId,
    status,
    generalReportIds,
    contextualTraits: own?.contextualTraits.map(({ code, strength }) => ({ code, strength })) ?? [],
    technicalMoves: own?.technicalMoves.map(({ code, proficiency, usageTendency }) => ({ code, proficiency, usageTendency })) ?? [],
    basketballSpecializationTraits: own?.basketballSpecializationTraits.map(({ code }) => code) ?? [],
    ...(status === 'OPPONENT_UNOBSERVED' ? { suggestedMission: 'LIVE_GAME' as const } : {}),
  }
}

/** Exhaustive, explicit 60-code bridge to *existing* TrainingCatalog modules.
 * It does not mean that a training session automatically upgrades the move.
 */
export const REPERTOIRE_MOVE_TRAINING = Object.freeze(Object.fromEntries(
  ([
    ['ballControl', [
      'CROSSOVER','DOUBLE_CROSSOVER','BETWEEN_LEGS','BEHIND_BACK','IN_AND_OUT',
      'HESITATION','SPIN_DRIBBLE','SNAKE_DRIBBLE','RETREAT_DRIBBLE','HOSTAGE_DRIBBLE',
    ]],
    ['shotCreation', [
      'STEPBACK','SIDE_STEP','SNATCH_BACK','PULLBACK','STOP_AND_GO','REJECT_SCREEN','SPLIT_PICK_AND_ROLL',
      'ONE_DRIBBLE_PULLUP','SIDE_DRIBBLE_THREE','STEPBACK_THREE','TURNAROUND_JUMPER','FADEAWAY','DRIFT_SHOT','RELOCATION_THREE',
    ]],
    ['rimFinishing', [
      'EURO_STEP','PRO_HOP','SPIN_FINISH','REVERSE_FINISH','SCOOP_FINISH',
      'EXTENDED_ARM_FINISH','WRONG_FOOT_FINISH','INSIDE_HAND_FINISH','POWER_FINISH','DOUBLE_CLUTCH',
    ]],
    ['floaters', ['FLOATER','RUNNER','PUSH_SHOT','HOOK_FLOATER']],
    ['postScoring', [
      'HOOK_SHOT','JUMP_HOOK','TURNAROUND_FADEAWAY','DROP_STEP','UP_AND_UNDER',
      'POST_SPIN','FACE_UP','SHOULDER_FAKE','POST_STEPBACK',
    ]],
    ['passing', [
      'POCKET_PASS','WRAPAROUND_PASS','SKIP_PASS','LOB_PASS','HOOK_PASS',
      'LIVE_DRIBBLE_ONE_HAND_PASS','BEHIND_BACK_PASS','TOUCH_PASS',
    ]],
    ['defensiveAwareness', [
      'CHASE_DOWN_BLOCK','STRIP_DOWN','DIG_DOWN','VERTICALITY','REAR_VIEW_CONTEST',
    ]],
  ] as const).flatMap(([moduleId, moveCodes]) => moveCodes.map((code) => [code, moduleId] as const)),
)) as Readonly<Record<string, string>>

/** Ordering heuristic only: no training growth multiplier, learned move or gameplay effect. */
export interface RepertoireTrainingAdvice {
  readonly playerId: PlayerId
  readonly moveCode: string
  readonly moduleId: string
  readonly proficiency: number
  readonly usageTendency: number
  readonly priority: number
}

export function recommendRepertoireTraining(
  world: GameWorld,
  teamId: TeamId,
  asOfDate: GameDate = world.currentDate,
): readonly RepertoireTrainingAdvice[] {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError('Repertoire advice requires a known team')
  const recommendations: RepertoireTrainingAdvice[] = []
  for (const playerId of team.rosterPlayerIds) {
    const player = world.players[playerId]
    const repertoire = world.playerRepertoireByPlayerId[playerId]
    if (player === undefined || repertoire === undefined) continue
    // This view is non-prescriptive on match days, when injured or fatigued.
    if (!isPlayerAvailable(world, playerId, asOfDate)
      || (world.careerFatigueByPlayerId[playerId] ?? 0) >= 70
      || Object.values(world.games).some((game) =>
        game.date === asOfDate && (game.homeTeamId === teamId || game.awayTeamId === teamId))) continue
    for (const move of repertoire.technicalMoves) {
      if (move.asOfOn > asOfDate || move.proficiency >= 70) continue
      const moduleId = REPERTOIRE_MOVE_TRAINING[move.code]
      if (moduleId === undefined) continue // unknown legacy code: fail closed
      const definition = trainingDefinitionById(moduleId)
      if (definition.eligiblePositions !== undefined
        && !definition.eligiblePositions.includes(player.basketball.primaryPosition)) continue
      recommendations.push({
        playerId,
        moveCode: move.code,
        moduleId,
        proficiency: move.proficiency,
        usageTendency: move.usageTendency,
        // Advisory rank only; NOT an estimated gain or prediction.
        priority: (70 - move.proficiency) * (100 + move.usageTendency),
      })
    }
  }
  return Object.freeze(recommendations
    .sort((a, b) => b.priority - a.priority || a.playerId.localeCompare(b.playerId) || a.moveCode.localeCompare(b.moveCode))
    .slice(0, 5))
}
