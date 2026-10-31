import type { TeamId } from '@/domain/ids'
import type { WorldCompetitionFormatNode } from './WorldCompetitionFormatTypes'

/** Generated assignments are a declared gameplay policy, never historical memberships. */
export function resolveWorldCompetitionGroups(node: WorldCompetitionFormatNode, participants: readonly TeamId[]): readonly (readonly TeamId[])[] {
  if (node.opponentScope?.type === 'SCHEDULE_MATRIX'
    && node.opponentScope.payload.policy === 'BDM_PINNED_NBA_CONFERENCES') {
    const rawEast = node.opponentScope.payload.east_team_ids
    const rawWest = node.opponentScope.payload.west_team_ids
    if (!Array.isArray(rawEast) || !Array.isArray(rawWest)
      || rawEast.length !== 15 || rawWest.length !== 15
      || [...rawEast, ...rawWest].some(id => typeof id !== 'string')) {
      throw new Error('NBA conference membership requires two explicitly pinned 15-club lists')
    }
    const ids = new Map(participants.map(id => [String(id), id]))
    const all = [...rawEast, ...rawWest] as string[]
    if (new Set(all).size !== 30 || new Set(participants).size !== 30
      || all.some(id => !ids.has(id))) throw new Error('NBA conference membership must cover exactly the original 30 club IDs')
    return [rawEast.map(id => ids.get(id as string)!), rawWest.map(id => ids.get(id as string)!)]
  }
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
