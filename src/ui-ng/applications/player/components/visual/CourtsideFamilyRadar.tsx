import type { KeyboardEvent } from 'react'

import type { RadarAxis, RadarComparisonSeries } from './BasketballVisuals'

/**
 * Exact Courtside Overview geometry reused by the Attributes experience.
 * Only interaction and authorized comparison overlays are optional.
 * The core 8-family polygon, four grid rings, labels and numeric values
 * remain visually identical for both screens.
 */
const CENTER_X = 170
const CENTER_Y = 161
const RADIUS = 111
const LABEL_RADIUS = 140

function polar(index: number, total: number, radius: number) {
  const angle = -Math.PI / 2 + 2 * Math.PI * index / total
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  }
}

function pointsFor(
  axes: readonly RadarAxis[],
  value: (axis: RadarAxis) => number,
  factor = 1,
): string {
  return axes.map((axis, index) => {
    const radius = RADIUS * factor * Math.max(0, Math.min(100, value(axis))) / 100
    const { x, y } = polar(index, axes.length, radius)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function areaForAxis(index: number, total: number) {
  const start = (-Math.PI / 2) + (index - .5) * 2 * Math.PI / total
  const end = (-Math.PI / 2) + (index + .5) * 2 * Math.PI / total
  const radius = LABEL_RADIUS + 10
  const a = { x: CENTER_X + Math.cos(start) * radius, y: CENTER_Y + Math.sin(start) * radius }
  const b = { x: CENTER_X + Math.cos(end) * radius, y: CENTER_Y + Math.sin(end) * radius }
  return `M ${CENTER_X} ${CENTER_Y} L ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y} Z`
}

interface CourtsideFamilyRadarProps {
  readonly axes: readonly RadarAxis[]
  readonly comparisonSeries?: readonly RadarComparisonSeries[]
  readonly selectedCategory?: RadarAxis['key'] | null
  readonly onCategorySelect?: (category: RadarAxis['key']) => void
  readonly estimated?: boolean
  readonly ariaLabel: string
}

/** Both Overview and Attributes mount this one SVG. It never accesses player truth. */
export function CourtsideFamilyRadar({
  axes,
  comparisonSeries = [],
  selectedCategory = null,
  onCategorySelect,
  estimated = false,
  ariaLabel,
}: CourtsideFamilyRadarProps) {
  const validComparisons = comparisonSeries.filter(series =>
    axes.length >= 3 && axes.every(axis =>
      typeof series.axes[axis.key] === 'number' && Number.isFinite(series.axes[axis.key]),
    ),
  )

  const activate = (key: RadarAxis['key']) => onCategorySelect?.(key)
  const handleKey = (event: KeyboardEvent<SVGGElement>, key: RadarAxis['key']) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate(key)
    }
  }

  if (axes.length < 3) return null

  return <svg
    viewBox="0 0 340 325"
    className="po-cs-radar__svg po-cs-family-radar"
    role="img"
    aria-label={ariaLabel}
  >
    {[.25,.5,.75,1].map(level =>
      <polygon
        key={level}
        points={axes.map((_,i) => {
          const { x,y } = polar(i,axes.length,RADIUS*level)
          return `${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeOpacity=".18"
      />,
    )}
    {axes.map((axis,i) => {
      const {x,y} = polar(i,axes.length,RADIUS)
      return <line key={axis.key} x1={CENTER_X} y1={CENTER_Y}
        x2={x} y2={y} stroke="currentColor" strokeOpacity=".25" />
    })}
    <polygon
      points={pointsFor(axes, axis => axis.value)}
      className="po-cs-radar__shape"
    />
    {validComparisons.map((series,index) =>
      <polygon
        key={series.key}
        className="po-cs-family-radar__comparison"
        aria-label={series.label + ' comparison'}
        points={pointsFor(axes, axis => series.axes[axis.key] ?? 0)}
        fill="none"
        stroke={series.color}
        strokeWidth="2"
        strokeDasharray={index === 0 ? '6 4' : index === 1 ? '2 5' : '8 3 2 3'}
        strokeLinejoin="round"
      />,
    )}
    {axes.map((axis,index) => {
      const { x,y } = polar(index,axes.length,LABEL_RADIUS)
      const interactive = onCategorySelect !== undefined
      return <g key={axis.key}
        className={'po-cs-family-radar__axis' + (selectedCategory === axis.key ? ' is-active' : '')}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `Explorar ${axis.label}, ${axis.value}` : undefined}
        aria-pressed={interactive ? selectedCategory === axis.key : undefined}
        onClick={interactive ? () => activate(axis.key) : undefined}
        onKeyDown={interactive ? event => handleKey(event,axis.key) : undefined}
      >
        {interactive && <path
          d={areaForAxis(index,axes.length)}
          className="po-cs-family-radar__hit"
          fill="transparent"
        />}
        <text x={x} y={y-2} textAnchor="middle" className="po-cs-radar__label">{axis.label}</text>
        <text x={x} y={y+13} textAnchor="middle" className="po-cs-radar__value">
          {estimated ? '≈' : ''}{axis.value}
        </text>
      </g>
    })}
  </svg>
}
