import { addYears } from '@/domain/date'
import type { CoachId, PlayerId, TeamId } from '@/domain/ids'
import { addInboxItem, applyMoraleEventToWorld, applyRelationshipEventsToWorld, archiveInboxItem, updateGameWorld, type GameWorld } from '@/domain/world'
import { recordMemory } from '@/engine/memory/MemoryEngine'
import { scheduledTrainingSessionsOnDate } from '@/engine/training/ScheduledTrainingEngine'

export type PlayerFeedbackChoice = 'recognizeWork' | 'setHigherStandard'
export type PlayerFeedbackResult =
  | { readonly status: 'APPLIED'; readonly world: GameWorld; readonly choice: PlayerFeedbackChoice }
  | { readonly status: 'BLOCKED'; readonly world: GameWorld; readonly reason: 'NOT_USER_COACH' | 'NOT_PENDING' | 'NO_VERIFIED_TRAINING' | 'PLAYER_LEFT' | 'INVALID_CHOICE' | 'SIMULATION_BUSY' }

export interface PendingPlayerTrainingFeedback {
  readonly inboxId: string
  readonly coachId: CoachId
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly sessionId: string
  readonly evidenceId: string
  readonly openedOn: string
}
const feedbackOrigin = (coachId: CoachId, month: string) => `bs19c:player-feedback:${coachId}:${month}`
export const playerFeedbackInboxId = (coachId: CoachId, month: string): string => `inbox:${feedbackOrigin(coachId, month)}`

/** At most ONE optional developmental conversation per coach per calendar month.
 * It can only be proposed after an INDIVIDUAL training was actually completed,
 * a player participated, and the canonical development-event ledger contains
 * a positive contribution from the same session. No invented breakthrough.
 */
export function queueVerifiedPlayerTrainingFeedback(world: GameWorld): GameWorld {
  const coachId = world.userCoachId
  if (world.coachRpgProfilesByCoachId[coachId]?.creatorOrigin === undefined) return world
  const month = world.currentDate.slice(0, 7)
  const id = playerFeedbackInboxId(coachId, month)
  if (world.inboxItemsById[id] !== undefined) return world
  const sessions = scheduledTrainingSessionsOnDate(world.scheduledTrainingSessionsById, world.currentDate)
    .filter(item => item.scope === 'individual' && item.status === 'completed' && item.execution?.completedOn === world.currentDate)
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const session of sessions) {
    if (world.teams[session.teamId]?.coachId !== coachId || session.playerId === undefined ||
      !world.teams[session.teamId]!.rosterPlayerIds.includes(session.playerId)) continue
    const participated = session.execution!.participants.find(p => p.playerId === session.playerId && p.participation !== 'REST')
    const evidenceId = participated?.developmentStimulusEventId
    const evidence = evidenceId === undefined ? undefined : world.developmentStimulusEventsById[evidenceId]
    if (!evidence || evidence.sourceType !== 'training' || evidence.sourceId !== session.id ||
      evidence.playerId !== session.playerId || evidence.date !== world.currentDate ||
      !Object.values(evidence.byRating).some(value => value !== undefined && value > 0)) continue
    const player = world.players[session.playerId]
    if (!player) continue
    return addInboxItem(world, {
      id, coachId, gameDate: world.currentDate, status: 'unread', priority: 'normal', category: 'career',
      title: 'Discuss an individual training session',
      body: 'A player completed an individual training session and received a recorded development stimulus. You may recognize the effort or set a higher standard.',
      context: { lifeScenario: 'playerTrainingFeedback', playerId: player.id, teamId: session.teamId,
        sessionId: session.id, evidenceId, scenarioVersion: 1 },
    })
  }
  return world
}

export function getPendingPlayerTrainingFeedback(world: GameWorld): PendingPlayerTrainingFeedback | null {
  const coachId = world.userCoachId
  // Only this month's cue is actionable; an older conversation remains archived
  // by its original ID but cannot be recycled into a different month's event.
  const id = playerFeedbackInboxId(coachId, world.currentDate.slice(0, 7))
  const inbox = world.inboxItemsById[id]
  if (!inbox || inbox.status === 'archived' || inbox.coachId !== coachId ||
    inbox.context.lifeScenario !== 'playerTrainingFeedback') return null
  const { playerId, sessionId, evidenceId, teamId } = inbox.context
  if (typeof playerId !== 'string' || typeof sessionId !== 'string' || typeof evidenceId !== 'string' || typeof teamId !== 'string') return null
  const session = world.scheduledTrainingSessionsById[sessionId]
  const evidence = world.developmentStimulusEventsById[evidenceId]
  const team = world.teams[teamId as TeamId]
  if (!team || team.coachId !== coachId || !team.rosterPlayerIds.includes(playerId as PlayerId) ||
    session?.status !== 'completed' || session.scope !== 'individual' || session.teamId !== team.id ||
    session.playerId !== playerId || session.execution?.completedOn !== evidence?.date ||
    !session.execution?.participants.some(p => p.playerId === playerId && p.developmentStimulusEventId === evidenceId) ||
    evidence?.sourceType !== 'training' || evidence.sourceId !== sessionId || evidence.playerId !== playerId ||
    !Object.values(evidence.byRating).some(value => value !== undefined && value > 0)) return null
  return { inboxId: id, coachId, playerId: playerId as PlayerId, teamId: team.id,
    sessionId, evidenceId, openedOn: inbox.gameDate }
}

/** The player is a distinct subjective person. No guaranteed acceptance or
 * automatic skill gain from conversation: only witnessed relationships, morale,
 * memories, and the existing canonical PERSON50 praise/criticism observations.
 */
export function decidePlayerTrainingFeedback(world: GameWorld, choice: PlayerFeedbackChoice, coachId: CoachId = world.userCoachId): PlayerFeedbackResult {
  if (coachId !== world.userCoachId) return { status: 'BLOCKED', world, reason: 'NOT_USER_COACH' }
  if (choice !== 'recognizeWork' && choice !== 'setHigherStandard') return { status: 'BLOCKED', world, reason: 'INVALID_CHOICE' }
  const pending = getPendingPlayerTrainingFeedback(world)
  if (!pending) return { status: 'BLOCKED', world, reason: 'NOT_PENDING' }
  if (!world.teams[pending.teamId]?.rosterPlayerIds.includes(pending.playerId)) return { status: 'BLOCKED', world, reason: 'PLAYER_LEFT' }
  const praise = choice === 'recognizeWork'
  const source = feedbackOrigin(coachId, pending.openedOn.slice(0, 7))
  if (world.memoriesById[`memory:${source}:coach`] || world.memoriesById[`memory:${source}:player`]) {
    return { status: 'BLOCKED', world, reason: 'NOT_PENDING' }
  }
  let next = applyRelationshipEventsToWorld(world, [
    { sourceId: coachId, targetId: pending.playerId, event: {
      id: `relationship:${source}:coach`, gameDate: world.currentDate, source: 'developmentEvent',
      delta: praise ? 5 : -1, dimensionDeltas: praise
        ? { trust: 5, professionalRespect: 6, communicationQuality: 4, perceivedSupport: 5 }
        : { trust: -1, professionalRespect: 3, communicationQuality: -2, perceivedSupport: -3 },
      context: { sourceTrainingSessionId: pending.sessionId, sourceEvidenceId: pending.evidenceId, choice },
    } },
    { sourceId: pending.playerId, targetId: coachId, event: {
      id: `relationship:${source}:player`, gameDate: world.currentDate, source: 'developmentEvent',
      delta: praise ? 8 : -5, dimensionDeltas: praise
        ? { trust: 8, professionalRespect: 6, communicationQuality: 5, perceivedSupport: 8 }
        : { trust: -5, professionalRespect: 2, communicationQuality: -4, perceivedSupport: -7 },
      context: { sourceTrainingSessionId: pending.sessionId, sourceEvidenceId: pending.evidenceId, choice },
    } },
  ])
  next = recordMemory(next, {
    id: `memory:${source}:coach`, owner: { kind: 'coach', id: coachId },
    type: praise ? 'support' : 'opportunity', occurredOn: world.currentDate,
    entityRefs: [{ kind: 'player', id: pending.playerId }, { kind: 'team', id: pending.teamId }],
    sourceId: pending.evidenceId, semanticKey: `playerTrainingFeedback:coach:${pending.sessionId}`,
    importance: 'notable', valence: praise ? 25 : 5, intensity: 55, decayPerMonth: 2, permanent: false,
    tags: ['player', 'development', 'coach', 'feedback'],
    context: { playerId: pending.playerId, sessionId: pending.sessionId, evidenceId: pending.evidenceId, choice },
  })
  next = recordMemory(next, {
    id: `memory:${source}:player`, owner: { kind: 'player', id: pending.playerId },
    type: praise ? 'support' : 'conflict', occurredOn: world.currentDate,
    entityRefs: [{ kind: 'coach', id: coachId }, { kind: 'team', id: pending.teamId }],
    sourceId: pending.evidenceId, semanticKey: `playerTrainingFeedback:player:${pending.sessionId}`,
    importance: 'notable', valence: praise ? 35 : -20, intensity: 65, decayPerMonth: 2, permanent: false,
    tags: ['player', 'development', 'coach', 'feedback'],
    context: { coachId, sessionId: pending.sessionId, evidenceId: pending.evidenceId, choice },
  })

  const player = next.players[pending.playerId]!
  const personDOB = player.personId === undefined ? undefined : next.personsById[player.personId]?.dateOfBirth
  const playerDOB = personDOB ?? player.bio.dateOfBirth
  const ageValid = playerDOB !== undefined && addYears(playerDOB, 15) <= world.currentDate
  next = applyMoraleEventToWorld(next, {
    id: `morale:${source}:player`, personId: pending.playerId,
    gameDate: world.currentDate, source: 'developmentEvent', delta: praise ? 7 : -4,
    context: { ...(ageValid ? { personalityEventKind: praise ? 'COACH_PRAISE' : 'COACH_CRITICISM' } : {}),
      sourceTrainingSessionId: pending.sessionId, sourceEvidenceId: pending.evidenceId, choice },
  })
  const coach = next.coaches[coachId]!
  const coachDOB = next.personsById[coach.personId]?.dateOfBirth
  next = applyMoraleEventToWorld(next, {
    id: `morale:${source}:coach`, personId: coachId,
    gameDate: world.currentDate, source: 'professionalInteraction', delta: praise ? 3 : -1,
    context: { ...(coachDOB && addYears(coachDOB, 15) <= world.currentDate ? { personalityEventKind: 'TEAM_MEETING' } : {}),
      sourceTrainingSessionId: pending.sessionId, sourceEvidenceId: pending.evidenceId, choice },
  })
  next = updateGameWorld(next, { personalitiesByPersonId: {
    ...next.personalitiesByPersonId, [coach.staffProfileId]: next.personalitiesByPersonId[coachId]!,
  } })
  return { status: 'APPLIED', world: archiveInboxItem(next, pending.inboxId), choice }
}
