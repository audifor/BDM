import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { getAddressableScoutingPlayerIds } from '@/app/scouting'
import { createMarketTarget, marketTargetId, type MarketTarget, type MarketTargetPriority, type MarketTargetKnowledgeSnapshot } from '@/domain/market/MarketTarget'
import { getPlayerKnowledgeSummary } from '@/engine/scouting'

export function getMarketTargetsForTeam(world: GameWorld, teamId: TeamId, includeArchived = false): readonly MarketTarget[] {
  return Object.values(world.marketTargetsById ?? {})
    .filter((target) => target.teamId === teamId && (includeArchived || target.status === 'ACTIVE'))
    .sort((a, b) => ({ HIGH: 0, NORMAL: 1, LOW: 2 })[a.priority] - ({ HIGH: 0, NORMAL: 1, LOW: 2 })[b.priority] ||
      a.createdOn.localeCompare(b.createdOn) || a.playerId.localeCompare(b.playerId))
}

/** Snapshot of persisted club knowledge only, never player truth or private market reality. */
export function snapshotMarketTargetKnowledge(world: GameWorld, teamId: TeamId, playerId: PlayerId): MarketTargetKnowledgeSnapshot {
  const organizationId = world.teams[teamId]?.organizationId
  if (organizationId === undefined) throw new Error('Unknown club')
  const reportCount = Object.values(world.evaluatorReportsById)
    .filter((report) => report.organizationId === organizationId && report.subjectPlayerId === playerId).length
  const knowledge = world.organizationKnowledge.find((item) => item.organizationId === organizationId && item.subjectPlayerId === playerId)
  const count = Object.keys(knowledge?.dimensions ?? {}).filter((key) => key.startsWith('rating:')).length
  const summary = getPlayerKnowledgeSummary(world, organizationId, playerId)
  const known = summary.knownDomains.length > 0
  const market = world.marketKnowledge.filter((item) => item.organizationId === organizationId && item.playerId === playerId)
    .sort((a,b) => b.assessedAt.localeCompare(a.assessedAt))[0]
  return { date: world.currentDate,
    coverage: known ? summary.overallCoverage : null,
    confidence: known ? summary.overallConfidence : null,
    freshness: known ? summary.freshness : null,
    knownRatingCount: count, knownDomains: [...summary.knownDomains], reportCount,
    ...(market?.expectedSalary === undefined ? {} : { expectedSalary: market.expectedSalary, expectedSalaryConfidence: market.confidence }) }
}

function checkTeam(world: GameWorld, teamId: TeamId): void {
  if (world.teams[teamId]?.coachId !== world.userCoachId) throw new Error('Market targets require the user-controlled club')
}
function write(world: GameWorld, updated: MarketTarget): GameWorld {
  return updateGameWorld(world, { marketTargets: [...Object.values(world.marketTargetsById).filter((item) => item.id !== updated.id), createMarketTarget(updated)] })
}
export function addMarketTarget(world: GameWorld, teamId: TeamId, playerId: PlayerId): GameWorld {
  checkTeam(world, teamId)
  if (!getAddressableScoutingPlayerIds(world, teamId).includes(playerId) || world.teams[teamId]!.rosterPlayerIds.includes(playerId)) throw new Error('Player is not an external addressable target')
  const id = marketTargetId(teamId, playerId)
  const existing = world.marketTargetsById[id]
  if (existing?.status === 'ACTIVE') return world
  if (existing !== undefined) return write(world, {
    ...existing, status: 'ACTIVE', reviewedOn: world.currentDate,
    history: [...existing.history, { date: world.currentDate, kind: 'RESTORED' }],
    knowledgeSnapshots: [...(existing.knowledgeSnapshots ?? []), snapshotMarketTargetKnowledge(world, teamId, playerId)],
  })
  return write(world, { id, teamId, playerId, status: 'ACTIVE', priority: 'NORMAL', note: '',
    createdOn: world.currentDate, reviewedOn: world.currentDate,
    history: [{ date: world.currentDate, kind: 'ADDED' }],
    knowledgeSnapshots: [snapshotMarketTargetKnowledge(world, teamId, playerId)],
  })
}
export function archiveMarketTarget(world: GameWorld, teamId: TeamId, playerId: PlayerId): GameWorld {
  checkTeam(world, teamId)
  const entry = world.marketTargetsById[marketTargetId(teamId, playerId)]
  if (entry === undefined || entry.status === 'ARCHIVED') return world
  return write(world, { ...entry, status: 'ARCHIVED', reviewedOn: world.currentDate,
    history: [...entry.history, { date: world.currentDate, kind: 'ARCHIVED' }] })
}
export function setMarketTargetPriority(world: GameWorld, teamId: TeamId, playerId: PlayerId, priority: MarketTargetPriority): GameWorld {
  checkTeam(world, teamId)
  const entry = world.marketTargetsById[marketTargetId(teamId, playerId)]
  if (entry?.status !== 'ACTIVE') throw new Error('Active target not found')
  if (entry.priority === priority) return world
  return write(world, { ...entry, priority, reviewedOn: world.currentDate,
    history: [...entry.history, { date: world.currentDate, kind: 'PRIORITY_CHANGED', detail: priority }] })
}
/** Explicit re-evaluation. Preserves what was known on every review date. */
export function reviewMarketTarget(world: GameWorld, teamId: TeamId, playerId: PlayerId): GameWorld {
  checkTeam(world, teamId)
  const target = world.marketTargetsById[marketTargetId(teamId, playerId)]
  if (target?.status !== 'ACTIVE') throw new Error('Active target not found')
  return write(world, { ...target, reviewedOn: world.currentDate,
    history: [...target.history, { date: world.currentDate, kind: 'KNOWLEDGE_REVIEWED' }],
    knowledgeSnapshots: [...(target.knowledgeSnapshots ?? []), snapshotMarketTargetKnowledge(world, teamId, playerId)] })
}

export function setMarketTargetNote(world: GameWorld, teamId: TeamId, playerId: PlayerId, note: string): GameWorld {
  checkTeam(world, teamId)
  const entry = world.marketTargetsById[marketTargetId(teamId, playerId)]
  if (entry?.status !== 'ACTIVE') throw new Error('Active target not found')
  const clean = note.trim()
  if (clean.length > 500) throw new RangeError('Note limit is 500 characters')
  if (entry.note === clean) return world
  return write(world, { ...entry, note: clean, reviewedOn: world.currentDate,
    history: [...entry.history, { date: world.currentDate, kind: 'NOTE_UPDATED' }] })
}
