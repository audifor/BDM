import type { CSSProperties } from 'react'



import type { PresentationField } from '@/ui-ng/applications/player/data/playerWorkspaceModel'

import { UNAVAILABLE_LABEL } from '@/ui-ng/applications/player/playerStructuralData'

import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'



function presentationValue<T>(field: PresentationField<T>, formatter?: (value: T) => string): string {

  if (field.status === 'unavailable') return field.label ?? UNAVAILABLE_LABEL

  return formatter === undefined ? String(field.value) : formatter(field.value as T)

}



export function TeamCrest({ code, size = 28 }: { readonly code: string; readonly size?: number }) {

  return (

    <svg aria-hidden className="po-crest" height={size} viewBox="0 0 32 36" width={size * 0.89}>

      <path d="M16 1 L30 8 V22 C30 29 24 34 16 35 C8 34 2 29 2 22 V8 Z" fill="var(--po-team-primary)" />

      <path d="M16 5 L26 10 V21 C26 26 22 29 16 30 C10 29 6 26 6 21 V10 Z" fill="var(--po-team-secondary)" fillOpacity="0.85" />

      <text fill="#fff" fontFamily="Roboto Flex" fontSize="11" fontWeight="700" textAnchor="middle" x="16" y="22">

        {code.slice(0, 3)}

      </text>

    </svg>

  )

}



export function EntityPortrait({ initials, jerseyLabel }: { readonly initials: string; readonly jerseyLabel: string }) {

  return (

    <div aria-hidden className="po-portrait">

      <div className="po-portrait__figure">{initials}</div>

      <span className="po-portrait__number">{jerseyLabel}</span>

    </div>

  )

}



export function EntityIdentityBand() {

  const { model } = usePlayerWorkspace()

  if (model === null) return null



  const { identity, status } = model

  const positions =

    identity.secondaryPositions.length > 0

      ? `${identity.primaryPosition} / ${identity.secondaryPositions.join(' / ')}`

      : identity.primaryPosition



  return (

    <section

      className="po-identity"

      style={{

        '--po-team-primary': identity.teamColors.primary,

        '--po-team-secondary': identity.teamColors.secondary,

        '--po-team-muted': identity.teamColors.muted,

      } as CSSProperties}

    >

      <EntityPortrait

        initials={identity.initials}

        jerseyLabel={identity.jerseyNumber.status === 'available' ? String(identity.jerseyNumber.value) : '—'}

      />

      <TeamCrest code={presentationValue(identity.teamShort)} size={32} />

      <div className="po-identity__name-block">

        <div className="po-identity__name-row">

          {identity.jerseyNumber.status === 'available' && (

            <span className="po-identity__number">#{identity.jerseyNumber.value}</span>

          )}

          <h1 className="po-identity__name">

            <span className="po-identity__firstname">{identity.firstName}</span>

            <span className="po-identity__lastname">{identity.lastName}</span>

          </h1>

        </div>

        <div className="po-identity__meta">

          <span>{presentationValue(identity.teamName)}</span>

          <span>{positions}</span>

          <span>{presentationValue(identity.age, (value) => `Age ${value}`)}</span>

          <span>{presentationValue(identity.nationality)}</span>

          <span>{presentationValue(identity.height)}</span>

          <span>{presentationValue(identity.weight)}</span>

        </div>

      </div>



      <div className="po-identity__status">

        <StatusInstrument label="Availability" value={presentationValue(status.availability)} tone="positive" />

        <StatusInstrument

          label="Condition"

          tone="positive"

          unit="%"

          value={presentationValue(status.condition)}

        />

        {status.morale.status === 'available' && (

          <StatusInstrument label="Morale" tone="neutral" value={presentationValue(status.morale)} />

        )}

        {status.fatigue.status === 'available' && (

          <StatusInstrument

            label="Fatigue"

            tone="neutral"

            value={presentationValue(status.fatigue, (value) => `${value} / 100`)}

          />

        )}

        {status.sharpness.status === 'unavailable' && (

          <StatusInstrument label="Sharpness" tone="neutral" value={status.sharpness.label ?? UNAVAILABLE_LABEL} />

        )}

        {status.risk.status === 'unavailable' && (

          <StatusInstrument label="Risk" tone="neutral" value={status.risk.label ?? UNAVAILABLE_LABEL} />

        )}

      </div>



      <div className="po-identity__actions">

        <button className="ng-btn ng-btn--primary" type="button">Match Plan</button>

        <button className="ng-btn" type="button">Talk</button>

      </div>

    </section>

  )

}



function StatusInstrument({

  label,

  value,

  unit = '',

  tone,

}: {

  readonly label: string

  readonly value: string | number

  readonly unit?: string

  readonly tone: 'positive' | 'good' | 'neutral' | 'warning'

}) {

  return (

    <div className={`po-status po-status--${tone}`}>

      <span className="po-status__label">{label}</span>

      <span className="po-status__value ng-type-numeric">

        {value}{typeof value === 'number' ? unit : ''}

      </span>

    </div>

  )

}


