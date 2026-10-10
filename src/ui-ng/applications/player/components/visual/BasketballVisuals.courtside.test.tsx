import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { AttributeRadar, type RadarAxis } from './BasketballVisuals'
import { RADAR_CATEGORY_ORDER, type RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'

const axes: readonly RadarAxis[] = RADAR_CATEGORY_ORDER.map((key, index) => ({
  key, label: key.toUpperCase(), value: 35 + index * 5,
}))

function profile(base: number): Readonly<Record<RatingCategory, number>> {
  return Object.fromEntries(axes.map((axis, index) => [axis.key, base + index * 3])) as Readonly<Record<RatingCategory, number>>
}

describe('AttributeRadar simultaneous references', () => {
  it('renders three independent references with the player polygon', () => {
    const markup = renderToStaticMarkup(<AttributeRadar
      axes={axes}
      courtsideFraming
      showValues
      comparisonSeries={[
        { key: 'team', label: 'Equipo', color: 'var(--cs-orange2)', axes: profile(40) },
        { key: 'league', label: 'Liga', color: 'var(--cs-negative)', axes: profile(43) },
        { key: 'position', label: 'Posición', color: 'var(--cs-positive)', axes: profile(46) },
      ]}
    />)
    expect(markup).toContain('aria-label="Equipo comparison"')
    expect(markup).toContain('aria-label="Liga comparison"')
    expect(markup).toContain('aria-label="Posición comparison"')
    expect(markup).toContain('viewBox="-25 -25 170 170"')
  })

  it('omits a reference rather than drawing a misleading incomplete polygon', () => {
    const incomplete = { shooting: 44 } as Readonly<Partial<Record<RatingCategory, number>>>
    const markup = renderToStaticMarkup(<AttributeRadar axes={axes}
      comparisonSeries={[
        { key: 'team', label: 'Equipo', color: 'var(--cs-orange2)', axes: incomplete },
        { key: 'league', label: 'Liga', color: 'var(--cs-negative)', axes: profile(40) },
      ]}
    />)
    expect(markup).not.toContain('aria-label="Equipo comparison"')
    expect(markup).toContain('aria-label="Liga comparison"')
  })

  it('keeps legacy viewBox for existing NG placements', () => {
    const markup = renderToStaticMarkup(<AttributeRadar axes={axes} />)
    expect(markup).toContain('viewBox="-36 -36 192 192"')
  })
})
