import type { GovernanceBody, GovernanceBodyKind, GovernanceRole } from './Governance'
import type { GovernanceUniverseProfile } from './GovernanceUniverseProfile'

export type GovernanceStructureRequirement = 'REQUIRED' | 'OPTIONAL' | 'ALTERNATIVE'
export interface GovernanceStructureSlot { readonly bodyKind: GovernanceBodyKind; readonly requirement: GovernanceStructureRequirement; readonly expectedRoles: readonly GovernanceRole[]; readonly parentBodyKind?: GovernanceBodyKind }
export interface GovernanceInstitutionStructure { readonly profileId: string; readonly slots: readonly GovernanceStructureSlot[] }
export type GovernanceStructureIssue = { readonly kind: 'MISSING_REQUIRED_BODY' | 'PROFILE_STRUCTURE_MISMATCH'; readonly bodyKind: GovernanceBodyKind; readonly severity: 'ERROR' | 'WARNING' }
const slot = (bodyKind: GovernanceBodyKind, requirement: GovernanceStructureRequirement, expectedRoles: readonly GovernanceRole[] = [], parentBodyKind?: GovernanceBodyKind): GovernanceStructureSlot => ({ bodyKind, requirement, expectedRoles, ...(parentBodyKind === undefined ? {} : { parentBodyKind }) })

/** Derives expectations only; it never creates people, appointments, grants, or decision rights. */
export function deriveGovernanceInstitutionStructure(profile: GovernanceUniverseProfile): GovernanceInstitutionStructure {
  const slots = profile.kind === 'NCAA_PROGRAM' || profile.kind === 'NCAAW_PROGRAM'
    ? [slot('BOARD','REQUIRED',['TRUSTEE','REGENT']),slot('EXECUTIVE','REQUIRED',['PRESIDENT','CHANCELLOR'],'BOARD'),slot('ATHLETIC_DEPARTMENT','REQUIRED',['ATHLETIC_DIRECTOR'],'EXECUTIVE'),slot('COMPLIANCE','OPTIONAL',['COMPLIANCE_OFFICER'],'ATHLETIC_DEPARTMENT')]
    : profile.kind === 'FEDERATION'
      ? [slot('BOARD','REQUIRED',['FEDERATION_PRESIDENT','FEDERATION_EXECUTIVE']),slot('EXECUTIVE','REQUIRED',[],'BOARD'),slot('COMPLIANCE','OPTIONAL',[],'BOARD')]
      : profile.kind === 'PROFESSIONAL_CLUB' && profile.ownershipModel === 'MULTISPORT_SECTION'
        ? [slot('BOARD','REQUIRED',['CHAIR']),slot('EXECUTIVE','REQUIRED',['SPORTING_DIRECTOR','GENERAL_MANAGER'],'BOARD'),slot('ATHLETIC_DEPARTMENT','OPTIONAL',[],'EXECUTIVE')]
        : [slot('OWNERSHIP','REQUIRED',profile.kind === 'NBA_FRANCHISE' || profile.kind === 'WNBA_FRANCHISE' ? ['OWNER','GOVERNOR','ALTERNATE_GOVERNOR'] : ['OWNER']),slot('BOARD','REQUIRED',['CHAIR'],'OWNERSHIP'),slot('EXECUTIVE','REQUIRED',['CEO','GENERAL_MANAGER','PRESIDENT_BASKETBALL_OPERATIONS'],'BOARD')]
  return { profileId: profile.id, slots: [...slots].sort((a,b) => a.bodyKind.localeCompare(b.bodyKind)) }
}
export function validateGovernanceInstitutionStructure(profile: GovernanceUniverseProfile, bodies: readonly GovernanceBody[]): readonly GovernanceStructureIssue[] {
  const kinds = new Set(bodies.filter((body) => body.institutionId === profile.institutionId).map((body) => body.kind))
  return deriveGovernanceInstitutionStructure(profile).slots.filter((slot) => slot.requirement === 'REQUIRED' && !kinds.has(slot.bodyKind)).map((slot) => ({ kind: 'MISSING_REQUIRED_BODY' as const, bodyKind: slot.bodyKind, severity: 'ERROR' as const })).sort((a,b) => a.bodyKind.localeCompare(b.bodyKind))
}
