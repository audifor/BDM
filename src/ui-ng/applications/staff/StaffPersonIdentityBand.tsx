import type { CSSProperties } from 'react'

import { EntityPortrait } from '@/ui-ng/applications/player/components/EntityIdentityBand'
import { CountryNationalityMark } from '@/ui-ng/applications/player/components/CountryNationalityMark'
import type { StaffPersonWorkspaceModel } from '@/ui-ng/applications/staff/staffPersonWorkspaceModel'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { EntityLink } from '@/ui/navigation/EntityLink'

export function StaffPersonIdentityBand({ model }: { readonly model: StaffPersonWorkspaceModel }) {
  const { openEntity } = useNgWorkspaceNavigation()
  const { identity, status, contract } = model
  const availabilityTone = status.workloadState === 'overloaded' ? 'warning' : status.workloadState === 'normal' ? 'positive' : 'warning'
  const teamDestination =
    identity.teamId === null
      ? null
      : ({ type: 'team' as const, teamId: identity.teamId, section: 'overview' as const })

  return (
    <section
      className="po-identity"
      data-ng-region="staff-person-identity"
      style={
        {
          '--po-team-primary': identity.teamColors.primary,
          '--po-team-secondary': identity.teamColors.secondary,
          '--po-team-muted': identity.teamColors.muted,
        } as CSSProperties
      }
    >
      <div className="po-identity__person">
        <EntityPortrait jerseyLabel="—" />
        <div className="po-identity__who">
          <h1 className="po-identity__name ng-type-entity">
            <span className="po-identity__firstname ng-type-entity__given">{identity.firstName}</span>
            <span className="po-identity__lastname ng-type-entity__family">{identity.lastName}</span>
          </h1>
          <div className="po-identity__clubline">
            {teamDestination === null ? (
              <span className="po-identity__team">{identity.teamName ?? 'Free staff'}</span>
            ) : (
              <EntityLink className="po-identity__team po-identity__meta-team-link" destination={teamDestination} onNavigate={openEntity}>
                {identity.teamName}
              </EntityLink>
            )}
            {identity.nationalityCode !== null ? (
              <CountryNationalityMark code={identity.nationalityCode} />
            ) : (
              <span className="po-identity__meta-detail">{identity.nationality ?? '—'}</span>
            )}
          </div>
          <div className="po-identity__facts">
            <IdentityFact label="Age" value={identity.age === null ? '—' : String(identity.age)} />
            <IdentityFact label="Dob" value={identity.dateOfBirth ?? '—'} />
          </div>
        </div>
      </div>

      <div className="po-identity__positions">
        <span className="po-identity__section-label">Role</span>
        <div className="po-identity__pos-row">
          <div className="po-identity__pos po-identity__pos--accent">
            <strong className="po-identity__pos-value">{identity.roleLabel}</strong>
            <span className="po-identity__pos-label">Assignment</span>
          </div>
          <div className="po-identity__pos">
            <strong className="po-identity__pos-value">{identity.departmentLabel}</strong>
            <span className="po-identity__pos-label">Department</span>
          </div>
        </div>
      </div>

      <div className="po-identity__measures">
        <IdentityMeasure label="Seniority" value={identity.seniorityLabel} />
        <IdentityMeasure label="Proficiency" value={status.proficiency === null ? '—' : String(status.proficiency)} />
        <IdentityMeasure label="Reputation" value={status.reputationScore === null ? '—' : String(status.reputationScore)} />
      </div>

      <div className="po-identity__condition">
        <span className={`po-identity__availability po-identity__availability--${availabilityTone}`}>
          <span className="po-identity__availability-dot" aria-hidden />
          {status.workloadLabel}
        </span>
        <div className="po-identity__status-list">
          <StatusInstrument
            label="Utilization"
            meter={status.utilization}
            tone={status.workloadState === 'overloaded' ? 'warning' : 'neutral'}
            value={status.utilizationLabel}
          />
          <StatusInstrument label="Employment" tone="neutral" value={status.employmentLabel} />
        </div>
      </div>

      <div className="po-identity__contract">
        <div className="po-identity__contract-top">
          <span className="po-identity__section-label">Contract</span>
        </div>
        <div className="po-identity__contract-list">
          <StatusInstrument label="Expires" tone="neutral" value={contract.expiresOn ?? '—'} />
          <StatusInstrument label="Salary" tone="neutral" value={contract.salaryLabel ?? '—'} />
          <StatusInstrument label="Status" tone="neutral" value={contract.contractStatusLabel} />
        </div>
      </div>
    </section>
  )
}

function IdentityFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="po-identity__fact">
      <span className="po-identity__fact-label">{label}</span>
      <span className="po-identity__fact-value">{value}</span>
    </div>
  )
}

function IdentityMeasure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="po-identity__measure">
      <span className="po-identity__measure-reading">
        <span className="po-identity__measure-value ng-type-numeric">{value}</span>
      </span>
      <span className="po-identity__measure-label">{label}</span>
    </div>
  )
}

function StatusInstrument({
  label,
  value,
  meter,
  tone,
}: {
  readonly label: string
  readonly value: string
  readonly meter?: number
  readonly tone: 'positive' | 'neutral' | 'warning'
}) {
  return (
    <div className={`po-status po-status--${tone}`}>
      <span className="po-status__label">{label}</span>
      <span className="po-status__value">
        {value}
        {meter !== undefined && (
          <span aria-hidden className="po-status__meter">
            <span className="po-status__meter-fill" style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
          </span>
        )}
      </span>
    </div>
  )
}
