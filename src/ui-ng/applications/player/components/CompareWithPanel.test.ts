import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { PlayerComparisonSnapshot } from '@/ui-ng/applications/player/data/buildPlayerComparisonSnapshot'

import { CompareBody } from './CompareWithPanel'

function snapshot(overrides: Partial<PlayerComparisonSnapshot> = {}): PlayerComparisonSnapshot {
  return {
    playerId: 'player:rival' as never,
    name: 'Rival Guard',
    position: 'PG',
    teamName: 'Rival Club',
    age: 24,
    ratings: { threePointShooting: 84, midRangeShooting: 80 } as never,
    ...overrides,
  }
}

const ratings = [
  { id: 'threePointShooting', label: 'Three-Point Shooting', value: 91 },
  { id: 'midRangeShooting', label: 'Mid-Range Shooting', value: 74 },
]

function render(element: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(element)
}

describe('CompareBody', () => {
  it('compares the selected rating of both players', () => {
    const markup = render(
      createElement(CompareBody, {
        currentName: 'Trae Bell-Haynes',
        currentRatingId: 'threePointShooting',
        currentRatings: ratings,
        snapshot: snapshot(),
        view: 'attributes',
      }),
    )

    expect(markup).toContain('Trae Bell-Haynes 91 · Rival Guard 84')
    expect(markup).toContain('+7')
    // Every rating of the page is compared, not only the selected one.
    expect(markup).toContain('Mid-Range Shooting')
    expect(markup).toContain('-6')
  })

  it('never renders a delta for a rating the rival has no value for', () => {
    const markup = render(
      createElement(CompareBody, {
        currentName: 'Trae Bell-Haynes',
        currentRatingId: 'midRangeShooting',
        currentRatings: ratings,
        snapshot: snapshot({ ratings: { threePointShooting: 84 } as never }),
        view: 'attributes',
      }),
    )

    expect(markup).toContain('—')
    expect(markup).not.toContain('+91')
  })

  it('says so instead of inventing a comparison for a page without one', () => {
    const markup = render(
      createElement(CompareBody, {
        currentName: 'Trae Bell-Haynes',
        currentRatingId: null,
        currentRatings: ratings,
        snapshot: snapshot(),
        view: 'performance',
      }),
    )

    expect(markup).toContain('Comparing performance arrives with that page')
    expect(markup).not.toContain('po-compare__rows')
  })
})
