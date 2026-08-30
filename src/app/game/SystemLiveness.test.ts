import { describe, expect, it } from 'vitest'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { respondToMediaOpportunity } from '@/engine/media'
import { acceptCoachJobOffer, applyUserCoachForJob } from '@/app/coachCareer'
import { createScheduledTrainingSession } from '@/domain/training'
import { nextEligibleTrainingDate, scheduleTrainingSession } from '@/engine/training'
import { advanceGameDay } from './advanceGameDay'
import { createNewGame } from './createNewGame'
import { instantResult } from './playUserGame'

describe('system liveness gameplay route', () => {
  it('reaches scheduled training, match consequences, media, career movement and save/load from normal game boundaries', () => {
    const created = createNewGame()
    const userTeam = Object.values(created.teams).find((team) => team.coachId === created.userCoachId)!
    const userGame = Object.values(created.games).find((game) => game.status === 'scheduled' && (game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id))!
    const beforeProgress = created.coachRpgProfilesByCoachId[created.userCoachId]!.development.globalProgress
    const finalFixture = updateGameWorld(created, { games: Object.values(created.games).map((game) => game.id === userGame.id ? { ...game, stakes: 'final' as never } : game) })

    const played = instantResult(finalFixture)
    // The canonical scheduled/module training system, not the legacy auto-applied plan, is what
    // must reach a normal player through this route: schedule a real session for the next
    // eligible date exactly as TrainingPcbPage/gameStore would, then advance through it.
    const scheduled = scheduleTrainingSession(played, createScheduledTrainingSession({
      id: 'liveness-session',
      teamId: userTeam.id,
      date: nextEligibleTrainingDate(played.currentDate),
      startTime: '09:00',
      durationMinutes: 60,
      scope: 'team',
      definitionId: 'threePoint',
      intensity: 'normal',
    }))
    const answered = respondToMediaOpportunity(scheduled, Object.values(scheduled.mediaOpportunitiesById).find((item) => item.status === 'pending')!.id, Object.values(scheduled.mediaOpportunitiesById).find((item) => item.status === 'pending')!.answers[0]!.stance)
    const advanced = advanceGameDay(answered)
    const opening = Object.values(advanced.coachJobOpeningsById).find((item) => item.status === 'open')!
    const applied = applyUserCoachForJob(advanced, opening.id)
    const offer = Object.values(applied.world.coachJobOffersById).find((item) => item.coachId === advanced.userCoachId && item.status === 'pending')!
    const moved = acceptCoachJobOffer(applied.world, offer.id)
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(moved, '2032-10-01T00:00:00.000Z'))

    expect(advanced.scheduledTrainingSessionsById['liveness-session']!.status).toBe('completed')
    expect(played.coachRpgProfilesByCoachId[played.userCoachId]!.development.globalProgress).toBeGreaterThan(beforeProgress)
    expect(Object.keys(answered.newsItemsById).length).toBeGreaterThan(0)
    expect(Object.keys(answered.mediaInteractionsById)).toHaveLength(1)
    expect(moved.coachEmploymentByCoachId[moved.userCoachId]!.teamId).toBe(opening.teamId)
    expect(Object.keys(moved.memoriesById).length).toBeGreaterThan(0)
    expect(loaded.scheduledTrainingSessionsById).toEqual(moved.scheduledTrainingSessionsById)
    expect(loaded.coachEmploymentByCoachId[loaded.userCoachId]!.teamId).toBe(opening.teamId)
    expect(loaded.mediaInteractionsById).toEqual(moved.mediaInteractionsById)
  })
})
