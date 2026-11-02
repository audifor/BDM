import { addDays, type GameDate } from '@/domain/date'
import type { CoachId, PlayerId } from '@/domain/ids'
import type { RolePromise } from '@/domain/market'
import { applyMoraleEventToWorld, applyRelationshipEventsToWorld, type GameWorld } from '@/domain/world'
import { recordMemory } from '@/engine/memory/MemoryEngine'
import { evaluateRolePromiseUsage, type RolePromiseEvaluation } from '@/engine/contractRetention/RolePromiseEvaluation'
import { deriveRolePromiseUsage } from '@/engine/contractRetention/RolePromiseUsage'

const reviewKey = (promiseId: string, competitionId: string, seasonId: string) => `role-promise-review:${promiseId}:${competitionId}:${seasonId}`
const reviewMemoryId = (key: string, actor: 'player' | 'coach') => `memory:${key}:${actor}`

/** Applies one review at the natural end of a competition season. It never closes or edits RolePromise. */
export function progressRolePromiseSeasonReviews(world: GameWorld): GameWorld {
  const endingDate = addOneDayBack(world.currentDate)
  const seasonsEnding = Object.values(world.seasons).filter((season) => season.endDate === endingDate)
  if (seasonsEnding.length === 0) return world

  const promises = latestActivePromises(world)
  let next = world
  for (const season of seasonsEnding.sort((left, right) => left.id.localeCompare(right.id))) {
    const competition = next.competitions[season.competitionId]
    if (competition === undefined) continue
    if (Object.values(next.games).some((game) => game.competitionId === season.competitionId && game.seasonId === season.id
      && game.date <= season.endDate && game.status !== 'completed')) continue
    const teamIds = competition.participantTeamIds.filter((teamId) => next.teams[teamId]?.organizationId !== undefined)
    const organizations = new Set(teamIds.map((teamId) => next.teams[teamId]!.organizationId))
    for (const promise of promises.filter((item) => organizations.has(item.teamOrganizationId))) {
      const window = deriveRolePromiseUsage(next, promise).find((item) => item.competitionId === season.competitionId && item.seasonId === season.id)
      if (window === undefined) continue
      const assessment = evaluateRolePromiseUsage(promise, window)
      if (assessment.status === 'INSUFFICIENT_EVIDENCE') continue
      const teamId = teamIds.find((id) => next.teams[id]?.organizationId === promise.teamOrganizationId)
      if (teamId === undefined) continue
      const coachId = next.teams[teamId]?.coachId
      const key = reviewKey(promise.id, season.competitionId, season.id)
      if (next.memoriesById[reviewMemoryId(key, 'player')] !== undefined) continue
      next = recordReviewMemories(next, promise, assessment, teamId, coachId, season.endDate, key)
      next = applyReviewConsequences(next, promise, assessment, teamId, coachId, season.endDate, key)
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
  teamId: string, coachId: CoachId | undefined, occurredOn: GameDate, key: string): GameWorld {
  const roleTag = assessment.status === 'SUSTAINED_BREACH' ? 'sustainedBreach' : assessment.status === 'AT_RISK' ? 'atRisk' : 'reasonable'
  const commonContext = { rolePromiseReview: true, rolePromiseId: promise.id, playerId: promise.playerId,
    ...(coachId === undefined ? {} : { coachId }), teamId, competitionId: assessment.competitionId,
    seasonId: assessment.seasonId, role: promise.role, reviewStatus: assessment.status,
    calibrationVersion: assessment.calibrationVersion }
  let next = recordMemory(world, {
    id: reviewMemoryId(key, 'player'), owner: { kind: 'player', id: promise.playerId },
    type: assessment.status === 'SUSTAINED_BREACH' ? 'betrayal' : 'support', occurredOn,
    entityRefs: [...(coachId === undefined ? [] : [{ kind: 'coach' as const, id: coachId }]), { kind: 'team', id: teamId }],
    sourceId: promise.id, semanticKey: `${key}:player`, importance: assessment.status === 'SUSTAINED_BREACH' ? 'important' : 'notable',
    valence: assessment.status === 'SUSTAINED_BREACH' ? -30 : assessment.status === 'REASONABLE' ? 12 : -5,
    intensity: assessment.status === 'SUSTAINED_BREACH' ? 55 : 35, decayPerMonth: 1, permanent: false,
    tags: ['player', 'contract', 'promise', 'rolePromiseReview', roleTag], context: commonContext,
  })
  if (coachId !== undefined) next = recordMemory(next, {
    id: reviewMemoryId(key, 'coach'), owner: { kind: 'coach', id: coachId },
    type: assessment.status === 'SUSTAINED_BREACH' ? 'betrayal' : 'support', occurredOn,
    entityRefs: [{ kind: 'player', id: promise.playerId }, { kind: 'team', id: teamId }],
    sourceId: promise.id, semanticKey: `${key}:coach`, importance: assessment.status === 'SUSTAINED_BREACH' ? 'important' : 'notable',
    valence: assessment.status === 'SUSTAINED_BREACH' ? -18 : assessment.status === 'REASONABLE' ? 8 : -3,
    intensity: assessment.status === 'SUSTAINED_BREACH' ? 45 : 30, decayPerMonth: 1, permanent: false,
    tags: ['coach', 'contract', 'promise', 'rolePromiseReview', roleTag], context: commonContext,
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

function addOneDayBack(date: GameDate): GameDate {
  return addDays(date, -1)
}
