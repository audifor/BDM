// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamLineup } from '@/domain/world'
import { getLineupAssignments } from '@/domain/tactics'
import { rebalanceRotationSlider } from '@/ui-ng/applications/tactics/CourtsideTacticsPanels'
import { useGameStore } from '@/stores/gameStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { TacticsWorkspace } from '@/ui-ng/applications/tactics/TacticsWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=tactics')
  useGameStore.getState().resetGame()
  useTacticalPlanStore.getState().reset()
})

function mountTacticsWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <TacticsWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

describe('TacticsWorkspace', () => {
  it('shows an empty state when no world is loaded', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <TacticsWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Tactics' })).toBeInTheDocument()
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('clones the five canonical tactics surfaces under NG chrome', () => {
    const { team } = mountTacticsWorkspace()
    expect(screen.getByText(team.name, { selector: '.tactics-workspace-header__team' })).toBeInTheDocument()
    for (const label of ['Pizarra', 'Emparejamientos', 'Rotaciones', 'PLAN DE PARTIDO']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Diseñador' })).not.toBeInTheDocument()
    for (const mode of ['PREPARAR','DISEÑAR','ANALIZAR']) {
      expect(screen.getByRole('button', { name: mode })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Jugadas' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Tácticas PCB migradas')).toHaveClass('pcb-tactics--ng')
    expect(document.querySelector('.pcb-tactics__tabs')).toBeNull()
  })

  it('keeps Pizarra and Diseñador immediately below the workspace tabs without duplicate page headers', () => {
    mountTacticsWorkspace()
    expect(document.querySelector('.ct-page__head')).toBeNull()
    expect(screen.queryByLabelText('Resumen táctico')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Tácticas PCB migradas')).toHaveClass('pcb-tactics--ng')

    fireEvent.click(screen.getByRole('button', { name: 'DISEÑAR' }))
    expect(document.querySelector('.ct-page__head')).toBeNull()
    expect(screen.queryByLabelText('Resumen táctico')).not.toBeInTheDocument()
    expect(document.querySelector('.pcb-tactics-creator__court')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Emparejamientos' }))
    expect(screen.getByLabelText('Resumen táctico')).toBeInTheDocument()
    expect(document.querySelector('.ct-page__head')).toBeNull()
  })

  it('opens a Courtside role popover with player-specific fit and real duties', () => {
    mountTacticsWorkspace()
    const first = document.querySelector('.tactics-board-player') as HTMLElement
    expect(first).toBeTruthy()
    fireEvent.contextMenu(first, {clientX:400, clientY:300})
    const dialog = screen.getByRole('dialog', {name:'Roles tácticos del jugador'})
    expect(dialog).toBeInTheDocument()
    expect(dialog.textContent).toContain('ENCAJE SEGÚN RATINGS REALES')
    expect(dialog.textContent).toContain('TAREA DEL JUGADOR')
    expect(dialog.querySelectorAll('.tactics-board-context-item')).toHaveLength(8)
    expect(dialog.querySelector('.tactics-board-context-bar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name:'Cerrar roles tácticos'}))
    expect(screen.queryByRole('dialog', {name:'Roles tácticos del jugador'})).not.toBeInTheDocument()
  })

  it('uses light/dark-adaptive vector colors for all designer movement types', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'DISEÑAR' }))
    const court = document.querySelector('.pcb-tactics-creator__court')!
    expect(court.querySelector('#arrow-white path')?.getAttribute('fill')).toContain('--ct-draw-cut')
    expect(court.querySelector('#arrow-blue path')?.getAttribute('fill')).toContain('--ct-draw-dribble')
    expect(court.querySelector('#arrow-yellow path')?.getAttribute('fill')).toContain('--ct-draw-pass')
    expect(court.querySelector('g[stroke*="--ct-draw-court"]')).toBeTruthy()
  })

  it('keeps all six offensive settings and the save action accessible on Pizarra', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'ATAQUE' }))
    for (const heading of [
      'SISTEMA (PLAYBOOK)', 'ESPACIADO (SPACING)', 'FRECUENCIA P&R',
      'VOLUMEN TRIPLES', 'RIESGO EN EL PASE', 'REBOTE OFENSIVO',
    ]) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'GUARDAR AJUSTES' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'DEFENSA' }))
    expect(screen.getByText('PROTECCION DE ARO')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GUARDAR AJUSTES' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'GENERAL' }))
    expect(screen.getByText('LIBERTAD CREATIVA')).toBeInTheDocument()
  })

  it('keeps the Designer court operable with a Courtside action and step workspace', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'DISEÑAR' }))
    expect(screen.getByText('CONTROL DE JUGADA')).toBeInTheDocument()
    expect(screen.getByText('SECUENCIA DE LA JUGADA')).toBeInTheDocument()
    expect(screen.getByText('HERRAMIENTA ACTIVA')).toBeInTheDocument()
    expect(document.querySelector('.pcb-tactics-creator__workarea')).toBeInTheDocument()
    expect(document.querySelector('.pcb-tactics-creator__court')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AÑADIR PASO' }))
    expect(screen.getByRole('button', { name: /PASO 2/ })).toBeInTheDocument()
    expect(screen.queryByText('2 acciones')).not.toBeInTheDocument()
  })

  it('uses actual roster information in the Tactical Lab and adds an editable movement to the saved play', () => {
    const { team } = mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'DISEÑAR' }))
    fireEvent.click(screen.getByRole('button', { name: 'ANALIZAR' }))
    expect(screen.getByTestId('tactical-lab')).toBeInTheDocument()
    const playerSelect = screen.getByLabelText('Jugador del laboratorio') as HTMLSelectElement
    const firstPlayer = Array.from(playerSelect.options).find(option => option.value !== '')?.value
    expect(firstPlayer).toBeTruthy()
    fireEvent.change(playerSelect, { target: { value: firstPlayer } })
    expect(screen.getByLabelText('Zonas de lanzamiento').querySelectorAll('button')).toHaveLength(9)

    fireEvent.click(screen.getByRole('button', { name: /2 SG/ }))
    expect(screen.getByRole('button', { name: 'AÑADIR CORTE A LA JUGADA' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'AÑADIR CORTE A LA JUGADA' }))

    expect(screen.getByText('ACCIONES DEL PASO 1')).toBeInTheDocument()
    expect(screen.getByText('MOVE')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    const world = useGameStore.getState().world!
    const saved = Object.values(world.savedPlaysById)
    expect(saved.length).toBeGreaterThan(0)
    const frames = saved[saved.length - 1]!.frames as Array<{ paths: Array<{ type:string; linkedId?:number }> }>
    expect(frames[0]?.paths[0]).toMatchObject({ type: 'move', linkedId: 2 })
    expect(team.id).toBeTruthy()
  })

  it('keeps an unsaved play intact when switching between unified Pizarra modes', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'DISEÑAR' }))
    fireEvent.click(screen.getByRole('button', { name: 'AÑADIR PASO' }))
    expect(screen.getByRole('button', { name: /PASO 2/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'PREPARAR' }))
    expect(screen.getByText('SIN ASIGNAR')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ANALIZAR' }))
    expect(screen.getByTestId('tactical-lab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'DISEÑAR' }))
    expect(screen.getByRole('button', { name: /PASO 2/ })).toBeInTheDocument()
  })

  it('assigns a real starting player from Analyse to the shared board lineup', () => {
    const { team } = mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'ANALIZAR' }))
    const select = screen.getByLabelText('Jugador del laboratorio') as HTMLSelectElement
    const value = Array.from(select.options).find(option => option.value !== '')?.value
    expect(value).toBeTruthy()
    fireEvent.change(select, {target: {value}})
    const state = useGameStore.getState().world!
    expect(getTeamLineup(state, team.id).starters.PG).toBe(value)
    fireEvent.click(screen.getByRole('button', { name: 'PREPARAR' }))
    expect(getTeamLineup(useGameStore.getState().world!,team.id).starters.PG).toBe(value)
  })

  it('renders one-line rival rows without repeated empty scouting messages', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Emparejamientos' }))
    expect(document.querySelectorAll('.ct-rival small')).toHaveLength(0)
    expect(screen.queryByText('Sin amenaza confirmada')).not.toBeInTheDocument()
    for (const row of document.querySelectorAll('.ct-rival')) {
      expect(row.querySelector('.ct-rival__name')).toBeTruthy()
      expect(row.querySelector('.ct-rival__def')).toBeTruthy()
    }
  })

  it('renders Courtside defensive duels without inventing rival ratings', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Emparejamientos' }))
    expect(screen.getByRole('heading', { name: 'CARA A CARA' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ASIGNACIÓN DEFENSIVA' })).toBeInTheDocument()
    expect(document.querySelector('[data-courtside-tactics-screen="matchups"]')).toBeInTheDocument()
    expect(screen.queryByText('CONTRASTE ILUSTRATIVO')).not.toBeInTheDocument()
  })

  it('renders a Courtside rotation timeline using the real competition rules', () => {
    mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))
    expect(screen.getByRole('heading', { name: 'CRONOLOGÍA DE MINUTOS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GUARDAR ROTACIÓN' })).toBeInTheDocument()
    expect(document.querySelector('[data-courtside-tactics-screen="rotations"]')).toBeInTheDocument()
  })

  it('lets the coach select the rotation directly, drag minutes and persist a valid plan', () => {
    const { team } = mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))
    expect(screen.getByText(/Convoca jugadores desde la columna izquierda/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Convocar / }).length).toBeGreaterThan(5)

    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getAllByRole('button', { name: /^Convocar / })[0]!)
    }
    expect(screen.getAllByRole('slider').length).toBe(20)
    expect(screen.getAllByRole('slider')[0]!).toBeDisabled()
    expect(screen.getByText(/Convoca un sexto para poder ajustar/)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /^Convocar / })[0]!)
    expect(screen.getAllByRole('slider').length).toBe(24)
    const slider = screen.getAllByRole('slider')[0] as HTMLInputElement
    expect(slider).toBeEnabled()
    const before = Number(slider.value)
    const changed = before < 10 ? before + 1 : before - 1
    fireEvent.change(slider, { target: { value: String(changed) } })
    expect(Number((screen.getAllByRole('slider')[0] as HTMLInputElement).value)).toBe(changed)
    expect(screen.getByRole('button', { name: 'GUARDAR ROTACIÓN' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'GUARDAR ROTACIÓN' }))

    const current = useGameStore.getState().world!
    const active = getLineupAssignments(getTeamLineup(current, team.id))
    expect(active).toHaveLength(6)
    const saved = current.rotationPlansByTeamId[team.id]?.minutesByPeriod
    expect(saved).toBeDefined()
    for (let q = 0; q < 4; q++) {
      const total = active.reduce((sum, item) => sum + (saved?.[item.playerId]?.[q] ?? 0), 0)
      expect(total).toBe(50)
    }
    expect(screen.getByText('Rotación guardada en la partida.')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /^Retirar / })[0]!)
    expect(getLineupAssignments(getTeamLineup(useGameStore.getState().world!, team.id))).toHaveLength(5)
  })

  it('rebalances slider changes without inventing or losing minutes', () => {
    const before = {
      PG: [8, 7], SG: [8, 9], SF: [9, 8],
      PF: [9, 8], C: [8, 9], SIXTH: [8, 9],
    }
    const ids = Object.keys(before)
    const next = rebalanceRotationSlider(before, ids, 'PG', 0, 10, 10)
    expect(next.PG?.[0]).toBe(10)
    expect(ids.reduce((sum,id) => sum + (next[id]?.[0] ?? 0), 0)).toBe(50)
    expect(next.SG?.[1]).toBe(9)
    expect(before.PG[0]).toBe(8)
    const decreased = rebalanceRotationSlider(next, ids, 'PG', 0, 4, 10)
    expect(decreased.PG?.[0]).toBe(4)
    expect(ids.reduce((sum,id) => sum + (decreased[id]?.[0] ?? 0), 0)).toBe(50)
  })

  it('opens a player dossier from a Pizarra name', () => {
    const { world, team } = mountTacticsWorkspace()
    const player = world.players[team.rosterPlayerIds[0]!]!
    fireEvent.click(screen.getByRole('button', { name: `${player.firstName} ${player.lastName}` }))
    expect(new URL(window.location.href).searchParams.get('playerId')).toBe(player.id)
  })

  it('persists actual P&R coverage, rather than mislabeling paint emphasis as switch', () => {
    const { world, team } = mountTacticsWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'PLAN DE PARTIDO' }))
    const coverage = screen.getByLabelText('Cobertura Pick and Roll')
    fireEvent.change(coverage, { target: { value: 'hedge' } })
    fireEvent.click(screen.getByRole('button', { name: 'APLICAR AL PARTIDO' }))
    const next = useGameStore.getState().world!
    const matching = Object.values(next.gamePlansByKey).find(plan => plan.teamId === team.id)
    expect(matching?.tacticalOverride?.defense?.pickAndRollCoverage).toBe('hedge')
    expect(next.currentDate).toBe(world.currentDate)
  })
})
