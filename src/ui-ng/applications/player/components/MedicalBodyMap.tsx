import { useId } from 'react'

import type {
  MedicalBodyRegionId,
  MedicalBodyRegionModel,
} from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { MedicalHoloBody } from '@/ui-ng/applications/player/components/MedicalHoloBody'

/**
 * Where each region's node sits and where its label hangs, in the figure's own 120 × 200 space.
 * Geometry only: the state of a region comes from the recorded injuries, never from here.
 */
const REGION_POINTS: Record<MedicalBodyRegionId, { readonly x: number; readonly y: number }> = {
  head: { x: 60, y: 26 },
  neck: { x: 60, y: 44 },
  'shoulder-r': { x: 44, y: 44 },
  'shoulder-l': { x: 76, y: 44 },
  'arm-r': { x: 34, y: 80 },
  'arm-l': { x: 86, y: 80 },
  core: { x: 60, y: 74 },
  'hip-r': { x: 48, y: 106 },
  'hip-l': { x: 72, y: 106 },
  'knee-r': { x: 50, y: 142 },
  'knee-l': { x: 70, y: 142 },
  'ankle-r': { x: 52, y: 174 },
  'ankle-l': { x: 68, y: 174 },
}

/** Label rows of both columns: the player's right side on the left, as the reference draws it. */
const LEFT_ORDER: readonly MedicalBodyRegionId[] = [
  'head',
  'shoulder-r',
  'arm-r',
  'hip-r',
  'knee-r',
  'ankle-r',
]
const RIGHT_ORDER: readonly MedicalBodyRegionId[] = [
  'neck',
  'shoulder-l',
  'arm-l',
  'core',
  'hip-l',
  'knee-l',
  'ankle-l',
]

const FIGURE_TOP = 16
const FIGURE_BOTTOM = 190
const LABEL_LEFT_X = -8
const LABEL_RIGHT_X = 128
const VIEW_BOX = '-118 -6 356 212'

function rowY(index: number, count: number): number {
  if (count === 1) return (FIGURE_TOP + FIGURE_BOTTOM) / 2
  return FIGURE_TOP + (index / (count - 1)) * (FIGURE_BOTTOM - FIGURE_TOP)
}

/**
 * BODY MAP — the reference's anatomical figure with a node and a labelled connector per region.
 *
 * The figure itself is the shared wireframe the rest of the app draws; the regions are real: an
 * active injury marks the regions its kind belongs to, everything else reads healthy.
 */
export function MedicalBodyMap({
  onSelectRegion,
  regions,
  selectedRegionId,
}: {
  readonly onSelectRegion: (region: MedicalBodyRegionId) => void
  readonly regions: readonly MedicalBodyRegionModel[]
  readonly selectedRegionId: MedicalBodyRegionId | null
}) {
  const glowId = useId()
  const byId = new Map(regions.map((region) => [region.id, region]))
  const attention = regions.filter((region) => region.status === 'attention').length

  const columns: readonly { readonly ids: readonly MedicalBodyRegionId[]; readonly side: 'left' | 'right' }[] = [
    { ids: LEFT_ORDER, side: 'left' },
    { ids: RIGHT_ORDER, side: 'right' },
  ]

  return (
    <div className="po-med-bodymap">
      <div className="po-med-bodymap__stage">
        <MedicalHoloBody className="po-med-bodymap__figure" viewBox={VIEW_BOX} />

        <svg
          aria-label="Body map: select a region for its medical state"
          className="po-med-bodymap__overlay"
          role="group"
          viewBox={VIEW_BOX}
        >
          <defs>
            <filter height="200%" id={glowId} width="200%" x="-50%" y="-50%">
              <feGaussianBlur result="blur" stdDeviation="1.6" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {columns.map((column) =>
            column.ids.map((id, index) => {
              const region = byId.get(id)
              const point = REGION_POINTS[id]
              if (region === undefined) return null
              const y = rowY(index, column.ids.length)
              const labelX = column.side === 'left' ? LABEL_LEFT_X : LABEL_RIGHT_X
              const elbowX = column.side === 'left' ? point.x - 10 : point.x + 10
              const isSelected = selectedRegionId === id
              const stateClass = `is-${region.status}${isSelected ? ' is-selected' : ''}`
              const textAnchor = column.side === 'left' ? 'end' : 'start'

              return (
                <g
                  className={`po-med-bodymap__region ${stateClass}`}
                  key={id}
                  onClick={() => onSelectRegion(id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectRegion(id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <path
                    className="po-med-bodymap__link"
                    d={`M ${point.x} ${point.y} L ${elbowX} ${y} L ${labelX + (column.side === 'left' ? 4 : -4)} ${y}`}
                  />
                  <circle
                    className="po-med-bodymap__node"
                    cx={point.x}
                    cy={point.y}
                    filter={region.status === 'attention' ? `url(#${glowId})` : undefined}
                    r={isSelected ? 3.4 : 2.6}
                  />
                  <text
                    className="po-med-bodymap__label"
                    dominantBaseline="middle"
                    textAnchor={textAnchor}
                    x={labelX}
                    y={y - 5}
                  >
                    {region.label}
                  </text>
                  <text
                    className="po-med-bodymap__state"
                    dominantBaseline="middle"
                    textAnchor={textAnchor}
                    x={labelX}
                    y={y + 5}
                  >
                    {region.statusLabel}
                  </text>
                </g>
              )
            }),
          )}
        </svg>
      </div>

      <p className="po-med-bodymap__legend">
        {attention === 0
          ? 'All systems healthy: no recorded injury maps to any region.'
          : `${attention} ${attention === 1 ? 'region' : 'regions'} marked from the recorded injuries.`}
      </p>
    </div>
  )
}
