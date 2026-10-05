import { describe, expect, it } from 'vitest'

import { addDays, compareGameDates } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { reviewReturnToPlay } from '@/engine/injury/ReturnToPlayEngine'
import { getAvailableDraftProspects } from '@/engine/draft'
import { skipMediaOpportunity } from '@/engine/media'
import { isSeasonComplete } from '@/engine/season'
import { getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { continueGame, getContinueStopReason } from './ContinueFlow'
import { createAcbTestGame as createFullAcbTestGame } from './createAcbTestGame'
import { instantResult } from './matchResolution'
import { selectDraftProspect } from '@/app/draft'
import { startNextSeason } from './startNextSeason'
import { withShortGameFormat } from './testFixtures'

// MX0.2 career acceptance harness. A production-like Spain/ACB world (the offline ACB test authority) is
// driven through the same canonical commands the app uses: Continue for time, Instant result for the user's
// own Game, startNextSeason at the season checkpoint, and the canonical medical/media commands for the
// breakpoints the app resolves through their apps. It certifies the whole loop: 30 days, 90 days, a full
// season reached and rolled over, and at least 30 days of the next season.
const createAcbTestGame = (...args: Parameters<typeof createFullAcbTestGame>): ReturnType<typeof createFullAcbTestGame> => withShortGameFormat(createFullAcbTestGame(...args))

const MATCH_SEED = 20261001
const seedFactory = () => MATCH_SEED

interface CareerMetrics {
  readonly startDate: GameWorld['currentDate']
  endDate: GameWorld['currentDate']
  calendarDaysAdvanced: number
  gameDaysProcessed: number
  userGamesResolved: number
  aiGamesResolved: number
  injuriesCreated: number
  rehabsCreated: number
  rtpReviewsEncountered: number
  readonly breakpointsByReason: Record<string, number>
  seasonTransitions: number
  aiEmergencyRosterRecoveries: number
  technicalFailures: string[]
  noProgressStops: number
}

interface CareerEvidence {
  readonly metrics: CareerMetrics
  readonly seenInjuries: Set<string>
  readonly seenRehabs: Set<string>
}

function newCareer(initial: GameWorld): CareerEvidence {
  return {
    metrics: {
      startDate: initial.currentDate, endDate: initial.currentDate, calendarDaysAdvanced: 0, gameDaysProcessed: 0,
      userGamesResolved: 0, aiGamesResolved: 0, injuriesCreated: 0, rehabsCreated: 0, rtpReviewsEncountered: 0,
      breakpointsByReason: {}, seasonTransitions: 0, aiEmergencyRosterRecoveries: 0, technicalFailures: [], noProgressStops: 0,
    },
    seenInjuries: new Set(), seenRehabs: new Set(),
  }
}

/**
 * One canonical career step: the Continue stop policy, then exactly one canonical day. Every step is
 * attributable -- a stop is resolved through its canonical command, or recorded with its reason.
 */
function careerStep(world: GameWorld, evidence: CareerEvidence): GameWorld {
  const { metrics } = evidence
  const stop = getContinueStopReason(world)
  if (stop !== undefined) {
    const reason = stop.type === 'breakpoint' ? stop.breakpoint.reason : stop.type
    metrics.breakpointsByReason[reason] = (metrics.breakpointsByReason[reason] ?? 0) + 1
    if (stop.type === 'userGame') { metrics.userGamesResolved += 1; return instantResult(world, undefined, MATCH_SEED) }
    if (stop.type === 'mediaOpportunity') return skipMediaOpportunity(world, stop.opportunityId)
    if (stop.type === 'seasonComplete') { metrics.seasonTransitions += 1; return startNextSeason(world) }
    if (stop.type === 'breakpoint' && stop.breakpoint.reason === 'draftPick') {
      const draftId = stop.breakpoint.actionTarget?.draftId
      const prospect = draftId === undefined ? undefined : getAvailableDraftProspects(world, draftId)[0]
      if (draftId !== undefined && prospect !== undefined) return selectDraftProspect(world, draftId, prospect)
    }
    if (stop.type === 'breakpoint' && stop.breakpoint.reason === 'returnToPlayReview') {
      metrics.rtpReviewsEncountered += 1
      const review = reviewReturnToPlay(world, { injuryId: stop.breakpoint.sourceId as never, decision: 'CONTINUE_RECOVERY', actor: { kind: 'USER', coachId: world.userCoachId } })
      if (review.ok) return review.world
    }
    throw new Error(`CAREER_STOP_UNRESOLVED: ${reason} at ${world.currentDate} :: ${'breakpoint' in stop ? stop.breakpoint.diagnostic : ''}`)
  }

  sampleDay(world, evidence)
  const advanced = continueGame(world, 1, seedFactory)
  if (advanced.daysAdvanced !== 1 || advanced.world.currentDate === world.currentDate) { metrics.noProgressStops += 1; return advanced.world }
  metrics.calendarDaysAdvanced += 1
  return advanced.world
}

/** Daily evidence: games resolved today, any AI club that could not dress five, and new medical records. */
function sampleDay(world: GameWorld, evidence: CareerEvidence): void {
  const { metrics, seenInjuries, seenRehabs } = evidence
  const userTeam = getUserTeam(world)
  const games = getScheduledGamesToday(world)
  if (games.length > 0) metrics.gameDaysProcessed += 1
  for (const game of games) {
    const involvesUser = game.homeTeamId === userTeam?.id || game.awayTeamId === userTeam?.id
    if (!involvesUser) metrics.aiGamesResolved += 1
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      if (teamId === userTeam?.id || world.teams[teamId]!.coachId === world.userCoachId) continue
      if (getAvailablePlayersForCompetition(world, teamId, game.competitionId, game.seasonId, game.date).length < 5) metrics.aiEmergencyRosterRecoveries += 1
    }
  }
  for (const injuryId of Object.keys(world.injuriesById)) {
    if (!seenInjuries.has(injuryId)) { seenInjuries.add(injuryId); metrics.injuriesCreated += 1 }
    const injury = world.injuriesById[injuryId as keyof typeof world.injuriesById]!
    if ((injury.rehabilitation?.history.length ?? 0) > 0 && !seenRehabs.has(injuryId)) { seenRehabs.add(injuryId); metrics.rehabsCreated += 1 }
  }
}

function advanceUntil(world: GameWorld, evidence: CareerEvidence, predicate: (world: GameWorld) => boolean): GameWorld {
  let current = world
  // Bounded: the certified loop needs ~400 days; a wider guard would only hide a stall behind the test timeout.
  for (let guard = 0; guard < 700 && !predicate(current); guard += 1) current = careerStep(current, evidence)
  return current
}

describe('MX0.2 career loop acceptance', () => {
  it('runs 30 days, 90 days, a season boundary and 30 days of the next season without a technical dead end', { timeout: 1_800_000 }, () => {
    const initial = createAcbTestGame()
    const evidence = newCareer(initial)
    const metrics = evidence.metrics
    const primaryCompetitionId = initial.competitions[initial.seasons[initial.currentSeasonId]!.competitionId]!.id
    const seasonsBeforeRollover = Object.keys(initial.seasons).length
    let world = initial

    try {
      // Gate A: 30 days.
      world = advanceUntil(world, evidence, () => metrics.calendarDaysAdvanced >= 30)
      expect(metrics.calendarDaysAdvanced).toBeGreaterThanOrEqual(30)

      // Gate B: 90 days.
      world = advanceUntil(world, evidence, () => metrics.calendarDaysAdvanced >= 90)
      expect(metrics.calendarDaysAdvanced).toBeGreaterThanOrEqual(90)

      // Gate C: a full season reached and rolled over through the canonical transition.
      world = advanceUntil(world, evidence, () => metrics.seasonTransitions >= 1)
      expect(metrics.seasonTransitions).toBeGreaterThanOrEqual(1)
      expect(Object.keys(world.seasons).length).toBeGreaterThan(seasonsBeforeRollover)
      expect(Object.keys(world.seasonHistoryBySeasonId).length).toBeGreaterThanOrEqual(1)

      // Gate D: the next season begins and at least 30 further days advance in it.
      const previousSeasonId = initial.currentSeasonId
      world = advanceUntil(world, evidence, (current) => current.currentSeasonId !== previousSeasonId)
      expect(world.currentSeasonId).not.toBe(previousSeasonId)
      const nextSeasonStart = world.currentDate
      world = advanceUntil(world, evidence, (current) => compareGameDates(current.currentDate, addDays(nextSeasonStart, 30)) >= 0)

      // Season transition safety: history kept, new fixtures scheduled, clock valid, Continue works.
      expect(compareGameDates(world.currentDate, nextSeasonStart)).toBeGreaterThanOrEqual(0)
      expect(compareGameDates(world.currentDate, addDays(nextSeasonStart, 30))).toBeGreaterThanOrEqual(0)
      expect(Object.values(world.games).some((game) => game.seasonId === world.currentSeasonId && game.status === 'scheduled')).toBe(true)
      expect(Object.values(world.games).some((game) => game.seasonId === previousSeasonId && game.status === 'completed')).toBe(true)
    } catch (error) {
      metrics.technicalFailures.push((error as Error).message)
    } finally {
      metrics.endDate = world.currentDate
      console.log('MX0.2 CAREER METRICS', JSON.stringify({ ...metrics, primaryCompetitionId }, null, 2))
    }

    expect(metrics.technicalFailures).toEqual([])
    expect(metrics.noProgressStops).toBe(0)
    expect(metrics.gameDaysProcessed).toBeGreaterThan(0)
    expect(metrics.userGamesResolved).toBeGreaterThan(0)
    expect(metrics.aiGamesResolved).toBeGreaterThan(0)
    expect(metrics.injuriesCreated).toBeGreaterThan(0)
  })
})
