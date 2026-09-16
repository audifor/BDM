/*
 * Coach · Legacy — the historical footprint screen.
 *
 * Reputation describes the present. Legacy describes what will outlive the career, so this board is
 * built around one question: if the career ended today, how would it be remembered and how far is it
 * from becoming an era?
 *
 * Data is MIXED, as agreed for this reconstruction:
 *   · RUNTIME — everything that already exists in `GameWorld` (coach legacy state, achievements,
 *     tenures, club legacy, career history and reputation) is read from the live world.
 *   · MOCK — the handful of dimensions the simulation does not model yet is isolated in
 *     `COACH_LEGACY_MOCK` below and flagged with an explicit `MOCK` chip wherever it surfaces.
 *
 * Nothing here writes to the world: the screen is a pure projection of the runtime state.
 */

import { useMemo, useState, type ReactNode } from 'react'

import { parseGameDate, type GameDate } from '@/domain/date'
import type { CoachAchievementType, ClubLegacyStatus, GlobalLegacyStatus, HallStatus } from '@/domain/legacy'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { LEGACY_CONFIG } from '@/engine/legacy'
import { useGameStore } from '@/stores/gameStore'
import { formatPrototypeDate } from '@/ui/formatters'
import { buildCoachCareerModel } from '@/ui-ng/applications/coach/CoachCareerScreen'
import {
  CircularProgress,
  HorizontalValueBar,
  OverviewPanelHeader,
} from '@/ui-ng/applications/coach/CoachOverviewCharts'
import { OverviewGlyph } from '@/ui-ng/applications/coach/CoachOverviewGlyph'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

import './coach-legacy.css'

/* ── Vocabulary ── */

export type LegacyTone = 'neutral' | 'cyan' | 'positive' | 'warning' | 'negative' | 'gold' | 'purple'
export type LegacyRecordCategory = 'honours' | 'records' | 'playoffRuns' | 'signatureWins' | 'nearMisses'
export type LegacyFilterId = 'all' | LegacyRecordCategory
export type LegacyComparisonContextId = 'active' | 'hof' | 'allTime'

export interface LegacyFigure {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly tone: LegacyTone
  readonly mock: boolean
}

export interface LegacyMilestone {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly current: number
  readonly target: number
  readonly percent: number
  readonly remaining: number
  readonly tone: LegacyTone
  readonly mock: boolean
}

export interface LegacyTheme {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly tone: LegacyTone
  readonly note: string
}

export interface LegacyRecordRow {
  readonly id: string
  readonly date: GameDate
  readonly dateLabel: string
  readonly achievement: string
  readonly detail: string
  readonly category: LegacyRecordCategory
  readonly tone: LegacyTone
  readonly mock: boolean
}

export interface LegacyCriterion {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly met: boolean
  readonly mock: boolean
}

export interface LegacyTimelineEvent {
  readonly id: string
  readonly date: GameDate
  readonly dateLabel: string
  readonly icon: string
  readonly title: string
  readonly highlight: string
  readonly detail: string
  readonly tone: LegacyTone
  readonly mock: boolean
}

export interface CoachLegacyModel {
  readonly standing: {
    readonly statusKey: GlobalLegacyStatus
    readonly label: string
    readonly explanation: string
    readonly tone: LegacyTone
  }
    readonly score: {
      readonly total: number
      readonly honours: number
      readonly tenure: number
      readonly honourShare: number
      readonly tenureShare: number
    }
  readonly hallTrack: { readonly current: number; readonly target: number; readonly percent: number; readonly remaining: number }
  readonly clubLegacy: readonly LegacyClubFootprint[]
  readonly figures: readonly LegacyFigure[]
  readonly milestones: readonly LegacyMilestone[]
  readonly themes: readonly LegacyTheme[]
  readonly narrative: string
  readonly records: readonly LegacyRecordRow[]
  readonly hof: {
    readonly statusLabel: string
    readonly criteria: readonly LegacyCriterion[]
    readonly estimatedPoints: number
    readonly estimatedPercent: number
    readonly trajectory: string
    readonly eligibility: string
    readonly recognitions: readonly string[]
  }
  readonly comparison: {
    readonly contexts: readonly {
      readonly id: LegacyComparisonContextId
      readonly label: string
      readonly note: string
    }[]
    readonly percentiles: Readonly<Record<LegacyComparisonContextId, Readonly<Record<string, number>>>>
    readonly metrics: readonly {
      readonly id: string
      readonly label: string
      readonly display: string
      readonly tone: LegacyTone
      readonly mock: boolean
    }[]
  }
  readonly timeline: readonly LegacyTimelineEvent[]
}

/* ── Presentational maps (copy only; no product rules) ── */

const STATUS_PRESENTATION: Readonly<Record<GlobalLegacyStatus, { label: string; tone: LegacyTone; explanation: string }>> = {
  unproven: {
    label: 'Unknown',
    tone: 'neutral',
    explanation: 'No body of work yet. Nothing on this profile has outlasted a single season.',
  },
  established: {
    label: 'Rising Name',
    tone: 'cyan',
    explanation: 'A first body of work is forming and the name is starting to travel beyond one building.',
  },
  notable: {
    label: 'Established Figure',
    tone: 'cyan',
    explanation: 'A credible career with a visible footprint, though not yet unavoidable in the record books.',
  },
  distinguished: {
    label: 'Distinguished Coach',
    tone: 'gold',
    explanation: 'A career of real consequence. The record now arrives before the name does.',
  },
  historic: {
    label: 'Era Defining',
    tone: 'gold',
    explanation: 'A whole era belongs to this coach. Results have changed what peers expect to be possible.',
  },
  legendary: {
    label: 'Legendary',
    tone: 'gold',
    explanation: 'Permanent. The career is now the reference point the next generation is measured against.',
  },
}

const HALL_STATUS_LABEL: Readonly<Record<HallStatus, string>> = {
  notEligible: 'Not eligible',
  eligible: 'Eligible',
  candidate: 'Candidate',
  inducted: 'Inducted',
}

const CLUB_STATUS_LABEL: Readonly<Record<ClubLegacyStatus, string>> = {
  forgettable: 'Forgettable',
  remembered: 'Remembered',
  respected: 'Respected',
  icon: 'Icon',
  clubLegend: 'Club legend',
}

const CLUB_STATUS_TONE: Readonly<Record<ClubLegacyStatus, LegacyTone>> = {
  forgettable: 'neutral',
  remembered: 'cyan',
  respected: 'cyan',
  icon: 'gold',
  clubLegend: 'gold',
}

export interface LegacyClubFootprint {
  readonly teamId: string
  readonly teamName: string
  readonly statusLabel: string
  readonly value: number
  readonly honours: number
  readonly tone: LegacyTone
}

const ACHIEVEMENT_LABEL: Readonly<Record<CoachAchievementType, string>> = {
  championship: 'Championship',
  promotion: 'Promotion',
  exceptionalSeason: 'Exceptional season',
  dynasty: 'Dynasty established',
  hallInduction: 'Hall of Fame induction',
}

const ACHIEVEMENT_CATEGORY: Readonly<Record<CoachAchievementType, LegacyRecordCategory>> = {
  championship: 'honours',
  promotion: 'honours',
  dynasty: 'honours',
  hallInduction: 'honours',
  exceptionalSeason: 'records',
}

const ACHIEVEMENT_TONE: Readonly<Record<CoachAchievementType, LegacyTone>> = {
  championship: 'gold',
  promotion: 'positive',
  dynasty: 'gold',
  hallInduction: 'gold',
  exceptionalSeason: 'cyan',
}

const MILESTONE_LABEL: Readonly<Record<string, string>> = {
  clubLegendReached: 'Club legend',
  dynastyEstablished: 'Dynasty established',
  hallCandidate: 'Hall candidate',
  hallInducted: 'Hall inducted',
}

const STAGE_WEIGHT: Readonly<Record<string, number>> = {
  championship: 100,
  hallInduction: 94,
  dynasty: 92,
  clubLegendReached: 86,
  firstGrandFinal: 82,
  conferenceFinal: 72,
  firstAppointment: 74,
  promotion: 68,
  firstPlayoffs: 62,
  careerWinsMilestone: 58,
  signatureWin: 54,
  exceptionalSeason: 46,
}

/* The milestones that actually reclassify a career. Targets come from the Legacy brief, not from a
 * derivation: the domain tracks whether they happened, not how far away they are. */
const MILESTONE_TARGETS = { championships: 3, finals: 5, playoffs: 10, wins: 250 } as const

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * MOCK DATA — every value in this object is illustrative and NOT backed by the domain.
 *
 * Why each group is mock:
 *   · finals / playoffAppearances — `coachAchievementsById` only records championships, promotions,
 *     exceptional seasons, dynasties and hall inductions, and `SeasonHistoryRecord.finalStandings`
 *     carries no bracket round, so there is no way to attribute a final or a playoff appearance to a
 *     coach without inventing a product rule. Career wins, by contrast, ARE derivable and are no
 *     longer mocked: `buildCoachLegacyModel` reuses the canonical `buildCoachCareerModel` linkage, so
 *     Legacy and Career report the same number.
 *   · themes / narrative — the simulation has no notion of "defining themes"; this is editorial copy.
 *   · comparison percentiles — there is no league-wide historical ranking of coaches.
 *   · hof.estimatedPoints / trajectory / eligibility — Hall status is real, but the projection is not.
 *   · records (playoff runs, signature wins, near misses) — near misses in particular are a memory the
 *     domain never stores.
 *   · timeline — the same non-modelled moments, used only for narrative milestones.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

export interface CoachLegacyMock {
  readonly finals: number
  readonly playoffAppearances: number
  readonly themes: readonly { readonly id: string; readonly label: string; readonly value: number; readonly tone: LegacyTone; readonly note: string }[]
  readonly contexts: readonly { readonly id: LegacyComparisonContextId; readonly label: string; readonly note: string }[]
  readonly percentiles: Readonly<Record<LegacyComparisonContextId, Readonly<Record<string, number>>>>
  readonly hof: { readonly estimatedPoints: number; readonly trajectory: string; readonly eligibility: string }
  readonly records: readonly {
    readonly id: string
    readonly category: LegacyRecordCategory
    readonly yearsAfterStart: number
    readonly monthDay: string
    readonly achievement: string
    readonly detail: string
    readonly tone: LegacyTone
  }[]
  readonly timeline: readonly {
    readonly id: string
    readonly yearsAfterStart: number
    readonly monthDay: string
    readonly title: string
    readonly highlight: string
    readonly detail: string
    readonly tone: LegacyTone
    readonly icon: string
  }[]
}

export const COACH_LEGACY_MOCK: CoachLegacyMock = {
  finals: 1,
  playoffAppearances: 3,

  themes: [
    {
      id: 'playerDevelopment',
      label: 'Player development',
      value: 82,
      tone: 'cyan',
      note: 'How much of the career is written through players who improved under this coach.',
    },
    {
      id: 'tacticalInnovation',
      label: 'Tactical innovation',
      value: 64,
      tone: 'cyan',
      note: 'Whether the coach changed how opponents had to prepare.',
    },
    {
      id: 'cultureBuilding',
      label: 'Culture building',
      value: 71,
      tone: 'positive',
      note: 'Standards and identity that survived after the coach left the building.',
    },
    {
      id: 'influenceLeadership',
      label: 'Influence & leadership',
      value: 58,
      tone: 'purple',
      note: 'Weight in rooms the coach did not control: league, media, ownership.',
    },
    {
      id: 'longevityAdaptation',
      label: 'Longevity & adaptation',
      value: 46,
      tone: 'gold',
      note: 'How many eras the career spans without losing relevance.',
    },
    {
      id: 'talentIdentification',
      label: 'Talent identification',
      value: 69,
      tone: 'gold',
      note: 'Players found or backed before the market agreed.',
    },
  ],

  contexts: [
    { id: 'active', label: 'Vs active coaches', note: 'Compared with head coaches currently working.' },
    { id: 'hof', label: 'Vs HOF benchmark', note: 'Compared with the average inducted coach at induction.' },
    { id: 'allTime', label: 'All-time', note: 'Compared with every coach the sport has recorded.' },
  ],

  percentiles: {
    active: { legacy: 72, championships: 55, finals: 61, wins: 58, reputation: 66, development: 78 },
    hof: { legacy: 34, championships: 12, finals: 22, wins: 26, reputation: 41, development: 52 },
    allTime: { legacy: 21, championships: 8, finals: 14, wins: 17, reputation: 29, development: 38 },
  },

  hof: {
    estimatedPoints: 132,
    trajectory: 'On pace — at the current rate the induction window opens in roughly six seasons.',
    eligibility: 'Projected eligibility: the 2035 cycle. Illustrative, pending the honours record.',
  },

  records: [
    {
      id: 'firstPlayoffs',
      category: 'playoffRuns',
      yearsAfterStart: 2,
      monthDay: '04-16',
      achievement: 'First playoff appearance',
      detail: 'Qualified sixth and lost a competitive first round.',
      tone: 'cyan',
    },
    {
      id: 'conferenceFinal',
      category: 'playoffRuns',
      yearsAfterStart: 4,
      monthDay: '05-06',
      achievement: 'Conference final run',
      detail: 'Won two series before falling one step short.',
      tone: 'cyan',
    },
    {
      id: 'signatureWin',
      category: 'signatureWins',
      yearsAfterStart: 3,
      monthDay: '03-11',
      achievement: 'Signature win',
      detail: 'Road win over the eventual champion with a short-handed roster.',
      tone: 'gold',
    },
    {
      id: 'finalsLost',
      category: 'nearMisses',
      yearsAfterStart: 4,
      monthDay: '05-22',
      achievement: 'Grand final lost',
      detail: 'Led the final 2–1, then lost three straight.',
      tone: 'negative',
    },
    {
      id: 'playoffCollapse',
      category: 'nearMisses',
      yearsAfterStart: 5,
      monthDay: '04-09',
      achievement: 'Playoff collapse',
      detail: 'Top seed eliminated in the first round after a franchise-best regular season.',
      tone: 'negative',
    },
    {
      id: 'projectAbandoned',
      category: 'nearMisses',
      yearsAfterStart: 6,
      monthDay: '02-28',
      achievement: 'Project abandoned',
      detail: 'A rebuild that promised a dynasty was broken up before it peaked.',
      tone: 'warning',
    },
  ],

  timeline: [
    {
      id: 'firstPlayoffs',
      yearsAfterStart: 2,
      monthDay: '04-16',
      title: 'First playoffs',
      highlight: 'Sixth seed',
      detail: 'First post-season of the career.',
      tone: 'cyan',
      icon: 'flag',
    },
    {
      id: 'conferenceFinal',
      yearsAfterStart: 4,
      monthDay: '05-06',
      title: 'Conference final',
      highlight: 'Two series won',
      detail: 'Deepest run of the career so far.',
      tone: 'cyan',
      icon: 'flag',
    },
    {
      id: 'firstGrandFinal',
      yearsAfterStart: 4,
      monthDay: '05-22',
      title: 'First grand final',
      highlight: 'Lost 2–4',
      detail: 'One series away from a championship.',
      tone: 'gold',
      icon: 'trophy',
    },
    {
      id: 'careerWinsMilestone',
      yearsAfterStart: 5,
      monthDay: '03-02',
      title: 'Career wins milestone',
      highlight: 'Illustrative',
      detail: 'Sample timeline entry — a stand-in milestone, not the live career-wins counter.',
      tone: 'positive',
      icon: 'star',
    },
  ],
}

/* ── Model builder (runtime projection) ── */

export function buildCoachLegacyModel(world: GameWorld): CoachLegacyModel | null {
  const coachId = world.userCoachId
  if (world.coaches[coachId] === undefined) return null

  const legacy = world.coachLegacyByCoachId[coachId]
  const achievements = Object.values(world.coachAchievementsById)
    .filter((item) => item.coachId === coachId)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
  const tenures = Object.values(world.coachTenuresById).filter((item) => item.coachId === coachId)
  const clubs = Object.values(world.coachTeamLegacyByKey).filter((item) => item.coachId === coachId)
  const careerHistory = world.coachCareerHistoryByCoachId[coachId] ?? []
  const reputation = world.coachReputationProfilesByCoachId[coachId]

  const statusKey: GlobalLegacyStatus = legacy?.status ?? 'unproven'
  const hallStatus: HallStatus = legacy?.hallStatus ?? 'notEligible'
  const legacyValue = legacy?.legacyValue ?? 0

  const championships = achievements.filter((item) => item.type === 'championship').length
  const honoursValue = achievements.reduce((sum, item) => sum + item.legacyValue, 0)
  const tenureValue = legacyValue - honoursValue
  const seasonsManaged = tenures.reduce((sum, item) => sum + (item.seasonsManaged ?? 0), 0)

  /* Career wins are derivable: the Career screen folds `CoachTenure.processedSeasonIds` into
     `SeasonHistoryRecord.finalStandings` filtered by `tenure.teamId`. Reusing that canonical
     derivation — rather than re-implementing it or mocking the counter — keeps Legacy and Career on
     the same real number. */
  const careerWins = buildCoachCareerModel(world).wins

  const teamName = (id: TeamId | undefined): string => (id === undefined ? 'Career' : world.teams[id]?.name ?? id)
  const competitionName = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : world.competitions[id as never]?.name ?? id

  /* Mock dates are re-anchored to the real first appointment so the illustrative milestones never
     contradict the world's own calendar. */
  const firstAppointment = careerHistory.find((entry) => entry.kind === 'appointment')
  const anchor: GameDate = firstAppointment?.date ?? world.currentDate
  const mockDate = (yearsAfterStart: number, monthDay: string): GameDate =>
    parseGameDate(`${Number(anchor.slice(0, 4)) + yearsAfterStart}-${monthDay}`)

  const status = STATUS_PRESENTATION[statusKey]

  const scoreTotal = Math.abs(honoursValue) + Math.abs(Math.max(0, tenureValue)) || 1
  const honourShare = (Math.abs(honoursValue) / scoreTotal) * 100
  const tenureShare = (Math.max(0, tenureValue) / scoreTotal) * 100

  const clubLegacy: readonly LegacyClubFootprint[] = [...clubs]
    .sort((a, b) => b.legacyValue - a.legacyValue)
    .map((club) => ({
      teamId: club.teamId,
      teamName: teamName(club.teamId),
      statusLabel: CLUB_STATUS_LABEL[club.status],
      value: club.legacyValue,
      honours: achievements.filter((item) => item.teamId === club.teamId).length,
      tone: CLUB_STATUS_TONE[club.status],
    }))

  const hallPercent = Math.min(100, Math.round((legacyValue / LEGACY_CONFIG.hallInducted) * 100))

  const figures: readonly LegacyFigure[] = [
    { id: 'championships', label: 'Championships', value: championships, tone: 'gold', mock: false },
    { id: 'finals', label: 'Finals', value: COACH_LEGACY_MOCK.finals, tone: 'gold', mock: true },
    { id: 'playoffs', label: 'Playoff appearances', value: COACH_LEGACY_MOCK.playoffAppearances, tone: 'cyan', mock: true },
    { id: 'wins', label: 'Career wins', value: careerWins, tone: 'cyan', mock: false },
  ]

  const milestones: readonly LegacyMilestone[] = (
    [
      { id: 'championships', label: 'Championships', icon: 'trophy', current: championships, target: MILESTONE_TARGETS.championships, tone: 'gold' as LegacyTone, mock: false },
      { id: 'finals', label: 'Finals appearances', icon: 'flag', current: COACH_LEGACY_MOCK.finals, target: MILESTONE_TARGETS.finals, tone: 'gold' as LegacyTone, mock: true },
      { id: 'playoffs', label: 'Playoff appearances', icon: 'stack', current: COACH_LEGACY_MOCK.playoffAppearances, target: MILESTONE_TARGETS.playoffs, tone: 'cyan' as LegacyTone, mock: true },
      { id: 'wins', label: 'Career wins', icon: 'star', current: careerWins, target: MILESTONE_TARGETS.wins, tone: 'cyan' as LegacyTone, mock: false },
    ]
  ).map((milestone) => ({
    ...milestone,
    percent: Math.min(100, Math.round((milestone.current / milestone.target) * 100)),
    remaining: Math.max(0, milestone.target - milestone.current),
  }))

  const themes: readonly LegacyTheme[] = COACH_LEGACY_MOCK.themes

  const realRecords: readonly LegacyRecordRow[] = achievements.map((item) => ({
    id: item.id,
    date: item.occurredOn,
    dateLabel: formatPrototypeDate(item.occurredOn),
    achievement: ACHIEVEMENT_LABEL[item.type],
    detail: [teamName(item.teamId), competitionName(item.competitionId), `Season ${item.seasonId}`]
      .filter((part): part is string => part !== undefined)
      .join(' · '),
    category: ACHIEVEMENT_CATEGORY[item.type],
    tone: ACHIEVEMENT_TONE[item.type],
    mock: false,
  }))

  const mockRecords: readonly LegacyRecordRow[] = COACH_LEGACY_MOCK.records.map((item) => {
    const date = mockDate(item.yearsAfterStart, item.monthDay)
    return {
      id: `mock:${item.id}`,
      date,
      dateLabel: formatPrototypeDate(date),
      achievement: item.achievement,
      detail: item.detail,
      category: item.category,
      tone: item.tone,
      mock: true,
    }
  })

  const records = [...realRecords, ...mockRecords].sort((a, b) => b.date.localeCompare(a.date))

  const criteria: readonly LegacyCriterion[] = [
    {
      id: 'titles',
      label: '3+ championships',
      detail: `${championships} of ${MILESTONE_TARGETS.championships}`,
      met: championships >= MILESTONE_TARGETS.championships,
      mock: false,
    },
    {
      id: 'finals',
      label: '5+ finals appearances',
      detail: `${COACH_LEGACY_MOCK.finals} of ${MILESTONE_TARGETS.finals}`,
      met: COACH_LEGACY_MOCK.finals >= MILESTONE_TARGETS.finals,
      mock: true,
    },
    {
      id: 'playoffs',
      label: '10+ playoff appearances',
      detail: `${COACH_LEGACY_MOCK.playoffAppearances} of ${MILESTONE_TARGETS.playoffs}`,
      met: COACH_LEGACY_MOCK.playoffAppearances >= MILESTONE_TARGETS.playoffs,
      mock: true,
    },
    {
      id: 'wins',
      label: '250+ career wins',
      detail: `${careerWins} of ${MILESTONE_TARGETS.wins}`,
      met: careerWins >= MILESTONE_TARGETS.wins,
      mock: true,
    },
    {
      id: 'standing',
      label: 'Distinguished historical standing',
      detail: status.label,
      met: statusKey === 'distinguished' || statusKey === 'historic' || statusKey === 'legendary',
      mock: false,
    },
  ]

  const recognitions = (legacy?.milestoneKeys ?? []).map((key) => {
    const [mark, teamId] = key.split(':')
    const label = MILESTONE_LABEL[mark ?? ''] ?? mark ?? key
    return teamId === undefined ? label : `${label} · ${teamName(teamId as TeamId)}`
  })

  const reputationAggregate =
    reputation === undefined
      ? 0
      : Math.round(
          (reputation.values.competitive +
            reputation.values.development +
            reputation.values.professional +
            reputation.values.publicStanding) /
            4,
        )

  const comparison = {
    contexts: COACH_LEGACY_MOCK.contexts,
    percentiles: COACH_LEGACY_MOCK.percentiles,
    metrics: [
      { id: 'legacy', label: 'Legacy score', display: String(legacyValue), tone: 'gold' as LegacyTone, mock: false },
      { id: 'championships', label: 'Championships', display: String(championships), tone: 'gold' as LegacyTone, mock: false },
      { id: 'finals', label: 'Finals', display: String(COACH_LEGACY_MOCK.finals), tone: 'gold' as LegacyTone, mock: true },
      { id: 'wins', label: 'Career wins', display: String(careerWins), tone: 'cyan' as LegacyTone, mock: false },
      { id: 'reputation', label: 'Reputation', display: String(reputationAggregate), tone: 'cyan' as LegacyTone, mock: false },
      {
        id: 'development',
        label: 'Development impact',
        display: String(reputation?.values.development ?? 0),
        tone: 'positive' as LegacyTone,
        mock: false,
      },
    ],
  }

  /* ── Timeline: only moments built to survive the career ── */

  const timelineCandidates: LegacyTimelineEvent[] = []
  if (firstAppointment !== undefined) {
    timelineCandidates.push({
      id: `appointment:${firstAppointment.teamId}`,
      date: firstAppointment.date,
      dateLabel: formatPrototypeDate(firstAppointment.date),
      icon: 'briefcase',
      title: 'First appointment',
      highlight: teamName(firstAppointment.teamId),
      detail: 'Where the career begins being measured.',
      tone: 'cyan',
      mock: false,
    })
  }
  for (const item of achievements) {
    const stage: Record<CoachAchievementType, { icon: string; title: string; tone: LegacyTone }> = {
      championship: { icon: 'trophy', title: 'Championship', tone: 'gold' },
      promotion: { icon: 'flag', title: 'Promotion', tone: 'positive' },
      exceptionalSeason: { icon: 'chartBars', title: 'Exceptional season', tone: 'cyan' },
      dynasty: { icon: 'trophy', title: 'Dynasty established', tone: 'gold' },
      hallInduction: { icon: 'star', title: 'Hall of Fame induction', tone: 'gold' },
    }
    const presentation = stage[item.type]
    timelineCandidates.push({
      id: `achievement:${item.type}:${item.id}`,
      date: item.occurredOn,
      dateLabel: formatPrototypeDate(item.occurredOn),
      icon: presentation.icon,
      title: presentation.title,
      highlight: teamName(item.teamId),
      detail: competitionName(item.competitionId) ?? `Season ${item.seasonId}`,
      tone: presentation.tone,
      mock: false,
    })
  }
  for (const club of clubs) {
    if ((club.milestoneKeys ?? []).includes('clubLegendReached')) {
      timelineCandidates.push({
        id: `clubLegend:${club.teamId}`,
        date: world.currentDate,
        dateLabel: formatPrototypeDate(world.currentDate),
        icon: 'landmark',
        title: 'Club legend',
        highlight: teamName(club.teamId),
        detail: 'The club record now carries this coach’s name.',
        tone: 'gold',
        mock: false,
      })
    }
  }
  for (const item of COACH_LEGACY_MOCK.timeline) {
    const date = mockDate(item.yearsAfterStart, item.monthDay)
    timelineCandidates.push({
      id: `mock:${item.id}`,
      date,
      dateLabel: formatPrototypeDate(date),
      icon: item.icon,
      title: item.title,
      highlight: item.highlight,
      detail: item.detail,
      tone: item.tone,
      mock: true,
    })
  }

  const timeline = [...timelineCandidates]
    .sort((a, b) => (STAGE_WEIGHT[timelineWeightKey(b)] ?? 0) - (STAGE_WEIGHT[timelineWeightKey(a)] ?? 0))
    .slice(0, 6)
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    standing: { statusKey, ...status },
      score: {
        total: legacyValue,
        honours: honoursValue,
        tenure: tenureValue,
        honourShare,
        tenureShare,
      },
      hallTrack: {
        current: legacyValue,
        target: LEGACY_CONFIG.hallInducted,
        percent: hallPercent,
        remaining: Math.max(0, LEGACY_CONFIG.hallInducted - legacyValue),
      },
      clubLegacy,
      figures,
    milestones,
    themes,
    narrative: buildNarrative(statusKey, themes, { championships, seasonsManaged, clubs: clubs.length }),
    records,
    hof: {
      statusLabel: HALL_STATUS_LABEL[hallStatus],
      criteria,
      estimatedPoints: COACH_LEGACY_MOCK.hof.estimatedPoints,
      estimatedPercent: Math.min(100, Math.round((COACH_LEGACY_MOCK.hof.estimatedPoints / LEGACY_CONFIG.hallInducted) * 100)),
      trajectory: COACH_LEGACY_MOCK.hof.trajectory,
      eligibility: COACH_LEGACY_MOCK.hof.eligibility,
      recognitions,
    },
    comparison,
    timeline,
  }
}

/** Maps a timeline event back to its significance key so the strip keeps the defining moments. */
function timelineWeightKey(event: LegacyTimelineEvent): string {
  if (event.id.startsWith('mock:')) return event.id.slice('mock:'.length)
  if (event.id.startsWith('achievement:')) return event.id.split(':')[1] ?? ''
  if (event.id.startsWith('clubLegend:')) return 'clubLegendReached'
  return 'firstAppointment'
}

const THEME_PHRASE: Readonly<Record<string, string>> = {
  playerDevelopment: 'developing talent',
  tacticalInnovation: 'tactical innovation',
  cultureBuilding: 'building resilient, competitive teams',
  influenceLeadership: 'shaping decisions beyond the touchline',
  longevityAdaptation: 'staying relevant across eras',
  talentIdentification: 'finding players the market overlooked',
}

const STATUS_ADJECTIVE: Readonly<Record<GlobalLegacyStatus, string>> = {
  unproven: 'unproven',
  established: 'emerging',
  notable: 'credible',
  distinguished: 'accomplished',
  historic: 'era-defining',
  legendary: 'generational',
}

function buildNarrative(
  statusKey: GlobalLegacyStatus,
  themes: readonly LegacyTheme[],
  totals: { readonly championships: number; readonly seasonsManaged: number; readonly clubs: number },
): string {
  const ranked = [...themes].sort((a, b) => b.value - a.value)
  const primary = THEME_PHRASE[ranked[0]?.id ?? ''] ?? 'building something that lasts'
  const secondary = THEME_PHRASE[ranked[1]?.id ?? ''] ?? 'competing every season'
  const adjective = STATUS_ADJECTIVE[statusKey]
  const article = /^[aeiou]/i.test(adjective) ? 'An' : 'A'
  const closing =
    totals.championships > 0
      ? `${totals.championships} title${totals.championships === 1 ? '' : 's'} across ${totals.seasonsManaged} season${
          totals.seasonsManaged === 1 ? '' : 's'
        } give the argument its anchor.`
      : `No title yet — the case rests on ${totals.seasonsManaged} season${
          totals.seasonsManaged === 1 ? '' : 's'
        } and ${totals.clubs} club${totals.clubs === 1 ? '' : 's'}.`
  return `${article} ${adjective} coach known for ${primary} and ${secondary}. ${closing}`
}

/* ── Small shared pieces ── */

function MockTag() {
  return (
    <span className="ld-mock" title="Illustrative value: not backed by the simulation domain yet.">
      Mock
    </span>
  )
}

function LegacyLink({ children, onClick }: { readonly children: ReactNode; readonly onClick?: () => void }) {
  return (
    <button className="ld-link" disabled={onClick === undefined} onClick={onClick} type="button">
      {children}
      <span aria-hidden className="ld-link__arrow">
        →
      </span>
    </button>
  )
}

function toneClass(tone: LegacyTone): string {
  return `ld-tone--${tone}`
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

/* ── Row 1 · Historical standing ── */

function HistoricalStandingPanel({ model, onOpenTab }: { readonly model: CoachLegacyModel; readonly onOpenTab?: (tabId: string) => void }) {
    const { clubLegacy, figures, hallTrack, score, standing } = model
  return (
    <section className="ng-canon__panel ng-holo-panel ld-panel">
      <OverviewPanelHeader
        aside={<LegacyLink onClick={onOpenTab === undefined ? undefined : () => onOpenTab('career')}>Career</LegacyLink>}
        icon="landmark"
        subtitle="Lasting historical importance"
        title="Historical standing"
      />
      <div className="ld-body">
        <div className="ld-standing">
          <span className={`ld-standing__label ${toneClass(standing.tone)}`}>{standing.label}</span>
          <span className="ld-standing__explain">{standing.explanation}</span>
        </div>

        <div className="ld-block">
          <div className="ld-block__head">
            <span className="ld-kicker">Legacy score</span>
            <span className="ld-block__value ld-num">{score.total}</span>
          </div>
          <span
            aria-label={`Legacy composition: honours ${score.honours} points, tenure and events ${score.tenure} points`}
            className="ld-bar"
            role="img"
          >
            <span className="ld-bar__fill ld-fill--gold" style={{ width: `${score.honourShare}%` }} />
            <span className="ld-bar__fill ld-fill--cyan" style={{ width: `${score.tenureShare}%` }} />
          </span>
          <ul className="ld-score__rows">
            <li className="ld-score__row">
              <span className="ld-score__row-label">Honours &amp; achievements</span>
              <span className="ld-score__row-value ld-num ld-tone--gold">{signed(score.honours)}</span>
            </li>
            <li className="ld-score__row">
              <span className="ld-score__row-label">Tenure, longevity &amp; tier events</span>
              <span className={`ld-score__row-value ld-num ${toneClass(score.tenure < 0 ? 'negative' : 'cyan')}`}>
                {signed(score.tenure)}
              </span>
            </li>
          </ul>
        </div>

        <div className="ld-block">
          <div className="ld-block__head">
            <span className="ld-kicker">Legacy by club</span>
            <span className="ld-block__value ld-num">{clubLegacy.length}</span>
          </div>
          <ul className="ld-score__rows">
            {clubLegacy.slice(0, 2).map((club) => (
              <li className="ld-score__row" key={club.teamId}>
                <span className="ld-score__row-label">
                  {club.teamName} · {club.statusLabel} · {club.honours} honours
                </span>
                <span className={`ld-score__row-value ld-num ${toneClass(club.tone)}`}>{club.value}</span>
              </li>
            ))}
            {clubLegacy.length > 2 ? (
              <li className="ld-score__row">
                <span className="ld-score__row-label">+{clubLegacy.length - 2} more clubs</span>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="ld-block">
          <div className="ld-block__head">
            <span className="ld-kicker">Hall of Fame track</span>
            <span className="ld-block__value ld-num">
              {hallTrack.current}
              <span className="ld-block__target">/{hallTrack.target}</span>
            </span>
          </div>
          <span
            aria-label={`Hall of Fame track: ${hallTrack.current} of ${hallTrack.target} points`}
            className="ld-bar"
            role="img"
          >
            <span className="ld-bar__fill ld-fill--gold" style={{ width: `${hallTrack.percent}%` }} />
          </span>
          <span className="ld-standing__explain">
            {hallTrack.remaining} points to induction · candidate threshold at {LEGACY_CONFIG.hallCandidate}
          </span>
        </div>

        <ul className="ld-figures">
          {figures.map((figure) => (
            <li className="ld-figure" key={figure.id}>
              <span className={`ld-figure__value ld-num ${toneClass(figure.tone)}`}>{figure.value}</span>
              <span className="ld-figure__label">
                {figure.label}
                {figure.mock ? <MockTag /> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ── Row 1 · Trophy & milestone progress ── */

function TrophyMilestonePanel({ model }: { readonly model: CoachLegacyModel }) {
  return (
    <section className="ng-canon__panel ng-holo-panel ld-panel">
      <OverviewPanelHeader
        aside={<span className="ld-kicker">Distance to history</span>}
        icon="trophy"
        subtitle="Milestones that reclassify a career"
        title="Trophy & milestone progress"
      />
      <div className="ld-body">
        <ul className="ld-trophies">
          {model.milestones.map((milestone) => (
            <li className="ld-trophy" key={milestone.id}>
              <span className="ld-trophy__ring">
                <CircularProgress
                  caption=""
                  label={`${milestone.label}: ${milestone.current} of ${milestone.target}`}
                  value={milestone.percent}
                />
              </span>
              <span className="ld-trophy__body">
                <span className="ld-trophy__label">
                  {milestone.label}
                  {milestone.mock ? <MockTag /> : null}
                </span>
                <span className={`ld-trophy__fraction ld-num ${toneClass(milestone.tone)}`}>
                  {milestone.current}
                  <span className="ld-block__target">/{milestone.target}</span>
                </span>
                <span className="ld-trophy__remaining">
                  {milestone.remaining === 0 ? 'Milestone reached' : `${milestone.remaining} to go`}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <span className="ld-standing__explain">
          The ring is the distance already covered. Nothing here rewards hitting a target; it only shows how far the
          record still is from changing its status.
        </span>
      </div>
    </section>
  )
}

/* ── Row 1 · Defining themes ── */

function DefiningThemesPanel({ model }: { readonly model: CoachLegacyModel }) {
  return (
    <section className="ng-canon__panel ng-holo-panel ld-panel">
      <OverviewPanelHeader
        aside={<MockTag />}
        icon="brain"
        subtitle="What the career is known for"
        title="Defining themes"
      />
      <div className="ld-body">
        <ul className="ld-themes">
          {model.themes.map((theme) => (
            <li className="ld-theme" key={theme.id} title={theme.note}>
              <HorizontalValueBar label={theme.label} tone={theme.tone} value={theme.value} />
            </li>
          ))}
        </ul>
        <div className="ld-narrative">
          <span className="ld-kicker">
            Narrative identity <MockTag />
          </span>
          <p className="ld-narrative__text">{model.narrative}</p>
          <span className="ld-standing__explain">
            Generated from the career so far. It is meant to change as decisions and results change.
          </span>
        </div>
      </div>
    </section>
  )
}

/* ── Row 2 · Achievements & records ── */

const RECORD_FILTERS: readonly { readonly id: LegacyFilterId; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'honours', label: 'Honours' },
  { id: 'records', label: 'Records' },
  { id: 'playoffRuns', label: 'Playoff runs' },
  { id: 'signatureWins', label: 'Signature wins' },
  { id: 'nearMisses', label: 'Near misses' },
]

function AchievementsPanel({
  filter,
  model,
  onFilterChange,
  onOpenTab,
}: {
  readonly filter: LegacyFilterId
  readonly model: CoachLegacyModel
  readonly onFilterChange: (filter: LegacyFilterId) => void
  readonly onOpenTab?: (tabId: string) => void
}) {
  const rows = filter === 'all' ? model.records : model.records.filter((row) => row.category === filter)
  const mockCount = rows.filter((row) => row.mock).length

  return (
    <section className="ng-canon__panel ng-holo-panel ld-panel">
      <OverviewPanelHeader
        aside={<LegacyLink onClick={onOpenTab === undefined ? undefined : () => onOpenTab('career')}>History</LegacyLink>}
        icon="star"
        subtitle="Successes and the ones that got away"
        title="Achievements & records"
      />
      <div className="ld-body ld-body--flush">
        <div aria-label="Filter historical records" className="ld-filters">
          {RECORD_FILTERS.map((option) => (
            <button
              aria-pressed={filter === option.id}
              className={`ld-filter${filter === option.id ? ' is-active' : ''}`}
              key={option.id}
              onClick={() => onFilterChange(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="ld-table-wrap">
          <NgPrecisionTable
            className="ld-table"
            columns={ngTableColumns(rows, [
              ngCol('date', 'Date', (row: LegacyRecordRow) => row.dateLabel, {
                width: 92,
                value: (row: LegacyRecordRow) => row.dateLabel,
              }),
              ngCol(
                'achievement',
                'Achievement',
                (row: LegacyRecordRow) => (
                  <span className={`ld-record ${toneClass(row.tone)}`}>
                    {row.achievement}
                    {row.mock ? <MockTag /> : null}
                  </span>
                ),
                { value: (row: LegacyRecordRow) => row.achievement },
              ),
              ngCol('detail', 'Detail', (row: LegacyRecordRow) => row.detail, {
                value: (row: LegacyRecordRow) => row.detail,
              }),
            ])}
            emptyDescription="Switch the filter to see other moments."
            emptyTitle="Nothing recorded in this category"
            gridId="ng-coach-legacy-achievements"
            rows={rows}
          />
        </div>
        <span className="ld-standing__explain">
          {rows.length} moment{rows.length === 1 ? '' : 's'}
          {mockCount > 0 ? ` · ${mockCount} illustrative` : ''} · a career is remembered for the finals it lost too.
        </span>
      </div>
    </section>
  )
}

/* ── Row 2 · Hall of Fame path ── */

function HallOfFamePathPanel({ model }: { readonly model: CoachLegacyModel }) {
  const { hof } = model
  return (
    <section className="ng-canon__panel ng-holo-panel ld-panel">
      <OverviewPanelHeader
        aside={<span className="ld-kicker">{hof.statusLabel}</span>}
        icon="flag"
        subtitle="What the voters would weigh"
        title="Hall of Fame path"
      />
      <div className="ld-body">
        <ul className="ld-criteria">
          {hof.criteria.map((criterion) => (
            <li className={`ld-criterion${criterion.met ? ' is-met' : ''}`} key={criterion.id}>
              <span aria-hidden className="ld-criterion__mark">
                {criterion.met ? '✓' : '—'}
              </span>
              <span className="ld-criterion__body">
                <span className="ld-criterion__label">
                  {criterion.label}
                  {criterion.mock ? <MockTag /> : null}
                </span>
                <span className="ld-criterion__detail">{criterion.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="ld-block">
          <div className="ld-block__head">
            <span className="ld-kicker">
              Estimated induction points <MockTag />
            </span>
            <span className="ld-block__value ld-num">
              {hof.estimatedPoints}
              <span className="ld-block__target">/{LEGACY_CONFIG.hallInducted}</span>
            </span>
          </div>
          <span
            aria-label={`Estimated induction points: ${hof.estimatedPoints} of ${LEGACY_CONFIG.hallInducted}`}
            className="ld-bar"
            role="img"
          >
            <span className="ld-bar__fill ld-fill--gold" style={{ width: `${hof.estimatedPercent}%` }} />
          </span>
          <span className="ld-standing__explain">{hof.trajectory}</span>
          <span className="ld-standing__explain">{hof.eligibility}</span>
        </div>

        {hof.recognitions.length === 0 ? (
          <span className="ld-standing__explain">No recorded recognitions yet.</span>
        ) : (
          <ul className="ld-chips">
            {hof.recognitions.map((recognition) => (
              <li className="ld-chip" key={recognition}>
                {recognition}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ── Row 2 · Comparative standing ── */

function percentileBand(percentile: number): { readonly label: string; readonly tone: LegacyTone } {
  const top = Math.max(1, Math.round((100 - percentile) / 5) * 5)
  if (percentile < 30) return { label: 'Bottom tier', tone: 'negative' }
  if (percentile < 50) return { label: `Top ${top}%`, tone: 'warning' }
  if (percentile < 70) return { label: `Top ${top}%`, tone: 'cyan' }
  return { label: `Top ${top}%`, tone: 'positive' }
}

function ComparativeStandingPanel({
  context,
  model,
  onContextChange,
}: {
  readonly context: LegacyComparisonContextId
  readonly model: CoachLegacyModel
  readonly onContextChange: (context: LegacyComparisonContextId) => void
}) {
  const { comparison } = model
  const percentiles = comparison.percentiles[context] ?? {}
  const activeContext = comparison.contexts.find((item) => item.id === context)

  return (
    <section className="ng-canon__panel ng-holo-panel ld-panel">
      <OverviewPanelHeader
        aside={<MockTag />}
        icon="chartBars"
        subtitle="Where the career sits right now"
        title="Comparative standing"
      />
      <div className="ld-body">
        <div aria-label="Comparison context" className="ld-filters">
          {comparison.contexts.map((option) => (
            <button
              aria-pressed={context === option.id}
              className={`ld-filter${context === option.id ? ' is-active' : ''}`}
              key={option.id}
              onClick={() => onContextChange(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <ul className="ld-cmp__rows">
          {comparison.metrics.map((metric) => {
            const percentile = percentiles[metric.id] ?? 0
            const band = percentileBand(percentile)
            return (
              <li className="ld-cmp__row" key={metric.id}>
                <span className="ld-cmp__label">
                  {metric.label}
                  {metric.mock ? <MockTag /> : null}
                </span>
                <span className={`ld-cmp__value ld-num ${toneClass(metric.tone)}`}>{metric.display}</span>
                <span className={`ld-cmp__band ${toneClass(band.tone)}`}>{band.label}</span>
                <span className="ld-cmp__track">
                  <span className={`ld-cmp__fill ld-fill--${band.tone}`} style={{ width: `${percentile}%` }} />
                </span>
              </li>
            )
          })}
        </ul>
        {activeContext === undefined ? null : <span className="ld-standing__explain">{activeContext.note}</span>}
      </div>
    </section>
  )
}

/* ── Bottom strip · Legacy timeline ── */

function LegacyTimelinePanel({ model, onOpenTab }: { readonly model: CoachLegacyModel; readonly onOpenTab?: (tabId: string) => void }) {
  return (
    <section className="ng-canon__panel ng-holo-panel ld-panel ld-panel--timeline">
      <OverviewPanelHeader
        aside={
          <LegacyLink onClick={onOpenTab === undefined ? undefined : () => onOpenTab('career')}>
            Full career history
          </LegacyLink>
        }
        icon="stack"
        subtitle="Moments with a chance to outlive the career"
        title="Legacy timeline"
      />
      <ol className="ld-tl">
        {model.timeline.map((event) => (
          <li className="ld-tl__item" key={event.id}>
            <span aria-hidden className={`ld-tl__dot ld-fill--${event.tone}`} />
            <span className="ld-tl__date">
              {event.dateLabel}
              {event.mock ? <MockTag /> : null}
            </span>
            <span className="ld-tl__title">
              <span className={toneClass(event.tone)}>
                <OverviewGlyph name={event.icon} size={13} />
              </span>
              {event.title}
            </span>
            <span className="ld-tl__highlight">{event.highlight}</span>
            <span className="ld-tl__detail">{event.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ── Screen ── */

export interface CoachLegacyScreenProps {
  /** Canonical world. Falls back to the game store so the tab is self-sufficient once wired. */
  readonly world?: GameWorld
  readonly onOpenTab?: (tabId: string) => void
}

export function CoachLegacyScreen({ world: suppliedWorld, onOpenTab }: CoachLegacyScreenProps = {}) {
  const storeWorld = useGameStore((state) => state.world)
  const world = suppliedWorld ?? storeWorld
  const model = useMemo(() => (world === null || world === undefined ? null : buildCoachLegacyModel(world)), [world])
  const [recordFilter, setRecordFilter] = useState<LegacyFilterId>('all')
  const [comparisonContext, setComparisonContext] = useState<LegacyComparisonContextId>('active')

  if (model === null) return <p className="ng-canon__empty ld-empty">No career loaded.</p>

  return (
    <div className="ld-legacy">
      <div className="ld-row">
        <HistoricalStandingPanel model={model} onOpenTab={onOpenTab} />
        <TrophyMilestonePanel model={model} />
        <DefiningThemesPanel model={model} />
      </div>
      <div className="ld-row">
        <AchievementsPanel filter={recordFilter} model={model} onFilterChange={setRecordFilter} onOpenTab={onOpenTab} />
        <HallOfFamePathPanel model={model} />
        <ComparativeStandingPanel context={comparisonContext} model={model} onContextChange={setComparisonContext} />
      </div>
      <LegacyTimelinePanel model={model} onOpenTab={onOpenTab} />
    </div>
  )
}
