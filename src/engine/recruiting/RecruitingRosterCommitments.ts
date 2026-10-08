import type { RecruitSigning } from '@/domain/recruiting'
import type { GameWorld } from '@/domain/world'

/** A legitimate successor-season placeholder is binding before the Season is materialized. */
export function validPendingNcaaSignings(world: GameWorld): readonly RecruitSigning[] {
  return Object.values(world.recruitSigningsById).filter(signing => {
    const profile = world.recruitProfilesById[signing.recruitId]
    const cycle = world.recruitingCyclesById[signing.cycleId]
    const season = world.seasons[signing.targetSeasonId]
    const source = cycle && world.seasons[cycle.sourceSeasonId]
    const competition = world.competitions[(season ?? source)?.competitionId ?? '']
    if (profile?.status !== 'incoming' || profile.playerId !== signing.playerId || profile.cycleId !== signing.cycleId
      || !cycle || cycle.targetSeasonId !== signing.targetSeasonId || competition?.ecosystemId !== cycle.ecosystemId
      || !competition.participantTeamIds.includes(signing.programTeamId) || (season !== undefined && season.endDate < world.currentDate)) return false
    if (profile.origin === 'transfer') {
      const entry = profile.transferPortalEntryId === undefined ? undefined : world.transferPortalEntriesById[profile.transferPortalEntryId]
      if (entry?.status !== 'authorized' || entry.playerId !== signing.playerId || entry.ecosystemId !== cycle.ecosystemId) return false
    }
    return true
  })
}

export function pendingBindingRosterPlayerIds(world: GameWorld): ReadonlySet<string> {
  const ids = new Set<string>(validPendingNcaaSignings(world).map(item => item.playerId))
  for (const right of Object.values(world.playerRightsById)) {
    if (right.status === 'active' && (right.expiresAt === undefined || right.expiresAt >= world.currentDate)) ids.add(right.playerId)
  }
  return ids
}
