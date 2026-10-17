import type { CSSProperties, ReactNode } from 'react'
import type { PlayerId, StaffPersonId } from '@/domain/ids'
import type { MedicalWorkspaceModel, MedicalHistoryRow, MedicalInjuredRow, MedicalRiskRow, MedicalStaffRow } from './medicalWorkspaceModel'

/**
 * Medical Courtside visual layer. All counts and measurements come from the
 * canonical MedicalWorkspaceModel. These charts are cross-sectional snapshots,
 * not invented historical measurements or predictions of clinical clearance.
 */
const bounded = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
const ratio = (value: number, total: number) => total > 0 ? bounded(value * 100 / total) : 0

function Panel({ title, meta, children, className = '' }: {
  readonly title: string
  readonly meta?: string
  readonly children: ReactNode
  readonly className?: string
}) {
  return <section className={`medical-cs__panel ${className}`}>
    <header className="medical-cs__panel-head">
      <h3>{title}</h3>
      {meta && <span>{meta}</span>}
    </header>
    {children}
  </section>
}

function Meter({ value, max = 100, tone = 'lime', label }: {
  readonly value: number
  readonly max?: number
  readonly tone?: 'lime' | 'orange' | 'red' | 'muted'
  readonly label: string
}) {
  return <div className="medical-cs__meter" role="img" aria-label={`${label}: ${value} of ${max}`}>
    <span className="medical-cs__meter-fill" data-tone={tone} style={{ width: `${ratio(value, max)}%` }} />
  </div>
}

function AvailabilityDonut({ model }: { readonly model: MedicalWorkspaceModel }) {
  const availableRatio = ratio(model.availableCount, model.rosterCount)
  return <Panel title="Squad availability" meta="CURRENT ROSTER" className="medical-cs__availability">
    <div className="medical-cs__donut-layout">
      <div className="medical-cs__donut" role="img"
        aria-label={`${model.availableCount} of ${model.rosterCount} players available`}
        style={{ '--med-share': `${availableRatio}%` } as CSSProperties}>
        <div><strong>{Math.round(availableRatio)}<small>%</small></strong><span>AVAILABLE</span></div>
      </div>
      <div className="medical-cs__donut-legend">
        <div><i className="is-lime" /><strong>{model.availableCount}</strong><span>Available</span></div>
        <div><i className="is-red" /><strong>{model.injuredCount}</strong><span>Active injury records</span></div>
        <div><i className="is-muted" /><strong>{model.rosterCount}</strong><span>Roster</span></div>
      </div>
    </div>
    <small className="medical-cs__annotation">Availability follows the game engine. Injuries are counted as records, not necessarily unique players.</small>
  </Panel>
}

function RiskBands({ model }: { readonly model: MedicalWorkspaceModel }) {
  const total = model.risk.length
  const bands = [
    { id: 'low', count: model.lowRiskCount, title: 'LOW' },
    { id: 'elevated', count: model.elevatedRiskCount, title: 'ELEVATED' },
    { id: 'high', count: model.highRiskCount, title: 'HIGH' },
  ] as const
  return <Panel title="Injury risk profile" meta={`${total} ASSESSED`}>
    <div className="medical-cs__stacked" role="img" aria-label={bands.map(band => `${band.title} ${band.count}`).join(', ')}>
      {bands.map(band => <span key={band.id} data-band={band.id} style={{ width: `${ratio(band.count, total)}%` }} />)}
    </div>
    <div className="medical-cs__risk-bands">
      {bands.map(band => <div key={band.id}><span className={`medical-cs__dot is-${band.id}`} /> <b>{band.count}</b><small>{band.title}</small></div>)}
    </div>
    <div className="medical-cs__risk-footer"><span>AVERAGE FATIGUE</span><strong>{model.averageFatigue}<small>/100</small></strong></div>
    <Meter value={model.averageFatigue} label="Average squad career fatigue" tone={model.averageFatigue >= 70 ? 'red' : model.averageFatigue >= 50 ? 'orange' : 'lime'} />
    <small className="medical-cs__annotation">Current engine assessment, not a future injury probability.</small>
  </Panel>
}

export function MedicalRiskScatter({ rows, onOpenPlayer }: {
  readonly rows: readonly MedicalRiskRow[]
  readonly onOpenPlayer: (id: PlayerId) => void
}) {
  return <Panel title="Fatigue × injury risk" meta="CURRENT SNAPSHOT" className="medical-cs__scatter-panel">
    {rows.length === 0 ? <div className="medical-cs__no-data">No engine risk assessments available.</div> : <>
      <div className="medical-cs__scatter-wrapper">
        <svg className="medical-cs__scatter" viewBox="0 0 520 236" role="img"
          aria-label="Players plotted by career fatigue on the horizontal axis and injury risk score on the vertical axis">
          {[0, 25, 50, 75, 100].map(n => <g key={n}>
            <line x1={44 + n * 4.3} x2={44 + n * 4.3} y1="12" y2="202" className="medical-cs__gridline"/>
            <line x1="44" x2="474" y1={202 - n * 1.9} y2={202 - n * 1.9} className="medical-cs__gridline"/>
            <text x={44 + n * 4.3} y="222" textAnchor="middle" className="medical-cs__axis">{n}</text>
            <text x="36" y={206 - n * 1.9} textAnchor="end" className="medical-cs__axis">{n}</text>
          </g>)}
          <line x1="44" y1="12" x2="44" y2="202" className="medical-cs__axis-line" />
          <line x1="44" y1="202" x2="474" y2="202" className="medical-cs__axis-line" />
          {rows.map(row => <g key={row.playerId} className="medical-cs__plot-point"
            role="button" tabIndex={0} aria-label={`Open ${row.playerName}: fatigue ${row.fatigue}, risk ${row.riskScore}`}
            onClick={() => onOpenPlayer(row.playerId)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenPlayer(row.playerId) } }}>
            <circle cx={44 + bounded(row.fatigue) * 4.3} cy={202 - bounded(row.riskScore) * 1.9} r="7.5" data-band={row.riskBand}/>
            <title>{`${row.playerName}: fatigue ${row.fatigue}, risk ${row.riskScore} (${row.riskBandLabel})`}</title>
          </g>)}
          <text x="259" y="235" textAnchor="middle" className="medical-cs__axis-title">CAREER FATIGUE</text>
          <text transform="translate(10 106) rotate(-90)" textAnchor="middle" className="medical-cs__axis-title">INJURY RISK</text>
        </svg>
      </div>
      <div className="medical-cs__scatter-legend"><span><i className="medical-cs__dot is-low" /> Low</span><span><i className="medical-cs__dot is-elevated" /> Elevated</span><span><i className="medical-cs__dot is-high" /> High</span><small>SELECT A PLAYER FOR THEIR DOSSIER</small></div>
    </>}
  </Panel>
}

function CaseForecast({ rows, onOpenPlayer }: { readonly rows: readonly MedicalInjuredRow[]; readonly onOpenPlayer: (id: PlayerId) => void }) {
  const maxDays = Math.max(1, ...rows.map(row => Math.max(0, row.daysRemaining)))
  return <Panel title="Next medical reviews" meta="SCHEDULED, NOT CLEARANCE" className="medical-cs__case-forecast">
    {rows.length === 0
      ? <div className="medical-cs__no-data">No medical reviews scheduled.</div>
      : <div className="medical-cs__case-list">
          {[...rows].sort((a,b) => a.daysRemaining - b.daysRemaining).slice(0, 6).map(row =>
            <button type="button" className="medical-cs__case-row" key={row.injuryId} onClick={() => onOpenPlayer(row.playerId)}>
              <div className="medical-cs__case-top">
                <strong>{row.playerName}</strong>
                <small>{row.injuryLabel}</small>
                <b data-status={row.daysRemaining <= 0 ? 'due' : 'scheduled'}>{row.daysRemaining <= 0 ? 'REVIEW DUE' : `${row.daysRemaining}D TO REVIEW`}</b>
              </div>
              <div className="medical-cs__track"><span data-severity={row.severity} style={{ width: `${ratio(Math.max(0, row.daysRemaining), maxDays)}%` }} /></div>
            </button>,
          )}
        </div>}
    <small className="medical-cs__annotation">Bar length compares days remaining between cases. It does not measure physical healing.</small>
  </Panel>
}


/** A real roster-wide medical view, useful even on day one with no injuries. */
export function MedicalSquadMonitor({ rows, onOpenPlayer }: {
  readonly rows: readonly MedicalRiskRow[]
  readonly onOpenPlayer: (id: PlayerId) => void
}) {
  const ordered = [...rows].sort((a, b) => b.riskScore - a.riskScore || b.fatigue - a.fatigue || a.playerName.localeCompare(b.playerName))
  return <Panel title="Squad medical monitor" meta={`${rows.length} PLAYER ASSESSMENTS`} className="medical-cs__squad-monitor">
    {ordered.length === 0
      ? <div className="medical-cs__no-data">No medical assessments recorded for this roster.</div>
      : <div className="medical-cs__squad-grid">
        {ordered.map(row => <button type="button" key={row.playerId} className="medical-cs__squad-player" onClick={() => onOpenPlayer(row.playerId)}
          aria-label={`Open medical profile for ${row.playerName}: fatigue ${row.fatigue}, risk ${row.riskScore}`}>
          <div className="medical-cs__squad-person">
            <span className="medical-cs__squad-position">{row.position}</span>
            <strong>{row.playerName}</strong>
            <span className="medical-cs__squad-status" data-band={row.available ? row.riskBand : 'unavailable'}>
              {row.available ? row.riskBandLabel.toUpperCase() : 'UNAVAILABLE'}
            </span>
          </div>
          <div className="medical-cs__squad-bars">
            <div><small>FATIGUE</small><Meter value={row.fatigue} label={`${row.playerName} fatigue`}
              tone={row.fatigue >= 70 ? 'red' : row.fatigue >= 50 ? 'orange' : 'lime'} /><b>{row.fatigue}</b></div>
            <div><small>RISK</small><Meter value={row.riskScore} label={`${row.playerName} injury risk score`}
              tone={row.riskBand === 'high' ? 'red' : row.riskBand === 'elevated' ? 'orange' : 'lime'} /><b>{row.riskScore}</b></div>
          </div>
        </button>)}
      </div>}
    <small className="medical-cs__annotation">These are current engine assessments. The risk score is not a percentage probability of injury. Select any player to open their medical file.</small>
  </Panel>
}

export function MedicalNoInjuries({ model, onOpenPlayer }: {
  readonly model: MedicalWorkspaceModel
  readonly onOpenPlayer: (id: PlayerId) => void
}) {
  return <div className="medical-cs__healthy-state" data-ng-region="medical-healthy-injuries">
    <section className="medical-cs__healthy-banner" aria-label="No active injuries">
      <div className="medical-cs__healthy-symbol" aria-hidden="true">✓</div>
      <div><span>MEDICAL SITUATION</span><h2>NO ACTIVE INJURIES</h2>
        <p>No current injury cases require rehabilitation or a return-to-play review. Medical risk monitoring remains available below.</p></div>
      <div className="medical-cs__healthy-counts">
        <div><strong>{model.injuredCount}</strong><span>ACTIVE CASES</span></div>
        <div><strong>{model.availableCount}<small> / {model.rosterCount}</small></strong><span>AVAILABLE</span></div>
        <div><strong>{model.highRiskCount + model.elevatedRiskCount}</strong><span>ELEVATED OR HIGH RISK</span></div>
      </div>
    </section>
    <MedicalSquadMonitor rows={model.risk} onOpenPlayer={onOpenPlayer} />
  </div>
}

export function MedicalOverviewVisual({ model, onOpenPlayer }: {
  readonly model: MedicalWorkspaceModel
  readonly onOpenPlayer: (id: PlayerId) => void
}) {
  return <div className="medical-cs__overview" data-ng-region="medical-courtside-dashboard">
    <AvailabilityDonut model={model} />
    <RiskBands model={model} />
    <MedicalRiskScatter rows={model.risk} onOpenPlayer={onOpenPlayer}/>
    <CaseForecast rows={model.injured} onOpenPlayer={onOpenPlayer}/>
  </div>
}

export function MedicalInjuryVisual({ rows, onOpenPlayer }: {
  readonly rows: readonly MedicalInjuredRow[]
  readonly onOpenPlayer: (id: PlayerId) => void
}) {
  const severity = ['minor', 'moderate', 'serious'] as const
  return <div className="medical-cs__section-grid" data-ng-region="medical-injuries-visual">
    <Panel title="Active injury severity" meta={`${rows.length} CASES`}>
      <div className="medical-cs__severity-grid">{severity.map(level => {
        const count = rows.filter(row => row.severity === level).length
        return <div key={level} data-severity={level}><b>{count}</b><small>{level.toUpperCase()}</small><Meter label={level + ' injury records'} value={count} max={Math.max(1, rows.length)} tone={level === 'serious' ? 'red' : level === 'moderate' ? 'orange' : 'muted'}/></div>
      })}</div>
    </Panel>
    <CaseForecast rows={rows} onOpenPlayer={onOpenPlayer}/>
  </div>
}

export function MedicalRecoveryVisual({ model, onOpenPlayer }: {
  readonly model: MedicalWorkspaceModel
  readonly onOpenPlayer: (id: PlayerId) => void
}) {
  const due = model.returnToPlayReviews.length
  const recovering = model.injured.filter(row => row.lifecycleStatus === 'RECOVERING').length
  return <div className="medical-cs__recovery" data-ng-region="medical-recovery-visual">
    <div className="medical-cs__recovery-metrics">
      <div><span>RETURN-TO-PLAY REVIEWS</span><strong data-tone={due > 0 ? 'alert' : 'normal'}>{due}</strong></div>
      <div><span>IN REHABILITATION</span><strong>{recovering}</strong></div>
      <div><span>OPEN STAFF ADVISORIES</span><strong>{model.openAdvisoryCount}</strong></div>
    </div>
    <CaseForecast rows={model.injured} onOpenPlayer={onOpenPlayer}/>
  </div>
}

export function MedicalHistoryVisual({ rows }: { readonly rows: readonly MedicalHistoryRow[] }) {
  const groups = new Map<string, number>()
  rows.forEach(row => groups.set(row.familyLabel, (groups.get(row.familyLabel) ?? 0) + 1))
  const families = [...groups.entries()].sort((a,b) => b[1] - a[1]).slice(0, 7)
  const highest = Math.max(1, ...families.map(entry => entry[1]))
  const recurrent = rows.filter(row => row.recurrenceLabel === 'RELATED / RECURRENT').length
  return <div className="medical-cs__section-grid" data-ng-region="medical-history-visual">
    <Panel title="Recorded injury families" meta="ALL RECORDED CASES">
      {families.length === 0 ? <div className="medical-cs__no-data">No recorded history.</div> :
        <div className="medical-cs__history-bars">{families.map(([family, count]) =>
          <div key={family}><span>{family}</span><div className="medical-cs__track"><i style={{ width: `${ratio(count, highest)}%` }}/></div><b>{count}</b></div>,
        )}</div>}
    </Panel>
    <Panel title="Recurrence in records" meta="RECORDED FAMILY MATCHES">
      <div className="medical-cs__history-summary">
        <div><strong>{rows.length}</strong><span>Injury records</span></div>
        <div><strong>{recurrent}</strong><span>Related or recurrent</span></div>
      </div>
      <div className="medical-cs__stacked" role="img" aria-label={`${recurrent} recurrent records out of ${rows.length}`}>
        <span data-band="high" style={{ width: `${ratio(recurrent, rows.length)}%` }}/>
        <span data-band="low" style={{ width: `${ratio(rows.length - recurrent, rows.length)}%` }}/>
      </div>
      <small className="medical-cs__annotation">Based on engine-recorded injury families. No unrecorded diagnoses inferred.</small>
    </Panel>
  </div>
}

export function MedicalStaffVisual({ rows, onOpenStaff }: {
  readonly rows: readonly MedicalStaffRow[]
  readonly onOpenStaff: (id: StaffPersonId) => void
}) {
  return <div className="medical-cs__staff-visual" data-ng-region="medical-staff-visual">
    <Panel title="Medical department capability" meta="ROLE PROFICIENCY / 100">
      {rows.length === 0 ? <div className="medical-cs__no-data">No medical staff assigned.</div> :
        <div className="medical-cs__staff-bars">{rows.map(row =>
          <button type="button" key={row.staffPersonId} onClick={() => onOpenStaff(row.staffPersonId)}>
            <span><strong>{row.name}</strong><small>{row.roleLabel}</small></span>
            <div><Meter label={`${row.name} proficiency`} value={row.proficiency} tone="lime"/><b>{row.proficiency}</b></div>
            <small>{row.workloadLabel} · {row.utilizationLabel} UTILIZATION</small>
          </button>,
        )}</div>}
    </Panel>
  </div>
}
