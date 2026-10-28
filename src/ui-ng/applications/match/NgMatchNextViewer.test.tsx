// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { createMatchEnginePort } from '@/app/matchNext'
import { updateGameWorld } from '@/domain/world'
import * as labels from './engine/matchPresentation'
import { NgMatchNextViewer } from './NgMatchNextViewer'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('reuses unchanged standings across visual repaints and refreshes them when the canonical world changes', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const world = createNewGame(), port = createMatchEnginePort('match-next')
  const game = Object.values(world.games).find(g => g.status === 'scheduled')!
  const setup = port.prepare(world, game, 151617), controller = port.createLiveSession(setup)
  const records = vi.spyOn(labels, 'teamRecordLabel')
  const props = { gameId: game.id, setup, controller, onComplete: vi.fn(), onContinue: vi.fn() }
  const view = render(<NgMatchNextViewer {...props} world={world} />)
  for (let repaint = 0; repaint < 10; repaint++) view.rerender(<NgMatchNextViewer {...props} world={world} />)
  expect(records).toHaveBeenCalledTimes(2)
  const updated = updateGameWorld(world, { games: Object.values(world.games).map(g => g.id === game.id
    ? { ...g, status: 'completed' as const, result: { homeScore: 70, awayScore: 60 } } : g) })
  view.rerender(<NgMatchNextViewer {...props} world={updated} />)
  expect(records).toHaveBeenCalledTimes(4)
  expect(screen.getByText('1-0')).toBeInTheDocument()
  expect(screen.getByText('0-1')).toBeInTheDocument()
  expect(controller.snapshot().isComplete).toBe(false)
})
