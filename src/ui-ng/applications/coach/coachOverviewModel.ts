/*
 * Coach · Overview — runtime model builder.
 *
 * The Overview board was the only coach tab rendered entirely from `COACH_OVERVIEW_MOCK`. This module
 * turns it into a projection of the live `GameWorld`: every field the domain already models is read
 * from the world, and the mock is kept only for the fields that have no canonical source.
 *
 * It reuses the other coach builders (`buildCoachCareerModel`, `buildCoachLegacyModel`,
 * `buildCoachReputationModel`, `buildCoachOpportunitiesModel`, `buildCoachDevelopmentSummary`) so no
 * derivation or formula is duplicated, and it never writes to the world.
 *
 * REAL (source in brackets):
 *   · Employment        → identity.role / identity.club  [coachEmploymentByCoachId + teams]
 *   · Development       → identity.developmentPoints, the development summary and its skill bars
 *                         [coachRpgProfilesByCoachId → buildCoachDevelopmentSummary / buildCoachSkillRows]
 *   · Reputation        → the reputation summary metrics and trend  [coachReputationProfilesByCoachId,
 *                         scale 0..1000 with 200 as the default, via buildCoachReputationModel]
 *   · Personal finances → the salary / net worth / expenses / external income rows and the fund
 *                         allocation  [coachFinancesByCoachId + getCoachFinancialPosition,
 *                         getCoachNetWorth, getCoachMonthlyExpenses, getCoachMonthlyExternalIncome]
 *   · Status & alerts   → job security and board patience [boardStatesByTeamId + getJobSecurity],
 *                         unspent development points, reputation standing and market activity
 *   · Summaries         → career [buildCoachCareerModel], relationships
 *                         [getRelationshipsForPerson + getRelationshipBandForPeople], legacy
 *                         [buildCoachLegacyModel]
 *   · Timeline          → the non-mock entries of the legacy timeline
 *
 * MOCK (no canonical source; kept from `COACH_OVERVIEW_MOCK` and labelled `· MOCK` in the model where
 * they surface as copy, so they can never be mistaken for runtime data):
 *   · identity.level / identity.careerXp — the RPG profile stores progress points, never a level.
 *   · identity.rows — archetype, shadow archetype and moral alignment are not modelled.
 *   · attributes / personality — the display labels ("Politics", "Integrity", "Empathy"…) do not map
 *     1:1 onto `StaffProfessionalProfile` or `Personality`, so re-sourcing them would invent a rule.
 *   · risks — the four heat/risk categories are not modelled.
 *   · favors, network (agent / federation / underground), power (leverage) — character fiction the
 *     simulation does not track.
 *   · the "Hidden funds" / "Influence budget" resource rows and the career "Contract" card, because
 *     coaches have no contract entity (only `CoachEmployment.startedOn` and `annualSalary` are real).
 *   · the timeline rail, but only while the legacy timeline has no real event: the filler entries are
 *     then flagged `mock` so the rail can label them, never the real ones.
 */

import { getJobSecurity, type BoardState, type JobSecurity } from '@/domain/board'
import {
  getCoachFinancialPosition,
  getCoachMonthlyExpenses,
  getCoachMonthlyExternalIncome,
  getCoachNetWorth,
  type CoachFinanceProfile,
  type CoachFinancialPosition,
} from '@/domain/coachFinances'
import type { CoachRpgProfile } from '@/domain/coachRpg'
import type { CoachId, PlayerId, StaffPersonId } from '@/domain/ids'
import { getRelationshipBandForPeople, getRelationshipsForPerson, type GameWorld } from '@/domain/world'
import { formatCoachReputationDelta } from '@/ui/coachReputationPresentation'
import { formatMoney } from '@/ui/formatters'
import { buildCoachCareerModel } from '@/ui-ng/applications/coach/CoachCareerScreen'
import { buildCoachLegacyModel, type CoachLegacyModel } from '@/ui-ng/applications/coach/CoachLegacyScreen'
import { buildCoachOpportunitiesModel, type CoachOpportunitiesModel } from '@/ui-ng/applications/coach/CoachOpportunitiesScreen'
import { buildCoachReputationModel, type CoachReputationModel } from '@/ui-ng/applications/coach/CoachReputationScreen'
import { buildCoachDevelopmentSummary, buildCoachSkillRows } from '@/ui-ng/applications/coach/coachDevelopmentModel'
import {
  COACH_OVERVIEW_MOCK,
  type CoachOverviewAllocationSlice,
  type CoachOverviewFinanceRow,
  type CoachOverviewMetric,
  type CoachOverviewModel,
  type CoachOverviewStatusRow,
  type CoachOverviewSummary,
  type CoachOverviewTimelineEvent,
  type CoachOverviewTone,
} from '@/ui-ng/applications/coach/coachOverviewMock'

type CoachCareerModel = ReturnType<typeof buildCoachCareerModel>

/** Suffix appended to every label whose value still comes from `COACH_OVERVIEW_MOCK`. */
const MOCK_SUFFIX = ' · MOCK'
/** Window the reputation card reports; the Overview is a six-month snapshot. */
const REPUTATION_WINDOW_MONTHS = 6

/* ── Small helpers ── */

function money(value: number): string {
  // `formatMoney` always emits two decimals for millions; drop them when they are zero so the rows
  // read like the rest of the board ("$3.2M", not "$3.20M").
  return `$${formatMoney(value).replace(/\.?0+M$/, 'M')}`
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function mockSummary(mock: CoachOverviewModel, id: string): CoachOverviewSummary {
  return mock.summaries.find((summary) => summary.id === id) ?? mock.summaries[0]!
}

function mockMetric(summary: CoachOverviewSummary, metricId: string): CoachOverviewMetric | undefined {
  return summary.metrics.find((metric) => metric.id === metricId)
}

function personLabel(world: GameWorld, personId: string): string {
  const player = world.players[personId as PlayerId]
  if (player !== undefined) return `${player.firstName} ${player.lastName}`
  const coach = world.coaches[personId as CoachId]
  if (coach !== undefined) return `${coach.firstName} ${coach.lastName}`
  const staff = world.staffPeopleById[personId as StaffPersonId]
  if (staff !== undefined) return `${staff.identity.firstName} ${staff.identity.lastName}`
  return personId
}

function jobSecurityLabel(security: JobSecurity): string {
  if (security === 'underPressure') return 'Under pressure'
  if (security === 'atRisk') return 'At risk'
  return security.charAt(0).toUpperCase() + security.slice(1)
}

function jobSecurityTone(security: JobSecurity): CoachOverviewTone {
  if (security === 'secure') return 'positive'
  if (security === 'stable') return 'cyan'
  if (security === 'underPressure') return 'warning'
  return 'negative'
}

function patienceLabel(value: number): string {
  if (value >= 80) return 'Very high'
  if (value >= 60) return 'High'
  if (value >= 40) return 'Moderate'
  if (value >= 20) return 'Low'
  return 'Very low'
}

function deltaTone(delta: number): CoachOverviewTone {
  return delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'
}

function deltaDirection(delta: number): 'up' | 'down' | 'flat' {
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

function relationshipTone(band: string): CoachOverviewTone {
  if (band === 'strong') return 'positive'
  if (band === 'positive') return 'cyan'
  if (band === 'hostile') return 'negative'
  if (band === 'poor') return 'warning'
  return 'neutral'
}

function titleCase(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1).toLowerCase()}`
}

/* ── Personal economy ── */

function buildFinanceRows(
  finances: CoachFinanceProfile | undefined,
  position: CoachFinancialPosition | undefined,
  fallback: readonly CoachOverviewFinanceRow[],
): readonly CoachOverviewFinanceRow[] {
  const rows: CoachOverviewFinanceRow[] = []
  if (finances !== undefined && position !== undefined) {
    rows.push({
      id: 'salary',
      icon: 'banknote',
      label: 'Annual salary',
      value: money(finances.annualSalary),
      tone: 'gold',
      tooltip: `Gross annual salary from coachFinancesByCoachId (tax rate ${Math.round(finances.incomeTaxRate * 100)}%).`,
    })
    rows.push({
      id: 'netWorth',
      icon: 'wallet',
      label: 'Net worth',
      value: money(position.netWorth),
      tone: position.netWorth >= 0 ? 'positive' : 'negative',
      tooltip: 'Cash + active investments + active assets − active debt (getCoachNetWorth).',
    })
    rows.push({
      id: 'expenses',
      icon: 'walletCards',
      label: 'Monthly expenses',
      value: money(getCoachMonthlyExpenses(finances)),
      tooltip: 'Lifestyle cost + asset upkeep + debt payments (getCoachMonthlyExpenses).',
    })
    rows.push({
      id: 'externalIncome',
      icon: 'trendingUp',
      label: 'Monthly external income',
      value: money(getCoachMonthlyExternalIncome(finances)),
      tone: 'cyan',
      tooltip: 'Active sponsorships and businesses, net of tax (getCoachMonthlyExternalIncome).',
    })
  }
  // "Hidden funds" and the "influence budget" are character fiction: no domain field tracks them.
  for (const row of fallback) {
    if (row.id === 'hidden' || row.id === 'influence') rows.push({ ...row, label: `${row.label}${MOCK_SUFFIX}` })
  }
  return rows.length > 0 ? rows : fallback
}

function buildAllocation(
  finances: CoachFinanceProfile | undefined,
  fallback: CoachOverviewModel['allocation'],
): CoachOverviewModel['allocation'] {
  if (finances === undefined) return fallback
  const cash = finances.cash
  const investments = finances.investments
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + item.value, 0)
  const assets = finances.assets
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + item.marketValue, 0)
  const gross = cash + investments + assets
  if (gross <= 0) return fallback
  const slices: CoachOverviewAllocationSlice[] = [
    { id: 'cash', label: 'Cash', amount: cash, tone: 'cyan' as const },
    { id: 'investments', label: 'Investments', amount: investments, tone: 'positive' as const },
    { id: 'assets', label: 'Assets', amount: assets, tone: 'gold' as const },
  ]
    .filter((entry) => entry.amount > 0)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      share: Math.round((entry.amount / gross) * 100),
      amount: money(entry.amount),
      tone: entry.tone,
    }))
  return { total: money(gross), caption: 'Gross assets', slices }
}

/* ── Status & alerts ── */

function buildStatusRows({
  board,
  career,
  development,
  isEmployed,
  legacy,
  opportunities,
  reputation,
}: {
  readonly board: BoardState | undefined
  readonly career: CoachCareerModel
  readonly development: ReturnType<typeof buildCoachDevelopmentSummary> | undefined
  readonly isEmployed: boolean
  readonly legacy: CoachLegacyModel | null
  readonly opportunities: CoachOpportunitiesModel | null
  readonly reputation: CoachReputationModel | null
}): readonly CoachOverviewStatusRow[] {
  const rows: CoachOverviewStatusRow[] = []

  if (board !== undefined && isEmployed) {
    const security = getJobSecurity(board)
    rows.push({
      id: 'career',
      icon: 'shieldCheck',
      title: `Job security: ${jobSecurityLabel(security)}`,
      detail: `Board confidence ${board.confidence}/100 · patience ${patienceLabel(board.profile.patience)}.`,
      badge: jobSecurityLabel(security),
      tone: jobSecurityTone(security),
      tooltip: `Derived from board confidence (${board.confidence}) and board patience (${board.profile.patience}) via getJobSecurity.`,
    })
  } else {
    rows.push({
      id: 'career',
      icon: 'briefcase',
      title: 'Out of work',
      detail: 'No club currently employs you.',
      badge: career.role,
      tone: 'warning',
      tooltip: 'Employment is read from coachEmploymentByCoachId.',
    })
  }

  if (development !== undefined) {
    const points = development.developmentPoints
    rows.push({
      id: 'development',
      icon: 'sparkle',
      title: 'Development points available',
      detail: points === 0 ? 'No unspent development points.' : `${points} unspent development point${points === 1 ? '' : 's'}.`,
      badge: points > 0 ? 'Action' : 'None',
      tone: points > 0 ? 'gold' : 'neutral',
      tooltip: 'Unspent points from the coach RPG profile. Spend them in Development — skills or perks.',
    })
  }

  if (reputation !== null) {
    const { recentChange, total, totalBand } = reputation.summary
    rows.push({
      id: 'reputation',
      icon: 'star',
      title: `Reputation: ${totalBand}`,
      detail: `${total}/1000 standing · ${formatCoachReputationDelta(recentChange.total)} in the last ${recentChange.months} months.`,
      badge: formatCoachReputationDelta(recentChange.total),
      tone: deltaTone(recentChange.total),
      tooltip: recentChange.note,
    })
  }

  if (opportunities !== null) {
    const metric = (id: string) => opportunities.market.metrics.find((entry) => entry.id === id)?.value ?? '0'
    rows.push({
      id: 'opportunities',
      icon: 'target',
      title: 'Career market',
      detail: `${metric('clubs-interested')} clubs interested · ${metric('active-openings')} open roles · ${metric('interviews')} interviews.`,
      badge: `${metric('active-openings')} open`,
      tone: Number(metric('active-openings')) > 0 ? 'cyan' : 'neutral',
      tooltip: 'Live candidacies, interviews and vacancies from the coach career market.',
    })
  }

  if (legacy !== null) {
    const championships = legacy.figures.find((figure) => figure.id === 'championships')?.value ?? 0
    rows.push({
      id: 'legacy',
      icon: 'trophy',
      title: `Legacy: ${legacy.standing.label}`,
      detail: `${championships} title${championships === 1 ? '' : 's'} · Hall ${legacy.hof.statusLabel}.`,
      badge: legacy.hof.statusLabel,
      tone: legacy.standing.tone,
      tooltip: legacy.standing.explanation,
    })
  }

  return rows
}

/* ── Summaries ── */

function buildCareerSummary(career: CoachCareerModel, base: CoachOverviewSummary): CoachOverviewSummary {
  const winSeries = career.trajectory.find((series) => series.id === 'winPct')
  const contract = mockMetric(base, 'contract')
  const security = career.jobSecurity
  const metrics: CoachOverviewMetric[] = [
    {
      id: 'years',
      label: 'Years in post',
      value: career.yearsInPost === undefined ? '—' : `${career.yearsInPost}`,
      tooltip: 'Time since the current appointment started.',
    },
    contract === undefined
      ? { id: 'contract', label: 'Contract', value: '—' }
      : { ...contract, label: `${contract.label}${MOCK_SUFFIX}`, tooltip: 'MOCK — coaches have no contract entity; only the annual salary and the start date are real.' },
    {
      id: 'security',
      label: 'Job Security',
      value: security === undefined ? '—' : jobSecurityLabel(security),
      tone: security === undefined ? 'neutral' : jobSecurityTone(security),
    },
    {
      id: 'winpct',
      label: 'Career Win %',
      value: winSeries?.endLabel ?? '—',
      tone: 'cyan',
      tooltip: winSeries?.caption,
    },
  ]
  const chart: CoachOverviewSummary['chart'] =
    winSeries !== undefined && winSeries.points.length > 0
      ? {
          kind: 'line',
          title: 'Win % trend',
          points: winSeries.points.map((point) => Math.round(point.value * 100)),
          endLabel: winSeries.endLabel,
          caption: winSeries.caption,
        }
      : base.chart
  return { ...base, metrics, chart }
}

function buildReputationSummary(reputation: CoachReputationModel | null, base: CoachOverviewSummary): CoachOverviewSummary {
  if (reputation === null) return base
  const { recentChange } = reputation.summary
  const metrics: CoachOverviewMetric[] = reputation.summary.dimensions.map((dimension) => ({
    id: dimension.id,
    label: dimension.label,
    value: String(dimension.value),
    delta: deltaDirection(dimension.delta),
    tone: deltaTone(dimension.delta),
    tooltip: `${dimension.band} · ${formatCoachReputationDelta(dimension.delta)} in the last ${recentChange.months} months.`,
  }))
  return {
    ...base,
    metrics,
    chart: {
      kind: 'line',
      title: 'Reputation trend',
      points: reputation.timeline.points,
      endLabel: formatCoachReputationDelta(recentChange.total),
      caption: reputation.timeline.caption,
    },
  }
}

function buildRelationshipsSummary(world: GameWorld, coachId: string, base: CoachOverviewSummary): CoachOverviewSummary {
  const profiles = getRelationshipsForPerson(world, coachId)
    .slice(0, 4)
    .map((profile) => {
      const otherId = profile.sourceId === coachId ? profile.targetId : profile.sourceId
      return {
        id: `rel-${profile.sourceId}-${profile.targetId}`,
        name: personLabel(world, otherId),
        value: profile.value,
        band: getRelationshipBandForPeople(world, coachId, otherId),
      }
    })
  if (profiles.length === 0) return base
  return {
    ...base,
    metrics: profiles.map((row) => ({
      id: row.id,
      label: row.name,
      value: signed(row.value),
      tone: relationshipTone(row.band),
      tooltip: `Relationship ${signed(row.value)} (${row.band}).`,
    })),
    chart: {
      kind: 'bars',
      title: 'Relationship health',
      columns: profiles.map((row) => ({
        id: row.id,
        label: row.name.slice(0, 1).toUpperCase(),
        value: Math.round((row.value + 100) / 2),
      })),
    },
  }
}

function buildDevelopmentSummaryCard(rpg: CoachRpgProfile | undefined, base: CoachOverviewSummary): CoachOverviewSummary {
  if (rpg === undefined) return base
  const summary = buildCoachDevelopmentSummary(rpg)
  const byCategory = new Map<string, { rank: number; capacity: number }>()
  for (const row of buildCoachSkillRows(rpg)) {
    const entry = byCategory.get(row.category) ?? { rank: 0, capacity: 0 }
    entry.rank += row.rank
    entry.capacity += row.maxRank
    byCategory.set(row.category, entry)
  }
  const columns = [...byCategory.entries()]
    .map(([category, totals]) => ({
      id: category.toLowerCase(),
      label: titleCase(category),
      value: totals.capacity === 0 ? 0 : Math.round((totals.rank / totals.capacity) * 100),
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 4)
  return {
    ...base,
    chart:
      columns.length === 0
        ? base.chart
        : { kind: 'bars', title: 'Skill tracks · % of max rank', columns },
    banner: {
      text: `${summary.developmentPoints} development point${summary.developmentPoints === 1 ? '' : 's'} available`,
      tooltip: 'Unspent points from the coach RPG profile. Spend them in Development — skills or perks.',
    },
  }
}

function buildOpportunitiesSummary(opportunities: CoachOpportunitiesModel | null, base: CoachOverviewSummary): CoachOverviewSummary {
  if (opportunities === null) return base
  const metricById = new Map(opportunities.market.metrics.map((metric) => [metric.id, metric]))
  const pick = (id: string) => metricById.get(id)
  const metrics: CoachOverviewMetric[] = [
    {
      id: 'clubs',
      label: 'Clubs Interested',
      value: pick('clubs-interested')?.value ?? '0',
      tone: pick('clubs-interested')?.tone,
      tooltip: pick('clubs-interested')?.detail,
    },
    {
      id: 'interviews',
      label: 'Interviews',
      value: pick('interviews')?.value ?? '0',
      tone: pick('interviews')?.tone,
      tooltip: pick('interviews')?.detail,
    },
    {
      id: 'paths',
      label: 'Open Paths',
      value: pick('active-openings')?.value ?? '0',
      tone: pick('active-openings')?.tone,
      tooltip: pick('active-openings')?.detail,
    },
    {
      id: 'leverage',
      label: 'Leverage',
      value: pick('leverage')?.value ?? '—',
      tone: pick('leverage')?.tone,
      tooltip: pick('leverage')?.detail,
    },
  ]
  return {
    ...base,
    metrics,
    chart: {
      kind: 'ring',
      title: 'Overall market fit',
      value: opportunities.fitOverall,
      caption: 'Weighted reputation fit',
    },
  }
}

function buildLegacySummary(legacy: CoachLegacyModel | null, base: CoachOverviewSummary): CoachOverviewSummary {
  if (legacy === null) return base
  return {
    ...base,
    metrics: legacy.figures.map((figure) => ({
      id: figure.id,
      label: figure.mock ? `${figure.label}${MOCK_SUFFIX}` : figure.label,
      value: String(figure.value),
      tone: figure.tone,
      tooltip: figure.mock ? 'MOCK — the domain has no source for this career counter.' : undefined,
    })),
    chart: {
      kind: 'ring',
      title: 'Legacy progress',
      value: Math.min(100, legacy.hallTrack.percent),
      caption: 'Hall of Fame track',
    },
  }
}

/* ── Builder ── */

export function buildCoachOverviewModel(
  world: GameWorld,
  mock: CoachOverviewModel = COACH_OVERVIEW_MOCK,
): CoachOverviewModel {
  const coachId = world.userCoachId
  const coach = world.coaches[coachId]
  if (coach === undefined) return mock

  const employment = world.coachEmploymentByCoachId[coachId]
  const teamId = employment?.status === 'employed' ? employment.teamId : undefined
  const team = teamId === undefined ? undefined : world.teams[teamId]
  const board = teamId === undefined ? undefined : world.boardStatesByTeamId[teamId]
  const isEmployed = employment?.status === 'employed' && team !== undefined

  const rpg = world.coachRpgProfilesByCoachId[coachId]
  const finances = world.coachFinancesByCoachId[coachId]
  const position = finances === undefined ? undefined : getCoachFinancialPosition(finances)

  const career = buildCoachCareerModel(world)
  const legacy = buildCoachLegacyModel(world)
  const reputation = buildCoachReputationModel(world, REPUTATION_WINDOW_MONTHS)
  const opportunities = buildCoachOpportunitiesModel(world)
  const development = rpg === undefined ? undefined : buildCoachDevelopmentSummary(rpg)

  const realTimeline = (legacy?.timeline ?? []).filter((event) => !event.mock)
  /* When the world has no real legacy event yet the board keeps its filler rail (density was asked
     for), but every entry is flagged so the rail can label it as illustrative. Real events are never
     flagged: they are the ones the domain actually recorded. */
  const timeline: readonly CoachOverviewTimelineEvent[] =
    realTimeline.length === 0
      ? mock.timeline.map((event) => ({ ...event, mock: true }))
      : [...realTimeline].reverse().map((event) => ({
          id: event.id,
          date: event.dateLabel,
          icon: event.icon,
          title: event.title,
          highlight: event.highlight,
          detail: event.detail,
          tone: event.tone,
          mock: false,
        }))

  const summaries: readonly CoachOverviewSummary[] = mock.summaries.map((base) => {
    if (base.id === 'career') return buildCareerSummary(career, base)
    if (base.id === 'reputation') return buildReputationSummary(reputation, base)
    if (base.id === 'relationships') return buildRelationshipsSummary(world, coachId, base)
    if (base.id === 'development') return buildDevelopmentSummaryCard(rpg, base)
    if (base.id === 'opportunities') return buildOpportunitiesSummary(opportunities, base)
    if (base.id === 'legacy') return buildLegacySummary(legacy, base)
    return base
  })

  return {
    identity: {
      name: `${coach.firstName} ${coach.lastName}`,
      // MOCK: the RPG profile stores progress points, never a character level.
      level: mock.identity.level,
      role: isEmployed ? 'Head Coach' : 'Free agent',
      club: team?.name ?? 'Unattached',
      // MOCK: archetype, shadow archetype and moral alignment are not modelled.
      rows: mock.identity.rows,
      // MOCK: there is no career XP pool in the domain.
      careerXp: mock.identity.careerXp,
      developmentPoints: development?.developmentPoints ?? mock.identity.developmentPoints,
    },
    // MOCK: the display labels do not map 1:1 onto `StaffProfessionalProfile`.
    attributes: mock.attributes,
    // MOCK: the display labels do not map 1:1 onto `Personality`.
    personality: mock.personality,
    status: buildStatusRows({ board, career, development, isEmployed, legacy, opportunities, reputation }),
    // MOCK: the heat/risk categories are not modelled.
    risks: mock.risks,
    finances: buildFinanceRows(finances, position, mock.finances),
    // MOCK: favours owed/held are not tracked anywhere in the domain.
    favors: mock.favors,
    // MOCK: agent / federation / underground networks are not modelled.
    network: mock.network,
    allocation: buildAllocation(finances, mock.allocation),
    // MOCK: leverage is partly real (reputation) but the power standing has no domain source.
    power: mock.power,
    summaries,
    timeline,
  }
}
