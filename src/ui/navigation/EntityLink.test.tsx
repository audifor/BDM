// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { EntityContextMenuProvider } from '@/ui/entityContextMenu/EntityContextMenuProvider'

import { EntityLink } from './EntityLink'

describe('EntityLink context-menu integration', () => {
  it('opens the real team navigation action on right-click', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const onNavigate = vi.fn(); const onOpenEntity = vi.fn()
    render(<EntityContextMenuProvider onOpenEntity={onOpenEntity} world={world}><EntityLink destination={{ type: 'team', teamId: team.id, section: 'overview' }} onNavigate={onNavigate}>{team.name}</EntityLink></EntityContextMenuProvider>)
    fireEvent.contextMenu(screen.getByRole('button', { name: team.name }), { clientX: 20, clientY: 30 }); fireEvent.click(screen.getByRole('menuitem', { name: 'Open team' }))
    expect(onOpenEntity).toHaveBeenCalledWith({ type: 'team', teamId: team.id, section: 'overview' }); expect(onNavigate).not.toHaveBeenCalled()
  })
})
