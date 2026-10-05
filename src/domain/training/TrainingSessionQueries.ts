import { addDays, type GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { ScheduledTrainingSession } from './TrainingSchedule'

/** Read-only weekly calendar projection from the canonical scheduled/completed session records. */
export function sessionsForTrainingWeek(
  sessions: readonly ScheduledTrainingSession[],
  teamId: TeamId,
  weekStart: GameDate,
): readonly ScheduledTrainingSession[] {
  const weekEnd = addDays(weekStart, 6)
  return sessions
    .filter((session) => session.teamId === teamId && session.date >= weekStart && session.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
}
