import type { WorldDbCompetitionBundleV1, WorldDbFixtureSideV1 } from '@/domain/worldDb/CompetitionBundle'
import type { WorldDbMatchRealizationBundleV1, WorldDbMatchV1 } from '@/domain/worldDb/MatchRealizationBundle'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import type { WorldDbGameFixtureBindingV1 } from './WorldDbGameFixtureBinding'
import { projectWorldDbPhysicalMatchPolicyV1 } from './WorldDbPhysicalMatchPolicy'
import { resolveWorldDbFixtureSchedulesAtV1 } from './WorldDbScheduleResolver'

export type WorldDbPhysicalGameWaitingReasonV1 =
  | 'UNSCHEDULED'
  | 'UNRESOLVED_PARTICIPANTS'
  | 'MISSING_TEAM'
  | 'UNSUPPORTED_SIDE_ROLE'
  | 'UNSUPPORTED_PHYSICAL_MATCH_CONTEXT'
  | 'MISSING_SHARED_COUNTERPART'

export interface WorldDbCompetitionPlanningContextV1 {
  readonly bundle: WorldDbCompetitionBundleV1
  readonly matchRealizations?: WorldDbMatchRealizationBundleV1
  readonly resolvedEntryIdByStructurePositionId?: Readonly<Record<string, string>>
}

export interface WorldDbPlannedPhysicalGameV1 {
  readonly gameId: string
  readonly sourceMatchId: string | null
  readonly primaryCompetitionSeasonId: string
  readonly seasonId: string
  readonly competitionId: string
  readonly localDate: string | null
  readonly homeTeamId: string
  readonly awayTeamId: string
  readonly competitionFixtureIds: readonly string[]
}

export interface WorldDbPhysicalGameWaitingFixtureV1 {
  readonly competitionFixtureId: string
  readonly reason: WorldDbPhysicalGameWaitingReasonV1
}

export interface WorldDbPhysicalGamePlanningResultV1 {
  readonly games: readonly WorldDbPlannedPhysicalGameV1[]
  readonly bindings: readonly WorldDbGameFixtureBindingV1[]
  readonly waitingFixtures: readonly WorldDbPhysicalGameWaitingFixtureV1[]
}

interface PlanningContextRuntime {
  readonly input: WorldDbCompetitionPlanningContextV1
  readonly runtime: ReturnType<typeof createWorldDbCompetitionRuntimeV1>
  readonly physicalPolicy: ReturnType<typeof projectWorldDbPhysicalMatchPolicyV1>
  readonly schedules: ReturnType<typeof resolveWorldDbFixtureSchedulesAtV1>
}

interface FixtureCandidate {
  readonly fixtureId: string
  readonly competitionSeasonId: string
  readonly seasonId: string
  readonly competitionId: string
  readonly databaseId: string
  readonly localDate: string
  readonly homeTeamId: string
  readonly awayTeamId: string
  readonly physicalMatchContext: string | null
  readonly sharedCompetitionSeasonId: string | null
}

interface ExistingPhysicalMatch {
  readonly match: WorldDbMatchV1
  readonly gameId: string
  readonly databaseId: string
  readonly competitionFixtureIds: readonly string[]
}

/**
 * Plans physical runtime game identity from declarative B04 fixtures and optional canonical B12 rows.
 *
 * Same-date/same-team fixtures are never merged by coincidence. A new runtime game can realize
 * multiple competition fixtures only when one fixture explicitly declares
 * `SHARED_WITH_DECLARED_COMPETITION` and names the target competition season.
 */
export function planWorldDbPhysicalGamesV1(
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
  asOf: string,
): WorldDbPhysicalGamePlanningResultV1 {
  if (contexts.length === 0) return Object.freeze({ games: Object.freeze([]), bindings: Object.freeze([]), waitingFixtures: Object.freeze([]) })

  const runtimes = buildRuntimes(contexts, asOf)
  const contextBySeasonId = uniqueContextIndex(runtimes)
  const databaseId = requireSingleDatabase(runtimes)
  const existing = collectExistingMatches(runtimes, databaseId)
  const bindings: WorldDbGameFixtureBindingV1[] = []
  const bindingPairs = new Set<string>()
  const games: WorldDbPlannedPhysicalGameV1[] = []

  for (const physical of existing) {
    const primary = contextBySeasonId[physical.match.competitionSeasonId]
    if (primary === undefined) {
      throw new Error(`World DB match ${physical.match.matchId} references competition season not loaded for planning: ${physical.match.competitionSeasonId}`)
    }
    const fixtureIds = [...physical.competitionFixtureIds].sort()
    games.push(Object.freeze({
      gameId: physical.gameId,
      sourceMatchId: physical.match.matchId,
      primaryCompetitionSeasonId: physical.match.competitionSeasonId,
      seasonId: primary.input.bundle.competitionSeason.seasonId,
      competitionId: primary.input.bundle.competitionSeason.competitionId,
      localDate: matchLocalDate(physical.match),
      homeTeamId: physical.match.homeTeamId,
      awayTeamId: physical.match.awayTeamId,
      competitionFixtureIds: Object.freeze(fixtureIds),
    }))
    for (const fixtureId of fixtureIds) addBinding(bindings, bindingPairs, physical.gameId, fixtureId)
  }

  const realizedFixtureIds = new Set(bindings.map((binding) => binding.competitionFixtureId))
  const waitingFixtures: WorldDbPhysicalGameWaitingFixtureV1[] = []
  const candidates: FixtureCandidate[] = []

  for (const context of runtimes) {
    for (const fixture of context.input.bundle.fixtures) {
      if (realizedFixtureIds.has(fixture.competitionFixtureId)) continue
      const schedule = context.schedules[fixture.competitionFixtureId]
      if (schedule?.timing?.localDate == null) {
        waitingFixtures.push(waiting(fixture.competitionFixtureId, 'UNSCHEDULED'))
        continue
      }

      const participants = resolveFixtureParticipants(context, fixture.competitionFixtureId)
      if (participants.kind === 'waiting') {
        waitingFixtures.push(waiting(fixture.competitionFixtureId, participants.reason))
        continue
      }

      const physicalMatchContext = fixture.structureNodeId === null
        ? null
        : context.physicalPolicy.physicalMatchContextByNodeId[fixture.structureNodeId] ?? null
      if (physicalMatchContext !== null && physicalMatchContext !== 'SHARED_WITH_DECLARED_COMPETITION' && physicalMatchContext !== 'COMPETITION_EXCLUSIVE') {
        waitingFixtures.push(waiting(fixture.competitionFixtureId, 'UNSUPPORTED_PHYSICAL_MATCH_CONTEXT'))
        continue
      }

      candidates.push(Object.freeze({
        fixtureId: fixture.competitionFixtureId,
        competitionSeasonId: context.input.bundle.competitionSeason.competitionSeasonId,
        seasonId: context.input.bundle.competitionSeason.seasonId,
        competitionId: context.input.bundle.competitionSeason.competitionId,
        databaseId: context.input.bundle.source.databaseId,
        localDate: schedule.timing.localDate,
        homeTeamId: participants.homeTeamId,
        awayTeamId: participants.awayTeamId,
        physicalMatchContext,
        sharedCompetitionSeasonId: context.physicalPolicy.sharedCompetitionSeasonId,
      }))
    }
  }

  const candidateByFixtureId = uniqueCandidateIndex(candidates)
  const consumed = new Set<string>()
  const existingBySeasonAndSignature = indexExistingBySeasonAndSignature(existing, contextBySeasonId)
  const candidateBySeasonAndSignature = indexCandidatesBySeasonAndSignature(candidates)

  for (const candidate of [...candidates].sort((left, right) => left.fixtureId.localeCompare(right.fixtureId))) {
    if (consumed.has(candidate.fixtureId)) continue

    if (candidate.physicalMatchContext === 'SHARED_WITH_DECLARED_COMPETITION') {
      const targetSeasonId = candidate.sharedCompetitionSeasonId
      if (targetSeasonId === null) {
        waitingFixtures.push(waiting(candidate.fixtureId, 'MISSING_SHARED_COUNTERPART'))
        consumed.add(candidate.fixtureId)
        continue
      }
      const signature = fixtureSignature(candidate)
      const existingTargets = existingBySeasonAndSignature[seasonSignatureKey(targetSeasonId, signature)] ?? []
      const targetCandidates = (candidateBySeasonAndSignature[seasonSignatureKey(targetSeasonId, signature)] ?? [])
        .filter((value) => !consumed.has(value.fixtureId))

      if (existingTargets.length + targetCandidates.length !== 1) {
        if (existingTargets.length + targetCandidates.length === 0) {
          waitingFixtures.push(waiting(candidate.fixtureId, 'MISSING_SHARED_COUNTERPART'))
          consumed.add(candidate.fixtureId)
          continue
        }
        throw new Error(`Shared fixture ${candidate.fixtureId} has ambiguous physical counterparts in ${targetSeasonId}`)
      }

      if (existingTargets.length === 1) {
        const target = existingTargets[0]!
        addBinding(bindings, bindingPairs, target.gameId, candidate.fixtureId)
        const planned = games.find((game) => game.gameId === target.gameId)
        if (planned === undefined) throw new Error(`Existing physical game missing from plan: ${target.gameId}`)
        const mergedFixtureIds = [...new Set([...planned.competitionFixtureIds, candidate.fixtureId])].sort()
        replaceGame(games, target.gameId, Object.freeze({ ...planned, competitionFixtureIds: Object.freeze(mergedFixtureIds) }))
        consumed.add(candidate.fixtureId)
        continue
      }

      const target = targetCandidates[0]!
      if (target.physicalMatchContext === 'COMPETITION_EXCLUSIVE') {
        throw new Error(`Shared fixture ${candidate.fixtureId} targets competition-exclusive fixture ${target.fixtureId}`)
      }
      if (target.seasonId !== candidate.seasonId) {
        throw new Error(`Shared physical fixtures must belong to the same season: ${candidate.fixtureId} vs ${target.fixtureId}`)
      }
      const fixtureIds = [candidate.fixtureId, target.fixtureId].sort()
      const gameId = runtimeGameId(databaseId, fixtureIds)
      games.push(Object.freeze({
        gameId,
        sourceMatchId: null,
        primaryCompetitionSeasonId: target.competitionSeasonId,
        seasonId: target.seasonId,
        competitionId: target.competitionId,
        localDate: target.localDate,
        homeTeamId: target.homeTeamId,
        awayTeamId: target.awayTeamId,
        competitionFixtureIds: Object.freeze(fixtureIds),
      }))
      for (const fixtureId of fixtureIds) addBinding(bindings, bindingPairs, gameId, fixtureId)
      consumed.add(candidate.fixtureId)
      consumed.add(target.fixtureId)
      continue
    }

    const fixtureIds = [candidate.fixtureId]
    const gameId = runtimeGameId(databaseId, fixtureIds)
    games.push(Object.freeze({
      gameId,
      sourceMatchId: null,
      primaryCompetitionSeasonId: candidate.competitionSeasonId,
      seasonId: candidate.seasonId,
      competitionId: candidate.competitionId,
      localDate: candidate.localDate,
      homeTeamId: candidate.homeTeamId,
      awayTeamId: candidate.awayTeamId,
      competitionFixtureIds: Object.freeze(fixtureIds),
    }))
    addBinding(bindings, bindingPairs, gameId, candidate.fixtureId)
    consumed.add(candidate.fixtureId)
  }

  for (const candidate of candidates) {
    if (!consumed.has(candidate.fixtureId) && candidateByFixtureId[candidate.fixtureId] !== undefined) {
      throw new Error(`Fixture candidate was not consumed by physical-game planning: ${candidate.fixtureId}`)
    }
  }

  return Object.freeze({
    games: Object.freeze(games.sort((left, right) => left.gameId.localeCompare(right.gameId))),
    bindings: Object.freeze(bindings.sort((left, right) => left.gameId.localeCompare(right.gameId) || left.competitionFixtureId.localeCompare(right.competitionFixtureId))),
    waitingFixtures: Object.freeze(waitingFixtures.sort((left, right) => left.competitionFixtureId.localeCompare(right.competitionFixtureId))),
  })
}

function buildRuntimes(contexts: readonly WorldDbCompetitionPlanningContextV1[], asOf: string): readonly PlanningContextRuntime[] {
  return contexts.map((input) => Object.freeze({
    input,
    runtime: createWorldDbCompetitionRuntimeV1(input.bundle),
    physicalPolicy: projectWorldDbPhysicalMatchPolicyV1(input.bundle),
    schedules: resolveWorldDbFixtureSchedulesAtV1(input.bundle, asOf),
  }))
}

function uniqueContextIndex(contexts: readonly PlanningContextRuntime[]): Readonly<Record<string, PlanningContextRuntime>> {
  const result: Record<string, PlanningContextRuntime> = {}
  for (const context of contexts) {
    const id = context.input.bundle.competitionSeason.competitionSeasonId
    if (result[id] !== undefined) throw new Error(`Duplicate competition season planning context: ${id}`)
    result[id] = context
  }
  return result
}

function requireSingleDatabase(contexts: readonly PlanningContextRuntime[]): string {
  const ids = new Set(contexts.map((context) => context.input.bundle.source.databaseId))
  if (ids.size !== 1) throw new Error('Physical game planning requires contexts from one World DB')
  return [...ids][0]!
}

function collectExistingMatches(contexts: readonly PlanningContextRuntime[], databaseId: string): readonly ExistingPhysicalMatch[] {
  const matchById = new Map<string, WorldDbMatchV1>()
  const fixtureIdsByMatchId = new Map<string, Set<string>>()

  for (const context of contexts) {
    const bundle = context.input.matchRealizations
    if (bundle === undefined) continue
    for (const match of bundle.matches) {
      const previous = matchById.get(match.matchId)
      if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(match)) {
        throw new Error(`Conflicting World DB match payloads: ${match.matchId}`)
      }
      matchById.set(match.matchId, match)
    }
    for (const realization of bundle.realizations) {
      if (!matchById.has(realization.matchId)) throw new Error(`Fixture realization references missing match: ${realization.matchId}`)
      const values = fixtureIdsByMatchId.get(realization.matchId) ?? new Set<string>()
      values.add(realization.competitionFixtureId)
      fixtureIdsByMatchId.set(realization.matchId, values)
    }
  }

  return Object.freeze([...matchById.values()]
    .map((match) => Object.freeze({
      match,
      gameId: `worlddb:${databaseId}:match:${match.matchId}`,
      databaseId,
      competitionFixtureIds: Object.freeze([...(fixtureIdsByMatchId.get(match.matchId) ?? new Set<string>())].sort()),
    }))
    .sort((left, right) => left.match.matchId.localeCompare(right.match.matchId)))
}

function resolveFixtureParticipants(
  context: PlanningContextRuntime,
  fixtureId: string,
): { readonly kind: 'ready'; readonly homeTeamId: string; readonly awayTeamId: string } | { readonly kind: 'waiting'; readonly reason: WorldDbPhysicalGameWaitingReasonV1 } {
  const sides = context.runtime.fixtureSidesByFixtureId[fixtureId] ?? []
  if (sides.length !== 2) return { kind: 'waiting', reason: 'UNRESOLVED_PARTICIPANTS' }

  let home: WorldDbFixtureSideV1 | undefined
  let away: WorldDbFixtureSideV1 | undefined
  for (const side of sides) {
    if (side.sideRole === 'HOME') {
      if (home !== undefined) throw new Error(`Fixture ${fixtureId} has multiple HOME sides`)
      home = side
    } else if (side.sideRole === 'AWAY') {
      if (away !== undefined) throw new Error(`Fixture ${fixtureId} has multiple AWAY sides`)
      away = side
    } else {
      return { kind: 'waiting', reason: 'UNSUPPORTED_SIDE_ROLE' }
    }
  }
  if (home === undefined || away === undefined) return { kind: 'waiting', reason: 'UNSUPPORTED_SIDE_ROLE' }

  const homeEntryId = resolveSideEntryId(context, home)
  const awayEntryId = resolveSideEntryId(context, away)
  if (homeEntryId === null || awayEntryId === null) return { kind: 'waiting', reason: 'UNRESOLVED_PARTICIPANTS' }
  if (homeEntryId === awayEntryId) throw new Error(`Fixture ${fixtureId} resolves the same entry on both sides`)

  const homeTeamId = context.runtime.entryById[homeEntryId]?.teamId ?? null
  const awayTeamId = context.runtime.entryById[awayEntryId]?.teamId ?? null
  if (homeTeamId === null || awayTeamId === null) return { kind: 'waiting', reason: 'MISSING_TEAM' }
  if (homeTeamId === awayTeamId) throw new Error(`Fixture ${fixtureId} resolves the same team on both sides`)
  return { kind: 'ready', homeTeamId, awayTeamId }
}

function resolveSideEntryId(context: PlanningContextRuntime, side: WorldDbFixtureSideV1): string | null {
  const sources = [side.competitionSeasonEntryId, side.competitionSeasonSlotId, side.sourceStructurePositionId].filter((value) => value !== null)
  if (sources.length > 1) throw new Error(`Fixture side ${side.competitionFixtureSideId} declares multiple participant sources`)
  if (side.competitionSeasonEntryId !== null) return side.competitionSeasonEntryId
  if (side.sourceStructurePositionId !== null) {
    return context.input.resolvedEntryIdByStructurePositionId?.[side.sourceStructurePositionId] ?? null
  }
  return null
}

function indexCandidatesBySeasonAndSignature(candidates: readonly FixtureCandidate[]): Readonly<Record<string, readonly FixtureCandidate[]>> {
  const result: Record<string, FixtureCandidate[]> = {}
  for (const candidate of candidates) {
    const key = seasonSignatureKey(candidate.competitionSeasonId, fixtureSignature(candidate))
    ;(result[key] ??= []).push(candidate)
  }
  return result
}

function indexExistingBySeasonAndSignature(
  existing: readonly ExistingPhysicalMatch[],
  contextBySeasonId: Readonly<Record<string, PlanningContextRuntime>>,
): Readonly<Record<string, readonly ExistingPhysicalMatch[]>> {
  const result: Record<string, ExistingPhysicalMatch[]> = {}
  for (const physical of existing) {
    if (contextBySeasonId[physical.match.competitionSeasonId] === undefined) continue
    const localDate = matchLocalDate(physical.match)
    if (localDate === null) continue
    const signature = `${localDate}\u0000${physical.match.homeTeamId}\u0000${physical.match.awayTeamId}`
    ;(result[seasonSignatureKey(physical.match.competitionSeasonId, signature)] ??= []).push(physical)
  }
  return result
}

function uniqueCandidateIndex(candidates: readonly FixtureCandidate[]): Readonly<Record<string, FixtureCandidate>> {
  const result: Record<string, FixtureCandidate> = {}
  for (const candidate of candidates) {
    if (result[candidate.fixtureId] !== undefined) throw new Error(`Duplicate competition fixture across planning contexts: ${candidate.fixtureId}`)
    result[candidate.fixtureId] = candidate
  }
  return result
}

function fixtureSignature(candidate: Pick<FixtureCandidate, 'localDate' | 'homeTeamId' | 'awayTeamId'>): string {
  return `${candidate.localDate}\u0000${candidate.homeTeamId}\u0000${candidate.awayTeamId}`
}

function seasonSignatureKey(competitionSeasonId: string, signature: string): string {
  return `${competitionSeasonId}\u0000${signature}`
}

function runtimeGameId(databaseId: string, fixtureIds: readonly string[]): string {
  return `worlddb:${databaseId}:runtime:${[...fixtureIds].sort().join('+')}`
}

function matchLocalDate(match: WorldDbMatchV1): string | null {
  for (const value of [match.scheduledAt, match.playedAt]) {
    if (value === null) continue
    const date = value.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  }
  return null
}

function addBinding(
  bindings: WorldDbGameFixtureBindingV1[],
  pairs: Set<string>,
  gameId: string,
  competitionFixtureId: string,
): void {
  const key = `${gameId}\u0000${competitionFixtureId}`
  if (pairs.has(key)) return
  pairs.add(key)
  bindings.push(Object.freeze({ gameId, competitionFixtureId }))
}

function replaceGame(games: WorldDbPlannedPhysicalGameV1[], gameId: string, next: WorldDbPlannedPhysicalGameV1): void {
  const index = games.findIndex((game) => game.gameId === gameId)
  if (index < 0) throw new Error(`Physical game not found for replacement: ${gameId}`)
  games[index] = next
}

function waiting(
  competitionFixtureId: string,
  reason: WorldDbPhysicalGameWaitingReasonV1,
): WorldDbPhysicalGameWaitingFixtureV1 {
  return Object.freeze({ competitionFixtureId, reason })
}
