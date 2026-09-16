/*
 * Coach · Opportunities — the coach's personal professional market.
 *
 * Composition: market overview / personal fit / opportunity signals in the first row, the opportunity
 * board next to the professional network and the decision factors in the second, the pipeline timeline
 * in the third. Everything is real runtime data unless it is explicitly sourced from
 * `COACH_OPPORTUNITIES_MOCK` (single labelled object below, marked in the UI with a dotted underline
 * and `data-source="mock"`).
 *
 * REAL sources — see `buildCoachOpportunitiesModel`:
 *   - `world.coachJobOpeningsById`                 → board rows, "Active openings", pipeline.
 *   - `world.coachJobCandidaciesById`              → board status/signals/pipeline, first consumer of
 *                                                    the previously unused `selectUserCoachActiveCandidacies`.
 *   - `world.coachInterviewsByCandidacyId`         → "Interviews" metric.
 *   - `world.coachJobOffersById`                   → board Accept/Decline, pipeline, real salary.
 *   - `evaluateCoachJobEligibility`                → Fit %, tone and unmet requirements (previously discarded).
 *   - `world.coachProfessionalProfilesByCoachId`   → the five real fit-profile dimensions.
 *   - `world.coachReputationProfilesByCoachId`     → Leverage.
 *   - `getRelationshipsForPerson` / `getRelationshipBandForPeople` → professional network strength.
 *   - `world.teamStaffAssignmentsById` + `STAFF_ROLE_REGISTRY`     → contact role and influence.
 *   - `world.teamFinancesByTeamId` + team/coach countries          → salary band tier, relocation.
 *
 * MOCK: only what the domain does not model — 12-month market momentum, market interest, relocation
 * flexibility, the salary-expectation fit dimension, decision factors, and the signals/timeline
 * entries that are not a real candidacy/interview/offer/opening.
 */

import { useMemo, type ReactNode } from 'react'

import { evaluateCoachJobEligibility, type CoachJobOpening } from '@/domain/coachCareer'
import { COACH_REPUTATION_MAX, getCoachReputationBand, type CoachReputationDimension } from '@/domain/coachReputation'
import { addDays, type GameDate } from '@/domain/date'
import type { CoachId, CountryId, StaffPersonId, TeamId } from '@/domain/ids'
import { STAFF_ROLE_REGISTRY, type StaffRoleId } from '@/domain/staff'
import { getRelationshipBandForPeople, getRelationshipsForPerson, type GameWorld } from '@/domain/world'
import { selectUserCoachActiveCandidacies, selectUserCoachPendingOffers, useGameStore } from '@/stores/gameStore'
import { formatMoney, formatPrototypeDate } from '@/ui/formatters'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { HorizontalValueBar, MiniLineChart } from '@/ui-ng/applications/coach/CoachOverviewCharts'
import { OverviewGlyph } from '@/ui-ng/applications/coach/CoachOverviewGlyph'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

import './coach-opportunities.css'

export type CoachOpportunityTone = 'neutral' | 'cyan' | 'positive' | 'warning' | 'negative' | 'gold' | 'purple'
export type CoachOpportunitySource = 'live' | 'mock'

/* ────────────────────────────────────────────────────────────────────────────
 * MOCK — the only place this screen invents numbers.
 * Each entry is either (a) not modelled by the domain at all, or (b) a display
 * label for a value whose *selection* is real (salary band tiers).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CoachOpportunitiesMock {
  readonly marketInterest: { readonly label: string; readonly tone: CoachOpportunityTone; readonly note: string }
  readonly relocationFlexibility: { readonly label: string; readonly tone: CoachOpportunityTone; readonly note: string }
  readonly momentum: { readonly title: string; readonly caption: string; readonly points: readonly number[] }
  readonly salaryBands: readonly string[]
  readonly salaryExpectations: number
  readonly signals: readonly {
    readonly id: string
    readonly icon: string
    readonly title: string
    readonly detail: string
    readonly ageDays: number
    readonly tone: CoachOpportunityTone
    readonly tabId?: string
  }[]
  readonly decisionFactors: readonly {
    readonly id: string
    readonly label: string
    readonly importance: number
    readonly marketLevel: number
  }[]
  readonly timeline: readonly {
    readonly id: string
    readonly offsetDays: number
    readonly icon: string
    readonly title: string
    readonly detail: string
    readonly tone: CoachOpportunityTone
  }[]
}

export const COACH_OPPORTUNITIES_MOCK: CoachOpportunitiesMock = {
  marketInterest: {
    label: 'Moderate',
    tone: 'warning',
    note: 'Interest is steady but no top-tier club has moved yet.',
  },
  relocationFlexibility: {
    label: 'Flexible',
    tone: 'positive',
    note: 'You are open to domestic and international moves.',
  },
  momentum: {
    title: 'Market momentum',
    caption: 'Interest you generate · last 12 months',
    points: [42, 45, 44, 48, 52, 51, 55, 58, 57, 62, 66, 71],
  },
  salaryBands: ['$0.4M – $0.8M', '$0.8M – $1.6M', '$1.6M – $3.2M', '$3.2M+'],
  salaryExpectations: 44,
  signals: [
    {
      id: 'mock-league-rep',
      detail: 'A competition representative wants your read on the coaching market.',
      icon: 'landmark',
      tabId: 'reputation',
      title: 'League office requested a meeting',
      ageDays: 3,
      tone: 'cyan',
    },
    {
      id: 'mock-agent',
      detail: 'Your representative expects a stronger opening within two months.',
      icon: 'handshake',
      tabId: 'relationships',
      title: 'Advisor: hold your position',
      ageDays: 6,
      tone: 'purple',
    },
    {
      id: 'mock-board',
      detail: 'Ownership groups have asked about your contract status.',
      icon: 'shieldCheck',
      tabId: 'career',
      title: 'Two boards are monitoring your situation',
      ageDays: 11,
      tone: 'warning',
    },
    {
      id: 'mock-rumour',
      detail: 'A national outlet reports unconfirmed interest.',
      icon: 'mic',
      tabId: 'legacy',
      title: 'Press linking you to a mid-table rebuild',
      ageDays: 15,
      tone: 'neutral',
    },
  ],
  decisionFactors: [
    { id: 'project', label: 'Sporting project', importance: 32, marketLevel: 63 },
    { id: 'money', label: 'Money', importance: 18, marketLevel: 71 },
    { id: 'control', label: 'Control & autonomy', importance: 22, marketLevel: 41 },
    { id: 'roster', label: 'Roster quality', importance: 16, marketLevel: 55 },
    { id: 'visibility', label: 'Market visibility', importance: 7, marketLevel: 68 },
    { id: 'security', label: 'Job security', importance: 5, marketLevel: 27 },
  ],
  timeline: [
    {
      id: 'mock-contract-window',
      offsetDays: 64,
      icon: 'banknote',
      title: 'Your contract window opens',
      detail: 'Release terms become negotiable.',
      tone: 'gold',
    },
    {
      id: 'mock-rumour',
      offsetDays: -15,
      icon: 'mic',
      title: 'Rumour · mid-table rebuild',
      detail: 'Unconfirmed press link to a rebuilding club.',
      tone: 'neutral',
    },
    {
      id: 'mock-call',
      offsetDays: -26,
      icon: 'handshake',
      title: 'Call with your advisor',
      detail: 'Reviewed which openings are actually worth taking.',
      tone: 'purple',
    },
  ],
}

/* ── Model ── */

export interface OpportunityMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly tone: CoachOpportunityTone
  readonly detail: string
  readonly source: CoachOpportunitySource
}

export interface OpportunityFitRow {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly tone: CoachOpportunityTone
  readonly hint: string
  readonly source: CoachOpportunitySource
}

export interface OpportunitySignal {
  readonly id: string
  readonly icon: string
  readonly title: string
  readonly detail: string
  readonly date: GameDate
  readonly ageLabel: string
  readonly tone: CoachOpportunityTone
  readonly source: CoachOpportunitySource
  readonly tabId?: string
}

/** `RUMOURED` is part of the vocabulary and is styled, but no domain record currently carries an
 *  unconfirmed opening, so the board never produces it from data. */
export type OpportunityBoardStatus = 'OPEN' | 'WATCHING' | 'INTERVIEW' | 'OFFER' | 'INTERNAL LINK' | 'HIGH RISK' | 'RUMOURED'
export type OpportunityBoardAction = 'apply' | 'track' | 'view' | 'offer'

export interface OpportunityBoardRow {
  readonly id: string
  readonly club: string
  readonly league: string
  readonly role: string
  readonly fit: number | undefined
  readonly fitLabel: string
  readonly fitTone: CoachOpportunityTone
  readonly fitHint: string
  readonly salary: string
  readonly salaryMock: boolean
  readonly status: OpportunityBoardStatus
  readonly statusTone: CoachOpportunityTone
  readonly relocation: string
  readonly relocationHint: string
  readonly action: OpportunityBoardAction
  readonly openingId: string
  readonly offerId?: string
}

export interface OpportunityContact {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly strengthLabel: string
  readonly strengthPercent: number
  readonly strengthTone: CoachOpportunityTone
  readonly influence: 'High' | 'Medium' | 'Low'
  readonly influenceTone: CoachOpportunityTone
  readonly hint: string
}

export interface OpportunityFactor {
  readonly id: string
  readonly label: string
  readonly importance: number
  readonly marketLevel: number
  readonly tone: CoachOpportunityTone
}

export interface OpportunityTimelineEvent {
  readonly id: string
  readonly date: GameDate
  readonly dateLabel: string
  readonly icon: string
  readonly title: string
  readonly detail: string
  readonly tone: CoachOpportunityTone
  readonly source: CoachOpportunitySource
}

export interface CoachOpportunitiesModel {
  readonly market: {
    readonly metrics: readonly OpportunityMetric[]
    readonly momentum: {
      readonly title: string
      readonly caption: string
      readonly endLabel: string
      readonly points: readonly number[]
      readonly peak: number
      readonly low: number
      readonly trendLabel: string
      readonly trendTone: CoachOpportunityTone
    }
  }
  readonly fit: readonly OpportunityFitRow[]
  readonly fitOverall: number
  readonly strongestFit: string
  readonly weakestFit: string
  readonly signals: readonly OpportunitySignal[]
  readonly board: readonly OpportunityBoardRow[]
  readonly contacts: readonly OpportunityContact[]
  readonly factors: readonly OpportunityFactor[]
  readonly timeline: readonly OpportunityTimelineEvent[]
}

/* ── Fit profile: real professional attributes for five of the six dimensions ── */

const FIT_DIMENSIONS: readonly {
  readonly id: string
  readonly label: string
  readonly attribute?: 'tacticalKnowledge' | 'playerDevelopment' | 'discipline' | 'communication' | 'motivation'
  readonly hint: string
}[] = [
  {
    attribute: 'tacticalKnowledge',
    hint: 'Tactical knowledge from your professional profile.',
    id: 'tactical',
    label: 'Tactical fit',
  },
  {
    attribute: 'playerDevelopment',
    hint: 'Player development from your professional profile.',
    id: 'youth',
    label: 'Youth development',
  },
  {
    attribute: 'discipline',
    hint: 'Discipline from your professional profile, read as the pressure-handling proxy.',
    id: 'pressure',
    label: 'Pressure handling',
  },
  {
    attribute: 'communication',
    hint: 'Communication from your professional profile.',
    id: 'politics',
    label: 'Politics & management',
  },
  {
    hint: 'MOCK — the domain does not model what the coach expects to be paid.',
    id: 'salary',
    label: 'Salary expectations',
  },
  {
    attribute: 'motivation',
    hint: 'Motivation from your professional profile.',
    id: 'ambition',
    label: 'Ambition alignment',
  },
]

const REPUTATION_LABELS: Readonly<Record<CoachReputationDimension, string>> = {
  competitive: 'Competitive',
  development: 'Development',
  professional: 'Professional',
  publicStanding: 'Public standing',
}

const BAND_LABELS: Readonly<Record<string, string>> = {
  strong: 'Strong',
  positive: 'Positive',
  neutral: 'Neutral',
  poor: 'Poor',
  hostile: 'Hostile',
}

const STRENGTH_TONE: Readonly<Record<string, CoachOpportunityTone>> = {
  strong: 'positive',
  positive: 'cyan',
  neutral: 'neutral',
  poor: 'warning',
  hostile: 'negative',
}

const STATUS_TONE: Readonly<Record<OpportunityBoardStatus, CoachOpportunityTone>> = {
  OPEN: 'cyan',
  WATCHING: 'warning',
  INTERVIEW: 'gold',
  OFFER: 'gold',
  'INTERNAL LINK': 'purple',
  'HIGH RISK': 'negative',
  RUMOURED: 'neutral',
}

const MAX_BOARD_ROWS = 12
const MAX_SIGNALS = 7
const MAX_CONTACTS = 6
const MAX_TIMELINE_EVENTS = 7

/* ── Helpers ── */

function titleCase(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1)
}

function daysBetween(from: GameDate, to: GameDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function ageLabel(days: number): string {
  const value = Math.max(0, days)
  if (value === 0) return 'today'
  if (value === 1) return '1d ago'
  if (value < 14) return `${value}d ago`
  if (value < 60) return `${Math.round(value / 7)}w ago`
  return `${Math.round(value / 30)}mo ago`
}

function fitToneFor(value: number): CoachOpportunityTone {
  if (value >= 70) return 'positive'
  if (value >= 55) return 'cyan'
  return 'warning'
}

function leverageToneFor(band: string): CoachOpportunityTone {
  if (band === 'legendary' || band === 'iconic' || band === 'elite') return 'gold'
  if (band === 'renowned' || band === 'respected') return 'positive'
  if (band === 'established') return 'cyan'
  if (band === 'emerging') return 'warning'
  return 'negative'
}

function marketLevelTone(level: number): CoachOpportunityTone {
  if (level >= 60) return 'positive'
  if (level >= 45) return 'cyan'
  if (level >= 30) return 'warning'
  return 'negative'
}

function influenceTone(influence: 'High' | 'Medium' | 'Low'): CoachOpportunityTone {
  return influence === 'High' ? 'gold' : influence === 'Medium' ? 'cyan' : 'neutral'
}

function staffInfluence(role: StaffRoleId | undefined): { readonly label: 'High' | 'Medium' | 'Low'; readonly rank: number } {
  if (role === undefined) return { label: 'Medium', rank: 2 }
  const seniority = STAFF_ROLE_REGISTRY[role].seniority
  if (seniority === 'director' || seniority === 'senior') return { label: 'High', rank: 3 }
  if (seniority === 'standard') return { label: 'Medium', rank: 2 }
  return { label: 'Low', rank: 1 }
}

/* ── Builder ── */

export function buildCoachOpportunitiesModel(
  world: GameWorld,
  mock: CoachOpportunitiesMock = COACH_OPPORTUNITIES_MOCK,
): CoachOpportunitiesModel | null {
  const userCoachId = world.userCoachId
  const coach = world.coaches[userCoachId]
  const reputation = world.coachReputationProfilesByCoachId[userCoachId]
  const professional = world.coachProfessionalProfilesByCoachId[userCoachId]
  if (coach === undefined || reputation === undefined || professional === undefined) return null

  const employment = world.coachEmploymentByCoachId[userCoachId] ?? { status: 'unemployed' as const }
  const teamName = (teamId: TeamId) => world.teams[teamId]?.name ?? teamId
  const countryName = (countryId: CountryId) => world.countries[countryId]?.name ?? countryId
  const leagueOf = (teamId: TeamId) =>
    Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(teamId))?.name ?? '—'

  const openOpenings = Object.values(world.coachJobOpeningsById)
    .filter((opening) => opening.status === 'open')
    .sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.id.localeCompare(b.id))
  const candidacies = selectUserCoachActiveCandidacies(world)
  const offers = selectUserCoachPendingOffers(world)
  const candidacyByOpening = new Map(candidacies.map((candidacy) => [candidacy.jobOpeningId as string, candidacy]))
  const offerByOpening = new Map(offers.map((offer) => [offer.jobOpeningId as string, offer]))

  const interestedTeams = new Set<string>()
  for (const candidacy of candidacies) {
    const opening = world.coachJobOpeningsById[candidacy.jobOpeningId]
    if (opening !== undefined) interestedTeams.add(opening.teamId)
  }
  for (const offer of offers) interestedTeams.add(offer.teamId)

  const interviews = candidacies.filter(
    (candidacy) => candidacy.status === 'interviewing' || world.coachInterviewsByCandidacyId[candidacy.id] !== undefined,
  ).length

  const reputationValues = Object.values(reputation.values)
  const reputationMean = Math.round(reputationValues.reduce((sum, value) => sum + value, 0) / reputationValues.length)
  const leverageBand = getCoachReputationBand(reputationMean)

  const metrics: OpportunityMetric[] = [
    {
      detail: 'Clubs holding a live candidacy or offer for you.',
      id: 'clubs-interested',
      label: 'Clubs interested',
      source: 'live',
      tone: interestedTeams.size > 0 ? 'cyan' : 'neutral',
      value: String(interestedTeams.size),
    },
    {
      detail: 'Vacant head coach roles currently on the market.',
      id: 'active-openings',
      label: 'Active openings',
      source: 'live',
      tone: openOpenings.length > 0 ? 'cyan' : 'neutral',
      value: String(openOpenings.length),
    },
    {
      detail: 'Your candidacies that reached the interview stage.',
      id: 'interviews',
      label: 'Interviews',
      source: 'live',
      tone: interviews > 0 ? 'gold' : 'neutral',
      value: String(interviews),
    },
    {
      detail: mock.marketInterest.note,
      id: 'market-interest',
      label: 'Market interest',
      source: 'mock',
      tone: mock.marketInterest.tone,
      value: mock.marketInterest.label,
    },
    {
      detail: `${reputationMean} / ${COACH_REPUTATION_MAX} mean reputation across four dimensions.`,
      id: 'leverage',
      label: 'Leverage',
      source: 'live',
      tone: leverageToneFor(leverageBand),
      value: titleCase(leverageBand),
    },
    {
      detail: mock.relocationFlexibility.note,
      id: 'relocation',
      label: 'Relocation flexibility',
      source: 'mock',
      tone: mock.relocationFlexibility.tone,
      value: mock.relocationFlexibility.label,
    },
  ]

  const momentumPoints = mock.momentum.points
  const momentumDelta = (momentumPoints[momentumPoints.length - 1] ?? 0) - (momentumPoints[0] ?? 0)
  const market = {
    metrics,
    momentum: {
      caption: mock.momentum.caption,
      endLabel: `${momentumDelta >= 0 ? '+' : ''}${momentumDelta}`,
      low: Math.min(...momentumPoints),
      peak: Math.max(...momentumPoints),
      points: momentumPoints,
      title: mock.momentum.title,
      trendLabel: momentumDelta > 0 ? 'Rising' : momentumDelta < 0 ? 'Cooling' : 'Flat',
      trendTone: (momentumDelta > 0 ? 'positive' : momentumDelta < 0 ? 'negative' : 'neutral') as CoachOpportunityTone,
    },
  }

  const fit: OpportunityFitRow[] = FIT_DIMENSIONS.map((dimension) => {
    if (dimension.attribute === undefined) {
      return {
        hint: dimension.hint,
        id: dimension.id,
        label: dimension.label,
        source: 'mock' as const,
        tone: fitToneFor(mock.salaryExpectations),
        value: mock.salaryExpectations,
      }
    }
    const value = professional.attributes[dimension.attribute]
    return { hint: dimension.hint, id: dimension.id, label: dimension.label, source: 'live' as const, tone: fitToneFor(value), value }
  })
  const fitOverall = Math.round(fit.reduce((sum, row) => sum + row.value, 0) / Math.max(1, fit.length))
  const orderedFit = [...fit].sort((a, b) => b.value - a.value)

  /* Signals */
  const signals: OpportunitySignal[] = []
  for (const candidacy of candidacies) {
    const opening = world.coachJobOpeningsById[candidacy.jobOpeningId]
    const club = opening === undefined ? 'A club' : teamName(opening.teamId)
    const date = candidacy.createdOn
    const age = ageLabel(daysBetween(date, world.currentDate))
    if (candidacy.status === 'interviewing') {
      signals.push({
        ageLabel: age,
        date,
        detail: 'You are through the first filter for their head coach role.',
        icon: 'mic',
        id: `signal-interview-${candidacy.id}`,
        source: 'live',
        tabId: 'career',
        title: `Interview stage with ${club}`,
        tone: 'gold',
      })
    } else if (candidacy.status === 'offered') {
      signals.push({
        ageLabel: age,
        date,
        detail: 'The club has put terms in front of you.',
        icon: 'handshake',
        id: `signal-offer-${candidacy.id}`,
        source: 'live',
        tabId: 'career',
        title: `Offer on the table from ${club}`,
        tone: 'gold',
      })
    } else {
      signals.push({
        ageLabel: age,
        date,
        detail: 'Your name is on their shortlist for the head coach role.',
        icon: 'target',
        id: `signal-identified-${candidacy.id}`,
        source: 'live',
        tabId: 'career',
        title: `${club} have identified you`,
        tone: 'cyan',
      })
    }
  }
  const recentVacancies = openOpenings
    .filter((opening) => daysBetween(opening.createdOn, world.currentDate) <= 45 && !candidacyByOpening.has(opening.id as string))
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
    .slice(0, 3)
  for (const opening of recentVacancies) {
    signals.push({
      ageLabel: ageLabel(daysBetween(opening.createdOn, world.currentDate)),
      date: opening.createdOn,
      detail: 'A confirmed opening on the market that you are eligible for.',
      icon: 'flag',
      id: `signal-vacancy-${opening.id}`,
      source: 'live',
      tabId: 'career',
      title: `Head coach vacancy at ${teamName(opening.teamId)}`,
      tone: 'cyan',
    })
  }
  for (const item of mock.signals) {
    signals.push({
      ageLabel: ageLabel(item.ageDays),
      date: addDays(world.currentDate, -item.ageDays),
      detail: item.detail,
      icon: item.icon,
      id: item.id,
      source: 'mock',
      tone: item.tone,
      title: item.title,
      ...(item.tabId === undefined ? {} : { tabId: item.tabId }),
    })
  }
  signals.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))

  /* Salary band: real tier off the club payroll, MOCK labels for the bands. */
  const budgets = Object.values(world.teamFinancesByTeamId)
    .map((finances) => finances.playerSalaryBudget)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)
  const salaryBandFor = (teamId: TeamId): string => {
    const budget = world.teamFinancesByTeamId[teamId]?.playerSalaryBudget
    if (budget === undefined || budgets.length === 0 || mock.salaryBands.length === 0) return mock.salaryBands[0] ?? '—'
    const position = budgets.filter((value) => value <= budget).length / budgets.length
    return mock.salaryBands[Math.min(mock.salaryBands.length - 1, Math.floor(position * mock.salaryBands.length))]!
  }

  /* Opportunity board */
  const boardOpenings: CoachJobOpening[] = [...openOpenings]
  for (const offer of offers) {
    if (boardOpenings.some((opening) => opening.id === offer.jobOpeningId)) continue
    const opening = world.coachJobOpeningsById[offer.jobOpeningId]
    if (opening !== undefined) boardOpenings.push(opening)
  }
  const board: OpportunityBoardRow[] = boardOpenings.map((opening) => {
    const eligibility = evaluateCoachJobEligibility(employment, reputation, opening)
    const unmet = eligibility.reasons.flatMap((reason) => reason.unmet ?? [])
    const weights = opening.fitWeights
    let fitValue: number | undefined
    if (weights !== undefined) {
      const totalWeight = weights.competitive + weights.development + weights.professional + weights.publicStanding
      const score =
        reputation.values.competitive * weights.competitive +
        reputation.values.development * weights.development +
        reputation.values.professional * weights.professional +
        reputation.values.publicStanding * weights.publicStanding
      fitValue = totalWeight === 0 ? 0 : Math.max(0, Math.min(100, Math.round((score / (totalWeight * COACH_REPUTATION_MAX)) * 100)))
    }
    const fitHint =
      unmet.length > 0
        ? `Requirement not met · ${unmet
            .map((failure) => `${REPUTATION_LABELS[failure.dimension]} ${failure.actual}/${failure.required}`)
            .join(' · ')}`
        : fitValue === undefined
          ? 'This opening publishes no fit weighting.'
          : `Weighted reputation fit ${fitValue}% across the club's four reputation weights.`

    const candidacy = candidacyByOpening.get(opening.id as string)
    const offer = offerByOpening.get(opening.id as string)
    let status: OpportunityBoardStatus
    if (offer !== undefined || candidacy?.status === 'offered') status = 'OFFER'
    else if (candidacy?.status === 'interviewing') status = 'INTERVIEW'
    else if (candidacy?.status === 'identified') status = 'WATCHING'
    else if (employment.status === 'employed' && employment.teamId === opening.teamId) status = 'INTERNAL LINK'
    else if (!eligibility.eligible) status = 'HIGH RISK'
    else status = 'OPEN'

    const action: OpportunityBoardAction =
      status === 'OFFER' ? 'offer' : status === 'WATCHING' || status === 'INTERVIEW' ? 'track' : eligibility.eligible ? 'apply' : 'view'
    const fitTone: CoachOpportunityTone = !eligibility.eligible
      ? 'negative'
      : fitValue === undefined
        ? 'neutral'
        : fitValue >= 65
          ? 'positive'
          : fitValue >= 40
            ? 'warning'
            : 'negative'
    const openingCountry = world.teams[opening.teamId]?.countryId
    const isLocal = openingCountry === coach.nationalityId

    return {
      action,
      club: teamName(opening.teamId),
      fit: fitValue,
      fitHint,
      fitLabel: fitValue === undefined ? '—' : `${fitValue}%`,
      fitTone,
      id: `opening:${opening.id}`,
      league: leagueOf(opening.teamId),
      openingId: opening.id,
      relocation: isLocal ? 'Local' : 'Relocation',
      relocationHint: isLocal
        ? `Same country as your nationality (${countryName(coach.nationalityId)}).`
        : `Would move to ${countryName(openingCountry ?? coach.nationalityId)}.`,
      role: 'Head coach',
      salary: offer?.annualSalary === undefined ? salaryBandFor(opening.teamId) : `$${formatMoney(offer.annualSalary)}`,
      salaryMock: offer?.annualSalary === undefined,
      status,
      statusTone: STATUS_TONE[status],
      ...(offer === undefined ? {} : { offerId: offer.id }),
    }
  })
  board.sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1) || a.club.localeCompare(b.club))

  /* Network & contacts — professional people only (coaches and staff, never players). */
  const contacts: OpportunityContact[] = []
  for (const profile of getRelationshipsForPerson(world, coach.id)) {
    const otherId = profile.sourceId === coach.id ? profile.targetId : profile.sourceId
    const staff = world.staffPeopleById[otherId as StaffPersonId]
    const otherCoach = world.coaches[otherId as CoachId]
    if (staff === undefined && otherCoach === undefined) continue

    const assignment = staff === undefined ? undefined : Object.values(world.teamStaffAssignmentsById).find((item) => item.staffPersonId === otherId)
    const staffRole = otherCoach === undefined ? (assignment?.role ?? staff?.marketRole) : undefined
    const isHeadCoach = otherCoach !== undefined && Object.values(world.teams).some((team) => team.coachId === otherId)
    const influence = otherCoach === undefined ? staffInfluence(staffRole) : { label: isHeadCoach ? ('High' as const) : ('Medium' as const), rank: isHeadCoach ? 3 : 2 }
    const name = otherCoach === undefined ? `${staff!.identity.firstName} ${staff!.identity.lastName}` : `${otherCoach.firstName} ${otherCoach.lastName}`
    const role =
      otherCoach === undefined ? (staffRole === undefined ? 'Staff' : STAFF_ROLE_LABELS[staffRole]) : isHeadCoach ? 'Head coach' : 'Coach'
    const band = getRelationshipBandForPeople(world, coach.id, otherId)

    contacts.push({
      hint: `Relationship ${profile.value} (${band})${assignment === undefined ? '' : ` · ${teamName(assignment.teamId)}`}`,
      id: `contact:${otherId}`,
      influence: influence.label,
      influenceTone: influenceTone(influence.label),
      name,
      role,
      strengthLabel: BAND_LABELS[band] ?? titleCase(band),
      strengthPercent: Math.round(((profile.value + 100) / 200) * 100),
      strengthTone: STRENGTH_TONE[band] ?? 'neutral',
    })
  }
  contacts.sort((a, b) => b.strengthPercent - a.strengthPercent || a.name.localeCompare(b.name))

  /* Decision factors — fully mocked (the domain does not model what the coach values). */
  const factors: OpportunityFactor[] = mock.decisionFactors.map((factor) => ({
    id: factor.id,
    importance: factor.importance,
    label: factor.label,
    marketLevel: factor.marketLevel,
    tone: marketLevelTone(factor.marketLevel),
  }))

  /* Pipeline timeline */
  const timeline: OpportunityTimelineEvent[] = []
  for (const opening of openOpenings.slice(-3)) {
    timeline.push({
      date: opening.createdOn,
      dateLabel: formatPrototypeDate(opening.createdOn),
      detail: leagueOf(opening.teamId),
      icon: 'flag',
      id: `timeline-vacancy-${opening.id}`,
      source: 'live',
      title: `Vacancy opened · ${teamName(opening.teamId)}`,
      tone: 'cyan',
    })
  }
  for (const candidacy of candidacies) {
    const opening = world.coachJobOpeningsById[candidacy.jobOpeningId]
    timeline.push({
      date: candidacy.createdOn,
      dateLabel: formatPrototypeDate(candidacy.createdOn),
      detail: 'Candidacy registered for the head coach role.',
      icon: 'target',
      id: `timeline-candidacy-${candidacy.id}`,
      source: 'live',
      title: `Shortlisted by ${opening === undefined ? 'a club' : teamName(opening.teamId)}`,
      tone: 'cyan',
    })
  }
  for (const offer of offers) {
    timeline.push({
      date: offer.createdOn,
      dateLabel: formatPrototypeDate(offer.createdOn),
      detail: offer.annualSalary === undefined ? 'Terms pending' : `$${formatMoney(offer.annualSalary)} per year`,
      icon: 'handshake',
      id: `timeline-offer-${offer.id}`,
      source: 'live',
      title: `Offer received from ${teamName(offer.teamId)}`,
      tone: 'gold',
    })
  }
  for (const item of mock.timeline) {
    const date = addDays(world.currentDate, item.offsetDays)
    timeline.push({
      date,
      dateLabel: formatPrototypeDate(date),
      detail: item.detail,
      icon: item.icon,
      id: item.id,
      source: 'mock',
      title: item.title,
      tone: item.tone,
    })
  }
  timeline.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))

  return {
    board: board.slice(0, MAX_BOARD_ROWS),
    contacts: contacts.slice(0, MAX_CONTACTS),
    factors,
    fit,
    fitOverall,
    market,
    signals: signals.slice(0, MAX_SIGNALS),
    strongestFit: orderedFit[0]?.label ?? '—',
    timeline: timeline.slice(0, MAX_TIMELINE_EVENTS),
    weakestFit: orderedFit[orderedFit.length - 1]?.label ?? '—',
  }
}

/* ── Local chrome ──
 * The shared `OverviewPanelHeader` carries the private `.co-panel__*` variant that is being reworked
 * elsewhere, so this screen keeps its own header markup with the same metrics. */

function CopPanelHeader({
  aside,
  icon,
  subtitle,
  title,
}: {
  readonly aside?: ReactNode
  readonly icon: string
  readonly subtitle?: string
  readonly title: string
}) {
  return (
    <header className="cop-panel__head">
      <h2 className="cop-panel__heading">
        <OverviewGlyph className="cop-panel__icon" name={icon} size={15} />
        <span className="cop-panel__title">{title}</span>
        {subtitle === undefined ? null : <span className="cop-panel__subtitle">{subtitle}</span>}
      </h2>
      {aside === undefined ? null : <div className="cop-panel__aside">{aside}</div>}
    </header>
  )
}

function toneClass(tone: CoachOpportunityTone): string {
  return `cop-tone-text--${tone}`
}

/* ── Screen ── */

export function CoachOpportunitiesScreen({
  onAcceptOffer,
  onApplyForJob,
  onDeclineOffer,
  onOpenTab,
  world: worldOverride,
}: {
  /** Injected by the host when it owns the career decisions. Falls back to the store action. */
  readonly onAcceptOffer?: (offerId: string) => void
  readonly onApplyForJob?: (openingId: string) => void
  readonly onDeclineOffer?: (offerId: string) => void
  readonly onOpenTab?: (tabId: string) => void
  /** Test/host seam: fall back to the live store when omitted. */
  readonly world?: GameWorld
}) {
  const storeWorld = useGameStore((state) => state.world)
  const storeApplyForJob = useGameStore((state) => state.applyUserCoachForJob)
  const storeAcceptOffer = useGameStore((state) => state.acceptUserCoachOffer)
  const storeDeclineOffer = useGameStore((state) => state.declineUserCoachOffer)
  const world = worldOverride ?? storeWorld
  const model = useMemo(() => (world === null || world === undefined ? null : buildCoachOpportunitiesModel(world)), [world])

  // Every action is inert (never throwing) when neither a host callback nor the live store is wired.
  const applyForJob = (openingId: string) => {
    if (onApplyForJob !== undefined) {
      onApplyForJob(openingId)
      return
    }
    if (storeWorld !== null) storeApplyForJob(openingId)
  }
  const acceptOffer = (offerId: string) => {
    if (onAcceptOffer !== undefined) {
      onAcceptOffer(offerId)
      return
    }
    if (storeWorld !== null) storeAcceptOffer(offerId)
  }
  const declineOffer = (offerId: string) => {
    if (onDeclineOffer !== undefined) {
      onDeclineOffer(offerId)
      return
    }
    if (storeWorld !== null) storeDeclineOffer(offerId)
  }
  const openTab = (tabId: string) => {
    onOpenTab?.(tabId)
  }

  if (world === null || world === undefined) {
    return (
      <div className="cop-screen cop-screen--empty">
        <section className="cop-panel cop-panel--empty ng-canon__panel ng-holo-panel">
          <p className="cop-empty">No career loaded.</p>
        </section>
      </div>
    )
  }
  if (model === null) {
    return (
      <div className="cop-screen cop-screen--empty">
        <section className="cop-panel cop-panel--empty ng-canon__panel ng-holo-panel">
          <p className="cop-empty">Coach profile unavailable.</p>
        </section>
      </div>
    )
  }

  const boardColumns = ngTableColumns(
    model.board,
    [
      ngCol('club', 'Club', (row) => <span className="cop-board__club">{row.club}</span>, {
        flex: 3,
        minWidth: 140,
        value: (row) => row.club,
      }),
      ngCol('league', 'League', (row) => row.league, { flex: 2, minWidth: 100, value: (row) => row.league }),
      ngCol('role', 'Role', (row) => row.role, { minWidth: 80, value: (row) => row.role }),
      ngCol(
        'fit',
        'Fit',
        (row) => (
          <span className={`cop-fit-cell ${toneClass(row.fitTone)}`} data-fit-cell={row.id} title={row.fitHint}>
            <span className="cop-fit-cell__track">
              <span className="cop-fit-cell__fill" style={{ width: `${row.fit ?? 0}%` }} />
            </span>
            <span className="cop-fit-cell__value">{row.fitLabel}</span>
          </span>
        ),
        { minWidth: 88, numeric: true, value: (row) => row.fit ?? -1 },
      ),
      ngCol(
        'salary',
        'Salary band',
        (row) => (
          <span className={row.salaryMock ? 'cop-is-mock' : undefined} data-source={row.salaryMock ? 'mock' : 'live'}>
            {row.salary}
          </span>
        ),
        { minWidth: 96, numeric: true, value: (row) => row.salary },
      ),
      ngCol(
        'status',
        'Status',
        (row) => (
          <span className={`cop-status ${toneClass(row.statusTone)}`} data-status={row.status}>
            {row.status}
          </span>
        ),
        { minWidth: 96, value: (row) => row.status },
      ),
      ngCol('relocation', 'Relocation', (row) => <span title={row.relocationHint}>{row.relocation}</span>, {
        minWidth: 92,
        value: (row) => row.relocation,
      }),
      ngCol(
        'actions',
        'Action',
        (row) => {
          const offerId = row.offerId
          const actions = []
          if (row.action === 'apply') {
            actions.push(
              <button className="cop-action" key="apply" onClick={() => applyForJob(row.openingId)} type="button">
                Apply
              </button>,
            )
          }
          if (row.action === 'offer' && offerId !== undefined) {
            actions.push(
              <button className="cop-action" key="accept" onClick={() => acceptOffer(offerId)} type="button">
                Accept
              </button>,
              <button className="cop-action cop-action--ghost" key="decline" onClick={() => declineOffer(offerId)} type="button">
                Decline
              </button>,
            )
          }
          if (onOpenTab !== undefined && row.action === 'track') {
            actions.push(
              <button className="cop-action cop-action--ghost" key="track" onClick={() => openTab('career')} type="button">
                Track
              </button>,
            )
          }
          if (onOpenTab !== undefined) {
            actions.push(
              <button className="cop-action cop-action--ghost" key="view" onClick={() => openTab('career')} type="button">
                View
              </button>,
            )
          }
          return actions.length === 0 ? (
            <span className="cop-board__mute">—</span>
          ) : (
            <span className="cop-board__actions">{actions}</span>
          )
        },
        { minWidth: 132, sortable: false },
      ),
    ],
  )

  const { momentum } = model.market

  const signalRow = (signal: OpportunitySignal, interactive: boolean) => {
    const body = (
      <>
        <span className={`cop-signal__icon ${toneClass(signal.tone)}`}>
          <OverviewGlyph name={signal.icon} size={15} />
        </span>
        <span className="cop-signal__body">
          <span className="cop-signal__title">{signal.title}</span>
          <span className="cop-signal__detail">{signal.detail}</span>
        </span>
        <span className="cop-signal__age">{signal.ageLabel}</span>
      </>
    )
    const title = signal.source === 'mock' ? 'MOCK signal — no runtime source yet' : signal.detail
    return interactive ? (
      <button className="cop-signal__hit" onClick={() => openTab(signal.tabId!)} title={title} type="button">
        {body}
      </button>
    ) : (
      <div className="cop-signal__hit" title={title}>
        {body}
      </div>
    )
  }

  return (
    <div className="cop-screen">
      <div className="cop-row cop-row--top">
        <section className="cop-panel cop-panel--market ng-canon__panel ng-holo-panel">
          <CopPanelHeader
            aside={<span className="cop-panel__hint">What the market wants from you</span>}
            icon="trendingUp"
            subtitle="Interest, openings, leverage"
            title="Market overview"
          />
          <div className="cop-market">
            <ul className="cop-market__metrics">
              {model.market.metrics.map((metric) => (
                <li
                  className={`cop-metric${metric.source === 'mock' ? ' cop-is-mock' : ''}`}
                  data-metric={metric.id}
                  data-source={metric.source}
                  key={metric.id}
                  title={metric.detail}
                >
                  <span className="cop-metric__label">{metric.label}</span>
                  <span className={`cop-metric__value ${toneClass(metric.tone)}`}>{metric.value}</span>
                </li>
              ))}
            </ul>
            <div className="cop-market__momentum cop-is-mock" data-source="mock">
              <MiniLineChart
                caption={momentum.caption}
                endLabel={momentum.endLabel}
                label="Market momentum — interest generated over the last twelve months"
                points={momentum.points}
                title={momentum.title}
              />
              <dl className="cop-momentum__stats">
                <div className="cop-momentum__stat">
                  <dt>Peak</dt>
                  <dd>{momentum.peak}</dd>
                </div>
                <div className="cop-momentum__stat">
                  <dt>Low</dt>
                  <dd>{momentum.low}</dd>
                </div>
                <div className="cop-momentum__stat">
                  <dt>Trend</dt>
                  <dd className={toneClass(momentum.trendTone)}>{momentum.trendLabel}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="cop-panel cop-panel--fit ng-canon__panel ng-holo-panel">
          <CopPanelHeader
            aside={<span className="cop-panel__hint">Read against the market</span>}
            icon="target"
            subtitle="Why clubs might want you"
            title="Personal fit profile"
          />
          <div className="cop-fit">
            {model.fit.map((row) => (
              <div
                className={`cop-fit__row${row.source === 'mock' ? ' cop-is-mock' : ''}`}
                data-fit={row.id}
                data-source={row.source}
                key={row.id}
              >
                <HorizontalValueBar label={row.label} title={row.hint} tone={row.tone} value={row.value} />
              </div>
            ))}
          </div>
          <footer className="cop-fit__footer">
            <span className="cop-fit__overall">
              Overall fit <b>{model.fitOverall}%</b>
            </span>
            <span>
              Strongest · <b className="cop-tone-text--positive">{model.strongestFit}</b>
            </span>
            <span>
              Watch · <b className="cop-tone-text--warning">{model.weakestFit}</b>
            </span>
          </footer>
        </section>

        <section className="cop-panel cop-panel--signals ng-canon__panel ng-holo-panel">
          <CopPanelHeader
            aside={<span className="cop-panel__hint">{model.signals.length} active</span>}
            icon="activity"
            subtitle="Movement before a formal offer"
            title="Opportunity signals"
          />
          <ul className="cop-signals">
            {model.signals.map((signal) => (
              <li
                className={`cop-signal${signal.source === 'mock' ? ' cop-is-mock' : ''}`}
                data-signal={signal.id}
                data-source={signal.source}
                key={signal.id}
              >
                {signalRow(signal, signal.tabId !== undefined && onOpenTab !== undefined)}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="cop-row cop-row--board">
        <section className="cop-panel cop-panel--board ng-canon__panel ng-holo-panel">
          <CopPanelHeader
            aside={<span className="cop-panel__hint">{model.board.length} tracked</span>}
            icon="briefcase"
            subtitle="Open roles, candidacies and live offers"
            title="Opportunity board"
          />
          {model.board.length === 0 ? (
            <p className="cop-empty" data-board-empty="true">
              No open positions and no active candidacies. The market is quiet — nothing to apply for yet.
            </p>
          ) : (
            <div className="cop-board">
              <NgPrecisionTable
                className="cop-board__grid"
                columns={boardColumns}
                emptyDescription="Change the current filters to see more openings."
                emptyTitle="No matching opportunities"
                gridId="ng-coach-opportunities-board"
                rows={model.board}
              />
            </div>
          )}
        </section>

        <div className="cop-side">
          <section className="cop-panel cop-panel--network ng-canon__panel ng-holo-panel">
            <CopPanelHeader
              aside={
                onOpenTab === undefined ? undefined : (
                  <button className="cop-link" onClick={() => openTab('relationships')} type="button">
                    All relationships
                    <span aria-hidden className="cop-link__arrow">
                      →
                    </span>
                  </button>
                )
              }
              icon="users"
              subtitle="People who move your market"
              title="Network & contacts"
            />
            {model.contacts.length === 0 ? null : (
              <ul className="cop-contacts">
                {model.contacts.map((contact) => (
                  <li className="cop-contact" data-contact={contact.id} key={contact.id} title={contact.hint}>
                    <span className="cop-contact__name">{contact.name}</span>
                    <span className="cop-contact__role">{contact.role}</span>
                    <span className="cop-contact__strength">
                      <span className="cop-contact__track">
                        <span
                          className={`cop-contact__fill cop-tone-bg--${contact.strengthTone}`}
                          style={{ width: `${contact.strengthPercent}%` }}
                        />
                      </span>
                      <span className={`cop-contact__value ${toneClass(contact.strengthTone)}`}>{contact.strengthLabel}</span>
                    </span>
                    <span className={`cop-contact__influence ${toneClass(contact.influenceTone)}`} title={`Influence ${contact.influence}`}>
                      {contact.influence}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cop-panel cop-panel--factors ng-canon__panel ng-holo-panel">
            <CopPanelHeader
              aside={<span className="cop-mock-tag">Mock</span>}
              icon="handshake"
              subtitle="What you weigh up"
              title="Decision factors"
            />
            <ul className="cop-factors" data-source="mock">
              {model.factors.map((factor) => (
                <li className="cop-factor" data-factor={factor.id} key={factor.id}>
                  <span className="cop-factor__label">{factor.label}</span>
                  <span className="cop-factor__importance">{factor.importance}%</span>
                  <span className="cop-factor__track">
                    <span className={`cop-factor__fill cop-tone-bg--${factor.tone}`} style={{ width: `${factor.marketLevel}%` }} />
                  </span>
                  <span className={`cop-factor__market ${toneClass(factor.tone)}`}>{factor.marketLevel}</span>
                </li>
              ))}
            </ul>
            <p className="cop-factors__note">
              Importance is your own scale; market level is the best currently on offer. Both are MOCK until the character
              AI, agents and negotiations land.
            </p>
          </section>
        </div>
      </div>

      <section className="cop-panel cop-panel--timeline ng-canon__panel ng-holo-panel">
        <CopPanelHeader
          aside={
            onOpenTab === undefined ? undefined : (
              <button className="cop-link" onClick={() => openTab('career')} type="button">
                Career history
                <span aria-hidden className="cop-link__arrow">
                  →
                </span>
              </button>
            )
          }
          icon="stack"
          subtitle="Rumours, conversations and contract windows"
          title="Opportunity timeline"
        />
        <ol className="cop-timeline">
          {model.timeline.map((event) => (
            <li
              className={`cop-timeline__event${event.source === 'mock' ? ' cop-is-mock' : ''}`}
              data-source={event.source}
              key={event.id}
            >
              <span aria-hidden className={`cop-timeline__dot cop-tone-bg--${event.tone}`} />
              <span className="cop-timeline__date">{event.dateLabel}</span>
              <span className="cop-timeline__title">
                <span className={`cop-timeline__icon ${toneClass(event.tone)}`}>
                  <OverviewGlyph name={event.icon} size={13} />
                </span>
                {event.title}
              </span>
              <span className="cop-timeline__detail">{event.detail}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
