import type { PresentationField } from './playerWorkspaceModel'

/** Display-only rounding: canonical measurements in GameWorld remain unchanged. */
export function formatPhysicalMeasurement(field: PresentationField<string>): {
  readonly value: string
  readonly unit: string
} {
  if (field.status !== 'available' || field.value === undefined) {
    return { value: field.label ?? '—', unit: '' }
  }
  const match = field.value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (match === null) return { value: field.value, unit: '' }
  const value = Number(match[1]!.replace(',', '.'))
  return {
    value: Number.isFinite(value) ? String(Math.round(value)) : match[1]!,
    unit: match[2] ?? '',
  }
}
