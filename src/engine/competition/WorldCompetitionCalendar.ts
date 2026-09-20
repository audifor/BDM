import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import type { WorldCompetitionFormatDocument, WorldCompetitionFormatNode, WorldCompetitionFormatVariant } from '@/domain/competition'

export interface CompetitionSeasonWindows {
  readonly regularSeasonStart: GameDate
  readonly regularSeasonEnd: GameDate
  readonly postseasonStart: GameDate | null
  readonly seasonEnd: GameDate
  readonly postseasonStartByNodeKey: Readonly<Record<string, GameDate>>
}

/** Reserves the maximum configured playoff game days inside a season's overall calendar window. */
export function deriveCompetitionSeasonWindows(
  seasonStart: GameDate,
  seasonEnd: GameDate,
  format?: WorldCompetitionFormatDocument,
): CompetitionSeasonWindows {
  if (compareGameDates(seasonStart, seasonEnd) > 0) throw new RangeError('Competition season starts after it ends')
  if (format === undefined) return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd: seasonEnd, postseasonStart: null, seasonEnd, postseasonStartByNodeKey: Object.freeze({}) })

  const variant = requireCompetitionFormatVariant(format)
  const regularNode = variant.nodes.find((node) => node.role === 'REGULAR_SEASON')
  if (regularNode === undefined) return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd: seasonEnd, postseasonStart: null, seasonEnd, postseasonStartByNodeKey: Object.freeze({}) })

  const postseasonKeys = reachableNodes(regularNode.key, variant)
  postseasonKeys.delete(regularNode.key)
  if (postseasonKeys.size === 0) return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd: seasonEnd, postseasonStart: null, seasonEnd, postseasonStartByNodeKey: Object.freeze({}) })

  const ordered = topologicalNodes(variant)
  const durations = new Map<string, number>()
  for (const node of variant.nodes) {
    if (!postseasonKeys.has(node.key)) continue
    const duration = maxGameDays(node)
    if (duration > 0) durations.set(node.key, duration)
  }
  if (durations.size === 0) return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd: seasonEnd, postseasonStart: null, seasonEnd, postseasonStartByNodeKey: Object.freeze({}) })

  const startOffsets = new Map<string, number>()
  const endOffsets = new Map<string, number>()
  for (const node of ordered) {
    if (!durations.has(node.key)) continue
    const incoming = variant.edges.filter((edge) => edge.to === node.key && durations.has(edge.from))
    const startOffset = incoming.length === 0 ? 0 : Math.max(...incoming.map((edge) => endOffsets.get(edge.from) ?? 0))
    startOffsets.set(node.key, startOffset)
    endOffsets.set(node.key, startOffset + durations.get(node.key)!)
  }
  const reserveDays = Math.max(...endOffsets.values())
  const regularSeasonEnd = addDays(seasonEnd, -reserveDays)
  if (compareGameDates(regularSeasonEnd, seasonStart) < 0) throw new RangeError('Competition season window cannot fit regular season and configured postseason')
  const postseasonStart = addDays(regularSeasonEnd, 1)
  const postseasonStartByNodeKey = Object.fromEntries([...startOffsets].map(([nodeKey, offset]) => [nodeKey, addDays(postseasonStart, offset)]))
  return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd, postseasonStart, seasonEnd, postseasonStartByNodeKey: Object.freeze(postseasonStartByNodeKey) })
}

export function requireCompetitionFormatVariant(format: WorldCompetitionFormatDocument): WorldCompetitionFormatVariant {
  if (format.status !== 'COMPLETE') throw new Error(`Competition format is not executable: ${format.competitionSeasonId}`)
  const variant = format.variants.find((candidate) => candidate.isRealVariant) ?? format.variants[0]
  if (variant === undefined) throw new Error(`Competition format has no variant: ${format.competitionSeasonId}`)
  return variant
}

function maxGameDays(node: WorldCompetitionFormatNode): number {
  if (node.contest?.formatType === 'SERIES') {
    if (node.contest.bestOf === undefined || node.contest.winsRequired !== Math.floor(node.contest.bestOf / 2) + 1) throw new Error(`Postseason SERIES node ${node.key} requires a valid best-of rule`)
    return node.contest.bestOf
  }
  if (node.contest?.formatType === 'SINGLE_GAME') return 1
  if (node.contest?.formatType === 'AGGREGATE') {
    if (node.contest.legCount === undefined) throw new Error(`Postseason AGGREGATE node ${node.key} requires a leg count`)
    return node.contest.legCount
  }
  if (['ROUND', 'SERIES', 'BRACKET'].includes(node.nodeType)) throw new Error(`Postseason node ${node.key} requires an executable contest format`)
  return 0
}

function reachableNodes(start: string, variant: WorldCompetitionFormatVariant): Set<string> {
  const reached = new Set([start])
  const pending = [start]
  while (pending.length > 0) {
    const current = pending.shift()!
    for (const edge of variant.edges.filter((candidate) => candidate.from === current)) {
      if (reached.has(edge.to)) continue
      reached.add(edge.to)
      pending.push(edge.to)
    }
  }
  return reached
}

function topologicalNodes(variant: WorldCompetitionFormatVariant): readonly WorldCompetitionFormatNode[] {
  const byKey = new Map(variant.nodes.map((node) => [node.key, node] as const))
  const indegree = new Map(variant.nodes.map((node): [string, number] => [node.key, 0]))
  const outgoing = new Map<string, string[]>()
  for (const edge of variant.edges) {
    if (!byKey.has(edge.from) || !byKey.has(edge.to)) throw new Error(`Competition format has unknown progression node: ${edge.from}->${edge.to}`)
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
    indegree.set(edge.to, indegree.get(edge.to)! + 1)
  }
  const ready = variant.nodes.filter((node) => indegree.get(node.key) === 0).map((node) => node.key)
  const result: WorldCompetitionFormatNode[] = []
  while (ready.length > 0) {
    const key = ready.shift()!
    result.push(byKey.get(key)!)
    for (const next of outgoing.get(key) ?? []) {
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) ready.push(next)
    }
  }
  if (result.length !== variant.nodes.length) throw new Error('Competition format progression graph is cyclic')
  return result
}
