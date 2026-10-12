import { useState } from 'react'

import { STAFF_UNIT_COHESION_DIMENSIONS } from '@/domain/staffUnitCohesion'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { getStaffPerson, type GameWorld } from '@/domain/world'
import { explainStaffCultureFit } from '@/ui/staffCulturePresentation'
import { getStaffConflictsForTeam, type StaffConflictPresentationItem } from '@/ui/staffConflictPresentation'
import {
  explainStaffHumanState,
  getStaffDynamicsForTeam,
  INTENSITY_BAND_LABELS,
  SATISFACTION_BAND_LABELS,
  type StaffDynamicsPresentationItem,
} from '@/ui/staffHumanStatePresentation'
import { getOpenStaffCareerRequestsPresentation, presentStaffCareerOutlook } from '@/ui/staffPresentation'
import {
  explainStaffUnitCohesion,
  getStaffUnitsForTeam,
  STAFF_UNIT_COHESION_BAND_LABELS,
  type StaffUnitPresentationItem,
} from '@/ui/staffUnitCohesionPresentation'

import { DynamicsToneDot, DynamicsTonePair } from '@/ui-ng/applications/staff/DynamicsToneDot'
import { FilterGroup, InspectorSection, MetricRow } from '@/ui-ng/applications/staff/StaffChrome'
import {
  toneForCohesionBand,
  toneForConflictSeverity,
  toneForCareerOutlook,
  toneForConflictStage,
  toneForCultureFit,
  toneForExpectationGap,
  toneForHumanStateBand,
  toneForInterpretedState,
  toneForRelationshipState,
  toneForTrend,
} from '@/ui-ng/applications/staff/dynamicsTone'
import {
  DYNAMICS_FILTER_LABELS,
  DYNAMICS_FILTERS,
  DYNAMICS_STATE_LABELS,
  DYNAMICS_SUBVIEW_LABELS,
  DYNAMICS_SUBVIEWS,
  DYNAMICS_TREND_LABELS,
  UNIT_COHESION_COLUMN_LABEL,
  WORKING_RELATIONSHIP_STATE_LABELS,
  type DynamicsFilter,
  type DynamicsSubviewId,
} from '@/ui-ng/applications/staff/staffWorkspaceModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

function matchesDynamicsFilter(item: StaffDynamicsPresentationItem, filter: DynamicsFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true
    case 'NEEDS_ATTENTION':
      return item.needsAttention
    case 'FRUSTRATED':
      return item.interpretedState === 'FRUSTRATED'
    case 'OVERLOADED':
      return item.signalKinds.includes('sustainedOverload') || item.signalKinds.includes('responsibilityOverextension')
    case 'UNDERUTILIZED':
      return item.signalKinds.includes('sustainedUnderutilization')
    case 'LOW_INFLUENCE':
      return item.signalKinds.includes('influenceDeficit')
    case 'LOW_COMMITMENT':
      return item.signalKinds.includes('lowOrganizationalCommitment')
    case 'CONTRACT_CONCERNS':
      return item.signalKinds.includes('contractMismatch') || item.signalKinds.includes('jobSecurityConcern')
    case 'DEVELOPMENT_CONCERNS':
      return item.signalKinds.includes('developmentStagnation')
    case 'THRIVING':
      return item.interpretedState === 'THRIVING'
  }
}

function humanStateLabel(value: string): string {
  return (SATISFACTION_BAND_LABELS as Record<string, string>)[value] ?? (INTENSITY_BAND_LABELS as Record<string, string>)[value] ?? value
}

export function StaffDynamicsBoard({
  world,
  teamId,
  onGrantCareerRequest,
  onDeclineCareerRequest,
  onOpenStaff,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly onGrantCareerRequest?: (requestId: string) => void
  readonly onDeclineCareerRequest?: (requestId: string) => void
  readonly onOpenStaff?: (staffPersonId: StaffPersonId) => void
}) {
  const [subview, setSubview] = useState<DynamicsSubviewId>('people')

  return (
    <div className="cs-staff-dynamics">
      <header className="cs-staff-dynamics__heading">
        <div className="cs-staff-eyebrow">PERSONAS / CULTURA / TRAYECTORIAS</div>
        <h1>EL PULSO DEL EQUIPO</h1>
        <p>Estado profesional, unidades, tensiones y peticiones basadas en hechos del mundo.</p>
      </header>
      <nav className="cs-staff-dynamics__tabs" aria-label="Áreas de dinámicas">
        {DYNAMICS_SUBVIEWS.map((id) => (
          <button
            aria-pressed={subview === id}
            className={`ng-btn ng-btn--toggle${subview === id ? ' is-active' : ''}`}
            key={id}
            onClick={() => setSubview(id)}
            type="button"
          >
            {DYNAMICS_SUBVIEW_LABELS[id]}
          </button>
        ))}
      </nav>
      {subview === 'units' ? (
        <UnitsSubview teamId={teamId} world={world} />
      ) : subview === 'conflicts' ? (
        <ConflictsSubview teamId={teamId} world={world} />
      ) : subview === 'career' ? (
        <CareerRequestsSubview onDecline={onDeclineCareerRequest} onGrant={onGrantCareerRequest} teamId={teamId} world={world} />
      ) : (
        <PeopleSubview onOpenStaff={onOpenStaff} teamId={teamId} world={world} />
      )}
    </div>
  )
}

function CareerRequestsSubview({
  world,
  teamId,
  onGrant,
  onDecline,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly onGrant?: (requestId: string) => void
  readonly onDecline?: (requestId: string) => void
}) {
  const requests = getOpenStaffCareerRequestsPresentation(world, teamId)
  return (
    <aside className="staff-workspace__inspector ng-holo-panel staff-workspace__inspector--wide">
      <p className="staff-workspace__eyebrow">Career requests</p>
      <h2 className="staff-workspace__inspector-title">Pending requests</h2>
      {requests.length === 0 ? (
        <p className="staff-workspace__note">No staff career requests require a decision.</p>
      ) : (
        requests.map((request) => (
          <section className="staff-workspace__card" key={request.id}>
            <h3>{request.staffName}</h3>
            <p className="staff-workspace__note">
              {request.role} · {request.request}
            </p>
            <p className="staff-workspace__note">{request.detail}</p>
            <div className="staff-workspace__actions">
              {onGrant !== undefined ? (
                <button className="ng-btn ng-btn--primary" onClick={() => onGrant(request.id)} type="button">
                  Grant
                </button>
              ) : null}
              {onDecline !== undefined ? (
                <button className="ng-btn" onClick={() => onDecline(request.id)} type="button">
                  Decline
                </button>
              ) : null}
            </div>
          </section>
        ))
      )}
    </aside>
  )
}

function ConflictsSubview({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const [history, setHistory] = useState(false)
  const items = getStaffConflictsForTeam(world, teamId).filter((item) => (history ? item.status === 'RESOLVED' : item.status === 'ACTIVE'))
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const selected = items.find((item) => item.id === selectedId) ?? items[0]

  return (
    <div className="staff-workspace__stack">
      <FilterGroup>
        <button
          aria-pressed={!history}
          className={`ng-btn ng-btn--toggle${!history ? ' is-active' : ''}`}
          onClick={() => setHistory(false)}
          type="button"
        >
          ABIERTOS
        </button>
        <button
          aria-pressed={history}
          className={`ng-btn ng-btn--toggle${history ? ' is-active' : ''}`}
          onClick={() => setHistory(true)}
          type="button"
        >
          HISTORIAL
        </button>
      </FilterGroup>
      {items.length === 0 ? (
        <p className="staff-workspace__empty">No staff conflicts in this scope.</p>
      ) : (
        <div className="staff-workspace__split">
          <div className="staff-workspace__panel ng-holo-panel">
            <NgPrecisionTable
              className="staff-workspace__table"
              columns={ngTableColumns(items, [
                ngCol('parties', 'Parties', (row) => row.parties, { value: (row) => row.parties }),
                ngCol('type', 'Type', (row) => row.type, { value: (row) => row.type }),
                ngCol('stage', 'Stage', (row) => row.stage, { value: (row) => row.stage }),
                ngCol(
                  'severity',
                  'Severity',
                  (row) => (
                    <span className="staff-workspace__tone-cell">
                      <DynamicsToneDot label={row.severity} tone={toneForConflictSeverity(row.severity)} />
                    </span>
                  ),
                  { value: (row) => row.severity },
                ),
                ngCol(
                  'trend',
                  'Trend',
                  (row) => (
                    <span className="staff-workspace__tone-cell">
                      <DynamicsToneDot label={row.trend} tone={toneForTrend(row.trend)} />
                    </span>
                  ),
                  { value: (row) => row.trend },
                ),
              ])}
              gridId="ng-staff-dynamics-conflicts"
              onSelectionChange={(ids) => {
                if (ids[0]) setSelectedId(ids[0])
              }}
              rows={items}
              selectedId={selected?.id}
            />
          </div>
          {selected !== undefined ? <ConflictInspector item={selected} /> : null}
        </div>
      )}
    </div>
  )
}

function ConflictInspector({ item }: { readonly item: StaffConflictPresentationItem }) {
  return (
    <aside className="staff-workspace__inspector ng-holo-panel">
      <p className="staff-workspace__eyebrow">Conflict</p>
      <h2 className="staff-workspace__inspector-title">{item.parties}</h2>
      <dl className="staff-workspace__metrics">
        <MetricRow label="Primary cause" value={item.primaryCause} />
        <MetricRow
          label="State"
          value={
            <DynamicsTonePair>
              <DynamicsToneDot label={item.severity} tone={toneForConflictSeverity(item.severity)} />
              <DynamicsToneDot label={item.stage} tone={toneForConflictStage(item.stage)} />
            </DynamicsTonePair>
          }
        />
      </dl>
      <InspectorSection title="Drivers">
        {item.drivers.map((driver) => (
          <p className="staff-workspace__note" key={driver}>
            {driver}
          </p>
        ))}
      </InspectorSection>
    </aside>
  )
}

function PeopleSubview({
  world,
  teamId,
  onOpenStaff,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly onOpenStaff?: (staffPersonId: StaffPersonId) => void
}) {
  const items = getStaffDynamicsForTeam(world, teamId)
  const [filter, setFilter] = useState<DynamicsFilter>('ALL')
  const [selectedId, setSelectedId] = useState<StaffPersonId | undefined>(undefined)
  const filtered = items.filter((item) => matchesDynamicsFilter(item, filter))
  const selected = filtered.find((item) => item.staffId === selectedId) ?? filtered[0]
  const sorted=[...filtered].sort((a,b)=>Number(b.needsAttention)-Number(a.needsAttention)||
    a.staffName.localeCompare(b.staffName))

  const needAttention = items.filter((item) => item.needsAttention).length
  const highStress = items.filter((item) => item.bands.stress === 'HIGH' || item.bands.stress === 'VERY_HIGH' || item.bands.stress === 'EXTREME').length
  const lowCommitment = items.filter((item) => item.signalKinds.includes('lowOrganizationalCommitment')).length
  const thriving = items.filter((item) => item.interpretedState === 'THRIVING').length

  return (
    <section className="cs-staff-people" aria-label="Estado profesional del equipo">
      <div className="cs-staff-people__summary">
        <span><strong>{items.length}</strong> PROFESIONALES</span>
        <span className={needAttention>0?'is-warning':''}><strong>{needAttention}</strong> REQUIEREN ATENCIÓN</span>
        <span><strong>{highStress}</strong> ESTRÉS ELEVADO</span>
        <span><strong>{lowCommitment}</strong> BAJO COMPROMISO</span>
        <span><strong>{thriving}</strong> FAVORABLE</span>
      </div>
      <div className="cs-staff-people__filter" role="group" aria-label="Filtrar estado del staff">
        {DYNAMICS_FILTERS.map(option=><button type="button" key={option}
          className="cs-staff-people__filter-button" aria-pressed={filter===option}
          onClick={()=>setFilter(option)}>{DYNAMICS_FILTER_LABELS[option]}</button>)}
      </div>
      {sorted.length===0?<p className="cs-staff-empty">
        Ningún profesional coincide con los filtros actuales.
      </p>:<div className="cs-staff-people__layout">
        <div className="cs-staff-people__list" aria-label="Profesionales y estado">
          <div className="cs-staff-people__columns">
            <span>PROFESIONAL</span><span>ESTADO</span><span>ESTRÉS</span>
            <span>SATISFACCIÓN</span><span>SEÑALES</span>
          </div>
          {sorted.map(row=><button key={row.staffId} type="button"
            aria-pressed={selected?.staffId===row.staffId}
            className={'cs-staff-people__row'+(selected?.staffId===row.staffId?' is-selected':'')}
            onClick={()=>setSelectedId(row.staffId)}>
            <span className="cs-staff-people__name"><strong>{row.staffName}</strong>
              <small>{row.role??'Personal técnico'}</small></span>
            <span><DynamicsToneDot label={DYNAMICS_STATE_LABELS[row.interpretedState]}
              tone={toneForInterpretedState(row.interpretedState)}/></span>
            <span><DynamicsToneDot label={humanStateLabel(row.bands.stress)}
              tone={toneForHumanStateBand('stress',row.bands.stress)}/></span>
            <span><DynamicsToneDot label={humanStateLabel(row.bands.roleSatisfaction)}
              tone={toneForHumanStateBand('roleSatisfaction',row.bands.roleSatisfaction)}/></span>
            <strong className={row.needsAttention?'is-warning':''}>
              {row.signalKinds.length>0?row.signalKinds.length:'—'}</strong>
          </button>)}
        </div>
        {selected!==undefined?<div className="cs-staff-people__detail">
          <DynamicsInspector staffId={selected.staffId} world={world}/>
          {onOpenStaff&&<button type="button" className="cs-staff-people__profile"
            onClick={()=>onOpenStaff(selected.staffId)}>VER PERFIL COMPLETO ↗</button>}
        </div>:null}
      </div>}
    </section>
  )
}

function DynamicsInspector({ world, staffId }: { readonly world: GameWorld; readonly staffId: StaffPersonId }) {
  const explanation = explainStaffHumanState(world, staffId)
  const person = getStaffPerson(world, staffId)
  const career = presentStaffCareerOutlook(world, staffId)
  if (explanation === undefined || person === undefined) {
    return (
      <aside className="staff-workspace__inspector ng-holo-panel">
        <p className="staff-workspace__note">No dynamics data yet.</p>
      </aside>
    )
  }

  const fit = explainStaffCultureFit(world, staffId)

  return (
    <aside className="staff-workspace__inspector ng-holo-panel">
      <p className="staff-workspace__eyebrow">Professional state</p>
      <h2 className="staff-workspace__inspector-title">
        {person.identity.firstName} {person.identity.lastName}
      </h2>
      <dl className="staff-workspace__metrics">
        <MetricRow
          label="State"
          value={
            <DynamicsToneDot
              label={DYNAMICS_STATE_LABELS[explanation.currentState]}
              tone={toneForInterpretedState(explanation.currentState)}
            />
          }
        />
        <MetricRow
          label="Trend"
          value={
            <DynamicsToneDot label={DYNAMICS_TREND_LABELS[explanation.trend]} tone={toneForTrend(explanation.trend)} />
          }
        />
      </dl>

      {career !== undefined ? (
        <InspectorSection title="Career outlook">
          <dl className="staff-workspace__metrics">
            <MetricRow
              label="Outlook"
              value={<DynamicsToneDot label={career.outlook} tone={toneForCareerOutlook(career.outlook)} />}
            />
            <MetricRow label="Current focus" value={career.intent} />
          </dl>
          <ul className="staff-workspace__list">
            {career.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}

      {explanation.positives.length > 0 ? (
        <InspectorSection title="Key positives">
          <ul className="staff-workspace__list">
            {explanation.positives.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}

      {explanation.concerns.length > 0 ? (
        <InspectorSection title="Key concerns">
          <ul className="staff-workspace__list">
            {explanation.concerns.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}

      {explanation.expectationGaps.length > 0 ? (
        <InspectorSection title="Expectation gaps">
          <dl className="staff-workspace__metrics">
            {explanation.expectationGaps.map((gap) => (
              <MetricRow
                key={gap.dimension}
                label={gap.label}
                value={<DynamicsToneDot label={gap.band.replace(/_/g, ' ')} tone={toneForExpectationGap(gap.band)} />}
              />
            ))}
          </dl>
        </InspectorSection>
      ) : null}

      {explanation.recentDevelopments.length > 0 ? (
        <InspectorSection title="Recent developments">
          <ul className="staff-workspace__list">
            {explanation.recentDevelopments.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}

      {explanation.memories.length > 0 ? (
        <InspectorSection title="Significant professional memories">
          <ul className="staff-workspace__list">
            {explanation.memories.map((memory) => (
              <li key={memory.id}>
                {memory.summary} ({memory.occurredOn})
              </li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}

      <InspectorSection title="Culture fit">
        <dl className="staff-workspace__metrics">
          <MetricRow
            label="Fit"
            value={
              fit.established ? (
                <DynamicsToneDot label={fit.label} tone={toneForCultureFit(fit.band)} />
              ) : (
                fit.label
              )
            }
          />
        </dl>
        {!fit.established ? <p className="staff-workspace__note">Organizational culture has not settled yet.</p> : null}
        {fit.causes.length > 0 ? (
          <ul className="staff-workspace__list">
            {fit.causes.map((cause) => (
              <li key={cause}>{cause}</li>
            ))}
          </ul>
        ) : null}
        {fit.established && fit.causes.length === 0 && fit.frictionWith.length === 0 && fit.alignedWith.length > 0 ? (
          <p className="staff-workspace__note">Aligned on: {fit.alignedWith.slice(0, 4).join(', ')}.</p>
        ) : null}
      </InspectorSection>

      {explanation.relationships.length > 0 ? (
        <InspectorSection title="Working relationships">
          <ul className="staff-workspace__relationships">
            {explanation.relationships.map((relationship) => (
              <li key={relationship.personId}>
                <span>
                  {relationship.personLabel}
                  {relationship.personRole !== undefined ? ` · ${relationship.personRole}` : ''}
                </span>
                <DynamicsTonePair>
                  <DynamicsToneDot
                    label={WORKING_RELATIONSHIP_STATE_LABELS[relationship.state] ?? relationship.state}
                    tone={toneForRelationshipState(relationship.state)}
                  />
                  <DynamicsToneDot label={relationship.trend} tone={toneForTrend(relationship.trend)} />
                </DynamicsTonePair>
              </li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}

      {explanation.positives.length === 0 &&
      explanation.concerns.length === 0 &&
      explanation.expectationGaps.length === 0 &&
      explanation.recentDevelopments.length === 0 ? (
        <p className="staff-workspace__note">Nothing notable to report — a settled, unremarkable professional state.</p>
      ) : null}
    </aside>
  )
}

function UnitsSubview({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const units = getStaffUnitsForTeam(world, teamId)
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)
  const selected = units.find((unit) => unit.unitKey === selectedKey) ?? units[0]
  const rows = units.map((unit) => ({ ...unit, id: unit.unitKey }))

  if (units.length === 0) {
    return <p className="staff-workspace__empty">No staff units resolved for this team.</p>
  }

  return (
    <div className="staff-workspace__split">
      <div className="staff-workspace__panel ng-holo-panel">
        <NgPrecisionTable
          className="staff-workspace__table"
          columns={ngTableColumns(rows, [
            ngCol('unit', 'Unit', (row) => row.departmentLabel, { value: (row) => row.departmentLabel }),
            ngCol('members', 'Members', (row) => row.memberCount, { numeric: true, value: (row) => row.memberCount }),
            ngCol('lead', 'Lead', (row) => row.leaderLabel, { value: (row) => row.leaderLabel }),
            ...STAFF_UNIT_COHESION_DIMENSIONS.map((dimension) =>
              ngCol<(typeof rows)[number]>(
                dimension,
                UNIT_COHESION_COLUMN_LABEL[dimension],
                (row) => (
                  <span className="staff-workspace__tone-cell">
                    <DynamicsToneDot
                      label={STAFF_UNIT_COHESION_BAND_LABELS[row.bands[dimension]]}
                      tone={toneForCohesionBand(row.bands[dimension])}
                    />
                  </span>
                ),
                { value: (row) => STAFF_UNIT_COHESION_BAND_LABELS[row.bands[dimension]] },
              ),
            ),
          ])}
          gridId="ng-staff-dynamics-units"
          onSelectionChange={(ids) => {
            if (ids[0]) setSelectedKey(ids[0])
          }}
          rows={rows}
          selectedId={selected?.unitKey}
        />
      </div>
      {selected !== undefined ? <UnitInspector unit={selected} world={world} /> : null}
    </div>
  )
}

function UnitInspector({ world, unit }: { readonly world: GameWorld; readonly unit: StaffUnitPresentationItem }) {
  const explanation = explainStaffUnitCohesion(world, unit.unitKey)

  return (
    <aside className="staff-workspace__inspector ng-holo-panel">
      <p className="staff-workspace__eyebrow">Staff unit</p>
      <h2 className="staff-workspace__inspector-title">{unit.departmentLabel}</h2>
      <dl className="staff-workspace__metrics">
        <MetricRow label="Lead" value={unit.leaderLabel} />
      </dl>
      {!explanation.established ? (
        <p className="staff-workspace__note">Unit cohesion has not been established yet.</p>
      ) : (
        <InspectorSection title="Cohesion">
          <dl className="staff-workspace__metrics">
            {explanation.dimensions.map((item) => (
              <MetricRow
                key={item.key}
                label={item.label}
                value={
                  <DynamicsToneDot
                    label={STAFF_UNIT_COHESION_BAND_LABELS[item.band]}
                    tone={toneForCohesionBand(item.band)}
                  />
                }
              />
            ))}
          </dl>
        </InspectorSection>
      )}
      {explanation.strengths.length > 0 ? (
        <InspectorSection title="Unit strengths">
          <ul className="staff-workspace__list">
            {explanation.strengths.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}
      {explanation.concerns.length > 0 ? (
        <InspectorSection title="Unit concerns">
          <ul className="staff-workspace__list">
            {explanation.concerns.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}
    </aside>
  )
}
