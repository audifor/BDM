import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import { playerIdFromString, seasonIdFromString } from '@/domain/ids'
import { PLAYER_TRUTH_RATING_KEYS } from '@/domain/player'
import { createUserTrainingModule, TRAINING_CATALOG } from '@/domain/training'
import { getPlayerRosterTeamId, updateGameWorld } from '@/domain/world'
import { applyOffseasonDevelopment } from '@/engine/development'
import { nextEligibleTrainingDate } from '@/engine/training'

import { buildAttributeHighlights, buildAttributeGaps, buildPlayerAttributesEvolution } from './buildPlayerAttributesEvolution'

function userTeamPlayerId(world: ReturnType<typeof createNewGame>) {
  const team = Object.values(world.teams).find((candidate) => candidate.coachId === world.userCoachId)!
  return team.rosterPlayerIds[0]!
}

describe('buildPlayerAttributesEvolution', () => {
  it('places every rating against the competition without counting the player twice', () => {
    const world = createNewGame()
    const player = world.players[userTeamPlayerId(world)]!
    const evolution = buildPlayerAttributesEvolution(world, player)
    const shooting = evolution.THREE_POINT_STATIC

    expect(shooting.standing.status).toBe('available')
    expect(shooting.standing.percentile).toBeGreaterThanOrEqual(0)
    expect(shooting.standing.percentile).toBeLessThanOrEqual(100)
    expect(shooting.standing.positionLabel).toBe(player.basketball.primaryPosition)
    expect(shooting.standing.positionMean).not.toBeNull()
    // The league baseline and the percentile are computed from the same rival-only sample.
    expect(shooting.standing.positionSampleSize).toBeLessThanOrEqual(shooting.league.sampleSize)
    expect(shooting.standing.note).toContain('never counts in their own sample')
  })

  it('ranks signature skills above weak links by competition percentile', () => {
    const world = createNewGame()
    const player = world.players[userTeamPlayerId(world)]!
    const evolution = buildPlayerAttributesEvolution(world, player)
    const { signatureSkills, weakLinks } = buildAttributeHighlights(evolution)

    expect(signatureSkills.length).toBeGreaterThan(0)
    expect(signatureSkills.length).toBe(weakLinks.length)
    const best = signatureSkills[0]!
    const worst = weakLinks[0]!
    expect(best.percentile!).toBeGreaterThanOrEqual(worst.percentile!)
    expect(best.value).toBe(player.basketball.ratings[best.id])
    for (const highlight of [...signatureSkills, ...weakLinks]) {
      expect(highlight.label.length).toBeGreaterThan(0)
    }
    // The two lists never overlap, or the page would call the same rating a strength and a weakness.
    const signatureIds = new Set(signatureSkills.map((entry) => entry.id))
    expect(weakLinks.some((entry) => signatureIds.has(entry.id))).toBe(false)
  })

  it('declares the reference elements it cannot produce', () => {
    const gaps = buildAttributeGaps()
    expect(gaps.map((gap) => gap.label)).toEqual(['Category description', 'Role fit'])
    for (const gap of gaps) {
      expect(gap.reason.length).toBeGreaterThan(0)
    }
  })

  it('reports the current value as the only point when no transition has been recorded', () => {
    const world = createNewGame()
    const player = world.players[userTeamPlayerId(world)]!
    const evolution = buildPlayerAttributesEvolution(world, player)
    const shooting = evolution.THREE_POINT_STATIC

    expect(shooting.points).toHaveLength(1)
    expect(shooting.points[0]!.value).toBe(player.basketball.ratings.THREE_POINT_STATIC)
    expect(shooting.points[0]!.isCurrent).toBe(true)
    expect(shooting.hasRecordedHistory).toBe(false)
    expect(shooting.note).toContain('No progression recorded yet')
  })

  it('does not project legacy 35-key history onto canonical 80-key ratings', () => {
    const base = createNewGame()
    const playerId = userTeamPlayerId(base)
    // Mirrors the real transition: development runs, then the world moves into the next season.
    const advanced = updateGameWorld(
      applyOffseasonDevelopment(base, {
        fromSeasonId: seasonIdFromString('generated-season-0001'),
        toSeasonId: seasonIdFromString('generated-season-0003'),
        targetDate: createGameDate(2033, 10, 1),
      }).world,
      { currentSeasonId: seasonIdFromString('generated-season-0002') },
    )

    const evolution = buildPlayerAttributesEvolution(advanced, advanced.players[playerId]!)
    const shooting = evolution.THREE_POINT_STATIC

    expect(advanced.playerRatingHistoryByPlayerId[playerId]).toHaveLength(1)
    expect(shooting.hasRecordedHistory).toBe(false)
    expect(shooting.points).toHaveLength(1)
    expect(shooting.points[0]!.value).toBe(advanced.players[playerId]!.basketball.ratings.THREE_POINT_STATIC)
    expect(shooting.changeSinceFirst).toBe(0)
  })

  it('does not read legacy rating keys as truth-key history', () => {
    const base = createNewGame()
    const playerId = userTeamPlayerId(base)
    const current = base.players[playerId]!.basketball.ratings.THREE_POINT_STATIC
    const world = updateGameWorld(base, {
      playerRatingHistoryByPlayerId: {
        [playerId]: [
          { seasonId: seasonIdFromString('season-oldest'), deltas: { threePointShooting: 2 } },
          { seasonId: seasonIdFromString('season-middle'), deltas: { threePointShooting: -1 } },
        ],
      },
    })

    const shooting = buildPlayerAttributesEvolution(world, world.players[playerId]!).THREE_POINT_STATIC

    expect(shooting.points).toHaveLength(1)
    expect(shooting.points[0]!.value).toBe(current)
    expect(shooting.hasRecordedHistory).toBe(false)
  })

  it('uses rival players of the same competition as the league baseline', () => {
    const world = createNewGame()
    const playerId = userTeamPlayerId(world)
    const player = world.players[playerId]!
    const evolution = buildPlayerAttributesEvolution(world, player)
    const baseline = evolution.THREE_POINT_STATIC.league

    expect(baseline.status).toBe('available')
    expect(baseline.sampleSize).toBeGreaterThan(0)
    expect(baseline.mean).not.toBeNull()
    expect(baseline.note).toContain('Mean of this rating')

    // The baseline covers the competition's participants only, never the whole world.
    const competition = world.competitions[world.seasons[world.currentSeasonId]!.competitionId]!
    const participants = competition.participantTeamIds
      .flatMap((teamId) => world.teams[teamId]!.rosterPlayerIds)
      .filter((id) => id !== playerId)
    expect(baseline.sampleSize).toBe(participants.length)
    expect(baseline.sampleSize).toBeLessThan(Object.keys(world.players).length)
    expect(baseline.scopeLabel).toBe(competition.name)
  })

  it('lists every catalog training that targets the attribute and fits the position', () => {
    const world = createNewGame()
    const player = world.players[userTeamPlayerId(world)]!
    const evolution = buildPlayerAttributesEvolution(world, player)
    const options = evolution.THREE_POINT_STATIC.trainings
    const expected = TRAINING_CATALOG.filter(
      (definition) =>
        definition.effects.targetRatings.includes('threePointShooting') &&
        definition.effects.developmentWeight > 0 &&
        (definition.eligiblePositions === undefined ||
          definition.eligiblePositions.includes(player.basketball.primaryPosition)),
    )

    expect(expected.length).toBeGreaterThan(0)
    expect(options).toEqual([])
  })

  it('covers every canonical rating so the chart never renders an unknown attribute', () => {
    const world = createNewGame()
    const evolution = buildPlayerAttributesEvolution(world, world.players[userTeamPlayerId(world)]!)

    expect(Object.keys(evolution)).toHaveLength(PLAYER_TRUTH_RATING_KEYS.length)
    for (const key of PLAYER_TRUTH_RATING_KEYS) {
      expect(evolution[key].points.length).toBeGreaterThan(0)
      expect(evolution[key].current).toBeGreaterThan(0)
    }
  })

  it('offers the modules the user already created alongside the catalog definitions', () => {
    const base = createNewGame()
    const playerId = userTeamPlayerId(base)
    const world = updateGameWorld(base, {
      userTrainingModulesById: {
        'module:custom-three': createUserTrainingModule({
          id: 'module:custom-three',
          name: 'Triples de Kevin',
          baseDefinitionId: 'threePoint',
          scope: 'individual',
          intensity: 'high',
        }),
      },
    })

    const options = buildPlayerAttributesEvolution(world, world.players[playerId]!).THREE_POINT_STATIC.trainings
    expect(options).toEqual([])
  })

  it('marks team-scoped options as not individually assignable', () => {
    const world = createNewGame()
    const playerId = userTeamPlayerId(world)
    const options = buildPlayerAttributesEvolution(world, world.players[playerId]!).PASSING_VISION.trainings
    expect(options).toEqual([])
  })

  it('points the quick assignment at the next eligible training day', () => {
    const world = createNewGame()
    const playerId = userTeamPlayerId(world)
    const assignment = buildPlayerAttributesEvolution(world, world.players[playerId]!).THREE_POINT_STATIC
      .assignment

    expect(assignment.status).toBe('unavailable')
    expect(assignment.reason).toContain('canonical 80-key')
    expect(assignment.date).toBeNull()
    expect(assignment.startTime).toBeNull()
    expect(assignment.sessionId).toBeNull()
    expect(assignment.nextSession).toBeNull()
  })

  it('refuses to schedule a player who is not on the user roster', () => {
    const world = createNewGame()
    const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
    const otherTeam = Object.values(world.teams).find((team) => team.id !== userTeam.id)!
    const outsiderId = otherTeam.rosterPlayerIds[0]!

    expect(getPlayerRosterTeamId(world, outsiderId)).not.toBe(userTeam.id)
    const assignment = buildPlayerAttributesEvolution(world, world.players[outsiderId]!).THREE_POINT_STATIC
      .assignment

    expect(assignment.status).toBe('unavailable')
    expect(assignment.date).toBeNull()
    expect(assignment.sessionId).toBeNull()
    expect(assignment.reason).toContain('canonical 80-key')
  })

  it('reports the pending individual session as the next training', () => {
    const base = createNewGame()
    const playerId = userTeamPlayerId(base)
    const teamId = getPlayerRosterTeamId(base, playerId)!
    const date = nextEligibleTrainingDate(base.currentDate)
    const world = updateGameWorld(base, {
      scheduledTrainingSessionsById: {
        'session:pending': {
          id: 'session:pending',
          teamId,
          date,
          startTime: '09:00',
          durationMinutes: 60,
          scope: 'individual',
          playerId: playerIdFromString(playerId),
          definitionId: 'threePoint',
          intensity: 'normal',
          status: 'scheduled',
        },
      },
    })

    const assignment = buildPlayerAttributesEvolution(world, world.players[playerId]!).THREE_POINT_STATIC
      .assignment

    expect(assignment.nextSession).toBeNull()
    expect(assignment.status).toBe('unavailable')
  })

  it('names the module the user actually scheduled, not its base definition', () => {
    const base = createNewGame()
    const playerId = userTeamPlayerId(base)
    const teamId = getPlayerRosterTeamId(base, playerId)!
    const date = nextEligibleTrainingDate(base.currentDate)
    const world = updateGameWorld(base, {
      userTrainingModulesById: {
        'module:custom-three': createUserTrainingModule({
          id: 'module:custom-three',
          name: 'Triples de Kevin',
          baseDefinitionId: 'threePoint',
          scope: 'individual',
          intensity: 'high',
        }),
      },
      scheduledTrainingSessionsById: {
        'session:pending': {
          id: 'session:pending',
          teamId,
          date,
          startTime: '09:00',
          durationMinutes: 60,
          scope: 'individual',
          playerId: playerIdFromString(playerId),
          definitionId: 'threePoint',
          moduleId: 'module:custom-three',
          intensity: 'high',
          status: 'scheduled',
        },
      },
    })

    const next = buildPlayerAttributesEvolution(world, world.players[playerId]!).THREE_POINT_STATIC.assignment
      .nextSession

    expect(next).toBeNull()
  })
})
