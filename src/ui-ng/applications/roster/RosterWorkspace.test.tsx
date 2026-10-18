// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { injuryIdFromString, type PlayerId } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { getTeamLineup, getTeamRoster, updateGameWorld } from '@/domain/world'
import { getLineupSlotForPlayer } from '@/domain/tactics'
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
  localStorage.clear()
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
    expect(screen.getByText('PLAN')).toBeInTheDocument()
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

  it('renders a compact General view and allows optional columns without modifying Legacy',()=>{
    mountRosterWorkspace()
    const grid=screen.getByRole('region',{name:'Plantilla Courtside'})
    expect(grid.querySelectorAll('thead th')).toHaveLength(9)
    expect(grid.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    expect(screen.getByRole('columnheader',{name:/JUGADOR/})).toBeInTheDocument()
    expect(screen.queryByRole('columnheader',{name:'PTS'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:/COLUMNAS/}))
    expect(screen.getByRole('complementary',{name:'Editor de columnas'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox',{name:'PTS'}))
    expect(grid.querySelectorAll('thead th')).toHaveLength(10)
  })

  it('offers all eight canonical rating families and a separate statistics view',()=>{
    mountRosterWorkspace()
    const chooser=screen.getByLabelText('Todas las vistas de plantilla')
    for(const id of ['shooting','finishing','ballHandling','playmaking','offBall','defense','physical','brain','performance']) {
      expect(chooser.querySelector('option[value="'+id+'"]')).not.toBeNull()
    }
    fireEvent.change(chooser,{target:{value:'shooting'}})
    expect(screen.getByRole('columnheader',{name:/TIRO LIBRE/})).toBeInTheDocument()
    expect(screen.getByRole('columnheader',{name:/TRIPLE ESTÁTICO/})).toBeInTheDocument()
    fireEvent.change(chooser,{target:{value:'performance'}})
    expect(screen.getByRole('columnheader',{name:/PTS/})).toBeInTheDocument()
    expect(screen.queryByRole('columnheader',{name:/TRIPLE ESTÁTICO/})).not.toBeInTheDocument()
  })

  it('uses an accessible Courtside role picker and updates the canonical lineup',()=>{
    const {team}=mountRosterWorkspace()
    const world=useGameStore.getState().world!
    const player=getTeamRoster(world,team.id)[0]!
    const trigger=screen.getByRole('button',{name:`Rotación ${player.firstName} ${player.lastName}`})
    expect(trigger).toHaveAttribute('aria-expanded','false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded','true')
    expect(screen.getByRole('menu',{name:`Asignación de ${player.firstName} ${player.lastName}`})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitemradio',{name:'TITULAR PG'}))
    expect(getLineupSlotForPlayer(getTeamLineup(useGameStore.getState().world!,team.id)!,player.id)).toBe('PG')
  })

  it('keeps the column editor over the table without hiding the first rows',()=>{
    mountRosterWorkspace()
    fireEvent.click(screen.getByRole('button',{name:/COLUMNAS/}))
    expect(screen.getByRole('complementary',{name:'Editor de columnas'})).toBeInTheDocument()
    expect(document.querySelector('.courtside-roster-table thead')).toBeInTheDocument()
    expect(document.querySelector('.courtside-roster-table tbody tr')).toBeInTheDocument()
  })

  it('keeps the table full-width and opens an optional popup only on request', () => {
    const {world,team}=mountRosterWorkspace()
    expect(screen.getByRole('navigation',{name:'Secciones de plantilla'})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'PLANIFICAR'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'VER CALENDARIO'})).toBeNull()
    expect(document.querySelector('[data-ng-region="roster-v4-popup"]')).toBeNull()
    expect(document.querySelector('[data-ng-region="roster-context-deck"]')).toBeNull()
    expect(document.querySelector('.roster-depth-chart')).toBeNull()
    fireEvent.click(document.querySelector('.bdm-data-table tbody tr')!)
    expect(document.querySelector('[data-ng-region="roster-v4-popup"]')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:/INSPECTOR/}))
    expect(screen.getByRole('dialog',{name:'Inspector flotante de jugador'})).toBeInTheDocument()
    expect(screen.getByRole('complementary',{name:'Inspector del jugador'})).toBeInTheDocument()
    expect(screen.getByRole('complementary',{name:'Inspector del jugador'}).textContent)
      .toContain(world.players[team.rosterPlayerIds[0]!]!.lastName)
    fireEvent.pointerDown(document.querySelector('.roster-v4__metrics')!)
    expect(screen.queryByRole('dialog',{name:'Inspector flotante de jugador'})).not.toBeInTheDocument()
    expect(useRosterWorkspaceSession.getState().selectedRowIds).toHaveLength(1)
  })

  it('closes the inspector with Escape while keeping selection', () => {
    mountRosterWorkspace()
    fireEvent.click(document.querySelector('.bdm-data-table tbody tr')!)
    fireEvent.click(screen.getByRole('button',{name:/INSPECTOR/}))
    fireEvent.keyDown(document,{key:'Escape'})
    expect(screen.queryByRole('dialog',{name:'Inspector flotante de jugador'})).not.toBeInTheDocument()
    expect(useRosterWorkspaceSession.getState().selectedRowIds).toHaveLength(1)
  })
})

describe('RosterWorkspace session restoration', () => {
  it('preserves preset, search, selection, and position filter across unmount', () => {
    const {unmount}=mountRosterWorkspace()
    fireEvent.change(screen.getByLabelText('Todas las vistas de plantilla'),{target:{value:'psico'}})
    const rows=document.querySelectorAll('.bdm-data-table tbody tr')
    fireEvent.click(rows[0]!,{ctrlKey:true})
    fireEvent.click(rows[1]!,{ctrlKey:true})
    fireEvent.change(screen.getByLabelText('Buscar jugador en roster'),{target:{value:'mart'}})
    fireEvent.change(screen.getByLabelText('Posición del roster'),{target:{value:'SG'}})
    expect(useRosterWorkspaceSession.getState().activePreset).toBe('psico')
    expect(useRosterWorkspaceSession.getState().positionFilter).toBe('SG')
    expect(useRosterWorkspaceSession.getState().searchQuery).toBe('mart')
    expect(useRosterWorkspaceSession.getState().selectedRowIds.length).toBe(2)
    unmount()
    mountRosterWorkspace()
    expect(useRosterWorkspaceSession.getState().activePreset).toBe('psico')
    expect(screen.getByLabelText('Todas las vistas de plantilla')).toHaveValue('')
    expect(screen.getByLabelText('Posición del roster')).toHaveValue('SG')
    expect(screen.getByLabelText('Buscar jugador en roster')).toHaveValue('mart')
    expect(useRosterWorkspaceSession.getState().selectedRowIds).toHaveLength(2)
  })

  it('does not render embedded PlayerProfileApp panel', () => {
    mountRosterWorkspace()
    expect(document.querySelector('[data-ng-region="roster-player-panel"]')).not.toBeInTheDocument()
    expect(document.querySelector('.bdm-app-frame')).not.toBeInTheDocument()
  })

  it('shows source-backed briefing only when the Briefing tab is selected',()=>{
    mountRosterWorkspace()
    expect(document.querySelector('[data-ng-region="roster-briefing"]')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'BRIEFING'}))
    const briefing=document.querySelector('[data-ng-region="roster-briefing"]')
    expect(briefing).not.toBeNull()
    expect(briefing?.textContent).toMatch(/jugadores/i)
    expect(briefing?.textContent).toMatch(/sin rol/i)
  })

  it('turns the canonical lineup into live manager agenda progress',()=>{
    const {team}=mountRosterWorkspace()
    expect(screen.getByLabelText('Agenda del mánager')).toHaveTextContent('0/5')
    fireEvent.click(screen.getByRole('button',{name:'BRIEFING'}))
    const agenda=screen.getByRole('region',{name:'Decisiones del mánager'})
    expect(agenda).toHaveTextContent('0/5')
    fireEvent.click(screen.getByRole('button',{name:'GESTIONAR QUINTETO ↗'}))
    expect(screen.getByLabelText('Depth chart')).toBeInTheDocument()
    const world=useGameStore.getState().world!
    const guard=getTeamRoster(world,team.id).find(p=>p.basketball.primaryPosition==='PG')!
    fireEvent.click(screen.getByRole('button',{name:`Rotación ${guard.firstName} ${guard.lastName}`}))
    fireEvent.click(screen.getByRole('menuitemradio',{name:'TITULAR PG'}))
    fireEvent.click(screen.getByRole('button',{name:'BRIEFING'}))
    expect(screen.getByRole('region',{name:'Decisiones del mánager'})).toHaveTextContent('1/5')
    expect(getLineupSlotForPlayer(getTeamLineup(useGameStore.getState().world!,team.id)!,guard.id)).toBe('PG')
  })

  it('saves a planning priority as a local manager intention without making a signing',()=>{
    const {unmount,team}=mountRosterWorkspace()
    const before=useGameStore.getState().world!
    fireEvent.click(screen.getByRole('button',{name:'PLANIFICAR'}))
    const pg=screen.getByRole('group',{name:'Prioridad del mánager en PG'})
    fireEvent.click(pg.querySelector<HTMLButtonElement>('button:last-child')!)
    expect(pg.querySelector('button:last-child')).toHaveAttribute('aria-pressed','true')
    expect(useGameStore.getState().world).toBe(before)
    fireEvent.click(screen.getByRole('button',{name:'BRIEFING'}))
    expect(screen.getByRole('region',{name:'Decisiones del mánager'}))
      .toHaveTextContent('PG · Estudiar refuerzo')
    unmount()
    mountRosterWorkspace(before)
    fireEvent.click(screen.getByRole('button',{name:'PLANIFICAR'}))
    expect(screen.getByRole('group',{name:'Prioridad del mánager en PG'})
      .querySelector('button:last-child')).toHaveAttribute('aria-pressed','true')
    expect(useGameStore.getState().world!.teams[team.id].rosterPlayerIds).toEqual(before.teams[team.id].rosterPlayerIds)
  })

  it('opens contractual planning with real roster players, not fictitious signings',()=>{
    const {world,team}=mountRosterWorkspace()
    fireEvent.click(screen.getByRole('button',{name:'PLANIFICAR'}))
    expect(screen.getByRole('heading',{name:'PLANIFICAR PLANTILLA'})).toBeInTheDocument()
    expect(document.querySelectorAll('.roster-v4-planning__table tbody tr').length).toBe(team.rosterPlayerIds.length)
    const player=world.players[team.rosterPlayerIds[0]!]!
    expect(screen.getByText(player.firstName+' '+player.lastName)).toBeInTheDocument()
  })

  it('updates the canonical starting lineup from the Courtside depth selector',()=>{
    const {team}=mountRosterWorkspace()
    const world=useGameStore.getState().world!
    const guard=getTeamRoster(world,team.id).find(player=>player.basketball.primaryPosition==='PG')!
    fireEvent.click(screen.getByRole('button',{name:'PROFUNDIDAD'}))
    fireEvent.click(screen.getByRole('button',{name:`Rotación ${guard.firstName} ${guard.lastName}`}))
    fireEvent.click(screen.getByRole('menuitemradio',{name:'TITULAR PG'}))
    const updated=useGameStore.getState().world!
    expect(getLineupSlotForPlayer(getTeamLineup(updated,team.id)!,guard.id)).toBe('PG')
    expect(screen.getByLabelText('Depth chart').textContent).toContain('TITULAR')
  })

  it('renders a position depth chart whose counts match the live roster', () => {
    const { team, world } = mountRosterWorkspace()
    fireEvent.click(screen.getByRole('button',{name:'PROFUNDIDAD'}))
    const chart = screen.getByLabelText('Depth chart')
    expect(chart).toBeInTheDocument()
    expect(chart).toHaveTextContent(`${team.rosterPlayerIds.length} jugadores`)
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
    const meters=[...chart.querySelectorAll('.roster-depth-chart__meter')]
    expect(meters).toHaveLength(5)
    expect(screen.getByLabelText('Leyenda de distribución de roles')).toHaveTextContent('Titulares')
    for (const meter of meters) {
      expect(meter.querySelector('.is-starter')).toHaveStyle({width:'0%'})
      expect(meter.querySelector('.is-bench')).toHaveStyle({width:'0%'})
      expect(meter.querySelector('.is-unassigned')).toHaveStyle({width:'100%'})
    }
    expect(chart.querySelector('.roster-depth-chart__rank')?.textContent).toBe('·')
  })

  it('divides a lane meter by all players, not by assigned players only',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const guards=getTeamRoster(world,team.id).filter(p=>p.basketball.primaryPosition==='PG')
    expect(guards.length).toBeGreaterThan(1)
    const assigned=setLineupSlot(world,team.id,'B1',guards[0]!.id)
    mountRosterWorkspace(assigned)
    fireEvent.click(screen.getByRole('button',{name:'PROFUNDIDAD'}))
    const lanes=[...screen.getByLabelText('Depth chart').querySelectorAll('.roster-depth-chart__lane')]
    const guardLane=lanes.find(l=>l.querySelector('.roster-depth-chart__pos')?.textContent==='PG')!
    const meter=guardLane.querySelector('.roster-depth-chart__meter')!
    const benchPercent=(1/guards.length)*100
    const unassignedPercent=((guards.length-1)/guards.length)*100
    expect(meter.querySelector('.is-starter')).toHaveStyle({width:'0%'})
    expect(meter.querySelector('.is-bench')).toHaveStyle({width:`${benchPercent}%`})
    expect(meter.querySelector('.is-unassigned')).toHaveStyle({width:`${unassignedPercent}%`})
    expect(meter.getAttribute('aria-label')).toContain(`1 en banquillo y ${guards.length-1} sin asignar`)
    expect(guardLane.querySelector('.roster-v4-depth__summary')).toHaveTextContent('BANQUILLO 1')
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
    fireEvent.click(screen.getByRole('button',{name:'PROFUNDIDAD'}))
    const chart = screen.getByLabelText('Depth chart')
    const pgLane = [...chart.querySelectorAll('.roster-depth-chart__lane')].find(
      (lane) => lane.querySelector('.roster-depth-chart__pos')?.textContent === 'PG',
    )
    expect(pgLane).toHaveClass('has-roles')
    expect(pgLane?.textContent).toContain('TITULAR')
    expect(pgLane?.textContent).not.toContain('FREE')
    expect(pgLane?.querySelector(`[data-player-id="${starter.id}"]`)?.querySelector('.roster-depth-chart__rank')?.textContent).toBe('T')
    if (rotation !== undefined) {
      expect(pgLane?.textContent).toContain('ROTACIÓN')
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

    expect(screen.getByRole('region',{name:'Plantilla Courtside'})).toBeInTheDocument()

    act(() => {
      navigateToPlayerFromRoster(playerId)
    })

    await waitFor(() => {
      expect(screen.queryByRole('region',{name:'Plantilla Courtside'})).not.toBeInTheDocument()
    })
    // The player workspace also renders the BS15H talent navigation ("Talent operations"), which has its own Overview entry;
    // the player's own Overview view tab must still be present exactly once outside it.
    const playerOverviewTabs = screen.getAllByRole('button', { name: 'Overview' }).filter((button) => button.closest('nav[aria-label="Talent operations"]') === null)
    expect(playerOverviewTabs).toHaveLength(1)
  })
})
