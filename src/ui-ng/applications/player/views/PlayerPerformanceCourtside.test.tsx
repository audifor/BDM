// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { completeMatch, createNewGame, prepareUserMatch } from '@/app/game'
import { useGameStore } from '@/stores/gameStore'
import type { GameId } from '@/domain/ids'
import type { PlayerWorkspaceContextValue } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { PlayerWorkspaceProvider } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { buildPlayerPerformanceModel } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'
import { PerformanceCourtsideForm, PlayerPerformanceView } from './PlayerPerformanceView'

afterEach(() => {
  cleanup()
  useGameStore.getState().resetGame()
})

describe('PLAYER Courtside performance form', () => {
  it('selects one recorded statistic at a time, keeping game selection synchronized', () => {
    const selected = vi.fn<(id: GameId) => void>()
    const a = 'game-a' as GameId
    const b = 'game-b' as GameId
    render(<PerformanceCourtsideForm games={[
      { gameId: b, date: '2025-10-12', opponent: 'RMA', points: 10, rebounds: 5, assists: 3, valuation: 12 },
      { gameId: a, date: '2025-10-10', opponent: 'BAR', points: 22, rebounds: 7, assists: 2, valuation: 19 },
    ]} selectedGameId={b} onSelectGame={selected} />)
    expect(screen.getByRole('button', { name: 'PTS' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'REB' }))
    expect(screen.getByRole('button', { name: 'REB' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'PTS' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: /2025-10-10 vs BAR.*rebounds/i }))
    expect(selected).toHaveBeenCalledWith(a)
    expect(screen.getByRole('button', { name: /2025-10-12 vs RMA.*rebounds/i }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('does not fabricate form values without recorded games', () => {
    render(<PerformanceCourtsideForm games={[]} selectedGameId={null} onSelectGame={() => {}} />)
    expect(screen.getByText('No recorded appearances in this context.')).toBeInTheDocument()
    expect(screen.queryByText('vs ')).not.toBeInTheDocument()
  })
})

describe('PLAYER Courtside performance FOW', () => {
  it('uses the same actual box scores for own and rival views, without hidden ability or private condition', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const performance = buildPlayerPerformanceModel(updated, playerId)
    useGameStore.getState().replaceWorld(updated)
    const callbacks = { setSelectedGameId: vi.fn(), setSeasonId: vi.fn(),
      setCompetitionFilter: vi.fn(), setPhaseFilter: vi.fn(), setSplitFilter: vi.fn() }
    function mount(kind: 'own-roster' | 'unknown') {
      const value = {
        model: {
          performance,
          knowledgeAccess: kind === 'own-roster' ? { kind: 'own-roster' } : {
            kind: 'unknown', ratingEvaluations: [], knownDimensions: [], knownPotential: [],
          },
          status: { morale: { value: 'SECRET_PRIVATE_MORALE' } },
          radarAxes: [{ key: 'shooting', value: 99 }],
          ratings: [{ value: 9999 }],
        },
        playerId,
        session: { performance: {
          selectedGameId: null, seasonId: null,
          competitionFilter: 'all', phaseFilter: 'all', splitFilter: 'all',
          ...callbacks,
        } },
      } as unknown as PlayerWorkspaceContextValue
      return render(<PlayerWorkspaceProvider value={value}><PlayerPerformanceView /></PlayerWorkspaceProvider>)
    }
    const own = mount('own-roster')
    expect(screen.getByText('SEASON PERFORMANCE')).toBeInTheDocument()
    expect(screen.getByText('RECENT FORM')).toBeInTheDocument()
    expect(screen.getByText(/game log/i)).toBeInTheDocument()
    expect(screen.getByText(/game inspector/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('SECRET_PRIVATE_MORALE')
    expect(document.body.textContent).not.toContain('9999')
    own.unmount()
    const rival = mount('unknown')
    expect(screen.getByText('RECORDED PERFORMANCE')).toBeInTheDocument()
    expect(screen.getByText('Opponent · recorded box scores only')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('SECRET_PRIVATE_MORALE')
    expect(document.body.textContent).not.toContain('9999')
    expect(screen.getByText('RECENT FORM')).toBeInTheDocument()
    rival.unmount()
  })
})
