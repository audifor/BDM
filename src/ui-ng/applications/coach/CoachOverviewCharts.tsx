/*
 * Coach · Overview charts.
 *
 * Deliberately dependency-free: SVG is used only where the geometry demands it (radar, line, step,
 * donut, ring) and everything rectangular (bars, segment meters, value bars) is plain HTML/CSS so
 * text stays crisp and every row keeps an exact, shared height.
 *
 * No chart draws axes, ticks or gridlines beyond the radar's own reference rings.
 */

import type { CSSProperties, ReactNode } from 'react'

import { OverviewGlyph } from '@/ui-ng/applications/coach/CoachOverviewGlyph'

/* ── Geometry helpers ── */

/** Angle 0 points up, growing clockwise — so the six radar axes land on top and then every 60°. */
function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

function toPoints(points: readonly { readonly x: number; readonly y: number }[]) {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

/* 28, not more: it is the largest radius whose outward-growing labels still fit inside the plot
   square at the narrowest column the layout allows. */
const RADAR_POLYGON_RATIO = 28
const SPARK_WIDTH = 100
const SPARK_HEIGHT = 30
const SPARK_PAD_Y = 4

function normalise(values: readonly number[]) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return (value: number) => SPARK_PAD_Y + (1 - (value - min) / span) * (SPARK_HEIGHT - SPARK_PAD_Y * 2)
}

/* ── Radar ── */

export function RadarChart({
  label,
  points,
}: {
  readonly label: string
  readonly points: readonly { readonly id: string; readonly label: string; readonly value: number }[]
}) {
  const count = points.length
  if (count < 3) return null
  const step = 360 / count
  const cx = 50
  const cy = 50
  const polygonRadius = RADAR_POLYGON_RATIO

  const rings = [0.25, 0.5, 0.75, 1].map((fraction) =>
    toPoints(Array.from({ length: count }, (_, index) => polar(cx, cy, polygonRadius * fraction, index * step))),
  )

  const dataPoints = points.map((point, index) =>
    polar(cx, cy, polygonRadius * Math.min(1, Math.max(0, point.value / 100)), index * step),
  )

  return (
    <div className="co-radar">
      <div className="co-radar__plot">
        <svg
          aria-label={`${label}: ${points.map((point) => `${point.label} ${point.value}`).join(', ')}`}
          className="co-radar__svg"
          role="img"
          viewBox="0 0 100 100"
        >
          {rings.map((ringPoints, index) => (
            <polygon
              className="co-radar__ring"
              key={`ring-${index}`}
              points={ringPoints}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {points.map((point, index) => {
            const vertex = polar(cx, cy, polygonRadius, index * step)
            return (
              <line
                className="co-radar__spoke"
                key={`spoke-${point.id}`}
                vectorEffect="non-scaling-stroke"
                x1={cx}
                x2={vertex.x}
                y1={cy}
                y2={vertex.y}
              />
            )
          })}
          <polygon className="co-radar__area" points={toPoints(dataPoints)} />
          {dataPoints.map((point, index) => (
            <circle
              className="co-radar__point"
              cx={point.x}
              cy={point.y}
              key={`point-${points[index].id}`}
              r={1.7}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {points.map((point, index) => {
          const anchor = polar(cx, cy, polygonRadius, index * step)
          // Labels grow outward from their own vertex. The side is decided from the axis direction
          // rather than from y alone: a diagonal axis sits high on the plot but must still anchor
          // horizontally, otherwise its long label gets clipped by the square.
          const cos = Math.cos(((index * step - 90) * Math.PI) / 180)
          const sin = Math.sin(((index * step - 90) * Math.PI) / 180)
          const side =
            Math.abs(cos) > 0.5 ? (cos > 0 ? 'is-right' : 'is-left') : sin < 0 ? 'is-top' : 'is-bottom'
          const style: CSSProperties = { left: `${anchor.x}%`, top: `${anchor.y}%` }
          return (
            <span className={`co-radar__label ${side}`} key={point.id} style={style}>
              <span className="co-radar__label-name">{point.label}</span>
              <span className="co-radar__label-value">{point.value}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/* ── Line ── */

export function MiniLineChart({
  caption,
  endLabel,
  label,
  points,
  scale,
  title,
}: {
  readonly caption: string
  readonly endLabel: string
  readonly label: string
  readonly points: readonly number[]
  /** Optional reading of the same series — its first and last value. Additive: omitted by callers
   *  that only want the bare sparkline. */
  readonly scale?: string
  readonly title: string
}) {
  if (points.length < 2) return null
  const yFor = normalise(points)
  const stepX = SPARK_WIDTH / (points.length - 1)
  const coords = points.map((value, index) => ({ x: index * stepX, y: yFor(value) }))
  const line = toPoints(coords)
  const last = coords[coords.length - 1]

  return (
    <figure className="co-chart">
      <figcaption className="co-chart__head">
        <span className="co-chart__title">{title}</span>
        <span className="co-chart__value">{endLabel}</span>
      </figcaption>
      <svg
        aria-label={label}
        className="co-chart__svg"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      >
        <polygon className="co-line__area" points={`0,${SPARK_HEIGHT} ${line} ${SPARK_WIDTH},${SPARK_HEIGHT}`} />
        <polyline className="co-line__stroke" points={line} vectorEffect="non-scaling-stroke" />
        <circle className="co-line__point" cx={last.x} cy={last.y} r={1.9} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="co-chart__caption">
        <span className="co-chart__caption-text">{caption}</span>
        {scale === undefined ? null : <span className="co-chart__scale">{scale}</span>}
      </p>
    </figure>
  )
}

/* ── Steps ── */

export function StepSparkline({
  caption,
  label,
  points,
  scale,
  title,
}: {
  readonly caption: string
  readonly label: string
  readonly points: readonly number[]
  /** Optional reading of the same series — its first and last value. See `MiniLineChart`. */
  readonly scale?: string
  readonly title: string
}) {
  if (points.length < 2) return null
  const yFor = normalise(points)
  const stepX = SPARK_WIDTH / (points.length - 1)

  const path = points.reduce((accumulator, value, index) => {
    const x = (index * stepX).toFixed(2)
    const y = yFor(value).toFixed(2)
    if (index === 0) return `M${x},${y}`
    return `${accumulator} H${x} V${y}`
  }, '')

  const last = { x: (points.length - 1) * stepX, y: yFor(points[points.length - 1]) }

  return (
    <figure className="co-chart">
      <figcaption className="co-chart__head">
        <span className="co-chart__title">{title}</span>
      </figcaption>
      <svg
        aria-label={label}
        className="co-chart__svg"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      >
        <path className="co-line__stroke" d={path} vectorEffect="non-scaling-stroke" />
        <circle className="co-line__point" cx={last.x} cy={last.y} r={1.9} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="co-chart__caption">
        <span className="co-chart__caption-text">{caption}</span>
        {scale === undefined ? null : <span className="co-chart__scale">{scale}</span>}
      </p>
    </figure>
  )
}

/* ── Donut ── */

export function MiniDonutChart({
  centerCaption,
  centerValue,
  label,
  slices,
}: {
  readonly centerCaption: string
  readonly centerValue: string
  readonly label: string
  readonly slices: readonly {
    readonly id: string
    readonly label: string
    readonly share: number
    readonly tone: string
  }[]
}) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const gap = 1.6
  let offset = 0

  return (
    <div className="co-donut">
      <div className="co-donut__visual">
        <svg
          aria-label={`${label}: ${centerValue} ${centerCaption}. ${slices
            .map((slice) => `${slice.label} ${slice.share}%`)
            .join(', ')}`}
          className="co-donut__svg"
          role="img"
          viewBox="0 0 100 100"
        >
          <circle className="co-donut__track" cx="50" cy="50" r={radius} />
          {slices.map((slice) => {
            const length = Math.max(0, (slice.share / 100) * circumference - gap)
            const rotation = (offset / 100) * 360 - 90
            offset += slice.share
            return (
              <circle
                className={`co-donut__slice co-stroke--${slice.tone}`}
                cx="50"
                cy="50"
                key={slice.id}
                r={radius}
                strokeDasharray={`${length.toFixed(2)} ${(circumference - length).toFixed(2)}`}
                transform={`rotate(${rotation.toFixed(2)} 50 50)`}
              />
            )
          })}
        </svg>
        <div className="co-donut__center">
          <span className="co-donut__value">{centerValue}</span>
          <span className="co-donut__caption">{centerCaption}</span>
        </div>
      </div>
      <ul className="co-donut__legend">
        {slices.map((slice) => (
          <li className="co-donut__legend-row" key={slice.id}>
            <span className={`co-donut__swatch co-tone-bg--${slice.tone}`} />
            <span className="co-donut__legend-label">{slice.label}</span>
            <span className="co-donut__legend-value">{slice.share}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Ring ── */

export function CircularProgress({
  caption,
  label,
  value,
}: {
  readonly caption: string
  readonly label: string
  readonly value: number
}) {
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  const length = (clamped / 100) * circumference

  return (
    <div className="co-ring">
      <div className="co-ring__visual">
        <svg aria-label={label} className="co-ring__svg" role="img" viewBox="0 0 100 100">
          <circle className="co-ring__track" cx="50" cy="50" r={radius} />
          <circle
            className="co-ring__value"
            cx="50"
            cy="50"
            r={radius}
            strokeDasharray={`${length.toFixed(2)} ${(circumference - length).toFixed(2)}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <span className="co-ring__label">{clamped}%</span>
      </div>
      <span className="co-ring__caption">{caption}</span>
    </div>
  )
}

/* ── Bars (HTML/CSS: crisp text, exact heights) ── */

export function MiniBarChart({
  columns,
  label,
  scale,
  title,
}: {
  readonly columns: readonly { readonly id: string; readonly label: string; readonly value: number }[]
  readonly label: string
  /** Optional reading of the same columns — the axis they are drawn against. Additive. */
  readonly scale?: string
  readonly title: string
}) {
  const max = Math.max(...columns.map((column) => Math.abs(column.value)), 1)
  return (
    <figure aria-label={label} className="co-chart co-chart--bars" role="img">
      <figcaption className="co-chart__head">
        <span className="co-chart__title">{title}</span>
        {scale === undefined ? null : <span className="co-chart__scale">{scale}</span>}
      </figcaption>
      <div className="co-bars">
        {columns.map((column) => (
          <div className="co-bars__column" key={column.id}>
            <div className="co-bars__track">
              <span
                className="co-bars__fill"
                style={{ height: `${Math.max(7, (Math.abs(column.value) / max) * 100)}%` }}
              />
            </div>
            <span className="co-bars__label">{column.label}</span>
          </div>
        ))}
      </div>
    </figure>
  )
}

/* ── Segmented meter ── */

export function SegmentedMeter({
  filled,
  label,
  title,
  tone,
  total,
}: {
  readonly filled: number
  readonly label: string
  readonly title?: string
  readonly tone: string
  readonly total: number
}) {
  return (
    <div className="co-segmented" title={title}>
      <span className="co-segmented__label">{label}</span>
      <span className="co-segmented__value">
        {filled}
        <span className="co-segmented__value-total">/{total}</span>
      </span>
      <span
        aria-label={`${label} ${filled} of ${total}`}
        className="co-segmented__blocks"
        role="img"
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            className={`co-segmented__block${index < filled ? ` is-on co-tone-bg--${tone}` : ''}`}
            key={`${label}-${index}`}
          />
        ))}
      </span>
    </div>
  )
}

/* ── Value bar ── */

export function HorizontalValueBar({
  label,
  title,
  tone,
  value,
}: {
  readonly label: string
  readonly title?: string
  readonly tone: string
  readonly value: number
}) {
  const percent = Math.max(0, Math.min(100, value))
  return (
    <div className="co-valuebar" title={title}>
      <span className="co-valuebar__label">{label}</span>
      <span className="co-valuebar__value">{value}</span>
      <span className="co-valuebar__track">
        <span className={`co-valuebar__fill co-tone-bg--${tone}`} style={{ width: `${percent}%` }} />
      </span>
    </div>
  )
}

/* ── Shared panel chrome ── */

export function OverviewPanelHeader({
  aside,
  icon,
  subtitle,
  title,
}: {
  readonly aside?: ReactNode
  readonly icon: string
  readonly subtitle?: string
  readonly title: string
}) {
  return (
    <header className="co-panel__head">
      <h2 className="co-panel__heading">
        <OverviewGlyph className="co-panel__icon" name={icon} size={15} />
        <span className="co-panel__title">{title}</span>
        {subtitle === undefined ? null : <span className="co-panel__subtitle">{subtitle}</span>}
      </h2>
      {aside === undefined ? null : <div className="co-panel__aside">{aside}</div>}
    </header>
  )
}
