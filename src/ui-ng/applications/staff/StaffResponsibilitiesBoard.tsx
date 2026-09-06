import type { SetTeamResponsibilityInput } from '@/app/staffResponsibilities'
import { RESPONSIBILITY_MODES, type ResponsibilityMode } from '@/domain/responsibility'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import {
  getEligibleResponsibilityCandidates,
  getTeamResponsibilityPresentation,
  RESPONSIBILITY_DOMAIN_LABELS,
  RESPONSIBILITY_KIND_LABELS,
  RESPONSIBILITY_MODE_LABELS,
  STAFF_ROLE_LABELS,
  type StaffResponsibilityPresentationItem,
} from '@/ui/staffPresentation'

import { WorkloadBadge } from '@/ui-ng/applications/staff/StaffChrome'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

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

  if (rows.length === 0) {
    return <p className="staff-workspace__empty">No responsibilities configured.</p>
  }

  return (
    <div className="staff-workspace__panel ng-holo-panel">
      <NgPrecisionTable
        className="staff-workspace__table staff-responsibilities__table"
        columns={ngTableColumns(rows, [
          ngCol('kind', 'Responsibility', (row) => RESPONSIBILITY_KIND_LABELS[row.kind], {
            value: (row) => RESPONSIBILITY_KIND_LABELS[row.kind],
          }),
          ngCol('domain', 'Domain', (row) => RESPONSIBILITY_DOMAIN_LABELS[row.domain], {
            value: (row) => RESPONSIBILITY_DOMAIN_LABELS[row.domain],
          }),
          ngCol(
            'control',
            'Control',
            (row) => (
              <ResponsibilityModeSelect
                disabled={onSetResponsibility === undefined}
                onChange={(mode) => {
                  if (onSetResponsibility === undefined) return
                  const candidates =
                    mode === 'delegated' || mode === 'advisory'
                      ? getEligibleResponsibilityCandidates(world, teamId, row.kind, mode)
                      : []
                  onSetResponsibility({
                    teamId,
                    kind: row.kind,
                    mode,
                    ...(candidates[0] === undefined ? {} : { holderStaffId: candidates[0].staffPersonId }),
                  })
                }}
                responsibility={row}
              />
            ),
            {
              value: (row) => RESPONSIBILITY_MODE_LABELS[row.mode],
            },
          ),
          ngCol(
            'holder',
            'Holder',
            (row) => (
              <ResponsibilityHolderSelect
                disabled={onSetResponsibility === undefined}
                onChange={(holderStaffId) => {
                  if (onSetResponsibility === undefined) return
                  onSetResponsibility({ teamId, kind: row.kind, mode: row.mode, holderStaffId })
                }}
                responsibility={row}
                teamId={teamId}
                world={world}
              />
            ),
            { value: (row) => row.holderLabel },
          ),
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
        ])}
        gridId="ng-staff-responsibilities"
        rows={rows}
      />
    </div>
  )
}

function ResponsibilityModeSelect({
  responsibility,
  onChange,
  disabled,
}: {
  readonly responsibility: StaffResponsibilityPresentationItem
  readonly onChange: (mode: ResponsibilityMode) => void
  readonly disabled: boolean
}) {
  return (
    <select
      aria-label={`Control for ${RESPONSIBILITY_KIND_LABELS[responsibility.kind]}`}
      className="ng-input staff-workspace__select"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ResponsibilityMode)}
      onClick={(event) => event.stopPropagation()}
      value={responsibility.mode}
    >
      {RESPONSIBILITY_MODES.map((mode) => (
        <option disabled={!responsibility.supportedModes.includes(mode)} key={mode} value={mode}>
          {RESPONSIBILITY_MODE_LABELS[mode]}
        </option>
      ))}
    </select>
  )
}

function ResponsibilityHolderSelect({
  responsibility,
  onChange,
  disabled,
  world,
  teamId,
}: {
  readonly responsibility: StaffResponsibilityPresentationItem
  readonly onChange: (holderStaffId: StaffPersonId) => void
  readonly disabled: boolean
  readonly world: GameWorld
  readonly teamId: TeamId
}) {
  const requiresStaff = responsibility.mode === 'delegated' || responsibility.mode === 'advisory'
  if (!requiresStaff || responsibility.eligibleParticipant === 'coach') {
    return <span>{responsibility.holderLabel}</span>
  }

  const candidates = getEligibleResponsibilityCandidates(world, teamId, responsibility.kind, responsibility.mode)
  return (
    <select
      aria-label={`Holder for ${RESPONSIBILITY_KIND_LABELS[responsibility.kind]}`}
      className="ng-input staff-workspace__select"
      disabled={disabled || candidates.length === 0}
      onChange={(event) => onChange(event.target.value as StaffPersonId)}
      onClick={(event) => event.stopPropagation()}
      value={responsibility.holderStaffId ?? ''}
    >
      {candidates.length === 0 ? <option value="">No eligible staff</option> : null}
      {candidates.map((candidate) => (
        <option key={candidate.staffPersonId} value={candidate.staffPersonId}>
          {candidate.name}
        </option>
      ))}
    </select>
  )
}
