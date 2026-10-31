import type { TeamId } from '@/domain/ids'
import type { WorldCompetitionFormatNode } from './WorldCompetitionFormatTypes'

/** Generated assignments are a declared gameplay policy, never historical memberships. */
export function resolveWorldCompetitionGroups(node: WorldCompetitionFormatNode, participants: readonly TeamId[]): readonly (readonly TeamId[])[] {
  if (node.opponentScope?.type === 'SCHEDULE_MATRIX'
    && ['BDM_PINNED_GLEAGUE_CONFERENCES', 'BDM_PINNED_GLEAGUE_TIPOFF_REGIONS'].includes(String(node.opponentScope.payload.policy))) {
    const isRegions = node.opponentScope.payload.policy === 'BDM_PINNED_GLEAGUE_TIPOFF_REGIONS'
    const names = isRegions ? ['central', 'east', 'south', 'west'] : ['east', 'west']
    const expected = isRegions ? [8, 8, 8, 7] : [16, 15]
    const ids = new Map(participants.map(id => [String(id), id]))
    const result = names.map((name, index) => {
      const raw = node.opponentScope!.payload[`${name}_team_ids`]
      if (!Array.isArray(raw) || raw.length !== expected[index] || raw.some(id => typeof id !== 'string')) {
        throw new Error(`G League source ${name} group requires ${expected[index]} original clubs`)
      }
      return (raw as string[]).map(id => {
        const team = ids.get(id)
        if (!team) throw new Error('G League grouping references a club absent from the source season: ' + id)
        return team
      })
    })
    const all = result.flat()
    if (all.length !== 31 || new Set(all).size !== 31 || ids.size !== 31) {
      throw new Error('G League source group membership must preserve all 31 PBM club identities exactly once')
    }
    return result
  }
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
