import { LEGACY_STAFF_ROLE_TO_ROLE_ID, STAFF_ROLE_REGISTRY } from '@/domain/staff'

/** Old saves can contain legacy role identifiers before role migration runs. */
export function isScoutingStaffRole(role: string): boolean {
  const normalized = (LEGACY_STAFF_ROLE_TO_ROLE_ID as Record<string, string>)[role] ?? role
  return (STAFF_ROLE_REGISTRY as Record<string, { readonly department: string } | undefined>)[normalized]?.department === 'scouting'
}
