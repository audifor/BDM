import { describe, expect, it } from 'vitest'
import { createNewGame, prepareMatch, simulateAndApplyGame } from '@/app/game'
import { startNextSeasonFor } from '@/app/game/startNextSeason'
import { createGameDate } from '@/domain/date'
import { createPlayerRegistration } from '@/domain/youth/ClubPathway'
import { updateGameWorld } from '@/domain/world'
import { createCollegeRuleset } from '@/domain/eligibility'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { assignAcademicSupport, resolveAcademicTerm } from '@/engine/academic'
import { assessCollegeEligibility, endPlayerEnrollment, enrollPlayer, evaluatePlayerEligibility, getAvailablePlayersForCompetition, recordCollegeEligibilityAssessment, resolveCollegeRuleset } from './EligibilityEngine'

function collegeFixture() {
  const world = createNewGame()
  const season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
  const game = Object.values(world.games).find((item) => item.seasonId === season.id)!
  const team = world.teams[game.homeTeamId]!
  const playerId = team.rosterPlayerIds[0]!
  const ecosystemId = world.competitions[game.competitionId]!.ecosystemId
  const enrollment = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === playerId && item.teamId === team.id)!
  return { world, season, game, team, playerId, ecosystemId, enrollment }
}

describe('BS15D college enrollment and eligibility', () => {
  it('uses versioned effective rules and keeps historical assessment provenance', () => {
    const { world, season, game, team, playerId, ecosystemId } = collegeFixture()
    const academic = Object.values(world.academicProfilesById).find((item) => item.playerId === playerId)!
    const facts = updateGameWorld(world, { academicProfiles: Object.values(world.academicProfilesById).map((item) => item.id === academic.id ? { ...item, performance: 70, progress: 70 } : item) })
    const v1 = assessCollegeEligibility(facts, { playerId, teamId: team.id, ecosystemId, onDate: createGameDate(2035, 6, 30) })!
    expect(v1.rulesetVersion).toBe('V1')
    expect(v1.eligible).toBe(true)
    const recorded = recordCollegeEligibilityAssessment(facts, { playerId, teamId: team.id, ecosystemId, onDate: v1.assessedOn })
    const revisedFacts = updateGameWorld(recorded, { academicProfiles: Object.values(recorded.academicProfilesById).map((item) => item.id === academic.id ? { ...item, performance: 50 } : item) })
    const withSecondAssessment = recordCollegeEligibilityAssessment(revisedFacts, { playerId, teamId: team.id, ecosystemId, onDate: v1.assessedOn })
    expect(Object.values(withSecondAssessment.collegeEligibilityAssessmentsById)).toHaveLength(2)
    expect(withSecondAssessment.collegeEligibilityAssessmentsById[v1.id]?.eligible).toBe(true)
    expect(Object.values(withSecondAssessment.collegeEligibilityAssessmentsById).some((item) => !item.eligible && item.rulesetVersion === 'V1')).toBe(true)
    const v2 = assessCollegeEligibility(recorded, { playerId, teamId: team.id, ecosystemId, onDate: createGameDate(2035, 7, 1) })!
    expect(v2.rulesetVersion).toBe('V2')
    expect(v2.reasons).toContain('ACADEMIC_REQUIREMENT_NOT_MET')
    expect(withSecondAssessment.collegeEligibilityAssessmentsById[v1.id]?.rulesetVersion).toBe('V1')
    expect(evaluatePlayerEligibility(facts, { playerId, teamId: team.id, competitionId: game.competitionId, seasonId: season.id, onDate: createGameDate(2035, 7, 1) }).eligible).toBe(false)
  })

  it('keeps enrollment separate from roster, consumes pathway evidence, and blocks common match availability on academic failure', () => {
    const { world, season, game, team, playerId, ecosystemId, enrollment } = collegeFixture()
    const registration = createPlayerRegistration({ id: 'registration:prior-bs15c', playerId, teamId: team.id, organizationId: team.organizationId, startsOn: createGameDate(2031, 1, 1), cause: 'SENIOR_PROMOTION', sourceActionId: 'prior:promotion' })
    const withHistory = updateGameWorld(world, { playerRegistrations: [...Object.values(world.playerRegistrationsById), registration] })
    const result = enrollPlayer(withHistory, { playerId, teamId: team.id, ecosystemId })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.enrollment.id).toBe(enrollment.id)
    expect(result.world.teams[team.id]!.rosterPlayerIds).toEqual(team.rosterPlayerIds)
    const assessment = assessCollegeEligibility(result.world, { playerId, teamId: team.id, ecosystemId })!
    expect(assessment.evidence.registrationIds).toContain(registration.id)
    expect(assessment.evidence.enrollmentId).toBe(enrollment.id)
    const academic = Object.values(result.world.academicProfilesById).find((item) => item.playerId === playerId)!
    const failing = updateGameWorld(result.world, { academicProfiles: Object.values(result.world.academicProfilesById).map((item) => item.id === academic.id ? { ...item, performance: 30, progress: 30 } : item) })
    expect(getAvailablePlayersForCompetition(failing, team.id, game.competitionId, season.id, game.date)).not.toContain(playerId)
    expect(prepareMatch(failing, game).squads.home).not.toContain(playerId)
    expect(failing.players[playerId]!.id).toBe(playerId)
  })

  it('rejects invalid rules and contradictory active enrollments', () => {
    const { world, team, playerId, ecosystemId, enrollment } = collegeFixture()
    expect(() => createCollegeRuleset({ id: 'invalid', version: 'bad', ecosystemId, effectiveFrom: createGameDate(2030, 1, 1), minimumAcademicPerformance: -1, minimumAcademicProgress: 55, maximumEligibilitySeasons: 4, participationThreshold: 3, provenance: 'TEST / PRODUCT FIXTURE' })).toThrow('academic threshold')
    const v1 = Object.values(world.collegeRulesetsById).find((item) => item.ecosystemId === ecosystemId && item.version === 'V1')!
    expect(() => updateGameWorld(world, { collegeRulesets: [...Object.values(world.collegeRulesetsById), { ...v1, id: 'college-fixture:overlap', version: 'V3', effectiveFrom: createGameDate(2030, 1, 1), effectiveTo: createGameDate(2035, 1, 1) }] })).toThrow('overlapping effective dates')
    const otherTeam = Object.values(world.teams).find((item) => item.id !== team.id && Object.values(world.competitions).some((competition) => competition.ecosystemId === ecosystemId && competition.participantTeamIds.includes(item.id)))!
    expect(() => updateGameWorld(world, { playerEnrollments: [...Object.values(world.playerEnrollmentsById), { ...enrollment, id: `${enrollment.id}:duplicate`, teamId: otherTeam.id, organizationId: otherTeam.organizationId }] })).toThrow('duplicate active enrollment')
    expect(enrollPlayer(world, { playerId, teamId: team.id, ecosystemId }).ok).toBe(true)
    const closed = endPlayerEnrollment(world, enrollment.id)
    expect(closed.playerEnrollmentsById[enrollment.id]).toMatchObject({ status: 'ended', endsOn: world.currentDate })
    expect(closed.teams[team.id]!.rosterPlayerIds).toEqual(team.rosterPlayerIds)
    const reopened = enrollPlayer(closed, { playerId, teamId: team.id, ecosystemId })
    expect(reopened.ok && reopened.enrollment.id).not.toBe(enrollment.id)
  })

  it('reassesses after term progression and round-trips rules, enrollment, registration, and assessment in Save V4', () => {
    const { world, team, playerId, ecosystemId, enrollment } = collegeFixture()
    const academic = Object.values(world.academicProfilesById).find((item) => item.playerId === playerId)!
    let struggling = updateGameWorld(world, { academicProfiles: Object.values(world.academicProfilesById).map((item) => item.id === academic.id ? { ...item, performance: 50, progress: 60 } : item) })
    const first = assessCollegeEligibility(struggling, { playerId, teamId: team.id, ecosystemId })!
    expect(first.eligible).toBe(false)
    const support = assignAcademicSupport(struggling, playerId, 'bs15d-term-1', 'intensive')
    expect(support.ok).toBe(true)
    if (!support.ok) return
    struggling = resolveAcademicTerm(support.value, 'bs15d-term-1')
    expect(assessCollegeEligibility(struggling, { playerId, teamId: team.id, ecosystemId })!.eligible).toBe(true)
    struggling = recordCollegeEligibilityAssessment(struggling, { playerId, teamId: team.id, ecosystemId })
    const saved = serializeGameWorldV4(struggling, '2032-01-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV4(saved)
    expect(loaded.playerEnrollmentsById[enrollment.id]).toEqual(enrollment)
    expect(loaded.academicTermRecordsById['academic-term:bs15d-term-1:' + playerId]).toBeDefined()
    expect(loaded.collegeRulesetsById).toEqual(struggling.collegeRulesetsById)
    expect(loaded.collegeEligibilityAssessmentsById).toEqual(struggling.collegeEligibilityAssessmentsById)
    expect(loaded.players[playerId]!.id).toBe(playerId)
    const priorV4 = serializeGameWorldV4(world, '2032-01-01T00:00:00.000Z')
    const { collegeRulesets: _rules, playerEnrollments: _enrollments, collegeEligibilityAssessments: _assessments, ...oldPayload } = priorV4.payload
    const oldLoaded = deserializeGameWorldV4({ ...priorV4, payload: oldPayload })
    expect(oldLoaded.players[playerId]!.id).toBe(playerId)
    expect(Object.values(oldLoaded.playerEnrollmentsById).some((item) => item.playerId === playerId && item.status === 'active')).toBe(true)
    expect(Object.values(oldLoaded.collegeRulesetsById).some((item) => item.ecosystemId === ecosystemId)).toBe(true)
  })

  it('carries enrollment, academic and pathway evidence through an NCAA successor season and Save V4', () => {
    let world = createNewGame()
    const season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const game = Object.values(world.games).find((item) => item.seasonId === season.id)!
    const team = world.teams[game.homeTeamId]!
    const playerId = team.rosterPlayerIds[0]!
    const personId = world.players[playerId]!.personId
    const ecosystemId = world.competitions[game.competitionId]!.ecosystemId
    const enrollment = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === playerId && item.teamId === team.id)!
    const academic = Object.values(world.academicProfilesById).find((item) => item.playerId === playerId)!
    const registration = createPlayerRegistration({ id: 'registration:successor-preserved', playerId, teamId: team.id, organizationId: team.organizationId, startsOn: createGameDate(2031, 1, 1), cause: 'SENIOR_PROMOTION', sourceActionId: 'prior:successor' })
    world = updateGameWorld(world, { playerRegistrations: [...Object.values(world.playerRegistrationsById), registration] })
    for (const scheduled of Object.values(world.games).filter((item) => item.seasonId === season.id && item.status === 'scheduled')) world = simulateAndApplyGame(world, scheduled)
    const successor = startNextSeasonFor(world, season.id)
    const afterEnrollment = successor.playerEnrollmentsById[enrollment.id]!
    expect(afterEnrollment).toEqual(enrollment)
    expect(successor.playerRegistrationsById[registration.id]).toEqual(registration)
    expect(successor.academicProfilesById[academic.id]).toEqual(world.academicProfilesById[academic.id])
    expect(successor.eligibilityProfilesById[`eligibility:${ecosystemId}:${team.id}:${playerId}`]!.seasonsUsed).toBeGreaterThanOrEqual(world.eligibilityProfilesById[`eligibility:${ecosystemId}:${team.id}:${playerId}`]!.seasonsUsed)
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(successor, '2033-10-01T00:00:00.000Z'))
    expect(loaded.playerEnrollmentsById[enrollment.id]).toEqual(enrollment)
    expect(loaded.playerRegistrationsById[registration.id]).toEqual(registration)
    expect(loaded.players[playerId]!.personId).toBe(personId)
    expect(resolveCollegeRuleset(loaded, ecosystemId, loaded.currentDate)?.version).toBe('V1')
  }, 30_000)
})
