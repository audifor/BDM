// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { EntityContextMenuProvider } from '@/ui/entityContextMenu/EntityContextMenuProvider'

import { EntityLink } from './EntityLink'

describe('EntityLink context-menu integration', () => {
  afterEach(cleanup)
  it('opens the real team navigation action on right-click', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const onNavigate = vi.fn(); const onOpenEntity = vi.fn()
    render(<EntityContextMenuProvider onOpenEntity={onOpenEntity} world={world}><EntityLink destination={{ type: 'team', teamId: team.id, section: 'overview' }} onNavigate={onNavigate}>{team.name}</EntityLink></EntityContextMenuProvider>)
    fireEvent.contextMenu(screen.getByRole('button', { name: team.name }), { clientX: 20, clientY: 30 }); fireEvent.click(screen.getByRole('menuitem', { name: 'Open team' }))
    expect(onOpenEntity).toHaveBeenCalledWith({ type: 'team', teamId: team.id, section: 'overview' }); expect(onNavigate).not.toHaveBeenCalled()
  })

  it('forwards only DOM handlers and supports both keyboard invocations without warnings', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<EntityContextMenuProvider onOpenEntity={vi.fn()} world={world}><EntityLink destination={{ type: 'team', teamId: team.id, section: 'overview' }} onNavigate={vi.fn()}>{team.name}</EntityLink></EntityContextMenuProvider>); const link = screen.getByRole('button', { name: team.name }); expect(link.hasAttribute('open')).toBe(false); fireEvent.keyDown(link, { key: 'ContextMenu' }); expect(screen.getByRole('menu')).toBeTruthy(); fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }); fireEvent.keyDown(link, { key: 'F10', shiftKey: true }); expect(screen.getByRole('menu')).toBeTruthy(); expect(warning).not.toHaveBeenCalled(); warning.mockRestore()
  })
})
