import { useState } from 'react'
import type { MatchShotZoneId } from '@/domain/stats/MatchStatLog'
import type { DetailedPerformanceShotZone, PerformanceShotProfileModel } from '../data/buildPlayerPerformanceModel'

const SHAPES: Readonly<Record<MatchShotZoneId, readonly string[]>> = {
  DEEP: ['M 32 155 Q 100 177 168 155 L 155 144 Q 100 160 45 144 Z'],
  ABOVE_BREAK_THREE: ['M 37 132 Q 100 162 163 132 L 151 113 Q 100 142 49 113 Z'],
  CORNER_THREE: ['M 7 78 L 30 78 L 30 128 L 7 128 Z', 'M 170 78 L 193 78 L 193 128 L 170 128 Z'],
  LONG_MIDRANGE: ['M 37 92 Q 100 144 163 92 L 147 77 Q 100 119 53 77 Z'],
  MIDRANGE: ['M 48 73 Q 100 121 152 73 L 133 58 Q 100 100 67 58 Z'],
  FLOATER_RANGE: ['M 65 52 Q 100 100 135 52 L 119 43 Q 100 79 81 43 Z'],
  SHORT_PAINT: ['M 76 31 L 124 31 L 124 53 Q 100 72 76 53 Z'],
  RIM: ['M 83 22 A 17 17 0 1 0 117 22 A 17 17 0 1 0 83 22 Z'],
  RESTRICTED: ['M 90 22 A 10 10 0 1 0 110 22 A 10 10 0 1 0 90 22 Z'],
}

/** A schematic of recognized shot families, NOT raw shot coordinates. */
export function PerformanceNineZoneCourt({ profile }: { readonly profile: PerformanceShotProfileModel }) {
  const zones = profile.detailedZones ?? []
  const [selectedId, setSelectedId] = useState<MatchShotZoneId>('RESTRICTED')
  const selected = zones.find((zone) => zone.id === selectedId) ?? zones[0]
  const totalPoints = zones.reduce((total, zone) => total + zone.points, 0)
  const provenance = profile.detailedProvenance === 'OBSERVED'
    ? 'RECORDED ZONES' : profile.detailedProvenance === 'MODELLED'
      ? 'MODELLED ZONES' : 'MIXED EVIDENCE'
  const select = (id: MatchShotZoneId) => setSelectedId(id)
  const renderRegion = (zone: DetailedPerformanceShotZone) =>
    <g className={'po-pf-nine__region' + (selected?.id === zone.id ? ' is-selected' : '')}
      key={zone.id} role="button" tabIndex={0} aria-pressed={selected?.id === zone.id}
      aria-label={zone.label + ': ' + zone.made + ' made of ' + zone.attempted + ' attempted'}
      onClick={() => select(zone.id)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(zone.id) } }}>
      <title>{zone.label + ' · ' + zone.made + '/' + zone.attempted + ' · ' + (zone.percentage ?? '—') + '%'}</title>
      {SHAPES[zone.id].map((shape, index) => <path key={index} d={shape} />)}
    </g>

  return <section className="po-pf-panel po-pf-shot po-pf-nine" data-ng-region="performance-shot-profile" aria-label="9 recorded or modelled shot zones">
    <div className="po-pf-nine__stage">
      <div className="po-pf-nine__source"><span>{provenance}</span>
        <small>{profile.detailedProvenance === 'OBSERVED' ? 'MatchEngine shot events' : 'Statistical subdivision · provisional'}</small></div>
      <svg className="po-pf-nine__court" viewBox="0 0 200 174"
        aria-label="Interactive nine-zone basketball half-court schematic. No shot coordinates are stored.">
        <rect className="po-pf-nine__boundary" x={6} y={3} width={188} height={168} rx={3} />
        {[...zones].reverse().map(renderRegion)}
        <path className="po-pf-nine__court-lines" d="M 67 3 L 67 87 L 133 87 L 133 3 M 7 80 Q 100 174 193 80 M 93 16 L 107 16"/>
        <circle className="po-pf-nine__rim" cx={100} cy={22} r={6} />
      </svg>
      <p className="po-pf-nine__caption">Schematic zones · select an area to inspect</p>
    </div>
    <div className="po-pf-nine__details">
      <div className="po-pf-nine__selected" aria-live="polite">
        <span>SELECTED ZONE</span>
        <strong>{selected?.label ?? 'No zone'}</strong>
        <div><b>{selected?.percentage === null || selected === undefined ? '—' : selected.percentage + '%'}</b>
          <span>{selected?.made ?? 0} / {selected?.attempted ?? 0} FG</span></div>
        <small>{selected?.share ?? 0}% of attempts · {selected?.points ?? 0} field points
          {totalPoints > 0 ? ' · ' + Math.round((selected?.points ?? 0) / totalPoints * 100) + '% of scoring' : ''}</small>
      </div>
      <div className="po-pf-nine__list" role="group" aria-label="Select a shooting zone">
        {zones.map((zone) => <button key={zone.id} type="button"
          aria-pressed={zone.id === selected?.id} onClick={() => select(zone.id)}>
          <span>{zone.label}</span>
          <b>{zone.made}/{zone.attempted}</b>
          <em>{zone.percentage === null ? '—' : zone.percentage + '%'}</em>
        </button>)}
      </div>
      <p className="po-pf-nine__disclaimer">{profile.note}</p>
    </div>
  </section>
}
