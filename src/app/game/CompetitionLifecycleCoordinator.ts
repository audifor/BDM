import type { GameDate } from '@/domain/date'
import type { CompetitionId, SeasonId } from '@/domain/ids'
import { getEcosystemForCompetition, type GameWorld } from '@/domain/world'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { areTierMovementDependenciesResolved } from '@/engine/competition'
import { startNextSeasonTransitionFor, type CompetitionSeasonTransitionResult } from './startNextSeason'

/**
 * Whether a Competition's future editions can be generated automatically once its current
 * Season completes.
 *
 * Competition lifecycle capability is a property of the GameWorld, never of which competition
 * the user happens to be following (`world.currentSeasonId` is a gameplay/UI concern only): the
 * same criterion applies to every competition in the world, independently of each other.
 *
 * FULLY_SUPPORTED_PRIMARY -- `startNextSeasonFor` knows how to regenerate this competition's next
 *                            edition: a round-robin-shaped competition with at least two
 *                            participants, or an NCAA-like competition with a valid conference
 *                            snapshot. When the Season also
 *                            carries both a `calendarPolicy` and a `worldCompetitionFormat`, the
 *                            next edition's window is derived deterministically from the real
 *                            cadence and round count (`deriveNextEditionCalendarPolicy`); without
 *                            them, `startNextSeasonFor` falls back to a plain one-year shift. Both
 *                            are FULLY_SUPPORTED because both produce a valid next edition; only
 *                            the precision of the derived calendar differs. This competition rolls
 *                            itself forward independently of every other competition in the world.
 * LINKED_TO_PRIMARY       -- not itself independently rolled: it is a "linked edition" (e.g. a
 *                            domestic cup keyed to its parent league's qualification round,
 *                            reachable through the parent's `calendarPolicy.specialCompetitionWindows`).
 *                            Its own lifecycle question ("has it completed / does it need a next
 *                            edition") is resolved atomically together with its parent by
 *                            `startNextSeasonFor(parentSeasonId)`, never on its own.
 * UNSUPPORTED_FUTURE_LIFECYCLE -- no future-edition generation exists for this configuration,
 *                            e.g. fewer than two participants or an NCAA-like season without a
 *                            valid, populated conference snapshot.
 */
export type CompetitionLifecycleSupport = 'FULLY_SUPPORTED_PRIMARY' | 'LINKED_TO_PRIMARY' | 'UNSUPPORTED_FUTURE_LIFECYCLE'

export interface CompetitionLifecycleCapability {
  readonly competitionId: CompetitionId
  readonly seasonId: SeasonId
  readonly support: CompetitionLifecycleSupport
  /** Only set for LINKED_TO_PRIMARY: the primary Season whose rollover also resolves this one. */
  readonly linkedToSeasonId?: SeasonId
}

/** Classifies every Competition currently in the world; does not mutate anything. */
export function classifyCompetitionLifecycles(world: GameWorld): readonly CompetitionLifecycleCapability[] {
  const seasons = latestSeasonPerCompetition(world)
  const linkedFrom = new Map<string, SeasonId>() // linked edition's worldCompetitionFormat.competitionSeasonId -> its primary's seasonId
  for (const { season } of seasons) {
    if (season.calendarPolicy === undefined) continue
    for (const window of season.calendarPolicy.specialCompetitionWindows) linkedFrom.set(window.competitionSeasonId, season.id)
  }

  return seasons.map(({ competitionId, season }) => {
    const editionId = season.worldCompetitionFormat?.competitionSeasonId
    const linkedToSeasonId = editionId === undefined ? undefined : linkedFrom.get(editionId)
    if (linkedToSeasonId !== undefined) return { competitionId, seasonId: season.id, support: 'LINKED_TO_PRIMARY' as const, linkedToSeasonId }
    const participantCount = (season.participantTeamIds ?? world.competitions[competitionId]!.participantTeamIds).length
    const isNcaaLike = getEcosystemForCompetition(world, competitionId).kind === 'ncaaLike'
    const isFullySupported = participantCount >= 2 && (!isNcaaLike || hasValidNcaaConferenceSnapshot(world, season.id, season.participantTeamIds ?? world.competitions[competitionId]!.participantTeamIds))
    return { competitionId, seasonId: season.id, support: isFullySupported ? 'FULLY_SUPPORTED_PRIMARY' as const : 'UNSUPPORTED_FUTURE_LIFECYCLE' as const }
  })
}

export interface UnsupportedLifecycleDiagnostic {
  readonly competitionId: CompetitionId
  readonly seasonId: SeasonId
  readonly capabilityMissing: 'futureSeasonGeneration'
  readonly lastSupportedDate: GameDate
}

/**
 * Rolls forward every FULLY_SUPPORTED_PRIMARY competition whose current Season is complete and
 * finalized -- each independently, in no particular cross-competition order, since none depends
 * on another's rollover except through the LINKED_TO_PRIMARY relationship already resolved
 * atomically inside `startNextSeasonFor`.
 *
 * Every eligible competition is rolled unconditionally, in no particular order -- since
 * `startNextSeasonFor` never moves `world.currentDate` (see `startNextSeason.ts`), a rollover here
 * can never overshoot a "simulate until targetDate" order the way an eager clock jump could; the
 * new edition simply exists, `SCHEDULED`, with a future `startDate`, and the world clock reaches
 * it later one day at a time.
 *
 * Returns the updated world plus, if any UNSUPPORTED_FUTURE_LIFECYCLE competition has also
 * completed its only supported Season, a diagnostic identifying exactly which competition and
 * season blocked further progress and the last date its schedule actually covers -- callers must
 * surface this rather than silently continuing, deleting orphaned fixtures, or moving their dates.
 */
export function advanceCompetitionLifecycles(world: GameWorld): { readonly world: GameWorld; readonly transitions: readonly CompetitionSeasonTransitionResult[]; readonly blockedOn?: UnsupportedLifecycleDiagnostic } {
  let current = world
  const transitions: CompetitionSeasonTransitionResult[] = []
  const capabilities = classifyCompetitionLifecycles(current)
  const readyToRoll = new Set(capabilities.filter((capability) => capability.support === 'FULLY_SUPPORTED_PRIMARY'
    && isSeasonComplete(world, capability.seasonId)
    && getSeasonHistoryRecord(world, capability.seasonId) !== undefined
    && areTierMovementDependenciesResolved(world, capability.seasonId)).map((capability) => capability.seasonId))

  for (const capability of capabilities) {
    if (capability.support !== 'FULLY_SUPPORTED_PRIMARY') continue
    if (current.seasons[capability.seasonId] === undefined) continue // already superseded by an earlier iteration's rollover
    if (!readyToRoll.has(capability.seasonId)) continue
    const transition = startNextSeasonTransitionFor(current, capability.seasonId)
    current = transition.world
    transitions.push(transition.result)
  }

  for (const capability of classifyCompetitionLifecycles(current)) {
    if (capability.support !== 'UNSUPPORTED_FUTURE_LIFECYCLE') continue
    if (!isSeasonComplete(current, capability.seasonId) || getSeasonHistoryRecord(current, capability.seasonId) === undefined) continue
    const season = current.seasons[capability.seasonId]!
    return { world: current, transitions: Object.freeze(transitions), blockedOn: { competitionId: capability.competitionId, seasonId: capability.seasonId, capabilityMissing: 'futureSeasonGeneration', lastSupportedDate: season.endDate } }
  }

  return { world: current, transitions: Object.freeze(transitions) }
}

function hasValidNcaaConferenceSnapshot(world: GameWorld, seasonId: SeasonId, participantTeamIds: readonly import('@/domain/ids').TeamId[]): boolean {
  const season = world.seasons[seasonId]!
  const memberships = season.conferenceMembershipSnapshot ?? world.conferenceMemberships.filter((membership) => membership.seasonId === seasonId)
  const groups = new Map<string, Set<string>>()
  for (const membership of memberships) {
    const teams = groups.get(membership.conferenceId) ?? new Set<string>()
    teams.add(membership.teamId)
    groups.set(membership.conferenceId, teams)
  }
  const membershipTeams = new Set([...groups.values()].flatMap((teams) => [...teams]))
  const participants = new Set(participantTeamIds)
  return groups.size >= 2 && [...groups.values()].every((teams) => teams.size >= 2)
    && membershipTeams.size === participants.size && [...participants].every((teamId) => membershipTeams.has(teamId))
}

function latestSeasonPerCompetition(world: GameWorld): readonly { readonly competitionId: CompetitionId; readonly season: GameWorld['seasons'][SeasonId] }[] {
  const latestByCompetition = new Map<CompetitionId, GameWorld['seasons'][SeasonId]>()
  for (const season of Object.values(world.seasons)) {
    const existing = latestByCompetition.get(season.competitionId)
    if (existing === undefined || season.startDate > existing.startDate || (season.startDate === existing.startDate && season.id > existing.id)) {
      latestByCompetition.set(season.competitionId, season)
    }
  }
  return [...latestByCompetition.entries()].map(([competitionId, season]) => ({ competitionId, season }))
}
