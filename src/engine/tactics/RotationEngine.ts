import { getNextScheduledGameForTeam } from '@/engine/calendar'
import { getTeamLineup, resolveGameClockRules, type GameWorld } from '@/domain/world'
import { getLineupAssignments, isValidRotationMinutes, type TeamRotationIntent } from '@/domain/tactics'
import type { PlayerId, TeamId } from '@/domain/ids'
import { updateRotationPlan } from '@/app/game/TacticalPlanning'

const DEFAULT_ROTATION_PERIOD_COUNT = 4
const DEFAULT_PERIOD_MINUTES = 10

/** The real active-12 roster player ids for a team, per the canonical lineup — the only players a rotation allocation is validated/persisted against. */
export function activeLineupPlayerIds(world: GameWorld, teamId: TeamId): readonly PlayerId[] {
  return getLineupAssignments(getTeamLineup(world, teamId)).map((assignment) => assignment.playerId)
}

/**
 * Resolves the per-REGULATION-period minute cap for a team's next scheduled game (never includes
 * an OT entry — see isValidRotationMinutes for why OT is exempt from the strict-total check), or
 * a neutral default when no game/competition can be resolved.
 */
export function rotationRegulationPeriodMinutes(world: GameWorld, teamId: TeamId): readonly number[] {
  const nextGame = getNextScheduledGameForTeam(world, teamId)
  const rules = nextGame === undefined ? undefined : resolveGameClockRules(world, nextGame.competitionId)
  const periodCount = rules?.periodCount ?? DEFAULT_ROTATION_PERIOD_COUNT
  const periodMinutes = rules === undefined ? DEFAULT_PERIOD_MINUTES : rules.periodSeconds / 60
  return Array.from({ length: periodCount }, () => periodMinutes)
}

/**
 * Canonical write boundary for rotation minutes (Issue #9): validates the proposed allocation
 * against the real active-12 roster and the team's actual resolved competition regulation-period
 * minutes — the SAME rule the Rotaciones UI warning uses (see domain/tactics/TacticalPlanning.ts
 * isValidRotationMinutes) — before persisting anything. Stale rows for players no longer in the
 * active lineup are stripped rather than validated or persisted. An invalid allocation throws and
 * leaves `world.rotationPlansByTeamId` completely untouched.
 */
export function updateRotationMinutesForTeam(world: GameWorld, teamId: TeamId, minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>): GameWorld {
  const activePlayerIds = activeLineupPlayerIds(world, teamId)
  const strippedMinutes = Object.fromEntries(Object.entries(minutesByPeriod).filter(([playerId]) => activePlayerIds.includes(playerId as PlayerId))) as Record<PlayerId, readonly number[]>
  const regulationPeriodMinutes = rotationRegulationPeriodMinutes(world, teamId)
  if (!isValidRotationMinutes(strippedMinutes, activePlayerIds, regulationPeriodMinutes)) {
    throw new RangeError('Rotation minutes must sum to exactly periodMinutes*5 for every regulation period among the active players')
  }
  const existing = world.rotationPlansByTeamId[teamId]
  const plan: TeamRotationIntent = { teamId, instructions: existing?.instructions ?? [], minutesByPeriod: strippedMinutes }
  return updateRotationPlan(world, plan)
}
