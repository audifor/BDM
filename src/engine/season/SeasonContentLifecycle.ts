import { addDays, addYears, type GameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessNbaDraftEligibility, createDraftForCompletedSeason } from '@/engine/draft'
import { nbaDraftRulesForYear } from '@/domain/draft'
import { resolveFuturePickProtections } from '@/engine/trade'
import { defaultRecruitingRules, recruitingRulesetForSeason, type RecruitingCycle } from '@/domain/recruiting'
import { sportsCategoryForGender } from '@/domain/primitives'

export interface ProductionDraftPoolProjection { readonly playerIds: readonly import('@/domain/ids').PlayerId[]; readonly playersBefore: number; readonly playersAfter: number }

/** Pure projection: eligible production candidates are existing Players already on NCAA/FIBA rosters. */
export function projectProductionDraftPool(world: GameWorld, seasonId: keyof GameWorld['seasons'], rules: ReturnType<typeof nbaDraftRulesForYear>, scheduledOn?: GameDate): ProductionDraftPoolProjection {
  const playersBefore = Object.keys(world.players).length
  const season = world.seasons[seasonId]
  if (season === undefined) return { playerIds: [], playersBefore, playersAfter: playersBefore }
  const category = world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.category
  const draftYear = Number(season.startDate.slice(0, 4)) + 1
  const date = scheduledOn ?? rules.draftDate ?? addDays(season.endDate, rules.scheduledAfterDays)
  const selected = new Set(Object.values(world.draftPicksById).flatMap(pick => pick.selection === undefined ? [] : [pick.selection.playerId]))
  const candidates = Object.values(world.teams)
    .filter((team) => Object.values(world.competitions).some((competition) => competition.participantTeamIds.includes(team.id) && world.ecosystems[competition.ecosystemId]?.kind !== 'nbaLike'))
    .flatMap((team) => team.rosterPlayerIds)
    .filter((id, index, ids) => {
      if (ids.indexOf(id) !== index || world.players[id] === undefined || selected.has(id)) return false
      if (sportsCategoryForGender(world.players[id]!.gender) !== category) return false
      const team = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(id))
      const ecosystemId = team === undefined ? undefined : Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(team.id))?.ecosystemId
      const kind = ecosystemId === undefined ? undefined : world.ecosystems[ecosystemId]?.kind
      if (kind !== 'ncaaLike' && kind !== 'fibaLike') return false
      if (kind === 'ncaaLike' && !Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === id && enrollment.status === 'active')) return false
      return assessNbaDraftEligibility(world, id, { scheduledOn: date, rules }).automatic
    })
  const playersAfter = Object.keys(world.players).length
  if (playersAfter !== playersBefore || candidates.some((playerId) => world.players[playerId] === undefined)) throw new Error('Production Draft pool projection must preserve Player count and existing identities')
  return { playerIds: candidates, playersBefore, playersAfter }
}

/** Produces season-scoped content only when its configured ecosystem season completes. */
export function processSeasonContentLifecycle(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  const season = world.seasons[seasonId]
  if (season === undefined || world.seasonHistoryBySeasonId[seasonId] === undefined) return world
  const ecosystem = world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!
  if (ecosystem.draftRules === undefined) return world
  const draftYear = Number(season.startDate.slice(0, 4)) + 1
  const rules = nbaDraftRulesForYear(draftYear, ecosystem.draftRules.rounds)
  const projection = projectProductionDraftPool(world, season.id, rules)
  const created = createDraftForCompletedSeason(world, ecosystem.id, season.id, rules, projection.playerIds)
  const draftId = `draft:${ecosystem.id}:${season.id}`
  return resolveFuturePickProtections(created, ecosystem.id, Number(season.startDate.slice(0, 4)), Object.values(created.draftPicksById).filter((pick) => pick.draftId === draftId))
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
  const yearsElapsed = latestCycle === undefined ? 0 : Number(season.startDate.slice(0, 4)) - Number(world.seasons[latestCycle.sourceSeasonId]!.startDate.slice(0, 4))
  const institutionalSigningPolicies = latestCycle?.institutionalSigningPolicies?.map((policy) => ({ ...policy, seasonId: season.id, finalAidSigningDate: addYears(policy.finalAidSigningDate, yearsElapsed), provenance: 'SIMULATED_CARRY_FORWARD' as const, basedOnSeasonId: latestCycle.sourceSeasonId }))
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
