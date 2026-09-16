// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { openCoachTenure, processCoachSeason, recordCoachAchievement } from '@/engine/legacy'
import { buildCoachCareerModel } from '@/ui-ng/applications/coach/CoachCareerScreen'
import { CoachLegacyScreen } from '@/ui-ng/applications/coach/CoachLegacyScreen'

afterEach(cleanup)

/**
 * A realistic career: an open tenure, one championship, one outsider promotion and two processed
 * seasons. That seeds real legacy value, real achievements and real tenure longevity, so the screen
 * is exercised against runtime state instead of a hand-built model.
 */
function buildCareer() {
  const base = createNewGame()
  const coachId = base.userCoachId
  const teamId = Object.values(base.teams).find((team) => team.coachId === coachId)!.id

  let world = openCoachTenure(base, coachId, teamId)
  world = recordCoachAchievement(world, {
    coachId,
    teamId,
    seasonId: '2028',
    type: 'championship',
    sourceEventKey: 'test:title:2028',
  })
  world = recordCoachAchievement(world, {
    coachId,
    teamId,
    seasonId: '2029',
    type: 'promotion',
    sourceEventKey: 'test:promotion:2029',
    outsider: true,
  })
  world = processCoachSeason(world, { coachId, teamId, seasonId: '2028' })
  world = processCoachSeason(world, { coachId, teamId, seasonId: '2029' })

  return { world, coachId, teamId }
}

/** Scopes queries to one macro-panel; several labels repeat across the board by design. */
function panel(container: HTMLElement, heading: RegExp) {
  const section = within(container).getByRole('heading', { name: heading }).closest('section')
  if (section === null) throw new Error(`No <section> panel for heading ${String(heading)}`)
  return within(section)
}

describe('CoachLegacyScreen', () => {
  it('reads the historical standing and the legacy score from the runtime world', () => {
    const { world, coachId, teamId } = buildCareer()
    const legacyValue = world.coachLegacyByCoachId[coachId]!.legacyValue
    const teamName = world.teams[teamId]!.name
    const { container } = render(<CoachLegacyScreen world={world} />)
    const standing = panel(container, /Historical standing/i)

    // unproven → established → notable paints as "Established Figure" for this record.
    expect(standing.getByText('Established Figure')).toBeInTheDocument()
    expect(standing.getAllByText(String(legacyValue)).length).toBeGreaterThan(0)
    expect(standing.getByRole('img', { name: `Hall of Fame track: ${legacyValue} of 220 points` })).toBeInTheDocument()

    // 40 (title) + 42 (outsider promotion) is the real honours half of the score.
    expect(standing.getByText('+82')).toBeInTheDocument()

    for (const label of ['Championships', 'Finals', 'Playoff appearances', 'Career wins']) {
      expect(standing.getByText(label)).toBeInTheDocument()
    }

    // `coachTeamLegacyByKey` is real per-club legacy: 89 points at that club reads as "Icon".
    expect(standing.getByText(`${teamName} · Icon · 2 honours`)).toBeInTheDocument()
  })

  it('renders the trophy milestones with the real title count and the distance to each target', () => {
    const { world } = buildCareer()
    // Career wins reuse the Canonical Career derivation, so the test reads the same number the screen does.
    const wins = buildCoachCareerModel(world).wins
    const { container } = render(<CoachLegacyScreen world={world} />)
    const trophy = panel(container, /Trophy & milestone progress/i)

    expect(trophy.getByRole('img', { name: 'Championships: 1 of 3' })).toBeInTheDocument()
    expect(trophy.getByRole('img', { name: 'Finals appearances: 1 of 5' })).toBeInTheDocument()
    expect(trophy.getByRole('img', { name: 'Playoff appearances: 3 of 10' })).toBeInTheDocument()
    expect(trophy.getByRole('img', { name: `Career wins: ${wins} of 250` })).toBeInTheDocument()
    expect(trophy.getByText('2 to go')).toBeInTheDocument()
    expect(trophy.getByText(`${250 - wins} to go`)).toBeInTheDocument()

    // Championships and career wins are runtime; only finals and playoffs are illustrative.
    expect(trophy.getAllByText('Mock')).toHaveLength(2)
  })

  it('filters the achievements table and keeps lost finals as part of the record', () => {
    const { world } = buildCareer()
    const { container } = render(<CoachLegacyScreen world={world} />)
    const achievements = panel(container, /Achievements & records/i)

    expect(achievements.getByText('Championship')).toBeInTheDocument()
    expect(achievements.getByText('Promotion')).toBeInTheDocument()

    fireEvent.click(achievements.getByRole('button', { name: 'Near misses' }))

    expect(achievements.getByText('Grand final lost')).toBeInTheDocument()
    expect(achievements.getByText('Playoff collapse')).toBeInTheDocument()
    expect(achievements.queryByText('Championship')).not.toBeInTheDocument()
  })

  it('spells out the Hall of Fame criteria and the real hall status', () => {
    const { world } = buildCareer()
    const { container } = render(<CoachLegacyScreen world={world} />)
    const hof = panel(container, /Hall of Fame path/i)

    expect(hof.getByText('3+ championships')).toBeInTheDocument()
    expect(hof.getByText('5+ finals appearances')).toBeInTheDocument()
    expect(hof.getByText('10+ playoff appearances')).toBeInTheDocument()
    expect(hof.getByText('250+ career wins')).toBeInTheDocument()
    expect(hof.getByText('Eligible')).toBeInTheDocument()
    expect(hof.getByText('1 of 3')).toBeInTheDocument()
  })

  it('switches the comparison context and re-reads the percentiles', () => {
    const { world } = buildCareer()
    const { container } = render(<CoachLegacyScreen world={world} />)
    const comparison = panel(container, /Comparative standing/i)

    expect(comparison.getByText('Legacy score')).toBeInTheDocument()
    expect(comparison.getByText('Development impact')).toBeInTheDocument()
    expect(comparison.getByText('Top 30%')).toBeInTheDocument()

    fireEvent.click(comparison.getByRole('button', { name: 'All-time' }))
    expect(comparison.getAllByText('Bottom tier').length).toBeGreaterThan(0)
    expect(comparison.queryByText('Top 30%')).not.toBeInTheDocument()
  })

  it('keeps only era-defining moments in the legacy timeline', () => {
    const { world } = buildCareer()
    const { container } = render(<CoachLegacyScreen world={world} />)
    const timeline = panel(container, /Legacy timeline/i)

    expect(timeline.getByText('First appointment')).toBeInTheDocument()
    expect(timeline.getByText('Championship')).toBeInTheDocument()
    expect(timeline.getByText('Promotion')).toBeInTheDocument()
    expect(timeline.getByText('First grand final')).toBeInTheDocument()
  })

  it('routes the career affordances through onOpenTab', () => {
    const { world } = buildCareer()
    const onOpenTab = vi.fn()
    render(<CoachLegacyScreen world={world} onOpenTab={onOpenTab} />)

    fireEvent.click(screen.getByRole('button', { name: /^Career/ }))
    fireEvent.click(screen.getByRole('button', { name: /Full career history/ }))

    expect(onOpenTab).toHaveBeenCalledWith('career')
    expect(onOpenTab).toHaveBeenCalledTimes(2)
  })

  it('renders inert, without throwing, when the navigation callback is not wired', () => {
    const { world } = buildCareer()
    render(<CoachLegacyScreen world={world} />)

    for (const button of screen.getAllByRole('button')) {
      fireEvent.click(button)
    }

    expect(screen.getByText('First appointment')).toBeInTheDocument()
  })

  it('renders an empty state when no career is loaded', () => {
    render(<CoachLegacyScreen />)
    expect(screen.getByText('No career loaded.')).toBeInTheDocument()
  })
})
