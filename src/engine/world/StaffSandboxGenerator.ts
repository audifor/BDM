import type { GameDate } from '@/domain/date'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { createStaffPerson, isStaffRoleApplicableToEcosystem, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, STAFF_ROLE_REGISTRY, type StaffPerson, type StaffRoleId, type TeamStaffAssignment } from '@/domain/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

export interface StaffSandboxStructure {
  readonly people: readonly StaffPerson[]
  readonly assignments: readonly TeamStaffAssignment[]
}

const QUALITY_BASES = [28, 43, 58, 73, 88] as const
const EXTRA_TEAM_ROLES = new Set<StaffRoleId>(['assistantCoach', 'physiotherapist', 'regionalScout'])

/** Registry-driven sporting staff and free agents for any FIBA-like sandbox. */
export function generateStaffSandbox(input: { readonly teams: readonly { readonly id: TeamId }[]; readonly assignedOn: GameDate; readonly idPrefix: string }): StaffSandboxStructure {
  const roles = applicableSupportingRoles()
  const teamEntries = input.teams.flatMap((team) => roles.flatMap((role) =>
    Array.from({ length: EXTRA_TEAM_ROLES.has(role) ? 2 : 1 }, (_, duplicateIndex) => {
      const id = staffPersonIdFromString(`${input.idPrefix}:team:${team.id}:${role}:${duplicateIndex + 1}`)
      return { person: generateStaffPerson(id, role, 1 + new SeededRandomSource(hashStringToSeed(`staff-sandbox-team-quality:${id}`)).nextInt(1, 3)), assignment: { id: teamStaffAssignmentIdFromString(`${input.idPrefix}:assignment:${team.id}:${role}:${duplicateIndex + 1}:${input.assignedOn}`), staffPersonId: id, teamId: team.id, role, assignedOn: input.assignedOn } }
    }),
  ))
  const freeAgents = roles.flatMap((role) => QUALITY_BASES.map((_, qualityIndex) => generateStaffPerson(staffPersonIdFromString(`${input.idPrefix}:free-agent:${role}:${qualityIndex + 1}`), role, qualityIndex)))
  return { people: [...teamEntries.map((entry) => entry.person), ...freeAgents], assignments: teamEntries.map((entry) => entry.assignment) }
}

export function applicableSupportingRoles(): readonly StaffRoleId[] {
  return Object.keys(STAFF_ROLE_REGISTRY).filter((role): role is StaffRoleId => role !== 'headCoach' && isStaffRoleApplicableToEcosystem(role as StaffRoleId, 'fibaLike')).sort()
}

function generateStaffPerson(id: StaffPerson['id'], marketRole: StaffRoleId, qualityIndex: number): StaffPerson {
  const random = new SeededRandomSource(hashStringToSeed(`staff-sandbox-person:${id}`))
  const definition = STAFF_ROLE_REGISTRY[marketRole]
  const quality = QUALITY_BASES[qualityIndex]!
  const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((attribute) => [attribute, Math.max(0, Math.min(100, quality + Math.round((definition.attributeWeights[attribute] ?? 0) * 24) + random.nextInt(-6, 6)))])) as StaffPerson['professional']['attributes']
  const suffix = String(id).split(':').slice(-2).join('-').replace(/[^a-z0-9]/gi, '').slice(-12)
  return createStaffPerson({ id, identity: { firstName: `Staff${String(random.nextInt(100, 999))}`, lastName: `${marketRole}-${suffix}`, nationality: 'Synthetic' }, professional: { attributes }, marketRole })
}
