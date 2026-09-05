import { useState } from 'react'

import { STAFF_HUMAN_STATE_DIMENSIONS } from '@/domain/staffHumanState'
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
  HUMAN_STATE_COLUMN_LABEL,
  UNIT_COHESION_COLUMN_LABEL,
  WORKING_RELATIONSHIP_STATE_LABELS,
  type DynamicsFilter,
  type DynamicsSubviewId,
} from '@/ui-ng/applications/staff/staffWorkspaceModel'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

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
    <div className="staff-workspace__stack">
      <FilterGroup>
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
      </FilterGroup>
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
          Open
        </button>
        <button
          aria-pressed={history}
          className={`ng-btn ng-btn--toggle${history ? ' is-active' : ''}`}
          onClick={() => setHistory(true)}
          type="button"
        >
          History
        </button>
      </FilterGroup>
      {items.length === 0 ? (
        <p className="staff-workspace__empty">No staff conflicts in this scope.</p>
      ) : (
        <div className="staff-workspace__split">
          <div className="staff-workspace__panel ng-holo-panel">
            <NgPrecisionTable
              className="staff-workspace__table"
              columns={[
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
              ]}
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
  const rows = filtered.map((row) => ({ ...row, id: row.staffId }))

  const needAttention = items.filter((item) => item.needsAttention).length
  const highStress = items.filter((item) => item.bands.stress === 'HIGH' || item.bands.stress === 'VERY_HIGH' || item.bands.stress === 'EXTREME').length
  const lowCommitment = items.filter((item) => item.signalKinds.includes('lowOrganizationalCommitment')).length
  const thriving = items.filter((item) => item.interpretedState === 'THRIVING').length

  return (
    <div className="staff-workspace__stack">
      <div className="staff-workspace__summary">
        <span>{items.length} staff</span>
        <span>{needAttention} need attention</span>
        <span>{highStress} high stress</span>
        <span>{lowCommitment} low commitment</span>
        <span>{thriving} thriving</span>
      </div>
      <FilterGroup>
        {DYNAMICS_FILTERS.map((option) => (
          <button
            aria-pressed={filter === option}
            className={`ng-btn ng-btn--toggle${filter === option ? ' is-active' : ''}`}
            key={option}
            onClick={() => setFilter(option)}
            type="button"
          >
            {DYNAMICS_FILTER_LABELS[option]}
          </button>
        ))}
      </FilterGroup>
      {filtered.length === 0 ? (
        <p className="staff-workspace__empty">No staff match this filter.</p>
      ) : (
        <div className="staff-workspace__split">
          <div className="staff-workspace__panel ng-holo-panel">
            <NgPrecisionTable
              className="staff-workspace__table"
              columns={[
                ngCol(
                  'name',
                  'Staff',
                  (row) => (
                    <button
                      className="staff-workspace__link"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (onOpenStaff !== undefined) {
                          onOpenStaff(row.staffId)
                          return
                        }
                        setSelectedId(row.staffId)
                      }}
                      type="button"
                    >
                      {row.staffName}
                    </button>
                  ),
                  { value: (row) => row.staffName },
                ),
                ngCol('role', 'Role', (row) => row.role ?? '—', { value: (row) => row.role ?? '—' }),
                ngCol(
                  'state',
                  'State',
                  (row) => (
                    <span className="staff-workspace__tone-cell">
                      <DynamicsToneDot
                        label={DYNAMICS_STATE_LABELS[row.interpretedState]}
                        tone={toneForInterpretedState(row.interpretedState)}
                      />
                    </span>
                  ),
                  { value: (row) => DYNAMICS_STATE_LABELS[row.interpretedState] },
                ),
                ...STAFF_HUMAN_STATE_DIMENSIONS.map((dimension) =>
                  ngCol(
                    dimension,
                    HUMAN_STATE_COLUMN_LABEL[dimension],
                    (row) => (
                      <span className="staff-workspace__tone-cell">
                        <DynamicsToneDot
                          label={humanStateLabel(row.bands[dimension])}
                          tone={toneForHumanStateBand(dimension, row.bands[dimension])}
                        />
                      </span>
                    ),
                    { value: (row) => humanStateLabel(row.bands[dimension]) },
                  ),
                ),
                ngCol('issues', 'Issues', (row) => (row.signalKinds.length > 0 ? String(row.signalKinds.length) : '—'), {
                  numeric: true,
                  value: (row) => row.signalKinds.length,
                }),
              ]}
              gridId="ng-staff-dynamics-people"
              onSelectionChange={(ids) => {
                if (ids[0]) setSelectedId(ids[0])
              }}
              rows={rows}
              selectedId={selected?.staffId}
            />
          </div>
          {selected !== undefined ? <DynamicsInspector staffId={selected.staffId} world={world} /> : null}
        </div>
      )}
    </div>
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
          columns={[
            ngCol('unit', 'Unit', (row) => row.departmentLabel, { value: (row) => row.departmentLabel }),
            ngCol('members', 'Members', (row) => row.memberCount, { numeric: true, value: (row) => row.memberCount }),
            ngCol('lead', 'Lead', (row) => row.leaderLabel, { value: (row) => row.leaderLabel }),
            ...STAFF_UNIT_COHESION_DIMENSIONS.map((dimension) =>
              ngCol(
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
          ]}
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
