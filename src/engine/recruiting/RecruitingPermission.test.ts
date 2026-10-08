import { describe, expect, it } from 'vitest'

import { addDays, createGameDate } from '@/domain/date'
import { getRecruitingPeriod, recruitingRulesetForSeason } from '@/domain/recruiting'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { generateLegacyFixtureRecruitingPool as generateRecruitingPool, performRecruitingAction, recordRecruitingEvaluation, resolveBasketballChampionshipDate } from './RecruitingEngine'
import { canPerformRecruitingAction } from './RecruitingPermission'

describe('2026-27 NCAA basketball recruiting rulesets', () => {
  it('requires Portal authorization at the shared transfer gate and permits transfer recruiting outside initial-player periods when authorized', () => {
    const calendar = recruitingRulesetForSeason('men', 2026)
    const transfer = { date: createGameDate(2026, 8, 25), isNCAA: true, calendar, action: 'offer' as const, recruitingContext: 'TRANSFER' as const }
    expect(canPerformRecruitingAction(transfer)).toMatchObject({ allowed: false, reasonCode: 'TRANSFER_PORTAL_AUTHORIZATION_REQUIRED' })
    expect(canPerformRecruitingAction({ ...transfer, transferAuthorized: true })).toMatchObject({ allowed: true, matchedException: 'authorized-transfer-recruiting' })
  })

  it('keeps the MBB dead period distinct from legal remote communication', () => {
    const calendar = recruitingRulesetForSeason('men', 2026)
    expect(calendar).toMatchObject({ version: 'NCAA_DI_MBB_2026_27', provenance: 'OFFICIAL_SOURCE', derivedSeason: '2026-27' })
    const common = { date: createGameDate(2026, 8, 5), isNCAA: true, calendar, category: 'men' as const, education: { highSchoolGraduationYear: 2028 } }
    expect(canPerformRecruitingAction({ ...common, action: 'phoneCall' })).toMatchObject({ allowed: true, period: 'dead' })
    expect(canPerformRecruitingAction({ ...common, action: 'correspondence' })).toMatchObject({ allowed: true, period: 'dead' })
    expect(canPerformRecruitingAction({ ...common, action: 'inPersonContact', location: 'onCampus' })).toMatchObject({ allowed: false, reasonCode: 'DEAD_PERIOD_IN_PERSON_BLOCKED' })
    expect(canPerformRecruitingAction({ ...common, action: 'evaluation', eventType: 'scholastic', eventApproved: true })).toMatchObject({ allowed: false })
    expect(canPerformRecruitingAction({ ...common, action: 'officialVisit' })).toMatchObject({ allowed: false })
    expect(canPerformRecruitingAction({ ...common, action: 'unofficialVisit' })).toMatchObject({ allowed: false })
  })

  it('matches exact MBB period exceptions and requires an approved evaluation context', () => {
    const calendar = recruitingRulesetForSeason('men', 2026)
    const period = (year: number, month: number, day: number) => getRecruitingPeriod(calendar, createGameDate(year, month, day))?.period
    expect(period(2026, 8, 25)).toBe('quiet')
    expect(period(2026, 9, 15)).toBe('recruiting')
    expect(period(2026, 11, 10)).toBe('dead')
    expect(period(2027, 5, 15)).toBe('evaluation')
    expect(period(2027, 6, 12)).toBe('evaluation')
    expect(period(2027, 6, 19)).toBe('dead')
    expect(period(2027, 7, 20)).toBe('quiet')
    expect(period(2027, 7, 28)).toBe('dead')
    const may = { date: createGameDate(2027, 5, 15), isNCAA: true, calendar, action: 'evaluation' as const }
    expect(canPerformRecruitingAction(may)).toMatchObject({ allowed: false, reasonCode: 'EVALUATION_CONTEXT_NOT_ALLOWED' })
    expect(canPerformRecruitingAction({ ...may, eventType: 'certifiedNonscholastic', eventApproved: true })).toMatchObject({ allowed: true, period: 'evaluation' })
    expect(canPerformRecruitingAction({ ...may, eventType: 'scholastic', eventApproved: true })).toMatchObject({ allowed: false })
  })

  it('blocks WBB recruiting shutdown while preserving the different dead-period semantics', () => {
    const calendar = recruitingRulesetForSeason('women', 2026)
    const shutdown = { date: createGameDate(2026, 8, 12), isNCAA: true, calendar }
    expect(canPerformRecruitingAction({ ...shutdown, action: 'phoneCall' })).toMatchObject({ allowed: false, reasonCode: 'RECRUITING_SHUTDOWN' })
    expect(canPerformRecruitingAction({ ...shutdown, action: 'correspondence' })).toMatchObject({ allowed: false, reasonCode: 'RECRUITING_SHUTDOWN' })
    expect(canPerformRecruitingAction({ ...shutdown, action: 'evaluation', eventType: 'scholastic', eventApproved: true })).toMatchObject({ allowed: false })
    const dead = { date: createGameDate(2026, 12, 25), isNCAA: true, calendar, category: 'women' as const, education: { highSchoolGraduationYear: 2028 } }
    expect(canPerformRecruitingAction({ ...dead, action: 'phoneCall' })).toMatchObject({ allowed: true, period: 'dead' })
    expect(canPerformRecruitingAction({ ...dead, action: 'unofficialVisit' })).toMatchObject({ allowed: false })
  })

  it('uses prospect-specific September/ March WBB rules and restricts July visits', () => {
    const calendar = recruitingRulesetForSeason('women', 2026)
    const september = { date: createGameDate(2026, 9, 15), isNCAA: true, calendar, action: 'evaluation' as const, eventType: 'scholastic' as const, eventApproved: true }
    expect(canPerformRecruitingAction({ ...september, prospectGroup: 'seniorOrTwoYear' })).toMatchObject({ allowed: true, period: 'contact' })
    expect(canPerformRecruitingAction({ ...september, prospectGroup: 'other' })).toMatchObject({ allowed: true, period: 'evaluation' })
    const education = { highSchoolGraduationYear: 2028, sophomoreYearOpeningOn: createGameDate(2025, 8, 1), juniorYearOpeningOn: createGameDate(2026, 8, 1), seniorYearOpeningOn: createGameDate(2027, 8, 1) }
    const july = { date: createGameDate(2027, 7, 10), isNCAA: true, calendar, education }
    expect(canPerformRecruitingAction({ ...july, action: 'officialVisit' })).toMatchObject({ allowed: false, reasonCode: 'JULY_VISIT_RESTRICTION' })
    expect(canPerformRecruitingAction({ ...july, action: 'unofficialVisit', signedWithThisProgram: true, JulyAdmissionException: true })).toMatchObject({ allowed: true })
  })

  it('applies communication thresholds, signed-prospect protection, and explicit off-campus stages', () => {
    const men = recruitingRulesetForSeason('men', 2026)
    const education = { highSchoolGraduationYear: 2028, sophomoreYearOpeningOn: createGameDate(2025, 8, 1), juniorYearOpeningOn: createGameDate(2026, 8, 1), seniorYearOpeningOn: createGameDate(2027, 8, 1) }
    const mbb = { isNCAA: true, calendar: men, category: 'men' as const, education }
    expect(canPerformRecruitingAction({ ...mbb, date: createGameDate(2026, 6, 14), action: 'outboundCall' })).toMatchObject({ allowed: false, reasonCode: 'COMMUNICATION_BEFORE_START_DATE' })
    expect(canPerformRecruitingAction({ ...mbb, date: createGameDate(2026, 6, 15), action: 'outboundCall' })).toMatchObject({ allowed: true })
    expect(canPerformRecruitingAction({ ...mbb, date: createGameDate(2026, 9, 15), action: 'inPersonContact', location: 'offCampus', offCampusSite: 'residence' })).toMatchObject({ allowed: false, reasonCode: 'JUNIOR_YEAR_CONTACT_LOCATION_RESTRICTED' })
    expect(canPerformRecruitingAction({ ...mbb, date: createGameDate(2027, 4, 15), action: 'inPersonContact', location: 'offCampus', offCampusSite: 'residence' })).toMatchObject({ allowed: true, matchedException: 'april-junior-year-residence' })
    expect(canPerformRecruitingAction({ ...mbb, date: createGameDate(2026, 9, 15), action: 'inPersonContact', signedWithOtherProgram: true, location: 'onCampus' })).toMatchObject({ allowed: false, reasonCode: 'SIGNED_WITH_OTHER_PROGRAM' })

    const women = recruitingRulesetForSeason('women', 2026)
    const wbb = { isNCAA: true, calendar: women, category: 'women' as const, education, prospectGroup: 'seniorOrTwoYear' as const }
    expect(canPerformRecruitingAction({ ...wbb, date: createGameDate(2026, 5, 31), action: 'electronicMessage' })).toMatchObject({ allowed: false, reasonCode: 'COMMUNICATION_BEFORE_START_DATE' })
    expect(canPerformRecruitingAction({ ...wbb, date: createGameDate(2026, 6, 1), action: 'electronicMessage' })).toMatchObject({ allowed: true })
    expect(canPerformRecruitingAction({ ...wbb, date: createGameDate(2026, 8, 31), action: 'inPersonContact', location: 'offCampus', offCampusSite: 'educationalInstitution' })).toMatchObject({ allowed: false, reasonCode: 'OFF_CAMPUS_CONTACT_BEFORE_START' })
    const nextWomenCalendar = recruitingRulesetForSeason('women', 2027)
    expect(canPerformRecruitingAction({ ...wbb, calendar: nextWomenCalendar, date: createGameDate(2027, 9, 15), action: 'inPersonContact', location: 'offCampus', offCampusSite: 'residence' })).toMatchObject({ allowed: true })
  })

  it('fails closed on NCAA visits when class progression is missing', () => {
    const calendar = recruitingRulesetForSeason('men', 2026)
    expect(canPerformRecruitingAction({ date: createGameDate(2026, 9, 15), isNCAA: true, calendar, action: 'officialVisit' })).toMatchObject({ allowed: false, reasonCode: 'PROSPECT_EDUCATION_REQUIRED' })
  })

  it('blocks WBB July direct and indirect communication with only the Academy exception', () => {
    const calendar = recruitingRulesetForSeason('women', 2026)
    const common = { date: createGameDate(2027, 7, 10), isNCAA: true, calendar, category: 'women' as const, education: { highSchoolGraduationYear: 2028 } }
    expect(canPerformRecruitingAction({ ...common, action: 'electronicMessage', communicationTarget: 'family' })).toMatchObject({ allowed: false, reasonCode: 'WBB_JULY_COMMUNICATION_BLACKOUT' })
    expect(canPerformRecruitingAction({ ...common, action: 'inboundCall', communicationTarget: 'prospect' })).toMatchObject({ allowed: false, reasonCode: 'WBB_JULY_COMMUNICATION_BLACKOUT' })
    expect(canPerformRecruitingAction({ ...common, action: 'electronicMessage', communicationTarget: 'prospect', eventType: 'collegeBasketballAcademy', eventApproved: true, eventActive: true })).toMatchObject({ allowed: true, matchedException: 'college-basketball-academy-limited-communication' })
    expect(canPerformRecruitingAction({ ...common, action: 'inPersonContact', communicationTarget: 'prospect', eventType: 'collegeBasketballAcademy', eventApproved: true, eventActive: true })).toMatchObject({ allowed: false, reasonCode: 'WBB_JULY_COMMUNICATION_BLACKOUT' })
  })

  it('blocks the eighth countable prospect recruiting opportunity', () => {
    const calendar = recruitingRulesetForSeason('men', 2026)
    const action = { date: createGameDate(2026, 9, 15), isNCAA: true, calendar, action: 'inPersonContact' as const, location: 'onCampus' as const, countsAsOpportunity: true }
    expect(canPerformRecruitingAction({ ...action, countableOpportunitiesUsed: 6 })).toMatchObject({ allowed: true })
    expect(canPerformRecruitingAction({ ...action, countableOpportunitiesUsed: 7 })).toMatchObject({ allowed: false, reasonCode: 'RECRUITING_OPPORTUNITY_LIMIT' })
  })

  it('shares four-recruiter and MBB/WBB person-day boundaries through one permission decision', () => {
    const mbb = recruitingRulesetForSeason('men', 2026)
    const common = { date: createGameDate(2026, 10, 20), isNCAA: true, calendar: mbb, category: 'men' as const, action: 'evaluation' as const, eventType: 'scholastic' as const, eventApproved: true, personDayRequired: true, designatedOffCampusRecruiter: true, designatedOffCampusRecruitersUsed: 6, maximumDesignatedOffCampusRecruiters: 6, maximumSimultaneousOffCampusRecruiters: 4 }
    expect(canPerformRecruitingAction({ ...common, simultaneousOffCampusRecruiters: 3, personDaysUsed: 99 })).toMatchObject({ allowed: true, recruitingPersonDayImpact: 1 })
    expect(canPerformRecruitingAction({ ...common, simultaneousOffCampusRecruiters: 3, personDaysUsed: 100 })).toMatchObject({ allowed: false, reasonCode: 'RECRUITING_PERSON_DAY_LIMIT' })
    expect(canPerformRecruitingAction({ ...common, simultaneousOffCampusRecruiters: 4, personDaysUsed: 0 })).toMatchObject({ allowed: false, reasonCode: 'OFF_CAMPUS_RECRUITER_DAILY_LIMIT' })
    const wbb = recruitingRulesetForSeason('women', 2026)
    const womenContext = { ...common, date: createGameDate(2026, 9, 15), calendar: wbb, category: 'women' as const, prospectGroup: 'other' as const, simultaneousOffCampusRecruiters: 3 }
    expect(canPerformRecruitingAction({ ...womenContext, personDaysUsed: 64 })).toMatchObject({ allowed: true, recruitingPersonDayImpact: 1 })
    expect(canPerformRecruitingAction({ ...womenContext, personDaysUsed: 65 })).toMatchObject({ allowed: false, reasonCode: 'RECRUITING_PERSON_DAY_LIMIT' })
    expect(canPerformRecruitingAction({ ...womenContext, personDaysUsed: 65, personDayException: true })).toMatchObject({ allowed: true, recruitingPersonDayImpact: 0 })
  })

  it('derives distant seasons from the fixed-date template and marks them simulated', () => {
    const baseline = recruitingRulesetForSeason('men', 2026)
    const future = recruitingRulesetForSeason('men', 2045, baseline.template)
    expect(future).toMatchObject({ version: 'BDM-CONTINUITY-2045-46-v1', provenance: 'SIMULATED_CARRY_FORWARD', sourceSeason: '2026-27', derivedSeason: '2045-46', basedOnRulesetId: 'NCAA_DI_MBB_2026_27' })
    expect(future.source).toContain('not official NCAA data')
    expect(future.windows).not.toHaveLength(0)
    expect(future.windows.some((window) => window.period === 'recruiting' && window.startsOn === '2045-09-09' && window.endsOn === '2046-04-30')).toBe(true)
    expect(future.windows.some((window) => window.startsOn === '2045-10-01' && window.endsOn === '2046-09-30' && window.period === 'contact')).toBe(false)
  })

  it('fails closed for a production NCAA cycle with no configured calendar', () => {
    expect(canPerformRecruitingAction({ date: createGameDate(2045, 9, 9), isNCAA: true, action: 'correspondence' })).toMatchObject({ allowed: false, reasonCode: 'NCAA_RULESET_MISSING' })
    expect(canPerformRecruitingAction({ date: createGameDate(2045, 9, 9), isNCAA: false, action: 'correspondence' })).toMatchObject({ allowed: true, provenance: 'LEGACY' })
  })

  it('persists live evaluations as countable opportunities and blocks the eighth', () => {
    let world = createNewGame()
    const season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const competition = world.competitions[season.competitionId]!
    const cycleId = 'evaluation-ledger-test'
    const cycle = { id: cycleId, ecosystemId: competition.ecosystemId, sourceSeasonId: season.id, targetSeasonId: season.id, opensOn: world.currentDate, signingOn: world.currentDate, closesOn: season.endDate, status: 'open' as const, rules: { ...defaultRecruitingRules, poolSize: 1 }, calendar: { version: 'test:evaluation-ledger', source: 'Test-only evaluation rules.', provenance: 'TEST_FIXTURE' as const, annualProspectOpportunityLimit: 7, annualPersonDayLimit: 100, windows: [{ startsOn: world.currentDate, endsOn: season.endDate, period: 'evaluation' as const, allowedEvaluationEvents: ['scholastic' as const] }] } }
    world = updateGameWorld(world, { currentSeasonId: season.id, recruitingCycles: [...Object.values(world.recruitingCyclesById), cycle] })
    world = generateRecruitingPool(world, cycleId)
    const recruitId = Object.values(world.recruitProfilesById).find((profile) => profile.cycleId === cycleId)!.id
    const program = competition.participantTeamIds[0]!
    for (let count = 0; count < 7; count += 1) {
      const result = recordRecruitingEvaluation(world, { cycleId, recruitId, programTeamId: program, eventType: 'scholastic', eventApproved: true })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      world = result.value
      if (count < 6) world = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
    }
    expect(Object.values(world.recruitingActionHistoryById).filter((action) => action.recruitId === recruitId && action.countsAsOpportunity)).toHaveLength(7)
    expect(recordRecruitingEvaluation(world, { cycleId, recruitId, programTeamId: program, eventType: 'scholastic', eventApproved: true })).toMatchObject({ ok: false, reason: 'RECRUITING_OPPORTUNITY_LIMIT' })
  })

  it('records canonical official visit details and enforces count and lodging limits', () => {
    let world = createNewGame()
    world = updateGameWorld(world, { currentDate: createGameDate(2026, 9, 10) })
    const season = Object.values(world.seasons).find((item) => world.ecosystems[world.competitions[item.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const competition = world.competitions[season.competitionId]!
    const cycleId = 'official-visit-ledger-test'
    const cycle = { id: cycleId, ecosystemId: competition.ecosystemId, sourceSeasonId: season.id, targetSeasonId: season.id, opensOn: world.currentDate, signingOn: world.currentDate, closesOn: season.endDate, status: 'open' as const, rules: { ...defaultRecruitingRules, poolSize: 1 }, calendar: recruitingRulesetForSeason('men', 2026) }
    world = updateGameWorld(world, { currentSeasonId: season.id, recruitingCycles: [...Object.values(world.recruitingCyclesById), cycle] })
    world = generateRecruitingPool(world, cycleId)
    const recruit = Object.values(world.recruitProfilesById).find((profile) => profile.cycleId === cycleId)!
    world = updateGameWorld(world, { recruitProfiles: Object.values(world.recruitProfilesById).map((profile) => profile.id === recruit.id ? { ...profile, prospectGroup: 'seniorOrTwoYear' as const, education: { highSchoolGraduationYear: 2028, juniorYearOpeningOn: createGameDate(2026, 8, 1) } } : profile) })
    const program = competition.participantTeamIds[0]!
    const headCoachStaffId = world.coaches[world.teams[program]!.coachId!]!.staffProfileId!
    const first = performRecruitingAction(world, cycleId, recruit.id, program, 'visit', { type: 'official', startsOn: world.currentDate, endsOn: world.currentDate, lodgingNights: 2, participants: [headCoachStaffId] })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(first.value, `${world.currentDate}T00:00:00.000Z`))))
    expect(restored.recruitingVisitsById).toEqual(first.value.recruitingVisitsById)
    expect(Object.values(first.value.recruitingVisitsById)[0]).toMatchObject({ type: 'official', lodgingNights: 2, participants: [headCoachStaffId], legalStatus: 'allowed', startsOn: world.currentDate, endsOn: world.currentDate })
    expect(performRecruitingAction(first.value, cycleId, recruit.id, program, 'visit', { type: 'official', startsOn: world.currentDate, endsOn: world.currentDate, lodgingNights: 0 })).toMatchObject({ ok: false, reason: 'OFFICIAL_VISIT_COUNT_LIMIT' })
    expect(performRecruitingAction(world, cycleId, recruit.id, program, 'visit', { type: 'official', startsOn: world.currentDate, endsOn: world.currentDate, lodgingNights: 3 })).toMatchObject({ ok: false, reason: 'OFFICIAL_VISIT_LODGING_LIMIT' })
  })

  it('uses versioned signing formulas and requires the configured class and opening time', () => {
    const calendar = recruitingRulesetForSeason('men', 2026)
    const common = { isNCAA: true, category: 'men' as const, calendar, action: 'sign' as const, prospectGroup: 'seniorOrTwoYear' as const }
    expect(canPerformRecruitingAction({ ...common, date: createGameDate(2026, 11, 10) })).toMatchObject({ allowed: false, reasonCode: 'SIGNING_PERIOD_CLOSED_OR_UNCONFIGURED' })
    expect(canPerformRecruitingAction({ ...common, date: createGameDate(2026, 11, 11), time: '06:59' })).toMatchObject({ allowed: false, reasonCode: 'SIGNING_PERIOD_NOT_YET_OPEN' })
    expect(canPerformRecruitingAction({ ...common, date: createGameDate(2026, 11, 11), time: '07:00' })).toMatchObject({ allowed: true, matchedException: 'basketball-early-signing-period' })
    expect(canPerformRecruitingAction({ ...common, prospectGroup: 'other', date: createGameDate(2026, 11, 11) })).toMatchObject({ allowed: false, reasonCode: 'SIGNING_PROSPECT_CLASS_NOT_ELIGIBLE' })
    expect(canPerformRecruitingAction({ ...common, date: createGameDate(2027, 4, 14), basketballChampionshipDate: createGameDate(2027, 4, 5), institutionalRegularSigningEndOn: createGameDate(2027, 8, 1) })).toMatchObject({ allowed: true, matchedException: 'basketball-regular-signing-period' })
  })

  it('resolves the championship anchor from the completed season FINAL games', () => {
    const sourceSeasonId = 'season:signing-anchor' as never
    const format = parseWorldCompetitionFormatDocument({
      schema_version: '1.0', competition_id: 'competition:signing-anchor', competition_season_id: 'edition:signing-anchor', season_label: '2026-27', status: 'COMPLETE',
      variants: [{ key: 'MAIN', is_real_variant: true, nodes: [{ key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2 }], edges: [] }],
      sources: [{ url: 'https://example.test/format', type: 'OFFICIAL' }],
    })
    const world = {
      seasons: { [sourceSeasonId]: { id: sourceSeasonId, worldCompetitionFormat: format } },
      games: {
        early: { id: 'game:early', seasonId: sourceSeasonId, competitionStageKey: 'FINAL', date: createGameDate(2027, 4, 3), status: 'completed' },
        final: { id: 'game:final', seasonId: sourceSeasonId, competitionStageKey: 'FINAL', date: createGameDate(2027, 4, 5), status: 'completed' },
        other: { id: 'game:other', seasonId: sourceSeasonId, competitionStageKey: 'REGULAR', date: createGameDate(2027, 4, 8), status: 'completed' },
      },
    } as never
    const cycle = { sourceSeasonId } as never
    expect(resolveBasketballChampionshipDate(world, cycle)).toBe(createGameDate(2027, 4, 5))
  })
})
