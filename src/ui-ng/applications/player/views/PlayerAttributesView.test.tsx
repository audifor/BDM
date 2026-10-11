// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlayerTruthRatingKey } from '@/domain/player'
import { PlayerWorkspaceProvider, type PlayerWorkspaceContextValue } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import type { PlayerWorkspaceModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'

import { PlayerAttributesView } from './PlayerAttributesView'

vi.mock('@/stores/gameStore', () => ({
  useGameStore: (selector: (state: { assignTrainingModuleToPlayer: () => void }) => unknown) =>
    selector({ assignTrainingModuleToPlayer: () => undefined }),
}))

vi.mock('@/ui-ng/applications/player/components/AttributeEvolutionChart', () => ({
  AttributeEvolutionChart: ({ label }: { readonly label: string }) => <div data-testid="detail-chart">{label}</div>,
}))

vi.mock('@/ui-ng/applications/player/components/AttributeTrainingOptions', () => ({
  AttributeTrainingOptions: () => null,
}))

vi.mock('@/ui-ng/applications/player/components/DeclaredGaps', () => ({ GapList: () => null }))
const categoryRows: readonly {
  readonly category: RatingCategory
  readonly label: string
  readonly value: number
  readonly ratingId: PlayerTruthRatingKey
  readonly ratingLabel: string
}[] = [
  { category: 'shooting', label: 'Shooting', value: 61, ratingId: 'DEEP_SHOOTING', ratingLabel: 'Deep Shooting' },
  { category: 'finishing', label: 'Finishing', value: 58, ratingId: 'RIM_FINISHING', ratingLabel: 'Rim Finishing' },
  { category: 'ballHandling', label: 'Ball Handling', value: 53, ratingId: 'BALL_CONTROL', ratingLabel: 'Ball Control' },
  { category: 'playmaking', label: 'Playmaking', value: 57, ratingId: 'PASSING_ACCURACY', ratingLabel: 'Passing Accuracy' },
  { category: 'offBall', label: 'Off-Ball', value: 49, ratingId: 'OFF_BALL_MOVEMENT', ratingLabel: 'Off-Ball Movement' },
  { category: 'defense', label: 'Defense / Rebounding', value: 62, ratingId: 'RIM_PROTECTION', ratingLabel: 'Rim Protection' },
  { category: 'physical', label: 'Physical', value: 71, ratingId: 'SPEED', ratingLabel: 'Speed' },
  { category: 'mental', label: 'Mental', value: 64, ratingId: 'DECISION_MAKING', ratingLabel: 'Decision Making' },
]

function makeEvolution(id: PlayerTruthRatingKey, value: number) {
  return {
    ratingId: id,
    current: value,
    points: [],
    changeSinceFirst: 0,
    hasRecordedHistory: false,
    note: `${value} current rating`,
    accumulatedStimulus: null,
    league: { status: 'available', average: 55, sampleSize: 8, scopeLabel: 'Liga', note: 'League sample.' },
    team: { status: 'available', average: 57, sampleSize: 8, scopeLabel: 'Team', note: 'Team sample.' },
    standing: {
      status: 'unavailable',
      percentile: null,
      positionAverage: null,
      positionLabel: 'PG',
      positionSampleSize: 0,
      note: 'No competition sample.',
    },
    trainings: [],
    assignment: { status: 'unavailable', reason: null, date: null, startTime: null, sessionId: null, nextSession: null },
  }
}

const attributes = {
  categories: categoryRows.map((entry) => ({
    category: entry.category,
    label: entry.label,
    profileValue: entry.value,
    all: [{ id: entry.ratingId, label: entry.ratingLabel, category: entry.category, value: entry.value }],
    note: `${entry.label} profile`,
  })),
  allRatings: categoryRows.map(entry => ({ id: entry.ratingId, label: entry.ratingLabel, category: entry.category, value: entry.value })),
  evolutionByRating: Object.fromEntries(categoryRows.map((entry) => [entry.ratingId, makeEvolution(entry.ratingId, entry.value)])),
  signatureSkills: [],
  weakLinks: [],
  gaps: [],
}

const model = {
  identity: { playerId: 'player-test' },
  knowledgeAccess: { kind: 'own-roster' },
  attributes,
  radarAxes: categoryRows.map((entry, index) => ({ key: entry.category, label: ['SHOOT','FIN','HANDLE','PLAY','OFF','DEF','PHYS','MENT'][index]!, value: entry.value })),
} as unknown as PlayerWorkspaceModel

function AttributesHarness() {
  const [attributesCategory, setAttributesCategory] = useState<RatingCategory>('shooting')
  const [selectedRatingId, setSelectedRatingId] = useState<PlayerTruthRatingKey | null>(null)
  const value = {
    model,
    emptyState: null,
    session: {
      attributesCategory,
      setAttributesCategory,
      selectedRatingId,
      setSelectedRatingId,
      compare: { open: vi.fn() },
    },
  } as unknown as PlayerWorkspaceContextValue

  return (
    <PlayerWorkspaceProvider value={value}>
      <div className="po-root">
        <PlayerAttributesView />
      </div>
    </PlayerWorkspaceProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Player Attributes Courtside interactions', () => {
  it('renders the same 8 family radar as Overview and keeps pointer/keyboard selection', () => {
    render(<AttributesHarness />)
    const radar = screen.getByRole('img', { name: /Attribute profile radar:/ })
    expect(radar).toHaveAttribute('viewBox', '0 0 340 325')
    expect(radar.querySelectorAll('.po-cs-radar__label')).toHaveLength(8)
    expect(radar.querySelectorAll('.po-cs-radar__value')).toHaveLength(8)
    expect(radar.querySelectorAll('.po-cs-radar__shape')).toHaveLength(1)
    const fin = screen.getByRole('button', { name: 'Explorar FIN, 58' })
    fireEvent.click(fin)
    expect(fin).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'FINISHING ATTRIBUTES' })).toBeInTheDocument()
    const mental = screen.getByRole('button', { name: 'Explorar MENT, 64' })
    fireEvent.keyDown(mental, { key: 'Enter' })
    expect(mental).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'MENTAL ATTRIBUTES' })).toBeInTheDocument()
  })

  it('keeps opt-in reference comparisons, the two-overlay limit and clearing', () => {
    const { container } = render(<AttributesHarness />)
    const radar = container.querySelector('.po-cs-family-radar')!
    const unchangedPlayerShape = radar.querySelector('.po-cs-radar__shape')!.getAttribute('points')
    fireEvent.click(screen.getByRole('button', { name: /COMPARAR/ }))
    const choices = screen.getByRole('group', { name: 'Referencias de comparación' })
    fireEvent.click(choices.querySelector('button')!)
    expect(radar.querySelectorAll('.po-cs-family-radar__comparison')).toHaveLength(1)
    const options = choices.querySelectorAll('button')
    fireEvent.click(options[1]!)
    expect(radar.querySelectorAll('.po-cs-family-radar__comparison')).toHaveLength(2)
    expect(options[2]).toBeDisabled()
    expect(radar.querySelector('.po-cs-radar__shape')!.getAttribute('points')).toBe(unchangedPlayerShape)
    fireEvent.click(screen.getByRole('button', { name: 'LIMPIAR' }))
    expect(radar.querySelectorAll('.po-cs-family-radar__comparison')).toHaveLength(0)
  })

  it('keeps the existing category selector and focus tracker', () => {
    render(<AttributesHarness />)
    const option = screen.getByRole('option', { name: 'Finishing, rating 58' })
    fireEvent.click(option)
    expect(option).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: /WATCH SELECTED ATTRIBUTE/i }))
    expect(screen.getByRole('button', { name: /REMOVE SELECTED/i })).toBeInTheDocument()
  })
})
