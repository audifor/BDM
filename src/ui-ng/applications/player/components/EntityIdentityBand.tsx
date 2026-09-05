import type { CSSProperties } from 'react'

import type { TeamId } from '@/domain/ids'
import type { PresentationField } from '@/ui-ng/applications/player/data/playerWorkspaceModel'
import { UNAVAILABLE_LABEL } from '@/ui-ng/applications/player/playerStructuralData'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { CountryNationalityMark } from '@/ui-ng/applications/player/components/CountryNationalityMark'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { EntityLink } from '@/ui/navigation/EntityLink'
import playerPortraitPlaceholder from '@/ui-ng/assets/images/player-portrait-placeholder.png'

function presentationValue<T>(field: PresentationField<T>, formatter?: (value: T) => string): string {
  if (field.status === 'unavailable') return field.label ?? UNAVAILABLE_LABEL
  return formatter === undefined ? String(field.value) : formatter(field.value as T)
}

function splitMeasure(field: PresentationField<string>): { readonly value: string; readonly unit: string } {
  if (field.status === 'unavailable' || field.value === undefined) {
    return { value: field.label ?? '—', unit: '' }
  }
  const match = field.value.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (match === null) return { value: field.value, unit: '' }
  return { value: match[1]!, unit: match[2] ?? '' }
}

export function TeamCrest({ code, size = 28 }: { readonly code: string; readonly size?: number }) {
  return (
    <svg aria-hidden className="po-crest" height={size} viewBox="0 0 32 36" width={size * 0.89}>
      <path d="M16 1 L30 8 V22 C30 29 24 34 16 35 C8 34 2 29 2 22 V8 Z" fill="var(--po-team-primary)" />
      <path d="M16 5 L26 10 V21 C26 26 22 29 16 30 C10 29 6 26 6 21 V10 Z" fill="var(--po-team-secondary)" fillOpacity="0.85" />
      <text fill="#fff" fontFamily="IBM Plex Sans" fontSize="11" fontWeight="700" textAnchor="middle" x="16" y="22">
        {code.slice(0, 3)}
      </text>
    </svg>
  )
}

export function EntityPortrait({
  jerseyLabel,
}: {
  readonly jerseyLabel: string
}) {
  return (
    <div aria-hidden className="po-portrait">
      {jerseyLabel !== '—' && <span className="po-portrait__watermark">{jerseyLabel}</span>}
      <img alt="" className="po-portrait__image" src={playerPortraitPlaceholder} />
    </div>
  )
}

export function EntityIdentityBand() {
  const { model } = usePlayerWorkspace()
  const { openEntity } = useNgWorkspaceNavigation()
  if (model === null) return null

  const { identity, status, contract } = model
  const teamLabel = presentationValue(identity.teamName)
  const teamDestination =
    identity.teamId.status === 'available'
      ? ({
          type: 'team',
          teamId: identity.teamId.value as TeamId,
          section: 'overview',
        } as const)
      : null
  const height = splitMeasure(identity.height)
  const weight = splitMeasure(identity.weight)
  const wingspan = splitMeasure(identity.wingspan)
  const jersey =
    identity.jerseyNumber.status === 'available' ? String(identity.jerseyNumber.value) : null
  const currentSalary =
    contract.financialSchedule.find((row) => row.isCurrent) ?? contract.financialSchedule[0]
  const availability = presentationValue(status.availability)
  const availabilityTone = availability === 'Available' ? 'positive' : 'warning'

  return (
    <section
      className="po-identity"
      style={
        {
          '--po-team-primary': identity.teamColors.primary,
          '--po-team-secondary': identity.teamColors.secondary,
          '--po-team-muted': identity.teamColors.muted,
        } as CSSProperties
      }
    >
      <div className="po-identity__person">
        <EntityPortrait jerseyLabel={jersey ?? '—'} />
        <div className="po-identity__who">
          <h1 className="po-identity__name ng-type-entity">
            <span className="po-identity__firstname ng-type-entity__given">{identity.firstName}</span>
            <span className="po-identity__lastname ng-type-entity__family">{identity.lastName}</span>
          </h1>
          <div className="po-identity__clubline">
            {teamDestination === null ? (
              <span className="po-identity__team">{teamLabel}</span>
            ) : (
              <EntityLink
                className="po-identity__team po-identity__meta-team-link"
                destination={teamDestination}
                onNavigate={openEntity}
              >
                {teamLabel}
              </EntityLink>
            )}
            {identity.nationalityCode.status === 'available' ? (
              <CountryNationalityMark code={identity.nationalityCode.value!} />
            ) : (
              <span className="po-identity__meta-detail">—</span>
            )}
          </div>
          <div className="po-identity__facts">
            {jersey !== null && <span className="po-identity__number">#{jersey}</span>}
            <IdentityFact label="Age" value={presentationValue(identity.age)} />
            <IdentityFact label="Dob" value={presentationValue(identity.dateOfBirth)} />
          </div>
        </div>
      </div>

      <div className="po-identity__positions">
        <span className="po-identity__section-label">Position</span>
        <div className="po-identity__pos-row">
          <IdentityPosition value={identity.primaryPosition} label="Primary" accent />
          {identity.secondaryPositions[0] !== undefined && (
            <IdentityPosition value={identity.secondaryPositions[0]} label="Secondary" />
          )}
        </div>
      </div>

      <div className="po-identity__measures">
        <IdentityMeasure value={height.value} unit={height.unit} label="Height" />
        <IdentityMeasure value={weight.value} unit={weight.unit} label="Weight" />
        <IdentityMeasure value={wingspan.value} unit={wingspan.unit} label="Wingspan" />
      </div>

      <div className="po-identity__condition">
        <span className={`po-identity__availability po-identity__availability--${availabilityTone}`}>
          <span className="po-identity__availability-dot" aria-hidden />
          {availability}
        </span>
        <div className="po-identity__status-list">
          {status.morale.status === 'available' && (
            <StatusInstrument label="Morale" tone="positive" value={presentationValue(status.morale)} />
          )}
          {status.fatigue.status === 'available' && (
            <StatusInstrument
              label="Fatigue"
              meter={typeof status.fatigue.value === 'number' ? status.fatigue.value : undefined}
              tone="neutral"
              value={presentationValue(status.fatigue, (value) => `${value}%`)}
            />
          )}
          {status.risk.status === 'available' ? (
            <StatusInstrument label="Injury Risk" tone={status.riskTone ?? 'neutral'} value={presentationValue(status.risk)} />
          ) : (
            <StatusInstrument label="Injury Risk" tone="neutral" value={status.risk.label ?? UNAVAILABLE_LABEL} />
          )}
        </div>
      </div>

      <div className="po-identity__contract">
        <div className="po-identity__contract-top">
          <span className="po-identity__section-label">Contract</span>
          <div className="po-identity__actions">
            <button className="ng-btn ng-btn--ghost" type="button">Match Plan</button>
            <button className="ng-btn ng-btn--ghost" type="button">Talk</button>
          </div>
        </div>
        <div className="po-identity__contract-list">
          <StatusInstrument
            label="Expires"
            tone="neutral"
            value={contract.statusBand?.endDate ?? UNAVAILABLE_LABEL}
          />
          <StatusInstrument
            label="Salary"
            tone="neutral"
            value={currentSalary?.baseSalary.formatted ?? contract.compensationContextNote ?? UNAVAILABLE_LABEL}
          />
          <StatusInstrument
            label="Status"
            tone="neutral"
            value={contract.statusBand?.statusLabel ?? UNAVAILABLE_LABEL}
          />
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

function IdentityPosition({
  value,
  label,
  accent = false,
}: {
  readonly value: string
  readonly label: string
  readonly accent?: boolean
}) {
  return (
    <div className={`po-identity__pos${accent ? ' po-identity__pos--accent' : ''}`}>
      <PlayPositionMark position={value} />
      <span className="po-identity__pos-label">{label}</span>
    </div>
  )
}

function IdentityMeasure({
  value,
  unit,
  label,
}: {
  readonly value: string
  readonly unit: string
  readonly label: string
}) {
  return (
    <div className="po-identity__measure">
      <span className="po-identity__measure-reading">
        <span className="po-identity__measure-value ng-type-numeric">{value}</span>
        {unit !== '' && <span className="po-identity__measure-unit">{unit}</span>}
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
  readonly value: string | number
  readonly meter?: number
  readonly tone: 'positive' | 'good' | 'neutral' | 'warning'
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
