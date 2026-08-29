import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createDraftForCompletedSeason, generateDraftProspects } from '@/engine/draft'
import { resolveFuturePickProtections } from '@/engine/trade'

/** Produces season-scoped content only when its configured ecosystem season completes. */
export function processSeasonContentLifecycle(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  const season = world.seasons[seasonId]
  if (season === undefined || world.seasonHistoryBySeasonId[seasonId] === undefined) return world
  const ecosystem = world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!
  if (ecosystem.draftRules === undefined) return world
  const created = createDraftForCompletedSeason(world, ecosystem.id, season.id, ecosystem.draftRules, [])
  const draftId = `draft:${ecosystem.id}:${season.id}`
  const prospectCount = world.competitions[season.competitionId]!.participantTeamIds.length * ecosystem.draftRules.rounds
  const prospected = created.draftsById[draftId]!.prospectPlayerIds.length === 0 ? generateDraftProspects(created, draftId, prospectCount) : created
  return resolveFuturePickProtections(prospected, ecosystem.id, Number(season.startDate.slice(0, 4)), Object.values(prospected.draftPicksById).filter((pick) => pick.draftId === draftId))
}

/** Creates an NCAA recruiting cycle from configured capability and its source season. */
export function initializeRecruitingCycle(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  const season = world.seasons[seasonId]; if (season === undefined) return world
  const ecosystem = world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!
  if (ecosystem.recruitingRules === undefined) return world
  const id = `recruiting:${ecosystem.id}:${season.id}`
  if (world.recruitingCyclesById[id] !== undefined) return world
  const nextStart = addDays(season.startDate, 365)
  const closesOn = addDays(season.endDate, 30) < addDays(nextStart, -1) ? addDays(season.endDate, 30) : addDays(nextStart, -1)
  return updateGameWorld(world, { recruitingCycles: [...Object.values(world.recruitingCyclesById), { id, ecosystemId: ecosystem.id, sourceSeasonId: season.id, targetSeasonId: `${season.id}:next` as never, opensOn: season.startDate, signingOn: addDays(season.endDate, 1), closesOn, status: 'scheduled', rules: ecosystem.recruitingRules }] })
}
