import { describe, expect, it } from 'vitest'
import { createPlace } from '@/domain/facilities'
import { createCompetition } from '@/domain/competition'
import { createTeam } from '@/domain/team'
import { createPlayer } from '@/domain/player'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createTalentCohort } from '@/domain/talent'
import { createSeason } from '@/domain/season'
import { createGameDate } from '@/domain/date'
import { seasonIdFromString } from '@/domain/ids'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { createDefaultTrainingPlan } from '@/domain/training'
import { executeTeamTraining } from '@/engine/training/TrainingEngine'
import { applyOffseasonDevelopment } from '@/engine/development/OffseasonDevelopment'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { acceptYouthIntake, configureTeamPathway, getPlayerPathway, promotePathwayPlayer, releaseYouthPlayer } from './YouthPathwayEngine'

function setup(gender: 'male' | 'female' = 'female') {
  const fixture = createValidGameWorldInput()
  const base = createGameWorld(gender === 'female' ? fixture : { ...fixture, players: fixture.players.map((player) => createPlayer({ ...player, gender })), teams: fixture.teams.map((team) => createTeam({ ...team, gender })), competitions: fixture.competitions.map((competition) => createCompetition({ ...competition, gender })) })
  const senior = Object.values(base.teams)[0]!
  const org = base.organizationsById[senior.organizationId]!
  const place = createPlace({ id: `academy-place-${gender}`, kind: 'CITY', name: 'Academy Place', countryId: senior.countryId })
  const youth = createTeam({ id: `team-youth-${gender}` as never, name: 'Young team', gender, countryId: senior.countryId, organizationId: senior.organizationId, organizationSectionId: senior.organizationSectionId, rosterPlayerIds: [] })
  const competition = createCompetition({ id: `competition-youth-${gender}` as never, name: 'Youth League', gender, participantTeamIds: [senior.id, youth.id], rules: { ...base.competitions[base.seasons[base.currentSeasonId]!.competitionId]!.rules, playerAgeEligibility: { maximumAge: 18, referenceDate: 'competitionDate' } } })
  let world = updateGameWorld(base, { places: [place], organizations: Object.values(base.organizationsById).map((item) => item.id === org.id ? { ...item, primaryPlaceId: place.id } : item), teams: [...Object.values(base.teams), youth], competitions: [...Object.values(base.competitions).filter((item) => item.id !== competition.id), competition], trainingPlansByTeamId: { ...base.trainingPlansByTeamId, [youth.id]: createDefaultTrainingPlan(youth.id) }, talentCohorts: [createTalentCohort({ id: `cohort:${gender}`, placeId: place.id as never, birthYear: 2017, generationYear: 2032, gender, seed: 9123, inputVersion: 'fixture-v1', inputs: { ageCohortPopulation: 1000, basketballParticipationPerThousand: 50, accessOpportunityBasisPoints: 9000 } })] })
  world = configureTeamPathway(world, { id: `pathway:${senior.id}`, organizationId: senior.organizationId, seniorTeamId: senior.id, teamId: senior.id, role: 'senior', movementTargetTeamIds: [] })
  world = configureTeamPathway(world, { id: `pathway:${youth.id}`, organizationId: senior.organizationId, seniorTeamId: senior.id, teamId: youth.id, role: 'youth', category: 'U18', movementTargetTeamIds: [senior.id] })
  return { world, senior, youth, competition }
}

describe('BS15C club youth pathway', () => {
  it.each(['male', 'female'] as const)('intakes one canonical %s Player, promotes and saves registration history', (gender) => {
    const { world: start, senior, youth, competition } = setup(gender)
    const accepted = acceptYouthIntake(start, { cohortId: `cohort:${gender}`, candidateIndex: 1, youthTeamId: youth.id, competitionId: competition.id, actionId: `intake:${gender}`, decision: 'ACCEPT' })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    const playerId = accepted.playerId
    expect(accepted.world.teams[youth.id]!.rosterPlayerIds).toContain(playerId)
    expect(accepted.world.talentMaterializationsByCandidateKey[`cohort:${gender}:candidate:000001`]!.playerId).toBe(playerId)
    const trained = executeTeamTraining(accepted.world, youth.id)
    expect(trained.trainingSessionsById[`training:${trained.currentDate}:${youth.id}`]!.playerResults.map((item) => item.playerId)).toContain(playerId)
    const developed = applyOffseasonDevelopment(trained, { fromSeasonId: trained.currentSeasonId, toSeasonId: trained.currentSeasonId, targetDate: createGameDate(2033, 10, 1), cycleId: `youth-development:${gender}` })
    expect(developed.world.playerRatingHistoryByPlayerId[playerId]?.[0]?.stimulusByRating).toBeDefined()
    const repeated = acceptYouthIntake(accepted.world, { cohortId: `cohort:${gender}`, candidateIndex: 1, youthTeamId: youth.id, competitionId: competition.id, actionId: `intake:${gender}`, decision: 'ACCEPT' })
    expect(repeated.ok).toBe(true)
    expect(repeated.world.playerRegistrationsById).toHaveProperty(`registration:intake:${gender}`)
    expect(Object.keys(repeated.world.playerRegistrationsById)).toHaveLength(Object.keys(accepted.world.playerRegistrationsById).length)
    const envelope = serializeGameWorldV4(developed.world, '2032-10-01T00:00:00.000Z')
    const saved = deserializeGameWorldV4(envelope)
    const { teamPathwayRelations: _pathways, playerRegistrations: _history, ...legacyPayload } = envelope.payload
    const legacy = deserializeGameWorldV4({ ...envelope, payload: legacyPayload })
    expect(Object.keys(legacy.teamPathwayRelationsById)).toHaveLength(0)
    expect(Object.keys(legacy.playerRegistrationsById)).toHaveLength(0)
    expect(legacy.teams[youth.id]!.rosterPlayerIds).toEqual(saved.teams[youth.id]!.rosterPlayerIds)
    const promoted = promotePathwayPlayer(saved, { playerId, toTeamId: senior.id, actionId: `promote:${gender}` })
    expect(promoted.ok).toBe(true)
    if (!promoted.ok) return
    expect(promoted.world.teams[youth.id]!.rosterPlayerIds).not.toContain(playerId)
    expect(promoted.world.teams[senior.id]!.rosterPlayerIds).toContain(playerId)
    expect(promoted.world.playerRatingHistoryByPlayerId[playerId]).toEqual(developed.world.playerRatingHistoryByPlayerId[playerId])
    expect(getPlayerPathway(promoted.world, playerId).registrations.map((item) => item.cause)).toEqual(['ACADEMY_INTAKE', 'SENIOR_PROMOTION'])
    expect(promotePathwayPlayer(promoted.world, { playerId, toTeamId: senior.id, actionId: `promote:${gender}` }).world).toBe(promoted.world)
    const released = releaseYouthPlayer(accepted.world, { playerId, actionId: `release:${gender}` })
    expect(released.ok).toBe(true)
    expect(released.world.players[playerId]).toBeDefined()
    expect(released.world.teams[youth.id]!.rosterPlayerIds).not.toContain(playerId)
    expect(releaseYouthPlayer(released.world, { playerId, actionId: `release:${gender}` }).world).toBe(released.world)
  })

  it('schedules youth Teams through the ordinary competition fixture generator', () => {
    const { world, youth, competition } = setup()
    const season = createSeason({ id: seasonIdFromString('season-youth-test'), competitionId: competition.id, label: 'Youth 2032', startDate: createGameDate(2032, 10, 1), endDate: createGameDate(2033, 5, 31) })
    const scheduledWorld = updateGameWorld(world, { seasons: [...Object.values(world.seasons), season] })
    const games = generateRoundRobinSchedule({ world: scheduledWorld, seasonId: season.id })
    expect(games.some((game) => game.homeTeamId === youth.id || game.awayTeamId === youth.id)).toBe(true)
    const nextSeason = createSeason({ id: seasonIdFromString('season-youth-next'), competitionId: competition.id, label: 'Youth 2033', startDate: createGameDate(2033, 10, 1), endDate: createGameDate(2034, 5, 31) })
    const rolloverWorld = updateGameWorld(scheduledWorld, { seasons: [...Object.values(scheduledWorld.seasons), nextSeason] })
    expect(generateRoundRobinSchedule({ world: rolloverWorld, seasonId: nextSeason.id }).some((game) => game.homeTeamId === youth.id || game.awayTeamId === youth.id)).toBe(true)
  })

  it('rejects over-age competition entry without a partial roster change', () => {
    const { world, senior, youth, competition } = setup()
    const oldCohort = createTalentCohort({ id: 'cohort:old', placeId: Object.values(world.placesById)[0]!.id as never, birthYear: 2000, generationYear: 2032, gender: 'female', seed: 2, inputVersion: 'fixture-v1', inputs: { ageCohortPopulation: 1000, basketballParticipationPerThousand: 50, accessOpportunityBasisPoints: 9000 } })
    const prepared = updateGameWorld(world, { talentCohorts: [...Object.values(world.talentCohortsById), oldCohort] })
    const result = acceptYouthIntake(prepared, { cohortId: oldCohort.id, candidateIndex: 1, youthTeamId: youth.id, competitionId: competition.id, actionId: 'too-old', decision: 'ACCEPT' })
    expect(result.ok).toBe(false)
    expect(result.world.teams[youth.id]!.rosterPlayerIds).toEqual([])
    expect(result.world.talentMaterializationsByCandidateKey[`${oldCohort.id}:candidate:000001`]).toBeUndefined()
    expect(result.world.teams[senior.id]!.rosterPlayerIds).toEqual(world.teams[senior.id]!.rosterPlayerIds)
  })

  it('surfaces age-out for a decision without moving the Player automatically', () => {
    const { world, youth } = setup()
    const competitionId = Object.values(world.competitions).find((item) => item.name === 'Youth League')!.id
    const accepted = acceptYouthIntake(world, { cohortId: 'cohort:female', candidateIndex: 1, youthTeamId: youth.id, competitionId, actionId: 'ageout-intake', decision: 'ACCEPT' })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    const aged = updateGameWorld(accepted.world, { currentDate: createGameDate(2036, 10, 1) })
    expect(getPlayerPathway(aged, accepted.playerId).pathwayStatus).toBe('AGE_OUT_REQUIRES_DECISION')
    expect(aged.teams[youth.id]!.rosterPlayerIds).toContain(accepted.playerId)
  })
})
