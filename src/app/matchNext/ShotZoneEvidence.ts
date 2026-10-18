import type { PlayerId } from '@/domain/ids'
import {
  MATCH_SHOT_ZONE_IDS, validateShotZoneBreakdown,
  type MatchShotZoneBreakdown, type MatchShotZoneId,
} from '@/domain/stats/MatchStatLog'
import type { MatchNextEvent } from '@/engine/match-next'

/**
 * Derive compact zone evidence from exact Match Next release/outcome events.
 * No coordinates or full PBP retained in the Save; completed boxes already
 * keep totals. A missing release label yields no detailed profile for that
 * player rather than fabricated estimates.
 */
export function observedShotZones(events: readonly MatchNextEvent[]): ReadonlyMap<PlayerId, MatchShotZoneBreakdown> {
  const counts = new Map<PlayerId, Partial<Record<MatchShotZoneId, { made: number; attempted: number }>>>()
  const pending = new Map<PlayerId, (MatchShotZoneId | null)[]>()
  const incomplete = new Set<PlayerId>()
  for (const event of events) {
    const id = event.shooterPlayerId
    if (id === undefined) continue
    if (event.type === 'shotReleased') {
      const zone = MATCH_SHOT_ZONE_IDS.find((candidate) => candidate === event.shotZone) ?? null
      if (zone === null) incomplete.add(id)
      const bag = pending.get(id) ?? []
      bag.push(zone)
      pending.set(id, bag)
      if (zone === null) continue
      const byZone = counts.get(id) ?? {}
      const old = byZone[zone] ?? { made: 0, attempted: 0 }
      byZone[zone] = { ...old, attempted: old.attempted + 1 }
      counts.set(id, byZone)
    } else if (event.type === 'shotMade' || event.type === 'shotMissed' || event.type === 'shotBlocked') {
      const bag = pending.get(id)
      // In blocking events shooterPlayerId is known. Do not confuse a
      // defender's playerId with the shooter receiving the missed attempt.
      const zone = bag?.shift()
      if (zone === undefined) { incomplete.add(id); continue }
      if (event.type === 'shotMade' && zone !== null) {
        const old = counts.get(id)?.[zone]
        if (old !== undefined) old.made += 1
      }
    }
  }
  const profiles = new Map<PlayerId, MatchShotZoneBreakdown>()
  for (const [id, byZone] of counts) {
    if (incomplete.has(id) || (pending.get(id)?.length ?? 0) > 0) continue
    profiles.set(id, { provenance: 'OBSERVED', counts: byZone })
  }
  return profiles
}

/** Safe guard for partial/legacy event logs. */
export function observedShotZonesForBox(
  breakdown: MatchShotZoneBreakdown | undefined,
  box: Parameters<typeof validateShotZoneBreakdown>[1],
): MatchShotZoneBreakdown | undefined {
  if (breakdown === undefined) return undefined
  try {
    validateShotZoneBreakdown(breakdown, box)
    return breakdown
  } catch {
    return undefined
  }
}
