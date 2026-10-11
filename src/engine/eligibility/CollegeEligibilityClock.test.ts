import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addYears, parseGameDate } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { ageAcademicYearTrigger, assessCollegeEligibility, deriveCollegeEligibilityClock, evaluatePlayerEligibility, resolveCollegeRuleset } from './EligibilityEngine'

function fixture() {
  const world = createNewGame()
  const season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]?.kind === 'ncaaLike')!
  const competition = world.competitions[season.competitionId]!
  const team = world.teams[competition.participantTeamIds[0]!]!
  const playerId = team.rosterPlayerIds[0]!
  const enrollment = Object.values(world.playerEnrollmentsById).find((item) => item.playerId === playerId && item.teamId === team.id)!
  return { world, season, competition, team, playerId, enrollment }
}

describe('2026 NCAA eligibility clock and transfer enrollment evidence', () => {
  it('uses the M-2026-1 September boundary and December birthday treatment', () => {
    expect(ageAcademicYearTrigger(parseGameDate('2007-08-31'))).toBe('2026-09-01')
    expect(ageAcademicYearTrigger(parseGameDate('2007-09-01'))).toBe('2027-09-01')
    expect(ageAcademicYearTrigger(parseGameDate('2007-12-31'))).toBe('2027-09-01')
    expect(ageAcademicYearTrigger(parseGameDate('2008-01-01'))).toBe('2027-09-01')
  })

  it('selects the earlier verified enrollment or age trigger and retains evidence through Save V4', () => {
    const { world, competition, playerId, enrollment } = fixture()
    const ruleset = resolveCollegeRuleset(world, competition.ecosystemId, world.currentDate)!
    const ageStart = ageAcademicYearTrigger(world.players[playerId]!.bio.dateOfBirth)
    const earlyTerm = addYears(ageStart, -1)
    const withEarly = updateGameWorld(world, { playerEnrollments: Object.values(world.playerEnrollmentsById).map((item) => item.id === enrollment.id ? { ...item, fullTimeEnrollmentTermStartedAt: earlyTerm, firstClassAttendanceAt: earlyTerm, academicLevel: 'UNDERGRADUATE' as const } : item) })
    expect(deriveCollegeEligibilityClock(withEarly, playerId, ruleset)).toMatchObject({ startsOn: earlyTerm, trigger: 'ENROLLMENT', enrollmentEvidence: 'KNOWN' })
    expect(assessCollegeEligibility(withEarly, { playerId, teamId: enrollment.teamId, ecosystemId: competition.ecosystemId, onDate: addYears(earlyTerm, 5) })?.reasons).toContain('ELIGIBILITY_CLOCK_EXPIRED')
    const lateTerm = addYears(ageStart, 1)
    const withLate = updateGameWorld(world, { playerEnrollments: Object.values(world.playerEnrollmentsById).map((item) => item.id === enrollment.id ? { ...item, fullTimeEnrollmentTermStartedAt: lateTerm, firstClassAttendanceAt: lateTerm, academicLevel: 'UNDERGRADUATE' as const } : item) })
    expect(deriveCollegeEligibilityClock(withLate, playerId, ruleset)).toMatchObject({ startsOn: ageStart, trigger: 'AGE_19_ACADEMIC_YEAR' })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(withEarly, '2032-10-01T00:00:00.000Z'))
    expect(restored.playerEnrollmentsById[enrollment.id]).toEqual(withEarly.playerEnrollmentsById[enrollment.id])
    expect(assessCollegeEligibility(restored, { playerId, teamId: enrollment.teamId, ecosystemId: competition.ecosystemId })?.evidence.eligibilityClockTrigger).toBe('ENROLLMENT')
    expect(assessCollegeEligibility(world, { playerId, teamId: enrollment.teamId, ecosystemId: competition.ecosystemId })?.evidence.enrollmentClockEvidence).toBe('UNKNOWN')
  })

  it('requires an explicit 2026-27 transition selection', () => {
    const { world, competition, playerId, enrollment } = fixture()
    const changed = updateGameWorld(world, { playerEnrollments: Object.values(world.playerEnrollmentsById).map((item) => item.id === enrollment.id ? { ...item, startsOn: parseGameDate('2026-09-01'), fullTimeEnrollmentTermStartedAt: parseGameDate('2026-09-01'), firstClassAttendanceAt: parseGameDate('2026-09-02') } : item) })
    expect(assessCollegeEligibility(changed, { playerId, teamId: enrollment.teamId, ecosystemId: competition.ecosystemId })?.reasons).toContain('TRANSITION_POLICY_UNDETERMINED')
    const previous = updateGameWorld(changed, { playerEnrollments: Object.values(changed.playerEnrollmentsById).map((item) => item.id === enrollment.id ? { ...item, transitionPolicySelection: 'PREVIOUS_RULES' as const, transitionPolicySource: 'NCAA 2026-27 transition authority' } : item) })
    expect(assessCollegeEligibility(previous, { playerId, teamId: enrollment.teamId, ecosystemId: competition.ecosystemId })?.evidence.transitionPolicySelection).toBe('PREVIOUS_RULES')
    const ageBased = updateGameWorld(changed, { playerEnrollments: Object.values(changed.playerEnrollmentsById).map((item) => item.id === enrollment.id ? { ...item, transitionPolicySelection: 'AGE_BASED' as const, transitionPolicySource: 'NCAA 2026-27 transition authority' } : item) })
    expect(assessCollegeEligibility(ageBased, { playerId, teamId: enrollment.teamId, ecosystemId: competition.ecosystemId })?.evidence.eligibilityClockStart).toBeDefined()
  })

  it('delays undergraduate midyear competition but permits qualifying postgraduate availability', () => {
    const { world, season, competition, team, playerId, enrollment } = fixture()
    const source = { ...enrollment, id: `${enrollment.id}:source`, startsOn: parseGameDate('2031-09-01'), endsOn: parseGameDate('2032-08-31'), status: 'ended' as const }
    const evidence = { ...enrollment, transferFromEnrollmentId: source.id, firstAcademicTermEndsOn: parseGameDate('2032-09-01'), nextAcademicYearStartsOn: parseGameDate('2033-09-01'), academicLevel: 'UNDERGRADUATE' as const }
    const undergraduate = updateGameWorld(world, { playerEnrollments: [...Object.values(world.playerEnrollmentsById).filter((item) => item.id !== enrollment.id), source, evidence] })
    expect(undergraduate.playerEnrollmentsById[enrollment.id]?.status).toBe('active')
    expect(evaluatePlayerEligibility(undergraduate, { playerId, teamId: team.id, competitionId: competition.id, seasonId: season.id }).reasons).toContain('MIDYEAR_TRANSFER_DELAY')
    const postgraduate = updateGameWorld(undergraduate, { playerEnrollments: Object.values(undergraduate.playerEnrollmentsById).map((item) => item.id === enrollment.id ? { ...item, academicLevel: 'POSTGRADUATE' as const } : item) })
    expect(evaluatePlayerEligibility(postgraduate, { playerId, teamId: team.id, competitionId: competition.id, seasonId: season.id }).reasons).not.toContain('MIDYEAR_TRANSFER_DELAY')
    expect(deserializeGameWorldV4(serializeGameWorldV4(postgraduate, '2032-10-01T00:00:00.000Z')).playerEnrollmentsById[enrollment.id]).toEqual(postgraduate.playerEnrollmentsById[enrollment.id])
  })
})
