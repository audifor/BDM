import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'

const SIZE = 120
const CENTER = SIZE / 2
const MAX_RADIUS = 46
const LABEL_RADIUS = MAX_RADIUS + 14

function polarPoint(index: number, total: number, radius: number): [number, number] {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2
  return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius]
}

function wedgePath(index: number, total: number, radius: number): string {
  const startAngle = (Math.PI * 2 * (index - 0.5)) / total - Math.PI / 2
  const endAngle = (Math.PI * 2 * (index + 0.5)) / total - Math.PI / 2
  const [x1, y1] = [CENTER + Math.cos(startAngle) * radius, CENTER + Math.sin(startAngle) * radius]
  const [x2, y2] = [CENTER + Math.cos(endAngle) * radius, CENTER + Math.sin(endAngle) * radius]
  return `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`
}

export interface RadarAxis {
  readonly key: RatingCategory
  readonly label: string
  readonly value: number
}

export interface AttributeRadarProps {
  readonly axes: readonly RadarAxis[]
  readonly selectedCategory?: RatingCategory | null
  readonly onCategorySelect?: (category: RatingCategory) => void
  readonly accent?: string
}

export function AttributeRadar({
  axes,
  selectedCategory = null,
  onCategorySelect,
  accent = 'var(--po-team-primary)',
}: AttributeRadarProps) {
  const total = axes.length
  const gridLevels = [0.25, 0.5, 0.75, 1]

  const polygonPoints = axes
    .map((axis, index) => {
      const radius = (axis.value / 100) * MAX_RADIUS
      const [x, y] = polarPoint(index, total, radius)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg aria-label="Attribute profile radar" className="po-radar" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {gridLevels.map((level) => (
        <polygon
          key={level}
          fill="none"
          points={Array.from({ length: total }, (_, index) => {
            const [x, y] = polarPoint(index, total, MAX_RADIUS * level)
            return `${x},${y}`
          }).join(' ')}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}

      {axes.map((axis, index) => {
        const [x, y] = polarPoint(index, total, MAX_RADIUS)
        const isActive = selectedCategory === axis.key
        return (
          <line
            key={`spoke-${axis.key}`}
            stroke={isActive ? 'var(--po-team-secondary)' : 'rgba(255,255,255,0.06)'}
            strokeWidth={isActive ? 1.5 : 1}
            x1={CENTER}
            x2={x}
            y1={CENTER}
            y2={y}
          />
        )
      })}

      <polygon
        fill={accent}
        fillOpacity="0.18"
        points={polygonPoints}
        stroke={accent}
        strokeWidth="1.5"
      />

      {axes.map((axis, index) => {
        const radius = (axis.value / 100) * MAX_RADIUS
        const [x, y] = polarPoint(index, total, radius)
        const isActive = selectedCategory === axis.key
        return (
          <circle
            key={`${axis.key}-dot`}
            cx={x}
            cy={y}
            fill={isActive ? 'var(--po-team-secondary)' : accent}
            r={isActive ? 3.5 : 2.5}
          />
        )
      })}

      {axes.map((axis, index) => {
        const [lx, ly] = polarPoint(index, total, LABEL_RADIUS)
        const isActive = selectedCategory === axis.key
        return (
          <g
            className={`po-radar__axis${isActive ? ' is-active' : ''}`}
            key={`axis-${axis.key}`}
            onClick={() => onCategorySelect?.(axis.key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onCategorySelect?.(axis.key)
              }
            }}
            role="button"
            tabIndex={0}
          >
            <path className="po-radar__hit" d={wedgePath(index, total, MAX_RADIUS + 8)} />
            <text
              className="po-radar__label"
              dominantBaseline="middle"
              textAnchor="middle"
              x={lx}
              y={ly}
            >
              {axis.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export type { CSSProperties } from 'react'

/** FIBA half court — coordinates in decimeters (0.1 m). Basket at baseline (bottom). */
const COURT_W = 150
const COURT_H = 140
const COURT_CX = 75
const BASELINE = COURT_H
const BASKET_Y = BASELINE - 15.75
const FT_Y = BASELINE - 58
const KEY_X1 = COURT_CX - 24.5
const KEY_X2 = COURT_CX + 24.5
const THREE_XL = 9
const THREE_XR = COURT_W - 9
const THREE_R = 67.5
const THREE_ARC_Y = BASKET_Y - Math.sqrt(THREE_R ** 2 - (COURT_CX - THREE_XL) ** 2)
const RESTRICTED_R = 12.5
const FT_CIRCLE_R = 18
const HOOP_R = 2.25
const BACKBOARD_Y = BASELINE - 12
const BACKBOARD_HALF = 9

const COURT_LINE = 'rgba(255, 255, 255, 0.55)'
const COURT_LINE_SOFT = 'rgba(255, 255, 255, 0.3)'
const LINE = 0.35

function HalfCourtLines() {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect height={COURT_H} stroke={COURT_LINE} strokeWidth={LINE} width={COURT_W} x="0" y="0" />
      <path
        d={`M ${COURT_CX - FT_CIRCLE_R} 0 A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${COURT_CX + FT_CIRCLE_R} 0`}
        stroke={COURT_LINE_SOFT}
        strokeWidth={LINE}
      />
      <rect
        height={BASELINE - FT_Y}
        stroke={COURT_LINE}
        strokeWidth={LINE}
        width={KEY_X2 - KEY_X1}
        x={KEY_X1}
        y={FT_Y}
      />
      <circle cx={COURT_CX} cy={FT_Y} r={FT_CIRCLE_R} stroke={COURT_LINE} strokeWidth={LINE} />
      <path
        d={`M ${COURT_CX - RESTRICTED_R} ${BASKET_Y} A ${RESTRICTED_R} ${RESTRICTED_R} 0 0 0 ${COURT_CX + RESTRICTED_R} ${BASKET_Y}`}
        stroke={COURT_LINE}
        strokeWidth={LINE}
      />
      <line
        stroke={COURT_LINE}
        strokeWidth={LINE}
        x1={COURT_CX - BACKBOARD_HALF}
        x2={COURT_CX + BACKBOARD_HALF}
        y1={BACKBOARD_Y}
        y2={BACKBOARD_Y}
      />
      <circle cx={COURT_CX} cy={BASKET_Y} r={HOOP_R} stroke={COURT_LINE_SOFT} strokeWidth={LINE * 0.85} />
      <path
        d={`M ${THREE_XL} ${BASELINE} L ${THREE_XL} ${THREE_ARC_Y} A ${THREE_R} ${THREE_R} 0 0 1 ${THREE_XR} ${THREE_ARC_Y} L ${THREE_XR} ${BASELINE}`}
        stroke={COURT_LINE}
        strokeWidth={LINE}
      />
    </g>
  )
}

export interface BasketballHalfCourtProps {
  readonly className?: string
  readonly style?: import('react').CSSProperties
  readonly zones?: readonly {
    readonly id: string
    readonly cx: number
    readonly cy: number
    readonly frequency: number
    readonly efficiency: number
  }[]
}

function zoneRadius(frequency: number): number {
  return 2.2 + (frequency / 50) * 4.8
}

function zoneOpacity(efficiency: number): number {
  return 0.12 + (efficiency / 100) * 0.42
}

/** Reusable half-court SVG for shot charts, role zones and tactical overlays. */
export function BasketballHalfCourt({ className, style, zones = [] }: BasketballHalfCourtProps) {
  return (
    <svg
      aria-hidden
      className={className}
      style={style}
      viewBox={`0 0 ${COURT_W} ${COURT_H}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect fill="var(--po-court-fill)" height={COURT_H} width={COURT_W} x="0" y="0" />
      <HalfCourtLines />
      {zones.map((zone) => (
        <circle
          key={zone.id}
          cx={zone.cx}
          cy={zone.cy}
          fill="var(--po-team-primary)"
          fillOpacity={zoneOpacity(zone.efficiency)}
          r={zoneRadius(zone.frequency)}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={LINE * 0.6}
        />
      ))}
    </svg>
  )
}
