import type { GameDate } from '@/domain/date'
import type { CoachId, GameId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import type { RolePromise } from '@/domain/market'
import { applyMoraleEventToWorld, applyRelationshipEventsToWorld, type GameWorld } from '@/domain/world'
import { recordMemory } from '@/engine/memory/MemoryEngine'
import { evaluateRolePromiseUsage, ROLE_PROMISE_EVALUATION_CALIBRATION, type RolePromiseEvaluation } from '@/engine/contractRetention/RolePromiseEvaluation'
import { deriveRolePromiseUsage, isRolePromiseUsageCheckpoint } from '@/engine/contractRetention/RolePromiseUsage'

const reviewKey = (promiseId: string, competitionId: string, seasonId: string, stage: 'midseason' | 'season' = 'season') => `role-promise-review:${promiseId}:${competitionId}:${seasonId}:${stage}`
const reviewMemoryId = (key: string, actor: 'player' | 'coach') => `memory:${key}:${actor}`

/** Reviews only completed-season facts supplied by the calendar (or a one-time recovery scan). */
export function progressRolePromiseSeasonReviews(world: GameWorld, completedSeasonIds: readonly SeasonId[] = Object.keys(world.seasonHistoryBySeasonId) as SeasonId[]): GameWorld {
  const seasonsEnding = completedSeasonIds.map(id => world.seasons[id]).filter((season): season is NonNullable<typeof season> => season !== undefined)
  if (seasonsEnding.length === 0) return world

  const promises = latestActivePromises(world)
  let next = world
  for (const season of seasonsEnding.sort((left, right) => left.id.localeCompare(right.id))) {
    const competition = next.competitions[season.competitionId]
    if (competition === undefined) continue
    const completedOn = next.seasonHistoryBySeasonId[season.id]?.completedOn
    if (completedOn === undefined || completedOn > next.currentDate) continue
    const teamIds = competition.participantTeamIds.filter((teamId) => next.teams[teamId]?.organizationId !== undefined)
    const organizations = new Set(teamIds.map((teamId) => next.teams[teamId]!.organizationId))
    for (const promise of promises.filter((item) => organizations.has(item.teamOrganizationId))) {
      const history = next.seasonHistoryBySeasonId[season.id]
      if (history === undefined || history.completedOn > next.currentDate || promise.acceptedOn > history.completedOn) continue
      const key = reviewKey(promise.id, season.competitionId, season.id)
      if (next.memoriesById[reviewMemoryId(key, 'player')] !== undefined) continue
      const window = deriveRolePromiseUsage(next, promise).find((item) => item.competitionId === season.competitionId && item.seasonId === season.id)
      if (window === undefined) continue
      const assessment = evaluateRolePromiseUsage(promise, window)
      if (assessment.status === 'INSUFFICIENT_EVIDENCE') continue
      const teamId = teamIds.find((id) => next.teams[id]?.organizationId === promise.teamOrganizationId)
      if (teamId === undefined) continue
      const coachId = next.teams[teamId]?.coachId
      const interimKey = reviewKey(promise.id, season.competitionId, season.id, 'midseason')
      const hasInterimConsequence = next.memoriesById[reviewMemoryId(interimKey, 'player')] !== undefined
      next = recordReviewMemories(next, promise, assessment, teamId, coachId, completedOn, key, !hasInterimConsequence)
      if (!hasInterimConsequence) next = applyReviewConsequences(next, promise, assessment, teamId, coachId, completedOn, key)
    }
  }
  return next
}

/** A single provisional checkpoint, opened only after the existing evidence minimum is met. */
export function progressRolePromiseInSeasonReviews(world: GameWorld, completedGameIds: readonly GameId[]): GameWorld {
  if (completedGameIds.length === 0) return world
  const playedTeamIds = new Set(completedGameIds.flatMap(id => {
    const game = world.games[id]
    return game?.status === 'completed' ? [game.homeTeamId, game.awayTeamId] : []
  }))
  if (playedTeamIds.size === 0) return world
  const completedIds = new Set(completedGameIds)
  const checkpoints = new Set(completedGameIds.map(id => world.games[id]).filter(game => game?.status === 'completed')
    .map(game => `${game!.competitionId}\u0000${game!.seasonId}`))
  const checkpointDate = completedGameIds.map(id => world.games[id]).filter(game => game?.status === 'completed')
    .map(game => game!.date).sort().at(-1) ?? world.currentDate
  const teamByOrganization = new Map<string, TeamId>()
  const playedOrganizations = new Set<string>()
  for (const teamId of playedTeamIds) {
    const organizationId = world.teams[teamId]?.organizationId
    if (organizationId !== undefined) { playedOrganizations.add(organizationId); teamByOrganization.set(organizationId, teamId) }
  }
  let next = world
  for (const promise of latestActivePromises(world).filter(item => playedOrganizations.has(item.teamOrganizationId))) {
    const teamId = teamByOrganization.get(promise.teamOrganizationId)
    if (teamId === undefined) continue
    for (const checkpoint of checkpoints) {
      const [competitionId, seasonId] = checkpoint.split('\u0000')
      if (!seasonId || !competitionId || next.seasons[seasonId as SeasonId]?.competitionId !== competitionId
        || !isRolePromiseUsageCheckpoint(next, promise, competitionId, seasonId, completedIds, ROLE_PROMISE_EVALUATION_CALIBRATION.minimumMeasuredGames)) continue
      const window = deriveRolePromiseUsage(next, promise).find(item => item.competitionId === competitionId && item.seasonId === seasonId)
      if (!window || window.measuredGames < ROLE_PROMISE_EVALUATION_CALIBRATION.minimumMeasuredGames) continue
      const key = reviewKey(promise.id, window.competitionId, window.seasonId, 'midseason')
      if (next.memoriesById[reviewMemoryId(key, 'player')]) continue
      const assessment = evaluateRolePromiseUsage(promise, window)
      if (assessment.status !== 'SUSTAINED_BREACH') continue
      const coachId = next.teams[teamId]?.coachId
      next = recordReviewMemories(next, promise, assessment, teamId, coachId, checkpointDate, key, true, 'midseason')
      next = applyReviewConsequences(next, promise, assessment, teamId, coachId, checkpointDate, key)
    }
  }
  return next
}

function latestActivePromises(world: GameWorld): readonly RolePromise[] {
  const latest = new Map<string, RolePromise>()
  for (const promise of Object.values(world.rolePromisesById).filter((item) => item.status === 'ACTIVE')) {
    const key = `${promise.playerId}\u0000${promise.teamOrganizationId}`
    const previous = latest.get(key)
    if (previous === undefined || previous.acceptedOn < promise.acceptedOn ||
      previous.acceptedOn === promise.acceptedOn && previous.id.localeCompare(promise.id) > 0) latest.set(key, promise)
  }
  return [...latest.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function recordReviewMemories(world: GameWorld, promise: RolePromise, assessment: RolePromiseEvaluation,
  teamId: string, coachId: CoachId | undefined, occurredOn: GameDate, key: string,
  exposeToHrpg = assessment.status === 'SUSTAINED_BREACH', reviewStage: 'midseason' | 'season' = 'season'): GameWorld {
  const roleTag = assessment.status === 'SUSTAINED_BREACH' ? 'sustainedBreach' : assessment.status === 'AT_RISK' ? 'atRisk' : 'reasonable'
  const commonContext = { rolePromiseReview: true, rolePromiseId: promise.id, playerId: promise.playerId,
    ...(coachId === undefined ? {} : { coachId }), teamId, competitionId: assessment.competitionId,
    seasonId: assessment.seasonId, role: promise.role, reviewStatus: assessment.status,
    calibrationVersion: assessment.calibrationVersion, reviewStage,
    measuredGames: assessment.measuredGames, availableGames: assessment.availableGames,
    starts: assessment.startRate === null ? 0 : Math.round(assessment.startRate * assessment.measuredGames),
    appearances: assessment.appearanceRate === null ? 0 : Math.round(assessment.appearanceRate * assessment.measuredGames),
    regulationTimeShareBps: Math.round((assessment.regulationTimeShare ?? 0) * 10000),
    rationale: assessment.rationale }
  const tags = ['player', 'contract', 'rolePromiseReview', roleTag, ...(exposeToHrpg ? ['promise'] : [])]
  let next = recordMemory(world, {
    id: reviewMemoryId(key, 'player'), owner: { kind: 'player', id: promise.playerId },
    type: assessment.status === 'SUSTAINED_BREACH' ? 'betrayal' : 'support', occurredOn,
    entityRefs: [...(coachId === undefined ? [] : [{ kind: 'coach' as const, id: coachId }]), { kind: 'team', id: teamId }],
    sourceId: promise.id, semanticKey: `${key}:player`, importance: assessment.status === 'SUSTAINED_BREACH' ? 'important' : 'notable',
    valence: assessment.status === 'SUSTAINED_BREACH' ? -30 : assessment.status === 'REASONABLE' ? 12 : -5,
    intensity: assessment.status === 'SUSTAINED_BREACH' ? 55 : 35, decayPerMonth: 1, permanent: false,
    tags, context: commonContext,
  })
  if (coachId !== undefined) next = recordMemory(next, {
    id: reviewMemoryId(key, 'coach'), owner: { kind: 'coach', id: coachId },
    type: assessment.status === 'SUSTAINED_BREACH' ? 'betrayal' : 'support', occurredOn,
    entityRefs: [{ kind: 'player', id: promise.playerId }, { kind: 'team', id: teamId }],
    sourceId: promise.id, semanticKey: `${key}:coach`, importance: assessment.status === 'SUSTAINED_BREACH' ? 'important' : 'notable',
    valence: assessment.status === 'SUSTAINED_BREACH' ? -18 : assessment.status === 'REASONABLE' ? 8 : -3,
    intensity: assessment.status === 'SUSTAINED_BREACH' ? 45 : 30, decayPerMonth: 1, permanent: false,
    tags: ['coach', 'contract', 'rolePromiseReview', roleTag, ...(exposeToHrpg ? ['promise'] : [])], context: commonContext,
  })
  return next
}

function applyReviewConsequences(world: GameWorld, promise: RolePromise, assessment: RolePromiseEvaluation,
  teamId: string, coachId: CoachId | undefined, occurredOn: GameDate, key: string): GameWorld {
  if (assessment.status === 'AT_RISK' || assessment.status === 'INSUFFICIENT_EVIDENCE') return world
  const sustainedBreach = assessment.status === 'SUSTAINED_BREACH'
  const player = world.players[promise.playerId]
  let next = world
  if (world.moraleByPersonId[promise.playerId] !== undefined && world.personalitiesByPersonId[promise.playerId] !== undefined) {
    next = applyMoraleEventToWorld(next, { id: `morale:${key}:player`,
      personId: promise.playerId, gameDate: occurredOn, source: 'playingTime', delta: sustainedBreach ? -5 : 1,
      context: { rolePromiseId: promise.id, rolePromiseReview: assessment.status, teamId } })
  }
  if (coachId === undefined) return next
  if (player === undefined || next.coaches[coachId] === undefined) return next
  const playerDelta = sustainedBreach ? -4 : 1
  const coachDelta = sustainedBreach ? -2 : 1
  return applyRelationshipEventsToWorld(next, [
    { sourceId: promise.playerId, targetId: coachId, event: {
      id: `relationship:${key}:player`, gameDate: occurredOn, source: 'professionalInteraction', delta: playerDelta,
      dimensionDeltas: sustainedBreach ? { trust: -5, reliability: -6, perceivedSupport: -4 } : { trust: 1, reliability: 1 },
      context: { rolePromiseId: promise.id, rolePromiseReview: assessment.status, teamId },
    } },
    { sourceId: coachId, targetId: promise.playerId, event: {
      id: `relationship:${key}:coach`, gameDate: occurredOn, source: 'professionalInteraction', delta: coachDelta,
      dimensionDeltas: sustainedBreach ? { trust: -2, collaboration: -2 } : { trust: 1, collaboration: 1 },
      context: { rolePromiseId: promise.id, rolePromiseReview: assessment.status, teamId },
    } },
  ])
}
