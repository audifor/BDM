import type { GameDate } from '@/domain/date'
import { organizationIdForTeam, type OrganizationId, type PlayerId } from '@/domain/ids'
import type { PlayerKnowledgeRecord } from './PlayerKnowledge'
export type { OrganizationId } from '@/domain/ids'
export type KnowledgeProvenance = 'legacyBaseline' | 'public' | 'ownObservation' | 'scoutReport' | 'inferred'
export interface OrganizationKnowledgeDimension { readonly coverage:number; readonly confidence:number; readonly assessedAt:GameDate; readonly provenance:KnowledgeProvenance; readonly estimate?:number; readonly uncertainty?:number; readonly evidenceIds?:readonly string[]; readonly reportIds?:readonly string[] }
/** Sparse V2 contract only. Reports and assignments arrive in Wave 2. */
export interface OrganizationKnowledge { readonly organizationId:OrganizationId; readonly subjectPlayerId:PlayerId; readonly dimensions:Readonly<Record<string,OrganizationKnowledgeDimension>> }

const legacyDimensions: Readonly<Record<string, string>> = { finishing: 'finishing', shooting: 'shooting', playmaking: 'creation', perimeterDefense: 'perimeterDefense', interiorDefense: 'interiorDefense', rebounding: 'rebounding', athleticism: 'physical' }

/** Pure V1 boundary migration: one record becomes one deliberately sparse finding. */
export function migrateLegacyPlayerKnowledge(record: PlayerKnowledgeRecord, ownPlayerIds: ReadonlySet<PlayerId> = new Set()): OrganizationKnowledge {
  const coverageBase = ownPlayerIds.has(record.subjectPlayerId) ? 0.65 : 0.35
  const dimensions = Object.fromEntries(Object.entries(record.basketball.ratings).map(([legacyKey, finding]) => {
    const confidence = Math.max(0.1, Math.min(0.9, 1 - finding.uncertainty / 25))
    return [legacyDimensions[legacyKey]!, { coverage: coverageBase, confidence, assessedAt: record.assessedOn, provenance: 'legacyBaseline' as const, estimate: finding.estimatedValue, uncertainty: finding.uncertainty }]
  }))
  return { organizationId: organizationIdForTeam(record.observerTeamId), subjectPlayerId: record.subjectPlayerId, dimensions }
}

export function createOrganizationKnowledge(value: OrganizationKnowledge): OrganizationKnowledge {
  if (Object.keys(value.dimensions).length === 0) throw new RangeError('Organization knowledge must be sparse but non-empty')
  for (const finding of Object.values(value.dimensions)) {
    if (!Number.isFinite(finding.coverage) || finding.coverage < 0 || finding.coverage > 1 || !Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1 || finding.provenance === undefined) throw new RangeError('Organization knowledge finding is invalid')
    if (finding.estimate !== undefined && (!Number.isFinite(finding.estimate) || finding.estimate < 0 || finding.estimate > 100)) throw new RangeError('Organization knowledge estimate is invalid')
    if (finding.uncertainty !== undefined && (!Number.isFinite(finding.uncertainty) || finding.uncertainty < 0 || finding.uncertainty > 20)) throw new RangeError('Organization knowledge uncertainty is invalid')
  }
  return { ...value, dimensions: Object.fromEntries(Object.entries(value.dimensions).map(([key, finding]) => [key, { ...finding, ...(finding.evidenceIds === undefined ? {} : { evidenceIds: [...new Set(finding.evidenceIds)] }), ...(finding.reportIds === undefined ? {} : { reportIds: [...new Set(finding.reportIds)] }) }])) }
}
