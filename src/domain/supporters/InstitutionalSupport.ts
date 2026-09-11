import { parseGameDate, type GameDate } from '@/domain/date'
import type { GovernanceActor } from '@/domain/governance'
import type { TeamId } from '@/domain/ids'

export const INSTITUTIONAL_SUPPORT_SCOPES = ['INSTITUTION_WIDE', 'ATHLETICS_WIDE', 'PROGRAM_SPECIFIC', 'MEN_BASKETBALL', 'WOMEN_BASKETBALL', 'MULTI_PROGRAM'] as const
export type InstitutionalSupportScope = typeof INSTITUTIONAL_SUPPORT_SCOPES[number]
export const SUPPORTER_RELATIONSHIP_KINDS = ['DONOR', 'BOOSTER'] as const
export type SupporterRelationshipKind = typeof SUPPORTER_RELATIONSHIP_KINDS[number]
export const DONOR_PATTERNS = ['ONE_TIME', 'RECURRING'] as const
export type DonorPattern = typeof DONOR_PATTERNS[number]
export const COLLECTIVE_AFFILIATION_KINDS = ['INDEPENDENT', 'INSTITUTIONAL_AFFILIATE'] as const
export type CollectiveAffiliationKind = typeof COLLECTIVE_AFFILIATION_KINDS[number]
export const COLLECTIVE_PARTICIPANT_KINDS = ['COLLECTIVE_MEMBER', 'COLLECTIVE_EXECUTIVE', 'BUSINESS_PARTNER', 'EXTERNAL_SUPPORTER'] as const
export type CollectiveParticipantKind = typeof COLLECTIVE_PARTICIPANT_KINDS[number]

/** A structural donor/booster status; it is never money, authority, or political influence. */
export interface SupporterRelationship {
  readonly id: string
  readonly actor: GovernanceActor
  readonly kind: SupporterRelationshipKind
  readonly institutionId: string
  readonly scope: InstitutionalSupportScope
  readonly programTeamIds: readonly TeamId[]
  readonly startedOn: GameDate
  readonly endedOn?: GameDate
  readonly donorPattern?: DonorPattern
  readonly restricted: boolean
}
/** Existing NIL Collective identity attached to an institution without making it part of that institution. */
export interface CollectiveInstitutionAffiliation {
  readonly id: string
  readonly collectiveId: string
  readonly institutionId: string
  readonly kind: CollectiveAffiliationKind
  readonly scope: InstitutionalSupportScope
  readonly programTeamIds: readonly TeamId[]
  readonly startedOn: GameDate
  readonly endedOn?: GameDate
}
/** A participant relation, not a governance appointment or collective ownership model. */
export interface CollectiveParticipantAffiliation {
  readonly id: string
  readonly collectiveId: string
  readonly actor: GovernanceActor
  readonly kind: CollectiveParticipantKind
  readonly startedOn: GameDate
  readonly endedOn?: GameDate
}

function dates(startedOn: GameDate, endedOn?: GameDate): { readonly startedOn: GameDate; readonly endedOn?: GameDate } {
  const start = parseGameDate(startedOn), end = endedOn === undefined ? undefined : parseGameDate(endedOn)
  if (end !== undefined && end < start) throw new RangeError('Institutional support relationship ends before it starts')
  return end === undefined ? { startedOn: start } : { startedOn: start, endedOn: end }
}
function scope(scope: InstitutionalSupportScope, programTeamIds: readonly TeamId[]): readonly TeamId[] {
  if (!INSTITUTIONAL_SUPPORT_SCOPES.includes(scope) || new Set(programTeamIds).size !== programTeamIds.length || programTeamIds.some((id) => !id.trim())) throw new RangeError('Invalid institutional support scope')
  const requiresPrograms = scope === 'PROGRAM_SPECIFIC' || scope === 'MEN_BASKETBALL' || scope === 'WOMEN_BASKETBALL' || scope === 'MULTI_PROGRAM'
  if (requiresPrograms !== (programTeamIds.length > 0) || (scope === 'PROGRAM_SPECIFIC' && programTeamIds.length !== 1) || ((scope === 'MEN_BASKETBALL' || scope === 'WOMEN_BASKETBALL') && programTeamIds.length !== 1)) throw new RangeError('Institutional support scope does not match programs')
  return [...programTeamIds]
}
function actor(value: GovernanceActor): GovernanceActor {
  if (!value.id.trim() || !['COACH', 'STAFF', 'EXTERNAL'].includes(value.kind)) throw new RangeError('Invalid institutional support actor')
  return { ...value }
}
export function createSupporterRelationship(value: SupporterRelationship): SupporterRelationship {
  if (!value.id.trim() || !value.institutionId.trim() || !SUPPORTER_RELATIONSHIP_KINDS.includes(value.kind) || (value.kind === 'DONOR' && value.donorPattern === undefined) || (value.kind === 'BOOSTER' && value.donorPattern !== undefined) || (value.donorPattern !== undefined && !DONOR_PATTERNS.includes(value.donorPattern))) throw new RangeError('Invalid supporter relationship')
  return { ...value, actor: actor(value.actor), programTeamIds: scope(value.scope, value.programTeamIds), ...dates(value.startedOn, value.endedOn) }
}
export function createCollectiveInstitutionAffiliation(value: CollectiveInstitutionAffiliation): CollectiveInstitutionAffiliation {
  if (!value.id.trim() || !value.collectiveId.trim() || !value.institutionId.trim() || !COLLECTIVE_AFFILIATION_KINDS.includes(value.kind)) throw new RangeError('Invalid collective institution affiliation')
  return { ...value, programTeamIds: scope(value.scope, value.programTeamIds), ...dates(value.startedOn, value.endedOn) }
}
export function createCollectiveParticipantAffiliation(value: CollectiveParticipantAffiliation): CollectiveParticipantAffiliation {
  if (!value.id.trim() || !value.collectiveId.trim() || !COLLECTIVE_PARTICIPANT_KINDS.includes(value.kind)) throw new RangeError('Invalid collective participant affiliation')
  return { ...value, actor: actor(value.actor), ...dates(value.startedOn, value.endedOn) }
}
