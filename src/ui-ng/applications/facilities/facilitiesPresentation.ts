import type { ClubFacilityAccessKind, ClubProjectActionId } from '@/app/facilities'
import type { FacilityServiceability } from '@/domain/facilities'

/** Presentation-only vocabulary for the Facilities workspace. No rule, threshold or cost lives here. */

const TOKEN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  FULL: 'Full service',
  LIMITED: 'Limited service',
  SEVERELY_LIMITED: 'Severely limited',
  OUT_OF_SERVICE: 'Out of service',
  MINOR: 'Minor',
  MODERATE: 'Moderate',
  MAJOR: 'Major',
  CRITICAL: 'Critical',
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  PLANNED: 'Planned',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  UNDER_CONSTRUCTION: 'Under construction',
  UNDER_RENOVATION: 'Under renovation',
  TEMPORARILY_CLOSED: 'Temporarily closed',
  PARTIALLY_CLOSED: 'Partially closed',
  DECOMMISSIONED: 'Decommissioned',
  DEMOLISHED: 'Demolished',
  ACTIVE: 'Active',
  OWNED: 'Owned',
  OPERATED: 'Operated',
  USED: 'Used',
})

/** `SOME_TOKEN` → `Some token`; unknown tokens stay verbatim rather than being invented into English. */
export function humanizeToken(value: string): string {
  const mapped = TOKEN_LABELS[value]
  if (mapped !== undefined) return mapped
  const words = value.toLowerCase().replaceAll('_', ' ')
  return words.length === 0 ? value : `${words[0]!.toUpperCase()}${words.slice(1)}`
}

export function serviceabilityLabel(value: FacilityServiceability): string {
  return humanizeToken(value)
}

export function accessLabel(kinds: readonly ClubFacilityAccessKind[]): string {
  return kinds.length === 0 ? 'No recorded involvement' : kinds.map(humanizeToken).join(' · ')
}

export function projectActionLabel(action: ClubProjectActionId): string {
  switch (action) {
    case 'START':
      return 'Start project'
    case 'PAUSE':
      return 'Pause project'
    case 'RESUME':
      return 'Resume project'
    case 'COMPLETE':
      return 'Complete project'
    case 'CANCEL':
      return 'Cancel project'
  }
}

export function conditionLabel(value: number | null): string {
  return value === null ? 'Not recorded' : value.toFixed(1)
}

/** Mirrors the Finances workspace formatter; an unrecognized currency code is shown verbatim instead of throwing. */
export function formatFacilityAmount(currencyCode: string, minorUnits: number): string {
  try {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, currencyDisplay: 'code' })
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
    return formatter.format(minorUnits / 10 ** digits)
  } catch {
    return `${minorUnits} ${currencyCode} (minor units)`
  }
}

export function amountPlaceholder(currencyCode: string | null): string {
  return currencyCode === null ? 'Amount (major units)' : `Amount in ${currencyCode}`
}

/** Parses a manager-entered major-unit amount into canonical minor units. Returns `null` for anything that is not a positive amount. */
export function parseMajorAmountToMinorUnits(value: string, currencyCode: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (trimmed.length === 0 || !/^\d+(\.\d+)?$/.test(trimmed)) return null
  let digits = 2
  try {
    digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    digits = 2
  }
  const minorUnits = Math.round(Number(trimmed) * 10 ** digits)
  return Number.isFinite(minorUnits) && minorUnits > 0 ? minorUnits : null
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Honest scheduling wording: a project's own planned dates, never a fabricated progress percentage. */
export function scheduleLabel(asOf: string, plannedDate: string, actualDate: string | null): string {
  if (actualDate !== null) return `${plannedDate} · actual ${actualDate}`
  const days = daysBetween(asOf, plannedDate)
  if (days === 0) return `${plannedDate} · due today`
  if (days > 0) return `${plannedDate} · in ${days} day(s)`
  return `${plannedDate} · ${Math.abs(days)} day(s) overdue`
}
