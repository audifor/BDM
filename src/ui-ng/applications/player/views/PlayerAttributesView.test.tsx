// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
vi.mock('@/ui-ng/applications/player/components/visual/BasketballVisuals', () => ({
  AttributeRadar: () => <div aria-label="Attribute radar" />,
}))

class TestResizeObserver {
  static instances: TestResizeObserver[] = []

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this)
  }

  private target: Element | undefined
  observe = vi.fn((target: Element, _options?: ResizeObserverOptions) => { this.target = target })
  disconnect = vi.fn()
  unobserve = vi.fn()

  resize(width: number, height: number) {
    if (this.target === undefined) throw new Error('ResizeObserver has no observed element')
    this.callback(
      [{ borderBoxSize: [{ inlineSize: width, blockSize: height }], contentRect: { width, height }, target: this.target } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
}

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
    league: { status: 'unavailable', average: null, sampleSize: 0, scopeLabel: null, note: 'No league sample.' },
    team: { status: 'unavailable', average: null, sampleSize: 0, scopeLabel: null, note: 'No team sample.' },
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
  allRatings: [],
  evolutionByRating: Object.fromEntries(categoryRows.map((entry) => [entry.ratingId, makeEvolution(entry.ratingId, entry.value)])),
  signatureSkills: [],
  weakLinks: [],
  gaps: [],
}

const model = {
  identity: { playerId: 'player-test' },
  attributes,
  radarAxes: [],
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
  TestResizeObserver.instances = []
  vi.unstubAllGlobals()
})

describe('PlayerAttributesView structural compact', () => {
  it('uses the measured width, keeps every category in the picker, and updates the detail by keyboard', async () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    const { unmount } = render(<AttributesHarness />)
    const observer = TestResizeObserver.instances[0]
    const board = document.querySelector('[data-ng-region="player-attributes"]') as HTMLElement

    const detailMetrics = board.querySelector('.po-at-detail__metrics')?.textContent ?? ''
    expect(detailMetrics).toContain('League average')
    expect(detailMetrics).toContain('Team average')
    expect(detailMetrics).toContain('Position average')

    const ratingCells = Array.from(board.querySelectorAll('.po-at-matrix .po-attr-rating > span'))
      .filter((cell) => !cell.classList.contains('po-attr-rating__marker'))
    expect(ratingCells.map((cell) => Array.from(cell.classList).find((name) => name.startsWith('po-attr-rating__'))))
      .toEqual([
        'po-attr-rating__label',
        'po-attr-rating__value',
        'po-attr-rating__scale',
        'po-attr-rating__change',
        'po-attr-rating__percentile',
      ])

    act(() => observer?.resize(599, 500))
    await waitFor(() => expect(board.getAttribute('data-bdm-structural-compact')).toBe('true'))

    const trigger = screen.getByRole('button', { name: /Choose attribute category, Shooting, rating 61/i })
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'))

    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(8)
    expect(screen.getByRole('option', { name: 'Shooting, rating 61' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'Defense / Rebounding, rating 62' })).toBeTruthy()

    fireEvent.keyDown(options[0] as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(options[1])
    fireEvent.keyDown(options[1] as HTMLElement, { key: 'Enter' })

    await waitFor(() => expect(document.querySelector('.po-at-detail__name')?.textContent).toBe('Rim Finishing'))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    expect(trigger.textContent).toContain('Finishing')

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'))
    const selectedOption = screen.getByRole('option', { name: 'Finishing, rating 58' })
    expect(selectedOption.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(selectedOption, { key: 'Escape' })
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'))
    expect(document.activeElement).toBe(trigger)

    act(() => observer?.resize(600, 500))
    await waitFor(() => expect(board.getAttribute('data-bdm-structural-compact')).toBe('false'))
    expect(observer?.disconnect).not.toHaveBeenCalled()
    unmount()
    expect(observer?.disconnect).toHaveBeenCalledOnce()
  })
})
