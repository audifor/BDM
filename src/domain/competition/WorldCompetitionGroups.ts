import type { TeamId } from '@/domain/ids'
import type { WorldCompetitionFormatNode } from './WorldCompetitionFormatTypes'

/** Generated assignments are a declared gameplay policy, never historical memberships. */
export function resolveWorldCompetitionGroups(node: WorldCompetitionFormatNode, participants: readonly TeamId[]): readonly (readonly TeamId[])[] {
  if (node.opponentScope?.type !== 'SAME_GROUP') return [participants]
  const count = node.opponentScope.payload.generated_group_count
  if (node.opponentScope.payload.policy !== 'BDM_GENERATED_GROUPS' || typeof count !== 'number'
    || !Number.isInteger(count) || count < 2 || count > Math.floor(participants.length / 2)) {
    throw new Error(`${node.key}: explicit executable group assignment policy required`)
  }
  const groups: TeamId[][] = Array.from({ length: count }, () => [])
  ;[...participants].sort().forEach((id, index) => groups[index % count]!.push(id))
  return groups
}
