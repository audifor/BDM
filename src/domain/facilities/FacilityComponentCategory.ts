/**
 * Broad functional family a FacilityComponent belongs to. This is a derived classification of
 * `FacilityComponentType` (see `FACILITY_COMPONENT_TYPE_CATEGORY` below), never independently
 * stored on a component — a component's category is always recomputed from its `type`, so the
 * two can never silently disagree.
 */
export const FACILITY_COMPONENT_CATEGORIES = [
  'BASKETBALL',
  'TRAINING',
  'PERFORMANCE',
  'MEDICAL',
  'RECOVERY',
  'PLAYER_SUPPORT',
  'STAFF',
  'ADMINISTRATION',
  'MEDIA',
  'SPECTATOR',
  'COMMERCIAL',
  'HOSPITALITY',
  'ACADEMY',
  'RESIDENTIAL',
  'LOGISTICS',
  'TRANSPORT',
  'SECURITY',
  'COMMUNITY',
  'UTILITIES',
  'OTHER',
] as const

export type FacilityComponentCategory = (typeof FACILITY_COMPONENT_CATEGORIES)[number]

export function isFacilityComponentCategory(value: unknown): value is FacilityComponentCategory {
  return typeof value === 'string' && (FACILITY_COMPONENT_CATEGORIES as readonly string[]).includes(value)
}
