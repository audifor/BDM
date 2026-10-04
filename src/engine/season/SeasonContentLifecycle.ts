import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createDraftForCompletedSeason, generateDraftProspects } from '@/engine/draft'
import { resolveFuturePickProtections } from '@/engine/trade'
import { defaultRecruitingRules, recruitingRulesetForSeason, type RecruitingCycle } from '@/domain/recruiting'

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
  const rules = ecosystem.recruitingRules ?? (ecosystem.kind === 'ncaaLike' ? defaultRecruitingRules : undefined)
  if (rules === undefined) return world
  const id = `recruiting:${ecosystem.id}:${season.id}`
  if (world.recruitingCyclesById[id] !== undefined) return world
  const latestCycle = Object.values(world.recruitingCyclesById)
    .filter((cycle) => cycle.ecosystemId === ecosystem.id)
    .sort((a, b) => world.seasons[b.sourceSeasonId]?.startDate.localeCompare(world.seasons[a.sourceSeasonId]?.startDate ?? '') ?? 0)[0]
  const nextStart = addDays(season.startDate, 365)
  const closesOn = addDays(season.endDate, 30) < addDays(nextStart, -1) ? addDays(season.endDate, 30) : addDays(nextStart, -1)
  const priorTemplate = latestCycle?.calendar?.provenance === 'OFFICIAL_SOURCE' || latestCycle?.calendar?.provenance === 'SIMULATED_CARRY_FORWARD'
    ? latestCycle.calendar.template
    : undefined
  const calendar = recruitingRulesetForSeason(ecosystem.category, Number(season.startDate.slice(0, 4)), priorTemplate)
  const institutionalSigningPolicies = latestCycle?.institutionalSigningPolicies?.map((policy) => ({ ...policy, seasonId: season.id, provenance: 'SIMULATED_CARRY_FORWARD' as const, basedOnSeasonId: latestCycle.sourceSeasonId }))
  return updateGameWorld(world, { recruitingCycles: [...Object.values(world.recruitingCyclesById), { id, ecosystemId: ecosystem.id, sourceSeasonId: season.id, targetSeasonId: `${season.id}:next` as never, opensOn: season.startDate, signingOn: addDays(season.endDate, 1), closesOn, status: 'scheduled', rules, calendar, ...(institutionalSigningPolicies === undefined ? {} : { institutionalSigningPolicies }) }] })
}

/** Binds a source season's already-signed recruiting class to its materialized successor. */
export function bindRecruitingCycleTargetToSeason(world: GameWorld, sourceSeasonId: keyof GameWorld['seasons'], targetSeasonId: keyof GameWorld['seasons']): GameWorld {
  const placeholder = `${sourceSeasonId}:next`
  const cycles = Object.values(world.recruitingCyclesById).filter((cycle) => cycle.sourceSeasonId === sourceSeasonId && cycle.targetSeasonId === placeholder)
  if (cycles.length === 0) return world
  const cycleIds = new Set(cycles.map((cycle) => cycle.id))
  return updateGameWorld(world, {
    recruitingCycles: Object.values(world.recruitingCyclesById).map((cycle) => cycleIds.has(cycle.id) ? { ...cycle, targetSeasonId: targetSeasonId as never } : cycle),
    recruitSignings: Object.values(world.recruitSigningsById).map((signing) => cycleIds.has(signing.cycleId) && signing.targetSeasonId === placeholder ? { ...signing, targetSeasonId: targetSeasonId as never } : signing),
  })
}
