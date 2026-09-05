// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
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

  it('builds context for a requested rival team instead of the user club', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const rival = Object.values(world.teams).find((team) => team.id !== userTeam.id)!
    const context = buildRosterWorkspaceContext(world, rival.id)

    expect(context?.teamName).toBe(rival.name)
    expect(context?.teamName).not.toBe(userTeam.name)
    expect(context?.rosterCount).toBe(rival.rosterPlayerIds.length)
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
    expect(screen.getByPlaceholderText('Buscar jugador...')).toBeInTheDocument()
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

    expect(screen.getByText('OUT')).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'TODOS' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('columnheader', { name: /EXP/i })).toBeInTheDocument()
    expect(screen.queryByText(/seleccionados/)).not.toBeInTheDocument()
  })

  it('opens a leftover inspector with basic player data when a row is selected', () => {
    const { team, world } = mountRosterWorkspace()
    const player = world.players[team.rosterPlayerIds[0]!]!

    expect(document.querySelector('[data-ng-region="roster-row-inspector"]')).toBeNull()

    fireEvent.click(document.querySelector('.bdm-data-table tbody tr')!)

    const inspector = screen.getByRole('complementary', { name: 'Inspector del jugador' })
    expect(inspector).toHaveClass('canonical-roster__inspector')
    expect(inspector.textContent).toContain(player.firstName)
    expect(inspector.textContent).toContain(player.lastName)
    expect(inspector.textContent).toContain(String(player.bio.heightCm))
    expect(inspector.textContent).toContain(String(player.bio.wingspanCm))
    expect(inspector.querySelector('.canonical-roster__inspector-identity')?.textContent).toMatch(
      /Age.*Height.*Weight.*Wingspan/s,
    )
    expect(inspector.querySelector('.canonical-roster__inspector-production')?.textContent).toMatch(
      /PTS.*REB.*AST.*MIN.*VAL/s,
    )
    expect(inspector.textContent).not.toContain('+/-')
    expect(inspector.querySelector('.canonical-roster__inspector-signals')).toBeNull()
    expect(inspector.textContent).not.toMatch(/\bFIN\b/)

    const dossier = screen.getByRole('complementary', { name: 'Dossier del jugador' })
    expect(dossier.textContent).toContain('CONTRACT')
    expect(dossier.textContent).toContain('STATUS')
    expect(dossier.textContent).toContain('NOTES')
    expect(dossier.querySelector('.roster-inspector-dossier__measures')).not.toBeNull()
    expect(dossier.querySelector('.canonical-roster__inspector-measure-label')?.textContent).toMatch(
      /Status|Availability|Scouting/i,
    )
    expect(dossier.textContent).not.toContain('El staff no ha emitido comentarios sobre este jugador.')
    expect(dossier.querySelector('[data-zone="staff"]')).toBeNull()
    expect(document.querySelector('[data-ng-region="roster-briefing"]')).toBeNull()

    const depthRow = document.querySelector(`[data-player-id="${player.id}"]`)
    expect(depthRow).toHaveClass('is-selected')
    expect(depthRow?.closest('.roster-depth-chart__lane')).toHaveClass('is-selected')
    expect(depthRow?.querySelector('.roster-depth-chart__rank')?.textContent).toMatch(/^\d+$/)
  })

  it('hides the leftover inspector when the same row is clicked again', () => {
    mountRosterWorkspace()
    const row = document.querySelector('.bdm-data-table tbody tr')!

    fireEvent.click(row)
    expect(screen.getByRole('complementary', { name: 'Inspector del jugador' })).toBeInTheDocument()

    fireEvent.click(row)
    expect(screen.queryByRole('complementary', { name: 'Inspector del jugador' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Dossier del jugador' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-ng-region="roster-row-inspector"]')).toBeNull()
    expect(document.querySelector('[data-ng-region="roster-inspector-dossier"]')).toBeNull()
    expect(document.querySelector('[data-ng-region="roster-briefing"]')).not.toBeNull()
    expect(document.querySelector('.roster-depth-chart__row.is-selected')).toBeNull()
    expect(document.querySelector('.roster-depth-chart__lane.is-selected')).toBeNull()
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

    fireEvent.change(screen.getByPlaceholderText('Buscar jugador...'), { target: { value: 'mart' } })
    fireEvent.click(screen.getByRole('button', { name: 'SG' }))

    expect(useRosterWorkspaceSession.getState().activePreset).toBe('psico')
    expect(useRosterWorkspaceSession.getState().positionFilter).toBe('SG')
    expect(useRosterWorkspaceSession.getState().searchQuery).toBe('mart')
    expect(useRosterWorkspaceSession.getState().selectedRowIds.length).toBe(2)

    unmount()

    mountRosterWorkspace()

    expect((screen.getByLabelText('Preset de columnas') as HTMLSelectElement).value).toBe('psico')
    expect(screen.getByRole('button', { name: 'SG' })).toHaveAttribute('aria-pressed', 'true')
    expect((screen.getByPlaceholderText('Buscar jugador...') as HTMLInputElement).value).toBe('mart')
    expect(useRosterWorkspaceSession.getState().selectedRowIds.length).toBe(2)
  })

  it('does not render embedded PlayerProfileApp panel', () => {
    mountRosterWorkspace()
    expect(document.querySelector('[data-ng-region="roster-player-panel"]')).not.toBeInTheDocument()
    expect(document.querySelector('.bdm-app-frame')).not.toBeInTheDocument()
  })

  it('fills the leftover space with a roster briefing when no row is selected', () => {
    mountRosterWorkspace()
    const briefing = document.querySelector('[data-ng-region="roster-briefing"]')
    expect(briefing).not.toBeNull()
    expect(briefing?.textContent).toMatch(/jugadores/i)
    expect(briefing?.textContent).toMatch(/sin rol/i)
    expect(briefing?.textContent).toMatch(/Scouting conocido/i)
    expect(briefing?.textContent).toMatch(/Target 2–3/)
    expect(briefing?.textContent).toMatch(/Balanced|Thin|Shortage|Overload|Critical/)
    expect(document.querySelector('.roster-briefing__lane')).not.toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Inspector del jugador' })).not.toBeInTheDocument()
  })

  it('renders a position depth chart whose counts match the live roster', () => {
    const { team, world } = mountRosterWorkspace()
    const chart = screen.getByLabelText('Depth chart')
    expect(chart).toBeInTheDocument()
    expect(chart).toHaveTextContent(`${team.rosterPlayerIds.length} players`)
    expect(chart.querySelector('.canonical-roster__player-link')).toBeInTheDocument()

    const lanes = [...chart.querySelectorAll('.roster-depth-chart__lane')]
    expect(lanes.map((lane) => lane.querySelector('.roster-depth-chart__pos')?.textContent)).toEqual([
      'PG',
      'SG',
      'SF',
      'PF',
      'C',
    ])
    for (const lane of lanes) {
      const position = lane.querySelector('.roster-depth-chart__pos')?.textContent
      const expected = team.rosterPlayerIds.filter((playerId) => {
        const player = world.players[playerId]
        return player?.basketball.primaryPosition === position
      }).length
      expect(lane.querySelector('.roster-depth-chart__count')?.textContent).toBe(String(expected))
    }
    expect(chart.textContent).not.toMatch(/FREE/)
    expect(chart.querySelector('.roster-depth-chart__group')).toBeNull()
    expect(chart.querySelector('.roster-depth-chart__meter')).toBeNull()
    expect(chart.querySelector('.roster-depth-chart__rank')?.textContent).toBe('1')
  })

  it('groups assigned lineup slots into BDM depth bands', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const roster = team.rosterPlayerIds.map((playerId) => world.players[playerId]!)
    const starter = roster.find((player) => player.basketball.primaryPosition === 'PG')!
    const rotation = roster.find(
      (player) => player.basketball.primaryPosition === 'PG' && player.id !== starter.id,
    )
    let assigned = setLineupSlot(world, team.id, 'PG', starter.id)
    if (rotation !== undefined) {
      assigned = setLineupSlot(assigned, team.id, 'B1', rotation.id)
    }

    mountRosterWorkspace(assigned)
    const chart = screen.getByLabelText('Depth chart')
    const pgLane = [...chart.querySelectorAll('.roster-depth-chart__lane')].find(
      (lane) => lane.querySelector('.roster-depth-chart__pos')?.textContent === 'PG',
    )
    expect(pgLane).toHaveClass('has-roles')
    expect(pgLane?.textContent).toContain('STARTER')
    expect(pgLane?.textContent).not.toContain('FREE')
    expect(pgLane?.querySelector(`[data-player-id="${starter.id}"]`)?.querySelector('.roster-depth-chart__rank')?.textContent).toBe('1')
    if (rotation !== undefined) {
      expect(pgLane?.textContent).toContain('ROTATION')
    }
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
