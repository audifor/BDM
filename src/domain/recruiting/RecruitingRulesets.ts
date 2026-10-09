import { createGameDate, type GameDate } from '@/domain/date'
import type { RecruitingCalendar, RecruitingCalendarRule, RecruitingProspectGroup, RecruitingVisitRestriction } from './Recruiting'

export const NCAA_DI_MBB_2026_27 = 'NCAA_DI_MBB_2026_27' as const
export const NCAA_DI_WBB_2026_27 = 'NCAA_DI_WBB_2026_27' as const

const MBB_RULES: readonly RecruitingCalendarRule[] = [
  fixed('mbb-aug-dead', 'dead', 8, 1, 0, 8, 19, 0, 100),
  fixed('mbb-aug-quiet', 'quiet', 8, 20, 0, 9, 8, 0, 60),
  fixed('mbb-academic-recruiting', 'recruiting', 9, 9, 0, 4, 30, 1, 10, 'all', ['scholastic', 'internationalTeam']),
  fixed('mbb-nov-dead', 'dead', 11, 9, 0, 11, 12, 0, 100),
  fixed('mbb-dec-dead', 'dead', 12, 24, 0, 12, 26, 0, 100),
  fixed('mbb-april-dead', 'dead', 4, 1, 1, 4, 8, 1, 100),
  fixed('mbb-may-june-quiet', 'quiet', 5, 1, 1, 6, 30, 1, 10),
  fixed('mbb-may-9-dead', 'dead', 5, 9, 1, 5, 9, 1, 100),
  fixed('mbb-may-certified', 'evaluation', 5, 14, 1, 5, 16, 1, 80, 'all', ['certifiedNonscholastic', 'internationalTeam'], undefined, '08:00', '16:00'),
  fixed('mbb-may-june-dead', 'dead', 5, 26, 1, 6, 6, 1, 100),
  fixed('mbb-june-scholastic-1', 'evaluation', 6, 11, 1, 6, 13, 1, 80, 'all', ['scholastic', 'approvedIntercollegiate']),
  fixed('mbb-june-dead', 'dead', 6, 19, 1, 6, 20, 1, 100),
  fixed('mbb-june-scholastic-2', 'evaluation', 6, 25, 1, 6, 27, 1, 80, 'all', ['scholastic', 'approvedIntercollegiate']),
  fixed('mbb-july-dead-baseline', 'dead', 7, 1, 1, 7, 31, 1, 10, 'all', undefined, 'julyUnofficialOnly'),
  fixed('mbb-july-evaluation-1', 'evaluation', 7, 8, 1, 7, 11, 1, 80, 'all', ['certifiedNonscholastic', 'scholastic', 'internationalTeam'], undefined, '08:00', '18:00'),
  fixed('mbb-july-evaluation-2', 'evaluation', 7, 15, 1, 7, 18, 1, 80, 'all', ['certifiedNonscholastic', 'scholastic', 'internationalTeam'], undefined, '08:00', '18:00'),
  fixed('mbb-july-quiet', 'quiet', 7, 19, 1, 7, 25, 1, 70),
  fixed('mbb-aug-next-dead', 'dead', 8, 1, 1, 8, 18, 1, 100),
  fixed('mbb-aug-next-quiet', 'quiet', 8, 19, 1, 8, 31, 1, 60),
]

const WBB_RULES: readonly RecruitingCalendarRule[] = [
  fixed('wbb-aug-quiet', 'quiet', 8, 1, 0, 8, 31, 0, 10),
  fixed('wbb-aug-shutdown', 'shutdown', 8, 10, 0, 8, 16, 0, 110),
  fixed('wbb-september-senior-contact', 'contact', 9, 1, 0, 9, 30, 0, 20, 'seniorOrTwoYear'),
  fixed('wbb-september-other-evaluation', 'evaluation', 9, 1, 0, 9, 30, 0, 20, 'other', ['scholastic']),
  fixed('wbb-oct-feb-evaluation', 'evaluation', 10, 1, 0, 2, 28, 1, 20, 'all', ['scholastic']),
  fixed('wbb-dec-dead', 'dead', 12, 24, 0, 12, 26, 0, 100),
  fixed('wbb-march-senior-contact', 'contact', 3, 1, 1, 3, 31, 1, 20, 'seniorOrTwoYear'),
  fixed('wbb-march-other-evaluation', 'evaluation', 3, 1, 1, 3, 31, 1, 20, 'other', ['scholastic']),
  fixed('wbb-april-baseline-quiet', 'quiet', 4, 6, 1, 7, 31, 1, 10),
  fixed('wbb-april-dead-1', 'dead', 4, 1, 1, 4, 5, 1, 100),
  fixed('wbb-april-22-dead', 'dead', 4, 22, 1, 4, 22, 1, 100, 'highSchoolOrTwoYear'),
  fixed('wbb-april-certified-eval', 'evaluation', 4, 23, 1, 4, 25, 1, 80, 'all', ['certifiedNonscholastic'], undefined, undefined, undefined, undefined, true),
  fixed('wbb-april-26-dead', 'dead', 4, 26, 1, 4, 26, 1, 100, 'highSchoolOrTwoYear'),
  fixed('wbb-may-shutdown', 'shutdown', 5, 3, 1, 5, 9, 1, 110),
  fixed('wbb-may-13-dead', 'dead', 5, 13, 1, 5, 13, 1, 100),
  fixed('wbb-may-eval', 'evaluation', 5, 14, 1, 5, 16, 1, 80, 'all', ['certifiedNonscholastic'], undefined, undefined, undefined, undefined, true),
  fixed('wbb-may-17-dead', 'dead', 5, 17, 1, 5, 17, 1, 100),
  fixed('wbb-june-16-dead', 'dead', 6, 16, 1, 6, 16, 1, 100),
  fixed('wbb-june-eval', 'evaluation', 6, 17, 1, 6, 19, 1, 80, 'all', ['scholastic', 'approvedIntercollegiate'], undefined, '12:00', '18:00', undefined, true),
  fixed('wbb-june-20-dead', 'dead', 6, 20, 1, 6, 20, 1, 100),
  fixed('wbb-july-8-dead', 'dead', 7, 8, 1, 7, 8, 1, 100),
  fixed('wbb-july-eval-1', 'evaluation', 7, 9, 1, 7, 12, 1, 80, 'all', ['certifiedNonscholastic', 'scholastic', 'internationalTeam', 'collegeBasketballAcademy'], 'julyAllVisits', undefined, undefined, true, true),
  fixed('wbb-july-13-dead', 'dead', 7, 13, 1, 7, 13, 1, 100),
  fixed('wbb-july-22-dead', 'dead', 7, 22, 1, 7, 22, 1, 100),
  fixed('wbb-july-eval-2', 'evaluation', 7, 23, 1, 7, 26, 1, 80, 'all', ['certifiedNonscholastic', 'scholastic', 'internationalTeam', 'collegeBasketballAcademy'], 'julyAllVisits', undefined, undefined, true, true),
  fixed('wbb-july-27-dead', 'dead', 7, 27, 1, 7, 27, 1, 100),
]

export function recruitingRulesetForSeason(category: 'men'|'women', seasonStartYear: number, sourceTemplate?: RecruitingCalendar['template']): RecruitingCalendar {
  const sourceSeason = '2026-27'
  const rulesetId = category === 'men' ? NCAA_DI_MBB_2026_27 : NCAA_DI_WBB_2026_27
  const template = sourceTemplate ?? { id: rulesetId, sourceSeason, rules: category === 'men' ? MBB_RULES : WBB_RULES }
  const rules = template.rules
  const windows = rules.map((rule) => ({
    startsOn: createGameDate(seasonStartYear + rule.startYearOffset, rule.startMonth, safeDay(seasonStartYear + rule.startYearOffset, rule.startMonth, rule.startDay)),
    endsOn: createGameDate(seasonStartYear + rule.endYearOffset, rule.endMonth, safeDay(seasonStartYear + rule.endYearOffset, rule.endMonth, rule.endDay)),
    period: rule.period,
    priority: rule.priority,
    ruleId: rule.id,
    ...(rule.prospectGroup === undefined ? {} : { prospectGroup: rule.prospectGroup }),
    ...(rule.allowedEvaluationEvents === undefined ? {} : { allowedEvaluationEvents: rule.allowedEvaluationEvents }),
    ...(rule.visitRestriction === undefined ? {} : { visitRestriction: rule.visitRestriction }),
    ...(rule.communicationBlackout === undefined ? {} : { communicationBlackout: rule.communicationBlackout }),
    ...(rule.personDayException === undefined ? {} : { personDayException: rule.personDayException }),
    ...(rule.startTime === undefined ? {} : { startTime: rule.startTime }),
    ...(rule.endTime === undefined ? {} : { endTime: rule.endTime }),
  })).sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.endsOn.localeCompare(b.endsOn))
  const isSourceSeason = seasonStartYear === 2026 && template.id === rulesetId
  return {
    version: isSourceSeason ? rulesetId : `BDM-CONTINUITY-${seasonStartYear}-${String(seasonStartYear + 1).slice(-2)}-v1`,
    source: isSourceSeason ? 'NCAA Division I 2026-27 Basketball Recruiting Calendar; see docs/research/NCAA_BASKETBALL_RECRUITING_RULES_2026_27.md.' : `Simulated BDM carry-forward from ${template.id} (${template.sourceSeason}); not official NCAA data.`,
    authority: isSourceSeason ? 'sourceBacked' : 'simulatedCarryForward',
    provenance: isSourceSeason ? 'OFFICIAL_SOURCE' : 'SIMULATED_CARRY_FORWARD',
    sourceSeason: template.sourceSeason,
    derivedSeason: `${seasonStartYear}-${String(seasonStartYear + 1).slice(-2)}`,
    basedOnRulesetId: template.id,
    annualProspectOpportunityLimit: 7,
    annualPersonDayLimit: category === 'men' ? 100 : 65,
    maximumDesignatedOffCampusRecruiters: 6,
    maximumSimultaneousOffCampusRecruiters: 4,
    maximumOfficialVisitLodgingNights: 2,
    signingWindowRules: {
      earlyPeriod: { month: 11, ordinalWeekday: 2, weekday: 3, durationDays: 7, opensAt: '07:00', prospectGroup: 'seniorOrTwoYear' },
      regularPeriod: { anchor: 'basketballChampionship', daysAfterAnchor: 7, nextWeekday: 3, opensAt: '07:00', finalDateAuthority: 'institutionalAidPolicy' },
    },
    template,
    windows,
  }
}

export function getRecruitingPeriod(calendar: RecruitingCalendar, date: GameDate, prospectGroup: RecruitingProspectGroup = 'all') {
  return calendar.windows
    .filter((window) => window.startsOn <= date && date <= window.endsOn && (window.prospectGroup === undefined || window.prospectGroup === 'all' || window.prospectGroup === prospectGroup))
    .sort((a, b) => (b.priority ?? priority(b.period)) - (a.priority ?? priority(a.period)) || (b.ruleId ?? '').localeCompare(a.ruleId ?? ''))[0]
}

function fixed(id: string, period: RecruitingCalendarRule['period'], startMonth: number, startDay: number, startYearOffset: 0|1, endMonth: number, endDay: number, endYearOffset: 0|1, priority: number, prospectGroup: RecruitingProspectGroup = 'all', allowedEvaluationEvents?: RecruitingCalendarRule['allowedEvaluationEvents'], visitRestriction?: RecruitingVisitRestriction, startTime?: string, endTime?: string, communicationBlackout?: boolean, personDayException?: boolean): RecruitingCalendarRule {
  return { id, kind: 'fixedMonthDay', period, priority, startMonth, startDay, startYearOffset, endMonth, endDay, endYearOffset, prospectGroup, ...(allowedEvaluationEvents === undefined ? {} : { allowedEvaluationEvents }), ...(visitRestriction === undefined ? {} : { visitRestriction }), ...(startTime === undefined ? {} : { startTime }), ...(endTime === undefined ? {} : { endTime }), ...(communicationBlackout === undefined ? {} : { communicationBlackout }), ...(personDayException === undefined ? {} : { personDayException }), sourceNote: 'Fixed date window from the 2026-27 NCAA Division I basketball recruiting calendar and applicable Bylaw 13.' }
}

function priority(period: RecruitingCalendarRule['period']): number { return period === 'shutdown' ? 5 : period === 'dead' ? 4 : period === 'evaluation' ? 3 : period === 'contact' || period === 'recruiting' ? 2 : 1 }
function safeDay(year: number, month: number, day: number): number { return month === 2 && day === 29 && !isLeapYear(year) ? 28 : day }
function isLeapYear(year: number): boolean { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) }
