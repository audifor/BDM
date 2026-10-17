// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { DesktopAppHost, type DesktopAppActions } from '@/ui/desktop/DesktopAppHost'
import type { GameWorld } from '@/domain/world'

const actions = { openApp: vi.fn() } as unknown as DesktopAppActions

beforeEach(() => {
  useGameStore.getState().resetGame()
  window.history.replaceState({}, '', '/?ui=ng&app=market')
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Tauri Desktop Market and Scouting activation', () => {
  for (const appId of ['market', 'scouting'] as const) {
    it(`opens ${appId} inside DesktopAppHost without crashing the shell`, () => {
      window.history.replaceState({}, '', `/?ui=ng&app=${appId}`)
      const world = createNewGame()
      useGameStore.getState().replaceWorld(world)
      render(<DesktopAppHost appId={appId} world={world} actions={actions} />)
      expect(screen.getByTestId(appId === 'market' ? 'market-explore' : 'scouting-war-room')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it(`opens ${appId} even when the save has no team salary budgets`, () => {
      window.history.replaceState({}, '', `/?ui=ng&app=${appId}`)
      const world = createNewGame()
      const team = getUserTeam(world)!
      const partial = {
        ...world,
        teamFinancesByTeamId: Object.fromEntries(
          Object.entries(world.teamFinancesByTeamId).filter(([id]) => id !== team.id)),
      } as GameWorld
      useGameStore.getState().replaceWorld(partial)
      render(<DesktopAppHost appId={appId} world={partial} actions={actions} />)
      expect(screen.getByTestId(appId === 'market' ? 'market-explore' : 'scouting-war-room')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  }
})
