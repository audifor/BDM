// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import type { CoachCareerHistoryEntry } from '@/domain/coachCareer'
import { createCoachFinanceProfile } from '@/domain/coachFinances'
import type { CoachReputationProfile } from '@/domain/coachReputation'
import type { GameDate } from '@/domain/date'
import type { CoachId, SeasonId, TeamId } from '@/domain/ids'
import type { CoachAchievement, CoachTenure } from '@/domain/legacy'
import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { buildCoachCareerModel, CoachCareerScreen } from '@/ui-ng/applications/coach/CoachCareerScreen'

afterEach(cleanup)

const CAREER_SECTIONS = ['position', 'trajectory', 'milestones', 'history', 'tenures', 'security', 'timeline'] as const

/** Scopes a query to one macro-panel; several labels legitimately repeat across this screen. */
function section(container: HTMLElement, id: (typeof CAREER_SECTIONS)[number]) {
  const element = container.querySelector<HTMLElement>(`[data-section="${id}"]`)
  if (element === null) throw new Error(`No panel with data-section="${id}"`)
  return within(element)
}

/**
 * A realistic in-progress career: a move up, a dismissal, four finalized seasons attached to the
 * tenures, two honours, reputation growth and a year of salary movements. Everything is written
 * through the canonical `updateGameWorld` validator, so the screen reads a legal GameWorld.
 */
function buildCareerWorld() {
  const base = createNewGame()
  const userTeam = getUserTeam(base)!
  const previousTeam = Object.values(base.teams).find((team) => team.id !== userTeam.id)!
  const coachId = base.userCoachId

  const history: readonly CoachCareerHistoryEntry[] = [
    { kind: 'appointment', coachId, teamId: previousTeam.id, date: '2028-07-01' as GameDate, reason: 'hired' },
    { kind: 'departure', coachId, teamId: previousTeam.id, date: '2030-06-30' as GameDate, reason: 'fired' },
    { kind: 'appointment', coachId, teamId: userTeam.id, date: '2030-07-01' as GameDate, reason: 'hired' },
  ]

  const previousTenure: CoachTenure = {
    id: 'tenure:previous',
    coachId,
    teamId: previousTeam.id,
    startedOn: '2028-07-01' as GameDate,
    endedOn: '2030-06-30' as GameDate,
    achievementIds: [],
    seasonsManaged: 2,
    processedSeasonIds: [],
    dynastyCount: 0,
  }

  const currentTenure: CoachTenure = {
    id: 'tenure:current',
    coachId,
    teamId: userTeam.id,
    startedOn: '2030-07-01' as GameDate,
    achievementIds: ['ach:title', 'ach:promotion'],
    seasonsManaged: 2,
    processedSeasonIds: [],
    dynastyCount: 0,
  }

  const title: CoachAchievement = {
    id: 'ach:title',
    coachId,
    teamId: userTeam.id,
    seasonId: 'season-2030' as SeasonId,
    type: 'championship',
    legacyValue: 40,
    sourceEventKey: 'test:title:2030',
    occurredOn: '2031-04-10' as GameDate,
  }

  const promotion: CoachAchievement = {
    id: 'ach:promotion',
    coachId,
    teamId: userTeam.id,
    seasonId: 'season-2031' as SeasonId,
    type: 'promotion',
    legacyValue: 22,
    sourceEventKey: 'test:promotion:2031',
    occurredOn: '2032-05-02' as GameDate,
  }

  const reputation: CoachReputationProfile = {
    values: { competitive: 420, development: 260, professional: 300, publicStanding: 340 },
    events: [
      {
        id: 'rep:title',
        gameDate: '2031-04-10',
        source: 'seasonAchievement',
        deltas: { competitive: 40, publicStanding: 20 },
        context: {
          kind: 'seasonAchievement',
          key: 'test:title:2030',
          seasonId: 'season-2030',
          teamId: userTeam.id,
          competitionId: 'competition:test',
          achievement: 'champion',
        },
      },
    ],
  }

  // Net monthly movements consistent with the stored salary: 2.4M * (1 - 0.25) / 12.
  const finances = createCoachFinanceProfile({
    coachId,
    annualSalary: 2_400_000,
    incomeTaxRate: 0.25,
    cash: 900_000,
    movements: [
      { id: 'mov:2031', date: '2031-01-15' as GameDate, type: 'salary', amount: 150_000, description: 'Net coaching salary' },
      { id: 'mov:2032', date: '2032-01-15' as GameDate, type: 'salary', amount: 150_000, description: 'Net coaching salary' },
    ],
  })

  return {
    world: updateGameWorld(base, {
      coachCareerHistoryByCoachId: { ...base.coachCareerHistoryByCoachId, [coachId]: history },
      coachTenuresById: {
        ...base.coachTenuresById,
        ['tenure:previous' as CoachId]: previousTenure,
        ['tenure:current' as CoachId]: currentTenure,
      } as typeof base.coachTenuresById,
      coachAchievementsById: {
        ...base.coachAchievementsById,
        ['ach:title']: title,
        ['ach:promotion']: promotion,
      } as typeof base.coachAchievementsById,
      coachReputationProfilesByCoachId: { ...base.coachReputationProfilesByCoachId, [coachId]: reputation },
      coachFinancesByCoachId: { ...base.coachFinancesByCoachId, [coachId]: finances },
    }),
    coachId,
    userTeam,
    previousTeam,
  }
}

describe('CoachCareerScreen', () => {
  it('renders every career panel from a real GameWorld', () => {
    const { world, userTeam } = buildCareerWorld()
    const { container } = render(<CoachCareerScreen world={world} />)

    for (const title of [
      'Current Position',
      'Career Trajectory',
      'Next Milestones',
      'Career History',
      'Tenure Breakdown',
      'Contract & Security',
      'Career Timeline',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }

    for (const id of CAREER_SECTIONS) {
      expect(container.querySelector(`[data-section="${id}"]`)).not.toBeNull()
    }

    // Current position reads the live employment, the club, the salary and the board context.
    const position = section(container, 'position')
    expect(position.getByText(userTeam.name)).toBeInTheDocument()
    expect(position.getByText('Head Coach')).toBeInTheDocument()
    expect(position.getByText('Seasons in charge')).toBeInTheDocument()
    expect(position.getAllByText('Annual salary').length).toBe(2)
    expect(position.getAllByText('$2.40M').length).toBeGreaterThan(0)
    expect(position.getByText('Development focus')).toBeInTheDocument()
    expect(position.getByText('Board alignment')).toBeInTheDocument()
    expect(position.getByText('Current contract')).toBeInTheDocument()
    expect(position.getByText('Playoff bonus')).toBeInTheDocument()
  })

  it('replays the real career history rows in chronological order', () => {
    const { world, userTeam } = buildCareerWorld()
    const { container } = render(<CoachCareerScreen world={world} />)
    const history = section(container, 'history')

    const rows = [...container.querySelectorAll<HTMLElement>('[data-section="history"] tbody tr')]
    expect(rows.map((row) => row.querySelector('td')?.textContent)).toEqual([
      '01 JUL 2028',
      '30 JUN 2030',
      '01 JUL 2030',
      '10 APR 2031',
      '02 MAY 2032',
    ])

    expect(history.getAllByText('Appointed head coach').length).toBe(2)
    expect(history.getByText('Dismissed')).toBeInTheDocument()
    expect(history.getByText('Champion')).toBeInTheDocument()
    expect(history.getByText('Promotion')).toBeInTheDocument()
    expect(history.getAllByText(userTeam.name).length).toBeGreaterThan(0)
    expect(history.getAllByText('Positive').length).toBeGreaterThan(0)
    expect(history.getByText('Negative')).toBeInTheDocument()
  })

  it('summarizes tenures as shares of the whole career', () => {
    const { world, userTeam, previousTeam } = buildCareerWorld()
    const { container } = render(<CoachCareerScreen world={world} />)
    const tenures = section(container, 'tenures')

    expect(tenures.getByText(userTeam.name)).toBeInTheDocument()
    expect(tenures.getByText(previousTeam.name)).toBeInTheDocument()
    expect(tenures.getAllByText('Head Coach').length).toBe(2)
    expect(tenures.getAllByText('2 seasons').length).toBe(2)
    // Only the current spell owns the two honours.
    expect(tenures.getByText('2 honours')).toBeInTheDocument()
    expect(tenures.getByText('0 honours')).toBeInTheDocument()

    const shares = [...container.querySelectorAll('[data-section="tenures"] .cc-tenure__share')].map((node) =>
      Number.parseInt(node.textContent ?? '0', 10),
    )
    expect(shares.length).toBe(2)
    const total = shares.reduce((sum, share) => sum + share, 0)
    expect(total).toBeGreaterThanOrEqual(99)
    expect(total).toBeLessThanOrEqual(101)
  })

  it('switches trajectory metrics and keeps the placeholder series flagged', () => {
    const { world } = buildCareerWorld()
    const { container } = render(<CoachCareerScreen world={world} />)
    const trajectory = section(container, 'trajectory')

    expect(trajectory.getByRole('button', { name: /Win %/ })).toHaveAttribute('aria-pressed', 'true')
    expect(trajectory.getByRole('button', { name: /Level/ })).toHaveTextContent('MOCK')

    // No season history in this world, so the honest answer is "not derivable yet".
    expect(trajectory.getByText(/No recorded career win percentage yet/)).toBeInTheDocument()

    fireEvent.click(trajectory.getByRole('button', { name: /Salary/ }))
    expect(trajectory.getByRole('button', { name: /Salary/ })).toHaveAttribute('aria-pressed', 'true')
    expect(trajectory.getAllByText('$2.40M').length).toBeGreaterThan(0)
    expect(trajectory.getByText(/recorded entries · current value \$2\.40M/)).toBeInTheDocument()

    fireEvent.click(trajectory.getByRole('button', { name: /Reputation/ }))
    expect(trajectory.getByText('330')).toBeInTheDocument()

    // Appointment and dismissal markers are drawn straight from the career history.
    expect(trajectory.getAllByText(/Appointed · /).length).toBe(2)
    expect(trajectory.getByText(/Dismissed · /)).toBeInTheDocument()
  })

  it('orders next milestones by how close they are', () => {
    const { world } = buildCareerWorld()
    const { container } = render(<CoachCareerScreen world={world} />)
    const milestones = section(container, 'milestones')

    for (const label of [
      '100 Career Wins',
      'First Playoff Series Win',
      'Conference Final',
      'Next Reputation Threshold',
      'Contract Review',
      'Five Seasons in Charge',
    ]) {
      expect(milestones.getByText(label)).toBeInTheDocument()
    }

    const items = [...container.querySelectorAll<HTMLElement>('[data-section="milestones"] .cc-milestone')]
    expect(items.length).toBe(6)
    // 330 reputation sits 87% of the way to the 350 threshold: the closest objective.
    expect(items[0]).toHaveClass('is-next')
    expect(items[0]?.textContent).toContain('Next Reputation Threshold')
    expect(milestones.getByText('Reputation 330')).toBeInTheDocument()
    expect(milestones.getByText('Next band 350')).toBeInTheDocument()

    for (const bar of container.querySelectorAll<HTMLElement>('[data-section="milestones"] .cc-progress__fill')) {
      expect(Number.parseInt(bar.style.width, 10)).toBeLessThanOrEqual(100)
    }
  })

  it('reports security as segmented states and marks what has no source of truth', () => {
    const { world } = buildCareerWorld()
    const { container } = render(<CoachCareerScreen world={world} />)
    const security = section(container, 'security')

    for (const label of ['Job Security', 'Board Patience', 'Media Patience', 'Long-term Outlook']) {
      expect(security.getByText(label)).toBeInTheDocument()
    }

    const meters = security.getAllByRole('img')
    expect(meters.length).toBe(4)
    for (const meter of meters) {
      expect(meter.getAttribute('aria-label')).toMatch(/ of 5$/)
      expect(meter.querySelectorAll('.cc-segments__block').length).toBe(5)
    }

    // Job security and board patience are live; media patience and outlook are placeholders.
    expect(security.getAllByText('LIVE').length).toBe(2)
    expect(security.getAllByText('MOCK').length).toBe(2)
  })

  it('narrates the career timeline with the moments worth telling', () => {
    const { world, userTeam } = buildCareerWorld()
    const { container } = render(<CoachCareerScreen world={world} />)
    const timeline = section(container, 'timeline')

    expect(timeline.getAllByText('New club').length).toBe(2)
    expect(timeline.getByText('Dismissed')).toBeInTheDocument()
    expect(timeline.getByText('Champion')).toBeInTheDocument()
    expect(timeline.getByText('Promotion')).toBeInTheDocument()
    expect(timeline.getAllByText(new RegExp(userTeam.name)).length).toBeGreaterThan(0)
  })

  it('routes every navigation affordance to its tab', () => {
    const { world } = buildCareerWorld()
    const onOpenTab = vi.fn()
    render(<CoachCareerScreen onOpenTab={onOpenTab} world={world} />)

    fireEvent.click(screen.getByRole('button', { name: 'View opportunities' }))
    expect(onOpenTab).toHaveBeenLastCalledWith('opportunities')

    const legacyButtons = screen.getAllByRole('button', { name: 'Open legacy' })
    expect(legacyButtons.length).toBe(2)
    fireEvent.click(legacyButtons[0]!)
    expect(onOpenTab).toHaveBeenLastCalledWith('legacy')

    const milestoneLinks = screen.getAllByRole('button', { name: 'Open' })
    expect(milestoneLinks.length).toBe(3)
    for (const link of milestoneLinks) {
      onOpenTab.mockClear()
      fireEvent.click(link)
      expect(onOpenTab).toHaveBeenCalledTimes(1)
      expect(typeof onOpenTab.mock.calls[0]?.[0]).toBe('string')
    }
  })

  it('stays inert and throw-free when no tab callback is wired', () => {
    const { world } = buildCareerWorld()
    render(<CoachCareerScreen world={world} />)

    expect(screen.queryByRole('button', { name: 'View opportunities' })).not.toBeInTheDocument()
    expect(screen.getByText('View opportunities')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) fireEvent.click(button)
    expect(screen.getByRole('heading', { name: 'Career Timeline' })).toBeInTheDocument()
  })

  it('renders a fresh career with every panel and empty state intact', () => {
    const world = createNewGame()
    const { container } = render(<CoachCareerScreen world={world} />)

    for (const id of CAREER_SECTIONS) {
      expect(container.querySelector(`[data-section="${id}"]`)).not.toBeNull()
    }
    for (const button of screen.getAllByRole('button')) fireEvent.click(button)
  })

  it('renders an explicit empty state when there is no world at all', () => {
    render(<CoachCareerScreen world={undefined} />)
    expect(screen.getByText('No career loaded.')).toBeInTheDocument()
  })

  /*
   * The domain stores no coach win/loss record. This test pins the only honest reconstruction:
   * `CoachTenure.processedSeasonIds` (written by LegacyEngine.processCoachSeason) joined with
   * `SeasonHistoryRecord.finalStandings`. If that derivation breaks, the screen must not silently
   * fall back to an invented win percentage.
   */
  it('derives the win record from finalized seasons instead of inventing one', () => {
    const coachId = 'coach:test' as CoachId
    const teamA = 'team:test-a' as TeamId
    const teamB = 'team:test-b' as TeamId
    const standing = (teamId: TeamId, wins: number, losses: number) => ({
      position: 1,
      teamId,
      played: wins + losses,
      wins,
      losses,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
    })

    const world = {
      currentDate: '2033-06-30',
      userCoachId: coachId,
      coaches: { [coachId]: { id: coachId, firstName: 'Jora', lastName: 'Dain' } },
      teams: {
        [teamA]: { id: teamA, name: 'Dunmere Orbits' },
        [teamB]: { id: teamB, name: 'Talon Rangers' },
      },
      coachEmploymentByCoachId: { [coachId]: { status: 'employed', teamId: teamA, startedOn: '2030-07-01' } },
      coachCareerHistoryByCoachId: {
        [coachId]: [
          { kind: 'appointment', coachId, teamId: teamB, date: '2028-07-01', reason: 'hired' },
          { kind: 'appointment', coachId, teamId: teamA, date: '2030-07-01', reason: 'hired' },
        ],
      },
      coachTenuresById: {
        'tenure:old': {
          id: 'tenure:old',
          coachId,
          teamId: teamB,
          startedOn: '2028-07-01',
          endedOn: '2030-06-30',
          achievementIds: [],
          seasonsManaged: 2,
          processedSeasonIds: ['s-2028', 's-2029'],
        },
        'tenure:new': {
          id: 'tenure:new',
          coachId,
          teamId: teamA,
          startedOn: '2030-07-01',
          achievementIds: [],
          seasonsManaged: 2,
          processedSeasonIds: ['s-2030', 's-2031'],
        },
      },
      seasonHistoryBySeasonId: {
        's-2028': {
          seasonId: 's-2028',
          competitionId: 'competition:test',
          completedOn: '2029-05-01',
          championTeamId: teamB,
          finalStandings: [standing(teamB, 20, 14)],
        },
        's-2029': {
          seasonId: 's-2029',
          competitionId: 'competition:test',
          completedOn: '2030-05-01',
          championTeamId: teamB,
          finalStandings: [standing(teamB, 16, 18)],
        },
        's-2030': {
          seasonId: 's-2030',
          competitionId: 'competition:test',
          completedOn: '2031-05-01',
          championTeamId: teamA,
          finalStandings: [standing(teamA, 24, 10)],
        },
        's-2031': {
          seasonId: 's-2031',
          competitionId: 'competition:test',
          completedOn: '2032-05-01',
          championTeamId: teamA,
          finalStandings: [standing(teamA, 26, 8)],
        },
      },
      coachAchievementsById: {},
      coachLegacyByCoachId: {},
      coachJobOffersById: {},
      boardStatesByTeamId: {},
      coachReputationProfilesByCoachId: {},
      coachFinancesByCoachId: {},
    } as unknown as GameWorld

    const model = buildCoachCareerModel(world)
    expect(model.wins).toBe(86)
    expect(model.losses).toBe(50)
    expect(model.winPct).toBeCloseTo(86 / 136, 6)

    render(<CoachCareerScreen world={world} />)
    const position = section(document.body, 'position')
    expect(position.getByText(/^86.50$/)).toBeInTheDocument()
    expect(position.getByText('.632')).toBeInTheDocument()

    const trajectory = section(document.body, 'trajectory')
    expect(trajectory.getByText(/4 finalized seasons attributed to your tenures/)).toBeInTheDocument()
  })
})
