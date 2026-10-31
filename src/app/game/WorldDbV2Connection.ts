import type { WorldCompetitionFormatDocument } from '@/domain/competition'
import { instantiateWorldCompetitionFixedBracketV1 } from '@/engine/competition/WorldCompetitionFixedBracket'

/** Runtime capabilities exercised by a family representative, independent of
 * competition identity, participant count, round names and venue pattern length. */
export function worldDbV2FamilySignature(format: WorldCompetitionFormatDocument): string {
  const variant = format.variants.find(v => v.isRealVariant) ?? format.variants[0]!
  const capabilities = new Set<string>()
  for (const node of variant.nodes) {
    if (node.role === 'SPLIT_STAGE') capabilities.add(`stage:${node.pairing?.payload.bdm_split_policy ?? node.pairing?.type}`)
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
    const groups = node.opponentScope?.payload.generated_group_count
    const generatedGroups = node.opponentScope?.type === 'SAME_GROUP' && node.opponentScope.payload.policy === 'BDM_GENERATED_GROUPS'
      && typeof groups === 'number' && Number.isInteger(groups) && groups >= 2 && groups <= Math.floor(participants / 2)
    if (node.opponentScope && node.opponentScope.type !== 'ALL_STAGE' && !generatedGroups) issues.push(`${node.key}: ${node.opponentScope.type} needs verified participant assignments and scoped scheduling`)
    if (!Number.isInteger(node.pairing?.meetingsPerPair) || node.pairing!.meetingsPerPair! < 1) issues.push(`${node.key}: meetings per pair must be a positive integer`)
    if (node.teamCount !== undefined && node.teamCount !== participants) issues.push(`${node.key}: source edition declares ${node.teamCount} participants, PBM supplies ${participants}; reconcile editions without changing identities`)
  }
  if (!frozenTemplatePolicy && issues.length === 0 && variant.edges.length > 0) {
    try {
      const plan = instantiateWorldCompetitionFixedBracketV1(format, variant.key, Array.from({ length: participants }, (_, i) => ({ competitionSeasonEntryId: `preflight:${i + 1}`, seed: i + 1 })))
      for (const node of variant.nodes.filter(n => n.role !== 'REGULAR_SEASON')) {
        if (node.role === 'GROUP_STAGE' && typeof node.pairing?.payload.bdm_generated_group_index === 'number') continue
        if (node.role === 'SPLIT_STAGE' && ['CROSS_GROUP_CARRYOVER', 'GROUP_ROUND_ROBIN'].includes(String(node.pairing?.payload.bdm_split_policy))) continue
        if (!plan.fixtureIdsByNodeKey[node.key]?.length) throw new Error(`${node.key}: phase has no executable fixtures`)
        if (node.contest?.formatType === 'SERIES' && (node.hosting?.ruleType !== 'SERIES_PATTERN' || node.hosting.priorityBasis !== 'HIGHER_SEED')) throw new Error(`${node.key}: explicit series hosting required`)
        if (node.contest?.formatType === 'AGGREGATE' && (node.contest.legCount !== 2 || node.contest.tieResolution?.method !== 'BDM_EXTRA_DECIDER')) throw new Error(`${node.key}: executable aggregate tie policy required`)
        if (!node.contest) throw new Error(`${node.key}: contest rules missing`)
      }
    } catch (error) { issues.push(error instanceof Error ? error.message : String(error)) }
  }
  return issues
}
