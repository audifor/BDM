// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'

import { clampContextMenuPosition } from './EntityContextMenu'
import { EntityContextMenuProvider, useEntityContextMenu } from './EntityContextMenuProvider'
import { resolveEntityContextActions } from './entityContextActions'

function Target({ entity }: { readonly entity: Parameters<typeof useEntityContextMenu>[0] }) {
  return <button {...useEntityContextMenu(entity)} type="button">Target</button>
}

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
    expect(resolveEntityContextActions(world, { type: 'team', id: team.id })[0]?.destination).toMatchObject({ teamId: team.id })
    expect(resolveEntityContextActions(world, { type: 'competition', id: competition.id })[0]?.destination).toMatchObject({ competitionId: competition.id })
  })
})
