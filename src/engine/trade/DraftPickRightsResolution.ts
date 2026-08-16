import type { DraftPick } from '@/domain/draft'
import type { EcosystemId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/** Applies persisted future-pick ownership when a matching draft cycle materializes. */
export function materializeFutureDraftPickOwnership(world: GameWorld, ecosystemId: EcosystemId, cycle: number, picks: readonly DraftPick[]): readonly DraftPick[] {
  return picks.map((pick) => { const right = Object.values(world.futureDraftPickRightsById).find((item) => item.ecosystemId === ecosystemId && item.cycle === cycle && item.round === pick.round && item.originalTeamId === pick.originalTeamId); return right === undefined ? pick : { ...pick, ownerTeamId: right.ownerTeamId } })
}

/** Resolves configured protections once a concrete pick order exists. Protected picks retain their owner and roll forward. */
export function resolveFuturePickProtections(world: GameWorld, ecosystemId: EcosystemId, cycle: number, picks: readonly DraftPick[]): GameWorld {
  const materialized = materializeFutureDraftPickOwnership(world, ecosystemId, cycle, picks)
  const rights = Object.values(world.futureDraftPickRightsById)
  const replacements = rights.flatMap((right) => { if (right.ecosystemId !== ecosystemId || right.cycle !== cycle || right.protection === undefined) return [right]; const pick = materialized.find((item) => item.round === right.round && item.originalTeamId === right.originalTeamId); if (pick === undefined) return [right]; const protectedPick = right.protection.protectedOrderRanges.some((range) => pick.order >= range.from && pick.order <= range.to); if (!protectedPick) return [{ ...right, conditionalRecipientTeamId: undefined }]; if (right.protection.outcome.kind === 'extinguish') return []; return [{ ...right, cycle: right.protection.outcome.cycle, round: right.protection.outcome.round, protection: undefined }]; })
  return updateGameWorld(world, { draftPicks: [...Object.values(world.draftPicksById).filter((item) => !picks.some((pick) => pick.id === item.id)), ...materialized], futureDraftPickRights: replacements })
}

/** The holder receives the lower (better) order while both pick identities remain intact. */
export function resolveDraftPickSwapRight(world: GameWorld, swapRightId: string, picks: readonly DraftPick[]): GameWorld {
  const right = world.draftPickSwapRightsById[swapRightId]
  if (right === undefined || right.status !== 'active') throw new Error('Swap right is unavailable')
  const candidates = picks.filter((pick) => pick.round === right.round && (pick.originalTeamId === right.holderTeamId || pick.originalTeamId === right.counterpartTeamId)).sort((a, b) => a.order - b.order)
  if (candidates.length !== 2) throw new Error('Swap right requires two resolved picks')
  const [better, worse] = candidates
  const changed = Object.values(world.draftPicksById).map((pick) => pick.id === better!.id ? { ...pick, ownerTeamId: right.holderTeamId } : pick.id === worse!.id ? { ...pick, ownerTeamId: right.counterpartTeamId } : pick)
  return updateGameWorld(world, { draftPicks: changed, draftPickSwapRights: Object.values(world.draftPickSwapRightsById).map((item) => item.id === right.id ? { ...item, status: 'resolved', resolvedPickIds: [better!.id, worse!.id] } : item) })
}
