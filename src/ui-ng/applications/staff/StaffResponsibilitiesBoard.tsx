import { useEffect, useState } from 'react'

import type { SetTeamResponsibilityInput } from '@/app/staffResponsibilities'
import type { ResponsibilityMode } from '@/domain/responsibility'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import {
  getEligibleResponsibilityCandidates,
  getTeamResponsibilityPresentation,
  RESPONSIBILITY_DOMAIN_LABELS,
  RESPONSIBILITY_KIND_LABELS,
  RESPONSIBILITY_MODE_LABELS,
  STAFF_ROLE_LABELS,
  WORKLOAD_STATE_LABELS,
  type StaffResponsibilityPresentationItem,
} from '@/ui/staffPresentation'

import { FilterGroup, InspectorSection, MetricRow, WorkloadBadge } from '@/ui-ng/applications/staff/StaffChrome'
import { formatStaffPercent } from '@/ui-ng/applications/staff/staffWorkspaceModel'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

export function StaffResponsibilitiesBoard({
  world,
  teamId,
  onSetResponsibility,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly onSetResponsibility?: (input: SetTeamResponsibilityInput) => void
}) {
  const rows = getTeamResponsibilityPresentation(world, teamId)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0]

  if (rows.length === 0) {
    return <p className="staff-workspace__empty">No responsibilities configured.</p>
  }

  return (
    <div className="staff-workspace__split">
      <div className="staff-workspace__panel ng-holo-panel">
        <NgPrecisionTable
          className="staff-workspace__table"
          columns={[
            ngCol('kind', 'Responsibility', (row) => RESPONSIBILITY_KIND_LABELS[row.kind], {
              value: (row) => RESPONSIBILITY_KIND_LABELS[row.kind],
            }),
            ngCol('domain', 'Domain', (row) => RESPONSIBILITY_DOMAIN_LABELS[row.domain], {
              value: (row) => RESPONSIBILITY_DOMAIN_LABELS[row.domain],
            }),
            ngCol('control', 'Control', (row) => RESPONSIBILITY_MODE_LABELS[row.mode], {
              value: (row) => RESPONSIBILITY_MODE_LABELS[row.mode],
            }),
            ngCol('holder', 'Holder', (row) => row.holderLabel, { value: (row) => row.holderLabel }),
            ngCol('role', 'Role', (row) => (row.holderRole === undefined ? '—' : STAFF_ROLE_LABELS[row.holderRole]), {
              value: (row) => (row.holderRole === undefined ? '—' : STAFF_ROLE_LABELS[row.holderRole]),
            }),
            ngCol('load', 'Load', (row) => row.capacityCost, { numeric: true, value: (row) => row.capacityCost }),
            ngCol(
              'utilization',
              'Utilization',
              (row) =>
                row.holderUtilization === undefined ? (
                  '—'
                ) : (
                  <WorkloadBadge state={row.holderWorkloadState ?? 'unassigned'} utilization={row.holderUtilization} />
                ),
              { value: (row) => row.holderUtilization },
            ),
          ]}
          gridId="ng-staff-responsibilities"
          onSelectionChange={(ids) => {
            if (ids[0]) setSelectedId(ids[0])
          }}
          rows={rows}
          selectedId={selected?.id}
        />
      </div>
      {selected !== undefined ? (
        <ResponsibilityInspector onApply={onSetResponsibility} responsibility={selected} teamId={teamId} world={world} />
      ) : null}
    </div>
  )
}

function ResponsibilityInspector({
  world,
  teamId,
  responsibility,
  onApply,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly responsibility: StaffResponsibilityPresentationItem
  readonly onApply?: (input: SetTeamResponsibilityInput) => void
}) {
  const [draftMode, setDraftMode] = useState<ResponsibilityMode>(responsibility.mode)
  const [draftHolderId, setDraftHolderId] = useState<StaffPersonId | undefined>(responsibility.holderStaffId)

  useEffect(() => {
    setDraftMode(responsibility.mode)
    setDraftHolderId(responsibility.holderStaffId)
  }, [responsibility.id, responsibility.mode, responsibility.holderStaffId])

  const readOnly = onApply === undefined || responsibility.eligibleParticipant === 'coach'
  const needsHolder = draftMode === 'delegated' || draftMode === 'advisory'
  const candidates = needsHolder ? getEligibleResponsibilityCandidates(world, teamId, responsibility.kind, draftMode) : []
  const selectedCandidate = candidates.find((candidate) => candidate.staffPersonId === draftHolderId)
  const hasChange = draftMode !== responsibility.mode || (needsHolder ? draftHolderId !== responsibility.holderStaffId : false)
  const canApply = !readOnly && hasChange && (!needsHolder || selectedCandidate !== undefined)

  return (
    <aside className="staff-workspace__inspector ng-holo-panel">
      <p className="staff-workspace__eyebrow">Responsibility</p>
      <h2 className="staff-workspace__inspector-title">{RESPONSIBILITY_KIND_LABELS[responsibility.kind]}</h2>
      <dl className="staff-workspace__metrics">
        <MetricRow label="Domain" value={RESPONSIBILITY_DOMAIN_LABELS[responsibility.domain]} />
        <MetricRow label="Capacity cost" value={responsibility.capacityCost} />
        <MetricRow label="Current control" value={RESPONSIBILITY_MODE_LABELS[responsibility.mode]} />
        <MetricRow label="Current holder" value={responsibility.holderLabel} />
      </dl>

      <InspectorSection title="Control mode">
        {responsibility.eligibleParticipant === 'coach' ? (
          <p className="staff-workspace__note">
            Head Coach-only. Only {RESPONSIBILITY_MODE_LABELS[responsibility.mode]} is available for this responsibility.
          </p>
        ) : (
          <FilterGroup>
            {responsibility.supportedModes.map((mode) => (
              <button
                aria-pressed={draftMode === mode}
                className={`ng-btn ng-btn--toggle${draftMode === mode ? ' is-active' : ''}`}
                disabled={readOnly}
                key={mode}
                onClick={() => setDraftMode(mode)}
                type="button"
              >
                {RESPONSIBILITY_MODE_LABELS[mode]}
              </button>
            ))}
          </FilterGroup>
        )}
      </InspectorSection>

      {needsHolder ? (
        <InspectorSection title="Staff selector">
          {candidates.length === 0 ? (
            <p className="staff-workspace__note">No eligible staff.</p>
          ) : (
            <>
              <select
                className="ng-input staff-workspace__select"
                disabled={readOnly}
                onChange={(event) => setDraftHolderId((event.target.value || undefined) as StaffPersonId | undefined)}
                value={draftHolderId ?? ''}
              >
                <option value="">Select staff…</option>
                {candidates.map((candidate) => (
                  <option key={candidate.staffPersonId} value={candidate.staffPersonId}>
                    {candidate.name} · {STAFF_ROLE_LABELS[candidate.role]} · PROF {candidate.proficiency} ·{' '}
                    {formatStaffPercent(candidate.currentUtilization)} → {formatStaffPercent(candidate.projectedUtilization)}
                  </option>
                ))}
              </select>
              {selectedCandidate !== undefined ? (
                <dl className="staff-workspace__metrics">
                  <MetricRow label="Role" value={STAFF_ROLE_LABELS[selectedCandidate.role]} />
                  <MetricRow label="Proficiency" value={selectedCandidate.proficiency} />
                  <MetricRow label="Current workload" value={formatStaffPercent(selectedCandidate.currentUtilization)} />
                  <MetricRow label="Projected workload" value={formatStaffPercent(selectedCandidate.projectedUtilization)} />
                  <MetricRow
                    label="Projected state"
                    value={
                      <span className={`staff-workspace__state staff-workspace__state--${selectedCandidate.projectedWorkloadState}`}>
                        {WORKLOAD_STATE_LABELS[selectedCandidate.projectedWorkloadState]}
                      </span>
                    }
                  />
                </dl>
              ) : null}
            </>
          )}
        </InspectorSection>
      ) : null}

      {!readOnly ? (
        <button
          className="ng-btn ng-btn--primary"
          disabled={!canApply}
          onClick={() => {
            if (!canApply || onApply === undefined) return
            onApply({
              teamId,
              kind: responsibility.kind,
              mode: draftMode,
              ...(needsHolder && draftHolderId !== undefined ? { holderStaffId: draftHolderId } : {}),
            })
          }}
          type="button"
        >
          Apply
        </button>
      ) : null}
    </aside>
  )
}
