// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import {
  COACH_REPUTATION_DIMENSIONS,
  applyCoachReputationEvent,
  getCoachReputationBand,
  type CoachReputationEvent,
  type CoachReputationProfile,
} from '@/domain/coachReputation'
import type { GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import {
  coachReputationBandLabel,
  coachReputationEventLabel,
  formatCoachReputationDelta,
} from '@/ui/coachReputationPresentation'
import { formatPrototypeDate } from '@/ui/formatters'
import { CoachReputationScreen } from '@/ui-ng/applications/coach/CoachReputationScreen'

afterEach(cleanup)

const DIMENSION_LABELS = {
  competitive: 'Competitive',
  development: 'Development',
  professional: 'Professional',
  publicStanding: 'Public Standing',
} as const

function monthKeyShift(date: string, delta: number): string {
  const [yearText, monthText] = date.slice(0, 7).split('-')
  const total = Number(yearText) * 12 + (Number(monthText) - 1) + delta
  const year = Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`
}

function dateMonthsAgo(currentDate: string, months: number, day = 12): GameDate {
  return `${monthKeyShift(currentDate, -months)}-${String(day).padStart(2, '0')}` as GameDate
}

function eventEffect(event: CoachReputationEvent): number {
  return COACH_REPUTATION_DIMENSIONS.reduce((total, dimension) => total + (event.deltas[dimension] ?? 0), 0)
}

interface ReputationFixture {
  readonly world: GameWorld
  readonly profile: CoachReputationProfile
  readonly teamName: string
  readonly coachLastName: string
  readonly championDate: GameDate
  readonly ancientDate: GameDate
  readonly recentEvents: readonly CoachReputationEvent[]
}

/**
 * A realistic career: five reputation events inside the six-month window, one championship inside the
 * twelve-month window but outside the six, and one win from over a year ago that must not surface.
 * The profile is built by applying the events through the canonical domain reducer, so the values the
 * screen renders are the real ones, not hand-written expectations.
 */
function buildReputationFixture(): ReputationFixture {
  const base = createNewGame()
  const coachId = base.userCoachId
  const employment = base.coachEmploymentByCoachId[coachId]
  const teamId: TeamId = employment?.teamId ?? (Object.keys(base.teams)[0] as TeamId)
  const season = base.seasons[base.currentSeasonId]
  if (season === undefined) throw new Error('Expected a current season in the generated world')
  const competitionId = season.competitionId
  const opponents = Object.values(base.teams).filter((team) => team.id !== teamId)
  const opponent = opponents[0]
  if (opponent === undefined) throw new Error('Expected an opponent team in the generated world')

  const matchContext = (gameId: string, result: 'win' | 'loss', expectedWinProbability: number) => ({
    kind: 'matchResult' as const,
    key: `game:${gameId}`,
    gameId,
    teamId,
    opponentTeamId: opponent.id,
    seasonId: base.currentSeasonId,
    competitionId,
    result,
    expectedWinProbability,
    teamStrength: 62,
    opponentTeamStrength: 64,
    coachIsHome: true,
  })

  const championDate = dateMonthsAgo(base.currentDate, 8)
  const ancientDate = dateMonthsAgo(base.currentDate, 14)

  const recentEvents: CoachReputationEvent[] = [
    {
      id: 'reputation:match:win',
      gameDate: dateMonthsAgo(base.currentDate, 5),
      source: 'matchResult',
      deltas: { competitive: 10, publicStanding: 4 },
      context: matchContext('win', 'win', 0.28),
    },
    {
      id: 'reputation:professional',
      gameDate: dateMonthsAgo(base.currentDate, 4),
      source: 'professionalEvent',
      deltas: { professional: 6 },
      context: { kind: 'professionalEvent', key: 'media-course' },
    },
    {
      id: 'reputation:public',
      gameDate: dateMonthsAgo(base.currentDate, 3),
      source: 'publicEvent',
      deltas: { publicStanding: -5 },
      context: { kind: 'publicEvent', key: 'touchline-exchange' },
    },
    {
      id: 'reputation:development',
      gameDate: dateMonthsAgo(base.currentDate, 2),
      source: 'developmentEvent',
      deltas: { development: 8 },
      context: { kind: 'developmentEvent', key: 'academy-promotion' },
    },
    {
      id: 'reputation:match:loss',
      gameDate: dateMonthsAgo(base.currentDate, 1),
      source: 'matchResult',
      deltas: { competitive: -7, publicStanding: -2 },
      context: matchContext('loss', 'loss', 0.71),
    },
  ]

  const events: readonly CoachReputationEvent[] = [
    ...recentEvents,
    {
      id: 'reputation:season:champion',
      gameDate: championDate,
      source: 'seasonAchievement',
      deltas: { competitive: 40, publicStanding: 20 },
      context: {
        kind: 'seasonAchievement',
        key: `season-champion:${base.currentSeasonId}`,
        seasonId: base.currentSeasonId,
        teamId,
        competitionId,
        achievement: 'champion',
      },
    },
    {
      id: 'reputation:match:ancient',
      gameDate: ancientDate,
      source: 'matchResult',
      deltas: { competitive: 5, publicStanding: 2 },
      context: matchContext('ancient', 'win', 0.4),
    },
  ]

  let profile = base.coachReputationProfilesByCoachId[coachId]
  if (profile === undefined) throw new Error('Expected a reputation profile for the user coach')
  for (const event of events) {
    const applied = applyCoachReputationEvent(profile, event)
    if (!applied.ok) throw new Error(`Rejected fixture event ${event.id}: ${applied.reason}`)
    profile = applied.profile
  }

  const world: GameWorld = {
    ...base,
    coachReputationProfilesByCoachId: { ...base.coachReputationProfilesByCoachId, [coachId]: profile },
  }

  return {
    world,
    profile,
    teamName: world.teams[teamId]?.name ?? '',
    coachLastName: world.coaches[coachId]?.lastName ?? '',
    championDate,
    ancientDate,
    recentEvents,
  }
}

const FIXTURE = buildReputationFixture()

function panel(container: HTMLElement, heading: RegExp) {
  const section = within(container).getByRole('heading', { name: heading }).closest('section')
  if (section === null) throw new Error(`No <section> panel for heading ${String(heading)}`)
  return within(section)
}

function renderScreen(onOpenTab?: (tabId: string) => void) {
  const view = render(<CoachReputationScreen onOpenTab={onOpenTab} world={FIXTURE.world} />)
  return { ...view, onOpenTab }
}

describe('CoachReputationScreen', () => {
  it('renders all eight reputation panels', () => {
    const { container } = renderScreen()

    for (const heading of [
      /Reputation summary/,
      /Perception breakdown/,
      /Recent changes & signals/,
      /Reputation drivers/,
      /Geographic reach/,
      /Media & narrative/,
      /Reputation timeline/,
      /Key milestones/,
    ]) {
      expect(within(container).getByRole('heading', { name: heading })).toBeInTheDocument()
    }
  })

  it('reads every dimension value, band and bar from the canonical profile', () => {
    const { container } = renderScreen()
    const summary = panel(container, /Reputation summary/)

    for (const dimension of COACH_REPUTATION_DIMENSIONS) {
      const value = FIXTURE.profile.values[dimension]
      const row = container.querySelector(`[data-dimension="${dimension}"]`)
      if (row === null) throw new Error(`Missing summary row for ${dimension}`)
      const scoped = within(row as HTMLElement)

      expect(scoped.getByText(DIMENSION_LABELS[dimension])).toBeInTheDocument()
      expect(scoped.getByText(String(value))).toBeInTheDocument()
      expect(scoped.getByText(coachReputationBandLabel(getCoachReputationBand(value)))).toBeInTheDocument()
      expect(
        scoped.getByRole('img', { name: `${DIMENSION_LABELS[dimension]} ${value} of 1000` }),
      ).toBeInTheDocument()
    }

    const expectedTotal = Math.round(
      COACH_REPUTATION_DIMENSIONS.reduce((sum, dimension) => sum + FIXTURE.profile.values[dimension], 0) /
        COACH_REPUTATION_DIMENSIONS.length,
    )
    const expectedBand = coachReputationBandLabel(getCoachReputationBand(expectedTotal))
    expect(summary.getByRole('img', { name: `Total standing ${expectedTotal} of 1000` })).toBeInTheDocument()
    // Several dimensions can share a band, so the aggregate band is asserted by presence, not by identity.
    expect(summary.getAllByText(expectedBand).length).toBeGreaterThan(0)
  })

  it('quantifies the recent change from the six-month window only', () => {
    const { container } = renderScreen()
    const summary = panel(container, /Reputation summary/)

    const windowDeltas = FIXTURE.recentEvents.reduce((sum, event) => sum + eventEffect(event), 0)
    expect(windowDeltas).toBe(14)

    expect(summary.getByText('Recent change')).toBeInTheDocument()
    expect(summary.getByText(formatCoachReputationDelta(windowDeltas))).toBeInTheDocument()
    expect(summary.getByText('Last 6 months')).toBeInTheDocument()
    // The championship sits eight months back, so it must not appear in the recent figure.
    expect(summary.getByText(/5 events tracked/)).toBeInTheDocument()
    expect(summary.getByText(/Development leads the gains \(\+8\)/)).toBeInTheDocument()
    expect(summary.getByText(/Public Standing is the main drag \(-3\)/)).toBeInTheDocument()
  })

  it('lists the newest events with their per-dimension deltas and quantified effect', () => {
    const { container } = renderScreen()
    const signals = panel(container, /Recent changes & signals/)

    const ordered = [...FIXTURE.recentEvents].sort((left, right) => right.gameDate.localeCompare(left.gameDate))
    for (const event of ordered) {
      expect(signals.getByText(coachReputationEventLabel(FIXTURE.world, event))).toBeInTheDocument()
      // The date shares its line with the source, so it is matched as part of that line.
      expect(signals.getByText(new RegExp(formatPrototypeDate(event.gameDate as GameDate)))).toBeInTheDocument()
      expect(signals.getByText(formatCoachReputationDelta(eventEffect(event)))).toBeInTheDocument()
    }

    // The upset win is the canonical match event: it carries its own expectations in the meta line.
    expect(signals.getByText(/Match Result · expected 28%/)).toBeInTheDocument()
    expect(signals.getByText(/5 of 7 recorded events/)).toBeInTheDocument()
  })

  it('ranks milestones by impact inside the twelve-month window and drops older results', () => {
    const { container } = renderScreen()
    const milestones = panel(container, /Key milestones/)

    expect(milestones.getByText('Season Champion')).toBeInTheDocument()
    expect(milestones.getByText(formatPrototypeDate(FIXTURE.championDate))).toBeInTheDocument()
    expect(milestones.getByText(formatCoachReputationDelta(60))).toBeInTheDocument()
    expect(milestones.queryByText(formatPrototypeDate(FIXTURE.ancientDate))).not.toBeInTheDocument()
  })

  it('derives driver levels from the stored dimensions and marks the mock surface', () => {
    const { container } = renderScreen()
    const drivers = panel(container, /Reputation drivers/)

    const competitive = Math.round((FIXTURE.profile.values.competitive / 1000) * 100)
    expect(drivers.getByText('On-field Success')).toBeInTheDocument()
    expect(drivers.getByRole('img', { name: `On-field Success ${competitive} of 100` })).toBeInTheDocument()
    expect(drivers.getByText('92')).toBeInTheDocument()
    expect(drivers.getByText('Political Skill')).toBeInTheDocument()

    // Every mock surface is labelled; the alternative would be presenting invented data as canonical.
    expect(container.querySelectorAll('[data-mock="true"]')).toHaveLength(4)
    expect(screen.getAllByText('mock').length).toBeGreaterThanOrEqual(4)
  })

  it('renders the mock perception, reach and narrative layers from the single mock object', () => {
    const { container } = renderScreen()
    const perception = panel(container, /Perception breakdown/)
    const reach = panel(container, /Geographic reach/)
    const narrative = panel(container, /Media & narrative/)

    expect(perception.getByText('Players')).toBeInTheDocument()
    expect(perception.getByText('Owners')).toBeInTheDocument()
    expect(perception.getByText('78')).toBeInTheDocument()
    expect(perception.getByText('34')).toBeInTheDocument()

    expect(reach.getByText('Horizon League')).toBeInTheDocument()
    expect(reach.getByText('Oceania')).toBeInTheDocument()
    expect(reach.getByRole('img', { name: 'European interest 62 of 100' })).toBeInTheDocument()

    // The narrative templates take the real team and coach names from the world.
    expect(narrative.getByText(`“${FIXTURE.teamName} thrive under ${FIXTURE.coachLastName}”`)).toBeInTheDocument()
    expect(narrative.getByText('“Questions raised over the defensive setup”')).toBeInTheDocument()
    expect(narrative.getByRole('img', { name: /Questions raised over the defensive setup volume 48 of 100/ })).toBeInTheDocument()
  })

  it('rebuilds the timeline when the time scale changes', () => {
    const { container } = renderScreen()
    const timeline = panel(container, /Reputation timeline/)

    expect(screen.getByRole('img', { name: /^Total standing, last 12 months:/ })).toBeInTheDocument()
    expect(timeline.getByText('Last 12 months')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '6M' }))

    expect(screen.getByRole('img', { name: /^Total standing, last 6 months:/ })).toBeInTheDocument()
    expect(panel(container, /Reputation timeline/).getByText('Last 6 months')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /^Total standing, last 12 months:/ })).not.toBeInTheDocument()
  })

  it('routes the wired sections through onOpenTab without hijacking the timeline controls', () => {
    const onOpenTab = vi.fn()
    renderScreen(onOpenTab)

    fireEvent.click(screen.getByRole('button', { name: /Career record/ }))
    expect(onOpenTab).toHaveBeenCalledWith('career')

    fireEvent.click(screen.getByRole('button', { name: /Check international openings/ }))
    expect(onOpenTab).toHaveBeenCalledWith('opportunities')

    onOpenTab.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '24M' }))
    expect(onOpenTab).not.toHaveBeenCalled()
  })

  it('renders inert, without throwing, when no navigation is wired yet', () => {
    renderScreen()

    for (const button of screen.getAllByRole('button')) {
      expect(() => fireEvent.click(button)).not.toThrow()
    }
  })

  it('degrades to explicit empty states for a career with no reputation events', () => {
    const pristine = createNewGame()
    const world: GameWorld = {
      ...pristine,
      coachCareerHistoryByCoachId: { ...pristine.coachCareerHistoryByCoachId, [pristine.userCoachId]: [] },
    }
    render(<CoachReputationScreen world={world} />)

    expect(screen.getByText('No reputation events recorded yet.')).toBeInTheDocument()
    expect(screen.getByText('No milestones recorded in the last twelve months.')).toBeInTheDocument()
    // A default profile is a real profile: the four dimensions still render.
    expect(screen.getByRole('img', { name: 'Competitive 200 of 1000' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Total standing 200 of 1000' })).toBeInTheDocument()
  })
})
