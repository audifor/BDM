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

  it('uses thin visual weights only in the Courtside frame while retaining legacy sizes', () => {
    const comparison = [{ key: 'league', label: 'Liga', color: 'var(--cs-negative)', axes: profile(43) }]
    const courtside = renderToStaticMarkup(<AttributeRadar
      axes={axes}
      selectedCategory={axes[0]?.key}
      courtsideFraming
      comparisonSeries={comparison}
    />)
    const legacy = renderToStaticMarkup(<AttributeRadar
      axes={axes}
      selectedCategory={axes[0]?.key}
      comparisonSeries={comparison}
    />)

    expect(courtside).toMatch(/aria-label="Liga comparison"[^>]*stroke-width="1\.15"/)
    expect(courtside).toContain('fill-opacity="0.075"')
    expect(courtside).toContain('stroke-width="1.5"')
    expect(courtside).toContain('stroke-width="0.65"')
    expect(courtside).toContain('stroke-width="0.8"')
    expect(courtside).toContain('r="2.2"')
    expect(courtside).toContain('r="2.7"')

    expect(legacy).toMatch(/aria-label="Liga comparison"[^>]*stroke-width="2\.2"/)
    expect(legacy).toContain('fill-opacity="0.13"')
    expect(legacy).toContain('stroke-width="1"')
    expect(legacy).toContain('r="3"')
    expect(legacy).toContain('r="3.5"')
  })

  it('starts with just the player and layers optional references above the Courtside base', () => {
    const noRefs = renderToStaticMarkup(<AttributeRadar
      axes={axes}
      courtsideFraming
      accent="var(--cs-lime)"
    />)
    expect(noRefs).not.toContain('aria-label="Liga comparison"')
    expect(noRefs).toContain('fill-opacity="0.075"')

    const compared = renderToStaticMarkup(<AttributeRadar
      axes={axes}
      courtsideFraming
      accent="var(--cs-lime)"
      comparisonSeries={[{ key: 'league', label: 'Liga', color: 'var(--cs-negative)', axes: profile(43) }]}
    />)
    expect(compared).toContain('aria-label="Liga comparison"')
    expect(compared.indexOf('fill="var(--cs-lime)"')).toBeLessThan(
      compared.indexOf('aria-label="Liga comparison"'),
    )
  })

  it('keeps legacy viewBox for existing NG placements', () => {
    const markup = renderToStaticMarkup(<AttributeRadar axes={axes} />)
    expect(markup).toContain('viewBox="-36 -36 192 192"')
  })
})
