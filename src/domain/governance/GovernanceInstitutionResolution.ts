import type { GovernanceBody, GovernanceBodyKind, GovernanceInstitution } from './Governance'
import { deriveGovernanceInstitutionStructure } from './GovernanceInstitutionStructure'
import { governanceUniverseForProfile, type GovernanceUniverseProfile } from './GovernanceUniverseProfile'

export const GOVERNANCE_INSTITUTION_VERDICTS = ['VALID', 'VALID_WITH_DEVIATIONS', 'INVALID'] as const
export type GovernanceInstitutionVerdict = typeof GOVERNANCE_INSTITUTION_VERDICTS[number]
export const GOVERNANCE_STRUCTURE_DEVIATION_KINDS = ['MISSING_REQUIRED_STRUCTURE', 'OPTIONAL_STRUCTURE_ABSENT', 'ALTERNATIVE_STRUCTURE_USED', 'UNEXPECTED_BUT_ALLOWED_STRUCTURE', 'INCOMPATIBLE_STRUCTURE', 'INVALID_PARENT_RELATIONSHIP', 'PROFILE_MISMATCH', 'SHARED_PARENT_REUSE'] as const
export type GovernanceStructureDeviationKind = typeof GOVERNANCE_STRUCTURE_DEVIATION_KINDS[number]
export interface GovernanceStructureDeviation {
  readonly kind: GovernanceStructureDeviationKind
  readonly bodyKind?: GovernanceBodyKind
  readonly bodyId?: string
  readonly institutionId: string
  readonly relatedInstitutionId?: string
}
export interface GovernanceInstitutionStructureResolution {
  readonly institutionId: string
  readonly profileId: string
  readonly verdict: GovernanceInstitutionVerdict
  readonly deviations: readonly GovernanceStructureDeviation[]
}

/**
 * Purely resolves structural conformance. It deliberately does not inspect or
 * create appointments, authority grants, decisions, people, or GameWorld state.
 */
export function resolveGovernanceInstitutionStructure(
  profile: GovernanceUniverseProfile,
  institution: GovernanceInstitution,
  bodies: readonly GovernanceBody[],
  institutions: readonly GovernanceInstitution[] = [],
): GovernanceInstitutionStructureResolution {
  const deviations: GovernanceStructureDeviation[] = []
  if (profile.institutionId !== institution.id || governanceUniverseForProfile(profile) !== institution.universe) {
    deviations.push({ kind: 'PROFILE_MISMATCH', institutionId: institution.id })
  }

  const byId = new Map([...institutions, institution].map((value) => [value.id, value]))
  const ancestorIds: string[] = []
  let parentId = institution.parentInstitutionId
  const visited = new Set<string>([institution.id])
  while (parentId !== undefined) {
    if (visited.has(parentId) || !byId.has(parentId)) {
      deviations.push({ kind: 'INVALID_PARENT_RELATIONSHIP', institutionId: institution.id, relatedInstitutionId: parentId })
      break
    }
    visited.add(parentId)
    ancestorIds.push(parentId)
    parentId = byId.get(parentId)?.parentInstitutionId
  }

  const localBodies = bodies.filter((body) => body.institutionId === institution.id)
  const parentBodies = bodies.filter((body) => ancestorIds.includes(body.institutionId))
  const localKinds = new Set(localBodies.map((body) => body.kind))
  const parentByKind = new Map<GovernanceBodyKind, GovernanceBody>()
  for (const body of parentBodies.sort((a, b) => a.id.localeCompare(b.id))) if (!parentByKind.has(body.kind)) parentByKind.set(body.kind, body)
  const slots = deriveGovernanceInstitutionStructure(profile).slots
  const expected = new Set(slots.map((slot) => slot.bodyKind))

  for (const slot of slots) {
    if (localKinds.has(slot.bodyKind)) {
      if (slot.requirement === 'ALTERNATIVE') deviations.push({ kind: 'ALTERNATIVE_STRUCTURE_USED', institutionId: institution.id, bodyKind: slot.bodyKind })
      continue
    }
    const reused = parentByKind.get(slot.bodyKind)
    if (reused !== undefined) {
      deviations.push({ kind: 'SHARED_PARENT_REUSE', institutionId: institution.id, relatedInstitutionId: reused.institutionId, bodyKind: slot.bodyKind, bodyId: reused.id })
    } else if (slot.requirement === 'REQUIRED') {
      deviations.push({ kind: 'MISSING_REQUIRED_STRUCTURE', institutionId: institution.id, bodyKind: slot.bodyKind })
    } else if (slot.requirement === 'OPTIONAL') {
      deviations.push({ kind: 'OPTIONAL_STRUCTURE_ABSENT', institutionId: institution.id, bodyKind: slot.bodyKind })
    }
  }

  for (const body of localBodies) if (!expected.has(body.kind)) deviations.push({ kind: 'UNEXPECTED_BUT_ALLOWED_STRUCTURE', institutionId: institution.id, bodyKind: body.kind, bodyId: body.id })
  for (const bodyId of [profile.apexAuthorityBodyId, profile.executiveAuthorityBodyId, profile.basketballOperationsBodyId]) {
    if (bodyId === undefined) continue
    const body = bodies.find((value) => value.id === bodyId)
    if (body !== undefined && body.institutionId !== institution.id && !ancestorIds.includes(body.institutionId)) deviations.push({ kind: 'INCOMPATIBLE_STRUCTURE', institutionId: institution.id, bodyId })
  }

  const ordered = deviations.sort((a, b) => `${a.kind}:${a.bodyKind ?? ''}:${a.bodyId ?? ''}:${a.relatedInstitutionId ?? ''}`.localeCompare(`${b.kind}:${b.bodyKind ?? ''}:${b.bodyId ?? ''}:${b.relatedInstitutionId ?? ''}`))
  const invalid = ordered.some((value) => ['MISSING_REQUIRED_STRUCTURE', 'INCOMPATIBLE_STRUCTURE', 'INVALID_PARENT_RELATIONSHIP', 'PROFILE_MISMATCH'].includes(value.kind))
  return { institutionId: institution.id, profileId: profile.id, verdict: invalid ? 'INVALID' : ordered.length === 0 ? 'VALID' : 'VALID_WITH_DEVIATIONS', deviations: ordered }
}
