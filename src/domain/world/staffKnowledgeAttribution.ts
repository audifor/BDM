import type { StaffPersonId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import type { OrganizationKnowledgeDimension } from '@/domain/knowledge'
import type { GameWorld } from './GameWorld'

/** Smallest shape supporting provenance inspection without duplicating report data: report id + the staff it resolves to + the report's own date, deduplicated and deterministically ordered. */
export interface KnowledgeAttributionRecord {
  readonly reportId: string
  readonly staffId: StaffPersonId
  readonly reportDate: GameDate
}

/**
 * Resolves a knowledge dimension's `reportIds` back to the originating Staff via the EXISTING
 * `EvaluatorReport.evaluatorStaffId` attribution chain — no new knowledge type, no duplicate
 * report storage. A `reportId` with no matching `EvaluatorReport` (e.g. pruned/legacy data) is
 * silently skipped rather than throwing. Deduplicated by `reportId` and returned in stable,
 * deterministic order (report id ascending) — never dependent on object/map iteration order.
 */
export function attributeKnowledgeDimension(world: GameWorld, dimension: OrganizationKnowledgeDimension | undefined): readonly KnowledgeAttributionRecord[] {
  if (dimension?.reportIds === undefined) return []
  const uniqueReportIds = [...new Set(dimension.reportIds)].sort()
  return uniqueReportIds
    .map((reportId) => {
      const report = world.evaluatorReportsById[reportId]
      return report === undefined ? undefined : { reportId, staffId: report.evaluatorStaffId, reportDate: report.createdAt }
    })
    .filter((record): record is KnowledgeAttributionRecord => record !== undefined)
}

/** Convenience: deduplicated, deterministically ordered Staff ids only (drops the report-level detail). */
export function attributingStaffIds(world: GameWorld, dimension: OrganizationKnowledgeDimension | undefined): readonly StaffPersonId[] {
  return [...new Set(attributeKnowledgeDimension(world, dimension).map((record) => record.staffId))].sort()
}
