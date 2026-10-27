import type { WorldCompetitionFormatDocument } from '@/domain/competition'

/** Runtime capabilities exercised by a family representative, independent of
 * competition identity, participant count, round names and venue pattern length. */
export function worldDbV2FamilySignature(format: WorldCompetitionFormatDocument): string {
  const variant = format.variants.find(v => v.isRealVariant) ?? format.variants[0]!
  const capabilities = new Set<string>()
  for (const node of variant.nodes) {
    if (node.role === 'REGULAR_SEASON') capabilities.add(`regular:${node.pairing?.type}:${node.opponentScope?.type ?? 'ALL_STAGE'}`)
    if (node.contest) capabilities.add(`contest:${node.contest.formatType}`)
    if (node.hosting) capabilities.add(`hosting:${node.hosting.ruleType}:${node.hosting.priorityBasis ?? ''}`)
    const payload = node.pairing?.payload ?? {}
    for (const key of ['pairings', 'matchups', 'paths', 'pairing']) {
      const value = payload[key]
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
        if (typeof item !== 'string') continue
        capabilities.add(/^WINNER_\d+-WINNER_\d+$/.test(item) ? 'bracket:ordinal-outcomes'
          : /^(WINNER|LOSER)/.test(item) ? 'bracket:named-outcomes' : 'bracket:seeds')
      }
    }
  }
  for (const edge of variant.edges) capabilities.add('selector:' + edge.selector)
  for (const basis of variant.seeding?.basis ?? []) {
    if (typeof basis === 'object' && basis !== null && !Array.isArray(basis) && typeof basis.type === 'string') capabilities.add('classification:' + basis.type)
  }
  return 'worlddb-v2-family-v1|' + [...capabilities].sort().join('|')
}

/** Explicit capabilities of the existing single-stage career projection.
 * This gate prevents an NBA fixed schedule or grouped format from quietly
 * entering the generic round-robin scheduler. Research status is independent.
 */
export function worldDbV2ConnectionBlockers(format: WorldCompetitionFormatDocument, participants: number, frozenTemplatePolicy = false): string[] {
  const issues: string[] = []
  if (format.status !== 'COMPLETE') issues.push(`Source format ${format.competitionSeasonId} is ${format.status}; missing execution fields must be reconciled from its sources`)
  const variant = format.variants.find(v => v.isRealVariant) ?? format.variants[0]!
  const hasClassificationPolicy = variant.seeding?.basis.some(b => typeof b === 'object' && b !== null && !Array.isArray(b) && b.type === 'CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1')
  if (!frozenTemplatePolicy && !hasClassificationPolicy) issues.push('Classification policy is not linked; a COMPLETE document does not authorize substituting default tie-breaks')
  const regular = variant.nodes.filter(n => n.role === 'REGULAR_SEASON')
  if (regular.length !== 1) issues.push(`Native single-stage projection requires one regular node; found ${regular.length}; group/conference assignments and stage planner connection required`)
  for (const node of regular) {
    if (node.pairing?.type !== 'ROUND_ROBIN') issues.push(`${node.key}: ${node.pairing?.type ?? 'missing pairing'} requires its own existing scheduling authority; do not substitute ROUND_ROBIN`)
    if (node.opponentScope && node.opponentScope.type !== 'ALL_STAGE') issues.push(`${node.key}: ${node.opponentScope.type} needs verified participant assignments and scoped scheduling`)
    if (node.pairing?.meetingsPerPair !== 2) issues.push(`${node.key}: native career projection currently supports exactly two meetings per pair, source declares ${node.pairing?.meetingsPerPair ?? 'unspecified'}`)
    if (node.teamCount !== undefined && node.teamCount !== participants) issues.push(`${node.key}: source edition declares ${node.teamCount} participants, PBM supplies ${participants}; reconcile editions without changing identities`)
  }
  return issues
}
