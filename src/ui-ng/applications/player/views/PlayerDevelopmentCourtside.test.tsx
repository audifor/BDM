// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import type { PlayerWorkspaceContextValue } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { PlayerWorkspaceProvider } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { buildPlayerWorkspaceModel, defaultPlayerIdForNg } from '@/ui-ng/applications/player/data/buildPlayerWorkspaceModel'
import { PlayerDevelopmentView } from './PlayerDevelopmentView'

function mount(kind: 'own' | 'external' = 'own') {
  const world = createNewGame()
  const playerId = defaultPlayerIdForNg(world)!
  const actual = buildPlayerWorkspaceModel(world, playerId)!
  const selected = vi.fn<(id: string | null) => void>()
  const development = {
    ...actual.development,
    insight: 'SECRET_INTERNAL_DEVELOPMENT',
    overview: {
      ...actual.development.overview,
      careerStageLabel: 'SECRET_INTERNAL_STAGE',
    },
    trainingPlan: {
      ...actual.development.trainingPlan,
      focusLabel: 'SECRET_INTERNAL_TRAINING',
    },
  }
  const value = {
    model: {
      ...actual,
      knowledgeAccess: kind === 'external'
        ? { kind: 'unknown', ratingEvaluations: [], knownDimensions: [], knownPotential: [] }
        : { kind: 'own-roster' },
      development,
    },
    session: { development: { selectedItemId: null, setSelectedItemId: selected } },
  } as unknown as PlayerWorkspaceContextValue
  const mounted = render(<PlayerWorkspaceProvider value={value}><PlayerDevelopmentView /></PlayerWorkspaceProvider>)
  return { mounted, selected, development }
}

describe('PLAYER DEVELOPMENT Courtside navigation and Fog of War', () => {
  it('opens the manager dashboard with recorded progress and interactive eight-family categories', () => {
    const { selected, development } = mount('own')
    const dashboard = screen.getByRole('group', { name: 'Development display' })
    expect(within(dashboard).getByRole('button', { name: 'OVERVIEW' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('DEVELOPMENT DASHBOARD')).toBeInTheDocument()
    expect(screen.getByText('Career development curve')).toBeInTheDocument()
    expect(screen.getByText('Training plan')).toBeInTheDocument()
    expect(screen.getByText('SECRET_INTERNAL_DEVELOPMENT')).toBeInTheDocument()
    const category = development.categoryDevelopment[0]
    expect(category).toBeDefined()
    const row = screen.getByRole('button', { name: new RegExp(category!.categoryLabel, 'i') })
    fireEvent.click(row)
    expect(selected).toHaveBeenCalledWith(category!.id)
  })

  it('moves between dashboard and complete recorded evidence without fake rating curves', () => {
    mount('own')
    fireEvent.click(screen.getByRole('button', { name: 'RECORDS' }))
    expect(screen.getByText('DEVELOPMENT RECORDS')).toBeInTheDocument()
    expect(screen.getByText('Rating movers')).toBeInTheDocument()
    expect(screen.getByText('Development drivers')).toBeInTheDocument()
    expect(screen.getByText('Scouting projection')).toBeInTheDocument()
    expect(screen.getByText('Not in the save')).toBeInTheDocument()
    expect(screen.queryByText('Career development curve')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'OVERVIEW' }))
    expect(screen.getByText('DEVELOPMENT DASHBOARD')).toBeInTheDocument()
  })

  it('never exposes a rival’s real development, training or internal trajectory', () => {
    mount('external')
    const page = document.querySelector('[data-ng-region="player-development"]')!
    expect(page).toHaveAttribute('data-knowledge', 'external')
    expect(screen.getByText('SCOUTED DEVELOPMENT')).toBeInTheDocument()
    expect(screen.getByText(/only authorized scouting estimates/i)).toBeInTheDocument()
    expect(page.textContent).not.toContain('SECRET_INTERNAL_DEVELOPMENT')
    expect(page.textContent).not.toContain('SECRET_INTERNAL_STAGE')
    expect(page.textContent).not.toContain('SECRET_INTERNAL_TRAINING')
    expect(screen.queryByText('DEVELOPMENT DASHBOARD')).not.toBeInTheDocument()
    expect(screen.queryByText('80-rating annual history')).not.toBeInTheDocument()
  })
})
