// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { useGameStore } from '@/stores/gameStore'
import { TeamWorkspace } from '@/ui-ng/applications/team/TeamWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng')
  useGameStore.getState().resetGame()
})

function renderTeamWorkspace(world: GameWorld | null, teamId: string) {
  window.history.replaceState({}, '', `/?ui=ng&app=team&teamId=${encodeURIComponent(teamId)}`)
  if (world !== null) {
    useGameStore.getState().replaceWorld(world)
  }
  return render(
    <NgWorkspaceNavigationProvider>
      <TeamWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
}

function currentSearchParams() {
  return new URL(window.location.href).searchParams
}

function tabButton(name: string) {
  const tabs = document.querySelector('.ng-workspace-tabs')
  expect(tabs).not.toBeNull()
  return within(tabs as HTMLElement).getByRole('button', { name })
}

function headerAction(name: string) {
  const header = document.querySelector('.team-header')
  expect(header).not.toBeNull()
  return within(header as HTMLElement).getByRole('button', { name })
}

const USER_TEAM_ID = 'generated-team-0001' as TeamId
const TEAM_WITHOUT_COACH_ID = 'generated-team-0002' as TeamId

describe('TeamWorkspace', () => {
  it('shows the requested team header, tabs and Team Details from the world', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, USER_TEAM_ID)

    expect(screen.getByRole('heading', { name: 'Dunmere Orbits' })).toBeInTheDocument()
    expect(screen.getByText('Virelia Horizon League · 2032-10-01 to 2033-06-30')).toBeInTheDocument()

    expect(screen.getByText('Team Details')).toBeInTheDocument()
    const factRows = [...document.querySelectorAll<HTMLElement>('.team-fact')]
    const factValue = (label: string) =>
      factRows
        .find((row) => row.querySelector('.team-fact__label')?.textContent === label)
        ?.querySelector('.team-fact__value')?.textContent ?? null
    expect(factValue('Country')).toBe('Virelia')
    expect(factValue('Gender')).toBe('Men')
    expect(factValue('Ecosystem')).toBe('Virelia Basketball Federation')
    expect(factValue('Roster')).toBe('12')
    expect(factValue('Staff')).toBe('3')
  })

  it('keeps tabs prepared: Overview and Roster usable, future tabs disabled without content', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, USER_TEAM_ID)

    const overview = tabButton('Overview')
    expect(overview).not.toBeDisabled()
    expect(overview).toHaveAttribute('aria-current', 'page')

    const roster = tabButton('Roster')
    expect(roster).not.toBeDisabled()

    for (const tabName of ['Staff', 'Tactics', 'Schedule', 'Results', 'Competitions', 'Finances', 'Facilities', 'History']) {
      expect(tabButton(tabName)).toBeDisabled()
    }
  })

  it('navigates to the Roster app from the Roster tab', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, USER_TEAM_ID)

    fireEvent.click(tabButton('Roster'))
    expect(currentSearchParams().get('app')).toBe('roster')
    expect(currentSearchParams().get('teamId')).toBe(USER_TEAM_ID)
  })

  it('navigates to the Roster app from the header action', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, USER_TEAM_ID)

    fireEvent.click(headerAction('Roster'))
    expect(currentSearchParams().get('app')).toBe('roster')
    expect(currentSearchParams().get('teamId')).toBe(USER_TEAM_ID)
  })

  it('renders Key People and navigates from a person to the Staff app', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, USER_TEAM_ID)

    expect(screen.getByText('Key People')).toBeInTheDocument()
    const scout = screen.getByRole('button', { name: 'Daro Elian' })
    expect(scout).toBeInTheDocument()
    expect(screen.getByText('ASSISTANT COACH')).toBeInTheDocument()

    fireEvent.click(scout)
    expect(currentSearchParams().get('app')).toBe('staff')
    expect(currentSearchParams().get('staffId')).toBe('generated-staff-generated-team-0001-scout-001')
    expect(currentSearchParams().get('teamId')).toBeNull()
  })

  it('shows the user head coach and navigates to the Coach profile when it is the user', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, USER_TEAM_ID)

    const coach = screen.getByRole('button', { name: 'Jora Dain' })
    expect(coach).toBeInTheDocument()
    expect(screen.getByText('Head Coach')).toBeInTheDocument()

    fireEvent.click(coach)
    expect(currentSearchParams().get('app')).toBe('coach')
  })

  it('navigates from a competition to the Competition app', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, USER_TEAM_ID)

    const rail = document.querySelector('.team-overview__rail')
    expect(rail).not.toBeNull()
    expect(within(rail as HTMLElement).getByText('Competition')).toBeInTheDocument()
    const competition = screen.getByRole('button', { name: 'Virelia Horizon League' })
    expect(competition).toBeInTheDocument()
    expect(screen.getByText('Current season')).toBeInTheDocument()

    fireEvent.click(competition)
    expect(currentSearchParams().get('app')).toBe('competition')
    expect(currentSearchParams().get('competitionId')).toBe('generated-competition-0001')
    expect(currentSearchParams().get('teamId')).toBeNull()
  })

  it('hides optional blocks that have no real data yet', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, USER_TEAM_ID)

    expect(screen.queryByText('Recent Results')).not.toBeInTheDocument()
    expect(screen.queryByText('Honours')).not.toBeInTheDocument()
    expect(screen.queryByText('Form')).not.toBeInTheDocument()
  })

  it('does not render a Head Coach row when the team has none', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, TEAM_WITHOUT_COACH_ID)

    expect(screen.getByRole('heading', { name: 'Highridge Lanterns' })).toBeInTheDocument()
    expect(screen.queryByText('Head Coach')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cira Dain' })).toBeInTheDocument()
  })

  it('shows a coherent empty state for a non-existent team', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, 'team:missing-team')

    expect(screen.getByText('Team not found')).toBeInTheDocument()
    expect(screen.getByText('This team does not exist in the current world.')).toBeInTheDocument()
  })

  it('shows a coherent empty state without a loaded world', () => {
    renderTeamWorkspace(null, USER_TEAM_ID)

    expect(screen.getByText('Team not found')).toBeInTheDocument()
    expect(screen.getByText('There is no active game world to inspect yet.')).toBeInTheDocument()
  })

  it('keeps the current screen when clicking a disabled future tab', () => {
    const world = createNewGame()
    renderTeamWorkspace(world, USER_TEAM_ID)

    fireEvent.click(screen.getByRole('button', { name: 'Finances' }))
    expect(currentSearchParams().get('app')).toBe('team')
    expect(screen.getByRole('heading', { name: 'Dunmere Orbits' })).toBeInTheDocument()
  })
})
