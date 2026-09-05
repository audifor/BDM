import type { CSSProperties, ReactNode } from 'react'

import { dynamicsToneColor } from '@/ui-ng/applications/staff/dynamicsTone'

import './dynamics-tone.css'

export function DynamicsToneDot({
  tone,
  label,
}: {
  readonly tone: number
  readonly label: string
}) {
  const color = dynamicsToneColor(tone)
  return (
    <span
      aria-label={label}
      className="staff-tone-dot"
      role="img"
      style={{ '--staff-tone': color } as CSSProperties}
      title={label}
    />
  )
}

export function DynamicsTonePair({ children }: { readonly children: ReactNode }) {
  return <span className="staff-tone-dot-row">{children}</span>
}
