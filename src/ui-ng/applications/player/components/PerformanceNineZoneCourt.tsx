import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MatchShotZoneId } from '@/domain/stats/MatchStatLog'
import type { DetailedPerformanceShotZone, PerformanceShotProfileModel } from '../data/buildPlayerPerformanceModel'

/**
 * Court-facing schematic districts, not real launch coordinates. The bounds
 * describe nine already-authorized shot families, not nine measured points.
 * Key, wings, three-point corners and long-range floor deliberately replace
 * the old concentric-dartboard drawing.
 */
export const COURT_ZONE_PATHS: Readonly<Record<MatchShotZoneId, readonly string[]>> = {
  DEEP: ['M6 172 H194 V224 H6 Z'],
  ABOVE_BREAK_THREE: ['M24 111 Q100 189 176 111 L194 111 V172 H6 V111 Z'],
  CORNER_THREE: [
    'M6 6 H24 V111 H6 Z',
    'M176 6 H194 V111 H176 Z',
  ],
  LONG_MIDRANGE: ['M24 111 L57 116 Q100 148 143 116 L176 111 Q100 189 24 111 Z'],
  MIDRANGE: [
    'M24 6 H68 V99 L57 116 L24 111 Z',
    'M132 6 H176 V111 L143 116 L132 99 Z',
  ],
  FLOATER_RANGE: ['M68 99 H132 L143 116 Q100 148 57 116 Z'],
  SHORT_PAINT: ['M68 6 H132 V99 H68 Z'],
  RIM: ['M70 31 Q100 91 130 31 H112 Q100 55 88 31 Z'],
  RESTRICTED: ['M88 31 Q100 55 112 31 Z'],
}

export function courtZoneTemperature(zone: DetailedPerformanceShotZone):
  'unobserved' | 'low' | 'moderate' | 'good' | 'strong' {
  if (zone.attempted === 0 || zone.percentage === null) return 'unobserved'
  const accuracy = (zone.made / zone.attempted) * 100
  if (accuracy < 30) return 'low'
  if (accuracy < 50) return 'moderate'
  if (accuracy < 70) return 'good'
  return 'strong'
}

/** UX caution only: fewer than five attempts is a small observed sample, not a confidence score. */
export function hasLimitedShotSample(zone: DetailedPerformanceShotZone): boolean {
  return zone.attempted > 0 && zone.attempted < 5
}

export function PerformanceNineZoneCourt({ profile }: { readonly profile: PerformanceShotProfileModel }) {
  const zones = profile.detailedZones ?? []
  const [selectedId, setSelectedId] = useState<MatchShotZoneId>('RESTRICTED')
  const [expanded, setExpanded] = useState(false)
  const expandButtonRef = useRef<HTMLButtonElement>(null)
  const wasExpandedRef = useRef(false)
  const selected = zones.find((zone) => zone.id === selectedId) ?? zones[0]
  const totalPoints = zones.reduce((total, zone) => total + zone.points, 0)
  const provenance = profile.detailedProvenance === 'OBSERVED'
    ? 'RECORDED ZONES' : profile.detailedProvenance === 'MODELLED'
      ? 'MODELLED ZONES' : 'MIXED EVIDENCE'
  const select = (id: MatchShotZoneId) => setSelectedId(id)

  useEffect(() => {
    if (!expanded) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [expanded])

  useEffect(() => {
    if (expanded) wasExpandedRef.current = true
    if (expanded || wasExpandedRef.current) expandButtonRef.current?.focus()
  }, [expanded])

  const renderRegion = (zone: DetailedPerformanceShotZone) =>
    <g className={'po-pf-nine__region is-' + courtZoneTemperature(zone) +
      (hasLimitedShotSample(zone) ? ' is-limited-sample' : '') +
      (selected?.id === zone.id ? ' is-selected' : '')}
      key={zone.id} role="button" tabIndex={0} aria-pressed={selected?.id === zone.id}
      aria-label={zone.label + ': ' + zone.made + ' made of ' + zone.attempted + ' attempted'}
      onClick={() => select(zone.id)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(zone.id) } }}>
      <title>{zone.label + ' · ' + zone.made + '/' + zone.attempted + ' · ' + (zone.percentage ?? '—') + '%' +
        (hasLimitedShotSample(zone) ? ' · Small sample (' + zone.attempted + ' attempts)' : '')}</title>
      {COURT_ZONE_PATHS[zone.id].map((shape, index) => <path key={index} d={shape} />)}
    </g>

  const courtView = <section className={'po-pf-panel po-pf-shot po-pf-nine' + (expanded ? ' is-expanded' : '')}
    data-ng-region="performance-shot-profile" aria-label="Nine-zone basketball shooting map"
    role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined}
    onKeyDown={expanded ? (event) => {
      if (event.key !== 'Tab') return
      const candidates = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [role="button"][tabindex="0"]',
      ))
      const first = candidates[0], last = candidates[candidates.length - 1]
      if (first === undefined || last === undefined) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    } : undefined}>
    <div className="po-pf-nine__stage">
      <div className="po-pf-nine__source">
        <div><span>{provenance}</span>
          <small>{profile.detailedProvenance === 'OBSERVED' ? 'MatchEngine shot events' : 'Statistical subdivision · provisional'}</small></div>
        <button ref={expandButtonRef} type="button" className="po-pf-nine__expand"
          aria-label={expanded ? 'Close enlarged shot map' : 'Enlarge shot map'}
          aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'CLOSE ×' : 'EXPAND ↗'}
        </button>
      </div>
      <svg className="po-pf-nine__court" viewBox="0 0 200 230" role="group"
        aria-label="Selectable schematic basketball half-court zones. No shot coordinates are stored.">
        <rect className="po-pf-nine__floor" x={6} y={6} width={188} height={218} rx={3} />
        {/* Outside first, key last: small close-to-basket regions remain clickable. */}
        {zones.slice().reverse().map(renderRegion)}
        <g className="po-pf-nine__markings" aria-hidden="true">
          <rect className="po-pf-nine__boundary" x={6} y={6} width={188} height={218} rx={3} />
          <path className="po-pf-nine__court-lines" d="M24 6 V111 Q100 189 176 111 V6 M68 6 V99 H132 V6 M68 75 H132 M80 75 A20 20 0 0 0 120 75 M68 99 Q100 137 132 99 M88 31 Q100 55 112 31 M85 12 H115" />
          <circle className="po-pf-nine__rim" cx={100} cy={31} r={6} />
        </g>
      </svg>
      <div className="po-pf-nine__legend" aria-label="Shot efficiency by region, FG percentage">
        <span><i className="is-unobserved" />No attempts</span>
        <span><i className="is-low" />0–29%</span>
        <span><i className="is-moderate" />30–49%</span>
        <span><i className="is-good" />50–69%</span>
        <span><i className="is-strong" />70%+</span>
      </div>
      <p className="po-pf-nine__caption">Regions indicate shot families, not exact release coordinates.</p>
    </div>
    <div className="po-pf-nine__details">
      <div className="po-pf-nine__selected" aria-live="polite">
        <span>SELECTED ZONE</span>
        {selected !== undefined && hasLimitedShotSample(selected) &&
          <span className="po-pf-nine__small-sample" title="Fewer than five attempts; the observed shooting percentage may vary substantially.">
            SMALL SAMPLE · {selected.attempted} {selected.attempted === 1 ? 'ATTEMPT' : 'ATTEMPTS'}
          </span>}
        <strong>{selected?.label ?? 'No zone'}</strong>
        <div><b>{selected?.percentage === null || selected === undefined ? '—' : selected.percentage + '%'}</b>
          <span>{selected?.made ?? 0}/{selected?.attempted ?? 0} FG</span></div>
        <small>{selected?.share ?? 0}% of attempts · {selected?.points ?? 0} field points
          {totalPoints > 0 ? ' · ' + Math.round((selected?.points ?? 0) / totalPoints * 100) + '% of scoring' : ''}</small>
      </div>
      <div className="po-pf-nine__list" role="group" aria-label="Select a shooting zone">
        <div className="po-pf-nine__list-head"><span>SHOT ZONE</span><span>FGM/FGA</span><span>FG%</span></div>
        {zones.map((zone) => <button key={zone.id} type="button"
          aria-pressed={zone.id === selected?.id}
          title={hasLimitedShotSample(zone) ? 'Small sample: ' + zone.attempted + ' attempts. FG% may change substantially with additional shots.' : undefined}
          onClick={() => select(zone.id)}>
          <span className="po-pf-nine__zone-name"><i className={'is-' + courtZoneTemperature(zone)} />{zone.label}</span>
          <b>{zone.made}/{zone.attempted}</b>
          <em>{zone.percentage === null ? '—' : zone.percentage + '%'}
            {hasLimitedShotSample(zone) && <sup aria-hidden="true">†</sup>}</em>
        </button>)}
      </div>
      <p className="po-pf-nine__disclaimer">{profile.note}
        <span className="po-pf-nine__sample-key"> † Fewer than five attempts: interpret FG% cautiously.</span>
      </p>
    </div>
  </section>

  // Place the enlarged view directly under the Courtside shell, outside the
  // clipped analysis/game panels. Retain the same component state/selection.
  if (!expanded || typeof document === 'undefined') return courtView
  const appRoot = document.querySelector('.bdm-os-ng[data-bdm-courtside-shell="true"]')
  return createPortal(
    <div className="po-pf-board--courtside po-pf-nine__portal">{courtView}</div>,
    appRoot ?? document.body,
  )
}
