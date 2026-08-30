// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { createOrUpdateUserTrainingModule } from '@/engine/training'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { useGameStore } from '@/stores/gameStore'
import { BDMDataGrid } from '@/ui/dataGrid/BDMDataGrid'
import type { DataGridColumn } from '@/ui/dataGrid/types'

import { clampContextMenuPosition, EntityContextMenu } from './EntityContextMenu'
import { EntityContextMenuProvider, useEntityContextMenu } from './EntityContextMenuProvider'
import { resolveEntityContextActions } from './entityContextActions'

function Target({ entity }: { readonly entity: Parameters<typeof useEntityContextMenu>[0] }) {
  const { onContextMenu, onKeyDown } = useEntityContextMenu(entity)
  return <button onContextMenu={onContextMenu} onKeyDown={onKeyDown} type="button">Target</button>
}
function actionIds(entries: readonly ReturnType<typeof resolveEntityContextActions>[number][]): readonly string[] { return entries.flatMap((entry) => entry.kind === 'submenu' ? [entry.id, ...actionIds(entry.children)] : entry.kind === 'action' ? [entry.id] : []) }

describe('EntityContextMenuProvider', () => {
  afterEach(cleanup)
  it('opens a player menu at pointer coordinates and navigates using the stable PlayerId', () => {
    const world = createNewGame(); const player = getTeamRoster(world, getUserTeam(world)!.id)[0]!; const onOpenEntity = vi.fn()
    render(<EntityContextMenuProvider onOpenEntity={onOpenEntity} world={world}><Target entity={{ type: 'player', id: player.id }} /></EntityContextMenuProvider>)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Target' }), { clientX: 31, clientY: 42 })
    const menu = screen.getByRole('menu') as HTMLElement; expect(menu.style.left).toBe('31px'); expect(menu.style.top).toBe('42px')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open profile' }))
    expect(onOpenEntity).toHaveBeenCalledWith({ type: 'player', playerId: player.id, section: 'overview' })
  })

  it('replaces targets and closes for outside clicks and Escape with focus restoration', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const player = getTeamRoster(world, team.id)[0]!
    render(<EntityContextMenuProvider onOpenEntity={vi.fn()} world={world}><Target entity={{ type: 'player', id: player.id }} /><Target entity={{ type: 'team', id: team.id }} /></EntityContextMenuProvider>)
    const [playerTarget, teamTarget] = screen.getAllByRole('button', { name: 'Target' })
    fireEvent.contextMenu(playerTarget, { clientX: 10, clientY: 20 }); fireEvent.contextMenu(teamTarget, { clientX: 30, clientY: 40 })
    expect(screen.queryByRole('menuitem', { name: 'Open profile' })).toBeNull(); expect(screen.getByRole('menuitem', { name: 'Open team' })).toBeTruthy()
    fireEvent.pointerDown(document.querySelector('.entity-context-menu__backdrop')!); expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.contextMenu(playerTarget, { clientX: 10, clientY: 20 }); fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull(); expect(document.activeElement).toBe(playerTarget)
  })

  it('opens from ContextMenu and Shift+F10, while unavailable entities render no menu', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const { rerender } = render(<EntityContextMenuProvider onOpenEntity={vi.fn()} world={world}><Target entity={{ type: 'team', id: team.id }} /></EntityContextMenuProvider>)
    const target = screen.getByRole('button', { name: 'Target' }); vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ bottom: 55, left: 44 } as DOMRect)
    fireEvent.keyDown(target, { key: 'ContextMenu' }); expect(screen.getByRole('menuitem', { name: 'Open team' })).toBeTruthy(); fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.keyDown(target, { key: 'F10', shiftKey: true }); expect(screen.getByRole('menu')).toBeTruthy(); fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    rerender(<EntityContextMenuProvider onOpenEntity={vi.fn()} world={world}><Target entity={{ type: 'staff', id: 'staff-without-navigation' }} /></EntityContextMenuProvider>)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Target' }), { clientX: 10, clientY: 10 }); expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keeps the overlay inside the viewport and resolves team/competition IDs without page data', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const competition = Object.values(world.competitions)[0]!
    expect(clampContextMenuPosition({ x: 999, y: 999 }, { width: 300, height: 200 })).toEqual({ left: 96, top: 150 })
    expect(resolveEntityContextActions(world, { type: 'team', id: team.id })[0]).toMatchObject({ destination: { teamId: team.id } })
    expect(resolveEntityContextActions(world, { type: 'competition', id: competition.id })[0]).toMatchObject({ destination: { competitionId: competition.id } })
  })

  it('uses canonical position eligibility for single and bulk training actions', () => {
    const world = createNewGame(); const roster = getTeamRoster(world, getUserTeam(world)!.id); const guard = roster.find((player) => player.basketball.primaryPosition === 'PG')!; const big = roster.find((player) => player.basketball.primaryPosition === 'PF' || player.basketball.primaryPosition === 'C')!
    const ids = (player: typeof guard, selection = [player]) => actionIds(resolveEntityContextActions(world, { type: 'player', id: player.id }, { selection: selection.map((item) => ({ type: 'player' as const, id: item.id })) }))
    expect(ids(guard)).not.toContain('training-postScoring'); expect(ids(big)).toContain('training-postScoring'); expect(ids(big, [big, guard])).not.toContain('training-postScoring'); expect(ids(big, [big])).toContain('training-threePoint')
  })

  it('resolves user modules through their canonical base-definition eligibility', () => {
    const base = createNewGame(); const roster = getTeamRoster(base, getUserTeam(base)!.id); const guard = roster.find((player) => player.basketball.primaryPosition === 'PG')!; const big = roster.find((player) => player.basketball.primaryPosition === 'PF' || player.basketball.primaryPosition === 'C')!
    const world = createOrUpdateUserTrainingModule(createOrUpdateUserTrainingModule(base, { id: 'custom-post', name: 'Custom post', baseDefinitionId: 'postScoring', scope: 'individual', intensity: 'normal' }), { id: 'custom-team', name: 'Custom team', baseDefinitionId: 'threePoint', scope: 'team', intensity: 'normal' })
    const ids = (player: typeof guard, selection = [player]) => actionIds(resolveEntityContextActions(world, { type: 'player', id: player.id }, { selection: selection.map((item) => ({ type: 'player' as const, id: item.id })) }))
    expect(ids(big)).toContain('training-custom-post'); expect(ids(guard)).not.toContain('training-custom-post'); expect(ids(big, [big, guard])).not.toContain('training-custom-post'); expect(ids(big)).not.toContain('training-custom-team')
  })

  it('delegates occupied slots to canonical TeamLineup displacement', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const [first, second] = getTeamRoster(world, team.id); const next = setLineupSlot(setLineupSlot(world, team.id, 'PG', first!.id), team.id, 'PG', second!.id)
    expect(next.lineupsByTeamId[team.id]!.starters.PG).toBe(second!.id); expect(actionIds(resolveEntityContextActions(world, { type: 'player', id: first!.id }))).toContain('lineup-PG')
  })

  it('invokes a lineup action through the canonical store command', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const [occupant, replacement] = getTeamRoster(world, team.id); useGameStore.getState().replaceWorld(setLineupSlot(world, team.id, 'PG', occupant!.id))
    render(<EntityContextMenuProvider onOpenEntity={vi.fn()} world={useGameStore.getState().world!}><Target entity={{ type: 'player', id: replacement!.id }} /></EntityContextMenuProvider>)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Target' }), { clientX: 20, clientY: 20 }); fireEvent.click(screen.getByRole('menuitem', { name: 'Squad / lineup ›' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Starting five ›' })); fireEvent.click(screen.getByRole('menuitem', { name: 'PG' }))
    const lineup = useGameStore.getState().world!.lineupsByTeamId[team.id]!; expect(lineup.starters.PG).toBe(replacement!.id); expect([...Object.values(lineup.starters), ...Object.values(lineup.bench)]).not.toContain(occupant!.id)
  })

  it('keeps parent and adjacent child surfaces while navigating enabled submenu items', async () => {
    const invoke = vi.fn(); const actions = [{ kind: 'submenu' as const, id: 'group', label: 'Group', children: [{ kind: 'action' as const, id: 'a', label: 'Enabled A', command: { type: 'training' as const, playerIds: [], moduleId: 'rest' } }, { kind: 'action' as const, id: 'disabled', label: 'Disabled', disabled: true, command: { type: 'training' as const, playerIds: [], moduleId: 'rest' } }, { kind: 'action' as const, id: 'b', label: 'Enabled B', command: { type: 'training' as const, playerIds: [], moduleId: 'rest' } }] }]
    render(<EntityContextMenu actions={actions} anchor={{ x: 20, y: 20 }} onClose={vi.fn()} onInvoke={invoke} />)
    const trigger = screen.getByRole('menuitem', { name: 'Group ›' }); fireEvent.keyDown(trigger, { key: 'ArrowRight' }); expect(screen.getAllByRole('menu')).toHaveLength(2); expect(document.body.contains(trigger)).toBe(true); await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Enabled A' })))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' }); expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Enabled B' })); fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' }); expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Enabled A' })); fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' }); expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Enabled B' })); fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' }); expect(screen.getAllByRole('menu')).toHaveLength(1); await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('renders semantic separators and never invokes disabled actions', () => {
    const invoke = vi.fn(); const actions = [{ kind: 'separator' as const, id: 'separator' }, { kind: 'action' as const, id: 'disabled', label: 'Disabled', disabled: true, reason: 'Unavailable', command: { type: 'training' as const, playerIds: [], moduleId: 'rest' } }]
    render(<EntityContextMenu actions={actions} anchor={{ x: 20, y: 20 }} onClose={vi.fn()} onInvoke={invoke} />); expect(screen.getByRole('separator')).toBeTruthy(); const disabled = screen.getByRole('menuitem', { name: 'Disabled' }) as HTMLButtonElement; expect(disabled.disabled).toBe(true); fireEvent.click(disabled); fireEvent.keyDown(disabled, { key: 'Enter' }); fireEvent.keyDown(disabled, { key: ' ' }); expect(invoke).not.toHaveBeenCalled()
  })

  it('clamps rendered surfaces using their measured variable heights', () => {
    const width = Object.getOwnPropertyDescriptor(globalThis, 'innerWidth'); const height = Object.getOwnPropertyDescriptor(globalThis, 'innerHeight'); Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 300 }); Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 200 }); const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect'); const actions = [{ kind: 'action' as const, id: 'a', label: 'A', command: { type: 'training' as const, playerIds: [], moduleId: 'rest' } }]
    rect.mockReturnValue({ width: 196, height: 50 } as DOMRect); const { unmount } = render(<EntityContextMenu actions={actions} anchor={{ x: 20, y: 190 }} onClose={vi.fn()} onInvoke={vi.fn()} />); const shortTop = Number.parseInt(screen.getByRole('menu').style.top); unmount(); rect.mockReturnValue({ width: 196, height: 120 } as DOMRect); render(<EntityContextMenu actions={actions} anchor={{ x: 20, y: 190 }} onClose={vi.fn()} onInvoke={vi.fn()} />); const tallTop = Number.parseInt(screen.getByRole('menu').style.top); expect(shortTop).toBe(142); expect(tallTop).toBe(72); expect(tallTop).toBeLessThan(shortTop); rect.mockRestore(); if (width) Object.defineProperty(globalThis, 'innerWidth', width); if (height) Object.defineProperty(globalThis, 'innerHeight', height)
  })

  it('opens a measured submenu to the left when right space is unavailable', () => {
    const width = Object.getOwnPropertyDescriptor(globalThis, 'innerWidth'); const height = Object.getOwnPropertyDescriptor(globalThis, 'innerHeight'); Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 300 }); Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 200 }); vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return this.getAttribute('data-menu-path') === '' ? ({ left: 250, right: 290, top: 20, width: 40, height: 40 } as DOMRect) : ({ left: 0, right: 196, top: 20, width: 196, height: 80 } as DOMRect) }); const actions = [{ kind: 'submenu' as const, id: 'group', label: 'Group', children: [{ kind: 'action' as const, id: 'a', label: 'A', command: { type: 'training' as const, playerIds: [], moduleId: 'rest' } }] }]
    render(<EntityContextMenu actions={actions} anchor={{ x: 250, y: 20 }} onClose={vi.fn()} onInvoke={vi.fn()} />); fireEvent.click(screen.getByRole('menuitem', { name: 'Group ›' })); const menus = screen.getAllByRole('menu'); expect(menus).toHaveLength(2); expect(Number.parseInt(menus[1]!.style.left)).toBeLessThan(250); expect(Number.parseInt(menus[1]!.style.left)).toBeGreaterThanOrEqual(8); vi.restoreAllMocks(); if (width) Object.defineProperty(globalThis, 'innerWidth', width); if (height) Object.defineProperty(globalThis, 'innerHeight', height)
  })

  it('opens entity actions from the whole Data Grid row and replaces stale selection', () => {
    const world = createNewGame(); const players = getTeamRoster(world, getUserTeam(world)!.id).slice(0, 3); const columns: readonly DataGridColumn<(typeof players)[number]>[] = [{ id: 'player', label: 'Player', render: (player) => `${player.firstName} ${player.lastName}` }]
    render(<EntityContextMenuProvider onOpenEntity={vi.fn()} world={world}><BDMDataGrid columns={columns} entityForRow={(player) => ({ type: 'player', id: player.id })} entitySurface="roster" multiSelect rows={players} /></EntityContextMenuProvider>)
    const rows = screen.getAllByRole('row').slice(1); fireEvent.click(rows[0]!); fireEvent.click(rows[1]!, { ctrlKey: true }); fireEvent.contextMenu(rows[2]!, { clientX: 30, clientY: 40 }); expect(screen.getByRole('menuitem', { name: 'Training ›' })).toBeTruthy(); expect(rows[2]!.getAttribute('aria-selected')).toBe('true'); expect(rows[0]!.getAttribute('aria-selected')).toBeNull(); expect(rows[1]!.getAttribute('aria-selected')).toBeNull()
  })

  it('preserves Data Grid multi-selection when opening a selected row menu', () => {
    const world = createNewGame(); const players = getTeamRoster(world, getUserTeam(world)!.id).slice(0, 3); const columns: readonly DataGridColumn<(typeof players)[number]>[] = [{ id: 'player', label: 'Player', render: (player) => `${player.firstName} ${player.lastName}` }]
    render(<EntityContextMenuProvider onOpenEntity={vi.fn()} world={world}><BDMDataGrid columns={columns} entityForRow={(player) => ({ type: 'player', id: player.id })} entitySurface="roster" multiSelect rows={players} /></EntityContextMenuProvider>)
    const rows = screen.getAllByRole('row').slice(1); fireEvent.click(rows[0]!); fireEvent.click(rows[1]!, { ctrlKey: true }); fireEvent.contextMenu(rows[1]!, { clientX: 30, clientY: 40 }); expect(screen.getByRole('menuitem', { name: 'Training (2) ›' })).toBeTruthy(); expect(rows[0]!.getAttribute('aria-selected')).toBe('true'); expect(rows[1]!.getAttribute('aria-selected')).toBe('true')
  })
})
