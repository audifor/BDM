// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { injuryIdFromString, type PlayerId } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { CanonicalRoster } from '@/ui/pcb-migrated/plantilla/CanonicalRoster'
import { buildLargeRosterTestWorld } from '@/ui-ng/applications/roster/buildLargeRosterTestWorld'
import { RosterWorkspace } from '@/ui-ng/applications/roster/RosterWorkspace'
import { buildRosterWorkspaceContext } from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import { useRosterWorkspaceSession } from '@/ui-ng/applications/roster/rosterWorkspaceSession'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { WorkspaceHost } from '@/ui-ng/workspace/WorkspaceHost'
import { navigateToPlayerFromRoster } from '@/ui-ng/workspace/workspaceApps'

afterEach(cleanup)

beforeEach(() => {
  useRosterWorkspaceSession.getState().reset()
  window.history.replaceState({}, '', '/?ui=ng&app=roster')
})

function mountRosterWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <RosterWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

function withInjury(
  world: ReturnType<typeof createNewGame>,
  playerId: PlayerId,
) {
  const injury = createInjury({
    id: injuryIdFromString('injury-roster-test'),
    playerId,
    kind: 'ankleSprain',
    severity: 'moderate',
    injuredOn: world.currentDate,
    expectedReturnDate: '2099-01-01' as never,
  })
  return updateGameWorld(world, {
    injuries: [...Object.values(world.injuriesById), injury],
  })
}

describe('buildRosterWorkspaceContext', () => {
  it('builds team and season context from the live world', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const context = buildRosterWorkspaceContext(world)

    expect(context).not.toBeNull()
    expect(context?.teamName).toBe(team.name)
    expect(context?.rosterCount).toBe(team.rosterPlayerIds.length)
    expect(context?.competitionLabel).toBeTruthy()
    expect(context?.seasonLabel).toBeTruthy()
  })
})

describe('CanonicalRoster NG variant', () => {
  it('renders preset selector without legacy-only sub-view controls', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    render(
      createElement(CanonicalRoster, {
        team,
        variant: 'ng',
        world,
      }),
    )

    expect(screen.getByLabelText('Preset de columnas')).toBeInTheDocument()
    expect(screen.queryByLabelText('Vista')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar jugador')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search grid')).toBeInTheDocument()
  })

  it('shows real injury status instead of hardcoded OK when injured', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const injuredWorld = withInjury(world, playerId)

    render(
      createElement(CanonicalRoster, {
        team,
        variant: 'legacy',
        world: injuredWorld,
      }),
    )

    expect(screen.getByText('Out')).toBeInTheDocument()
  })

  it('renders position filter and contract expiry in NG session mode', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    render(
      createElement(CanonicalRoster, {
        team,
        variant: 'ng',
        world,
        sessionBridge: {
          activePreset: 'general',
          onActivePresetChange: vi.fn(),
          searchQuery: '',
          onSearchQueryChange: vi.fn(),
          positionFilter: 'ALL',
          onPositionFilterChange: vi.fn(),
          selectedRowIds: [],
          onSelectedRowIdsChange: vi.fn(),
        },
      }),
    )

    expect(screen.getByLabelText('Filtro de posición')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /EXP/i })).toBeInTheDocument()
  })
})

describe('RosterWorkspace session restoration', () => {
  it('preserves preset, search, selection, and position filter across unmount', () => {
    const { unmount } = mountRosterWorkspace()

    fireEvent.change(screen.getByLabelText('Preset de columnas'), { target: { value: 'psico' } })

    const rows = document.querySelectorAll('.bdm-data-table tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(rows[0]!, { ctrlKey: true })
    fireEvent.click(rows[1]!, { ctrlKey: true })

    fireEvent.change(screen.getByLabelText('Search grid'), { target: { value: 'mart' } })
    fireEvent.change(screen.getByLabelText('Filtro de posición'), { target: { value: 'SG' } })

    expect(useRosterWorkspaceSession.getState().activePreset).toBe('psico')
    expect(useRosterWorkspaceSession.getState().positionFilter).toBe('SG')
    expect(useRosterWorkspaceSession.getState().searchQuery).toBe('mart')
    expect(useRosterWorkspaceSession.getState().selectedRowIds.length).toBe(2)

    unmount()

    mountRosterWorkspace()

    expect((screen.getByLabelText('Preset de columnas') as HTMLSelectElement).value).toBe('psico')
    expect((screen.getByLabelText('Filtro de posición') as HTMLSelectElement).value).toBe('SG')
    expect((screen.getByLabelText('Search grid') as HTMLInputElement).value).toBe('mart')
    expect(useRosterWorkspaceSession.getState().selectedRowIds.length).toBe(2)
  })

  it('does not render embedded PlayerProfileApp panel', () => {
    mountRosterWorkspace()
    expect(document.querySelector('[data-ng-region="roster-player-panel"]')).not.toBeInTheDocument()
    expect(document.querySelector('.bdm-app-frame')).not.toBeInTheDocument()
  })
})

describe('navigateToPlayerFromRoster', () => {
  it('uses pushState and encodes player workspace URL', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const playerId = 'player:test-roster-nav' as PlayerId

    navigateToPlayerFromRoster(playerId)

    expect(pushState).toHaveBeenCalled()
    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('player')
    expect(url.searchParams.get('playerId')).toBe(playerId)
    expect(url.searchParams.get('playerView')).toBeNull()
    expect(url.searchParams.get('rosterPlayer')).toBeNull()
  })
})

describe('large roster fixture', () => {
  it('builds at least 25 roster rows for scroll and density validation', () => {
    const world = buildLargeRosterTestWorld(25)
    const team = getUserTeam(world)!
    expect(team.rosterPlayerIds.length).toBeGreaterThanOrEqual(25)
  })
})

describe('WorkspaceHost player navigation', () => {
  it('switches from roster to player workspace without embedded panel', async () => {
    const world = createNewGame()
    useGameStore.getState().replaceWorld(world)
    const playerId = getUserTeam(world)!.rosterPlayerIds[0]!

    render(
      <NgWorkspaceNavigationProvider>
        <WorkspaceHost />
      </NgWorkspaceNavigationProvider>,
    )

    expect(screen.getByLabelText('Preset de columnas')).toBeInTheDocument()

    act(() => {
      navigateToPlayerFromRoster(playerId)
    })

    await waitFor(() => {
      expect(screen.queryByLabelText('Preset de columnas')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
  })
})
