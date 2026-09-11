import { describe, expect, it } from 'vitest'
import { resolveGovernanceInstitutionStructure } from './GovernanceInstitutionResolution'
import { createGovernanceInstitution, type GovernanceBody } from './Governance'
import { createGovernanceUniverseProfile } from './GovernanceUniverseProfile'

const models = { PROFESSIONAL_CLUB: 'PRIVATE', NBA_FRANCHISE: 'OWNERSHIP_GROUP', WNBA_FRANCHISE: 'PRIVATE', NCAA_PROGRAM: 'UNIVERSITY', NCAAW_PROGRAM: 'UNIVERSITY', FEDERATION: 'FEDERATION' } as const
const universes = { PROFESSIONAL_CLUB: 'PROFESSIONAL_CLUB', NBA_FRANCHISE: 'NBA_WNBA', WNBA_FRANCHISE: 'NBA_WNBA', NCAA_PROGRAM: 'NCAA', NCAAW_PROGRAM: 'NCAA', FEDERATION: 'FEDERATION' } as const
type ProfileKind = keyof typeof models
const profile = (kind: ProfileKind, institutionId = 'institution') => createGovernanceUniverseProfile({ id: `profile:${kind}`, institutionId, kind, ownershipModel: models[kind], expectedBodyKinds: ['BOARD', 'EXECUTIVE'], externalOversight: false })
const institution = (kind: ProfileKind, id = 'institution', parentInstitutionId?: string) => createGovernanceInstitution({ id, name: id, universe: universes[kind], teamIds: [], ...(parentInstitutionId === undefined ? {} : { parentInstitutionId }) })
const body = (kind: GovernanceBody['kind'], institutionId = 'institution', id = `${institutionId}:${kind}`): GovernanceBody => ({ id, institutionId, kind, name: kind })
const required = (kind: ProfileKind, institutionId = 'institution', ownership: string = models[kind]) => kind === 'NCAA_PROGRAM' || kind === 'NCAAW_PROGRAM' ? [body('BOARD', institutionId), body('EXECUTIVE', institutionId), body('ATHLETIC_DEPARTMENT', institutionId), body('COMPLIANCE', institutionId)] : kind === 'FEDERATION' ? [body('BOARD', institutionId), body('EXECUTIVE', institutionId), body('COMPLIANCE', institutionId)] : kind === 'PROFESSIONAL_CLUB' && ownership === 'MULTISPORT_SECTION' ? [body('BOARD', institutionId), body('EXECUTIVE', institutionId), body('ATHLETIC_DEPARTMENT', institutionId)] : [body('OWNERSHIP', institutionId), body('BOARD', institutionId), body('EXECUTIVE', institutionId)]

describe('Governance institutional resolution', () => {
  it.each(['PROFESSIONAL_CLUB', 'NBA_FRANCHISE', 'WNBA_FRANCHISE', 'NCAA_PROGRAM', 'NCAAW_PROGRAM', 'FEDERATION'] as const)('resolves a fully structured %s institution', (kind) => expect(resolveGovernanceInstitutionStructure(profile(kind), institution(kind), required(kind))).toMatchObject({ verdict: 'VALID', deviations: [] }))
  it('allows member-owned and multisport professional structures', () => {
    const member = { ...profile('PROFESSIONAL_CLUB'), ownershipModel: 'MEMBER_OWNED' as const }
    const multisport = { ...profile('PROFESSIONAL_CLUB'), ownershipModel: 'MULTISPORT_SECTION' as const }
    expect(resolveGovernanceInstitutionStructure(member, institution('PROFESSIONAL_CLUB'), required('PROFESSIONAL_CLUB'))).toMatchObject({ verdict: 'VALID' })
    expect(resolveGovernanceInstitutionStructure(multisport, institution('PROFESSIONAL_CLUB'), required('PROFESSIONAL_CLUB', 'institution', 'MULTISPORT_SECTION'))).toMatchObject({ verdict: 'VALID' })
  })
  it('reports optional absence and extra compatible bodies as non-invalid deviations', () => {
    const result = resolveGovernanceInstitutionStructure(profile('NCAA_PROGRAM'), institution('NCAA_PROGRAM'), [...required('NCAA_PROGRAM').filter((value) => value.kind !== 'COMPLIANCE'), body('OWNERSHIP')])
    expect(result.verdict).toBe('VALID_WITH_DEVIATIONS')
    expect(result.deviations.map((value) => value.kind)).toEqual(['OPTIONAL_STRUCTURE_ABSENT', 'UNEXPECTED_BUT_ALLOWED_STRUCTURE'])
  })
  it('reports a missing required layer as invalid', () => expect(resolveGovernanceInstitutionStructure(profile('PROFESSIONAL_CLUB'), institution('PROFESSIONAL_CLUB'), [body('OWNERSHIP'), body('BOARD')])).toMatchObject({ verdict: 'INVALID', deviations: expect.arrayContaining([expect.objectContaining({ kind: 'MISSING_REQUIRED_STRUCTURE', bodyKind: 'EXECUTIVE' })]) }))
  it('permits owner/governor arrangements and basketball-operations naming without authority inference', () => {
    const result = resolveGovernanceInstitutionStructure(profile('NBA_FRANCHISE'), institution('NBA_FRANCHISE'), required('NBA_FRANCHISE'))
    expect(result).toMatchObject({ verdict: 'VALID' }); expect(result).not.toHaveProperty('authorityGrants'); expect(result).not.toHaveProperty('appointments')
  })
  it('recognizes WNBA, multisport, and NCAA shared-parent reuse without cloning bodies', () => {
    for (const kind of ['WNBA_FRANCHISE', 'NCAA_PROGRAM', 'NCAAW_PROGRAM'] as const) {
      const parent = institution(kind, 'parent'), child = institution(kind, 'child', 'parent'), childProfile = profile(kind, 'child')
      const result = resolveGovernanceInstitutionStructure(childProfile, child, required(kind, 'parent'), [parent, child])
      expect(result.verdict).toBe('VALID_WITH_DEVIATIONS'); expect(result.deviations.every((value) => value.kind === 'SHARED_PARENT_REUSE' || value.kind === 'OPTIONAL_STRUCTURE_ABSENT')).toBe(true)
    }
  })
  it('invalidates profile and parent relationship mismatches', () => {
    expect(resolveGovernanceInstitutionStructure(profile('NBA_FRANCHISE'), institution('PROFESSIONAL_CLUB'), required('PROFESSIONAL_CLUB'))).toMatchObject({ verdict: 'INVALID', deviations: expect.arrayContaining([expect.objectContaining({ kind: 'PROFILE_MISMATCH' })]) })
    expect(resolveGovernanceInstitutionStructure(profile('WNBA_FRANCHISE'), institution('WNBA_FRANCHISE', 'child', 'missing'), required('WNBA_FRANCHISE'))).toMatchObject({ verdict: 'INVALID', deviations: expect.arrayContaining([expect.objectContaining({ kind: 'INVALID_PARENT_RELATIONSHIP' })]) })
  })
  it('flags incompatible profile body references without mutating its inputs', () => {
    const p = { ...profile('PROFESSIONAL_CLUB'), apexAuthorityBodyId: 'foreign:BOARD' }, bodies = [...required('PROFESSIONAL_CLUB'), body('BOARD', 'foreign')]
    const before = structuredClone(bodies), result = resolveGovernanceInstitutionStructure(p, institution('PROFESSIONAL_CLUB'), bodies)
    expect(result).toMatchObject({ verdict: 'INVALID', deviations: expect.arrayContaining([expect.objectContaining({ kind: 'INCOMPATIBLE_STRUCTURE' })]) }); expect(bodies).toEqual(before)
  })
  it('orders findings and verdicts deterministically', () => {
    const first = resolveGovernanceInstitutionStructure(profile('NCAA_PROGRAM'), institution('NCAA_PROGRAM'), [body('BOARD'), body('OWNERSHIP')])
    expect(first).toEqual(resolveGovernanceInstitutionStructure(profile('NCAA_PROGRAM'), institution('NCAA_PROGRAM'), [body('OWNERSHIP'), body('BOARD')]))
  })
})
