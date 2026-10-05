import { describe, expect, it } from 'vitest'
import { parseGameDate } from '@/domain/date'
import { teamIdFromString } from '@/domain/ids'
import { createScheduledTrainingSession } from './TrainingSchedule'
import { sessionsForTrainingWeek } from './TrainingSessionQueries'

describe('sessionsForTrainingWeek', () => {
  it('projects scheduled future work and completed history for one team in chronological order', () => {
    const teamId = teamIdFromString('weekly-team')
    const otherTeamId = teamIdFromString('other-weekly-team')
    const make = (id: string, date: string, status: 'scheduled' | 'completed' = 'scheduled', selectedTeamId = teamId) =>
      createScheduledTrainingSession({ id, teamId: selectedTeamId, date: parseGameDate(date), startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal', status })
    const result = sessionsForTrainingWeek([
      make('future', '2026-10-08'),
      make('outside', '2026-10-12'),
      make('completed', '2026-10-06', 'completed'),
      make('other-team', '2026-10-07', 'scheduled', otherTeamId),
    ], teamId, parseGameDate('2026-10-05'))

    expect(result.map((session) => [session.id, session.status])).toEqual([
      ['completed', 'completed'],
      ['future', 'scheduled'],
    ])
  })
})
