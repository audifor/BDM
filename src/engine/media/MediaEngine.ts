import { applyCoachReputationEvent } from '@/domain/coachReputation'
import { applyMoraleEvent } from '@/domain/morale'
import type { MediaAnswer, MediaOpportunity, MediaProfile, MediaQuestion, MediaStance } from '@/domain/media'
import { createMediaProfile } from '@/domain/media'
import { addNewsItem, applyRelationshipEventToWorld, getMatchNarrativeContext, updateGameWorld, type GameWorld } from '@/domain/world'
import { recordMemory } from '@/engine/memory'
import type { CoachId, GameId } from '@/domain/ids'

export function createPreMatchMediaOpportunity(world: GameWorld, gameId: GameId): GameWorld {
  const game = world.games[gameId]; if (game === undefined || game.status !== 'scheduled' || game.stakes === 'regular') return world
  const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId); if (userTeam === undefined || ![game.homeTeamId, game.awayTeamId].includes(userTeam.id)) return world
  const thread = getMatchNarrativeContext(world, game.homeTeamId, game.awayTeamId).find((item) => item.protagonistIds.includes(world.userCoachId))
  const topic = thread?.type === 'formerClub' ? 'formerClub' : thread?.type === 'revenge' ? 'revenge' : thread?.type === 'rivalry' ? 'rivalry' : thread?.type === 'formerPlayer' ? 'formerPlayer' : thread?.type === 'dynasty' ? 'dynasty' : thread?.type === 'promotionJourney' ? 'promotionJourney' : 'pressure'
  const key = `media:pre:${gameId}:${thread?.id ?? topic}`
  return addOpportunity(world, opportunity({ id: key, semanticKey: key, coachId: world.userCoachId, gameDate: game.date, type: 'preMatch', importance: thread === undefined ? 60 : 80, gameId, narrativeThreadId: thread?.id, questions: [question(key, topic, preMatchText(topic), thread?.id)], answers: answersFor(topic) }))
}

export function processMediaMatch(world: GameWorld, gameId: GameId): GameWorld {
  const game = world.games[gameId]; if (game === undefined || game.status !== 'completed' || game.result === null) return world
  const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId); if (userTeam === undefined || ![game.homeTeamId, game.awayTeamId].includes(userTeam.id)) return world
  const threads = getMatchNarrativeContext(world, game.homeTeamId, game.awayTeamId).filter((thread) => thread.protagonistIds.includes(world.userCoachId))
  const thread = threads.find((item) => item.type === 'revenge' && item.status === 'resolved') ?? threads[0]
  if (thread === undefined && game.stakes === 'regular') return world
  const topic = thread?.type === 'revenge' ? 'revenge' : thread?.type === 'rivalry' ? 'rivalry' : thread?.type === 'dynasty' ? 'dynasty' : 'performance'
  const key = `media:post:${gameId}:${thread?.id ?? topic}`
  return addOpportunity(world, opportunity({ id: key, semanticKey: key, coachId: world.userCoachId, gameDate: game.date, type: 'postMatch', importance: thread === undefined ? 60 : 90, gameId, narrativeThreadId: thread?.id, questions: [question(key, topic, postMatchText(topic), thread?.id)], answers: answersFor(topic) }))
}

export function respondToMediaOpportunity(world: GameWorld, opportunityId: string, stance: MediaStance): GameWorld {
  const item = world.mediaOpportunitiesById[opportunityId]; if (item === undefined || item.status !== 'pending' || !item.answers.some((answer) => answer.stance === stance)) return world
  const question = item.questions[0]!; const eventId = `media-response:${item.id}:${stance}`; let next = world; const consequences: string[] = []
  const playerId = question.targetPlayerId
  if (playerId !== undefined && (stance === 'protective' || stance === 'critical')) {
    const delta = stance === 'protective' ? 5 : -5
    next = applyRelationshipEventToWorld(next, item.coachId, playerId, { id: eventId, gameDate: item.gameDate, source: 'professionalInteraction', delta, context: { mediaOpportunityId: item.id, stance } })
    const morale = next.moraleByPersonId[playerId]; const personality = next.personalitiesByPersonId[playerId]
    if (morale !== undefined && personality !== undefined) next = updateGameWorld(next, { moraleByPersonId: { ...next.moraleByPersonId, [playerId]: applyMoraleEvent(morale, personality, { id: eventId, personId: playerId, gameDate: item.gameDate, source: 'professionalInteraction', delta, context: { mediaOpportunityId: item.id, stance } }) } })
    next = recordMemory(next, { id: `memory:${eventId}`, owner: { kind: 'player', id: playerId }, type: stance === 'protective' ? 'support' : 'conflict', occurredOn: item.gameDate, entityRefs: [{ kind: 'coach', id: item.coachId }], semanticKey: eventId, importance: 'important', valence: delta * 10, intensity: 55, decayPerMonth: 1, permanent: false, tags: ['media', stance], context: { mediaOpportunityId: item.id, stance } })
    consequences.push(stance === 'protective' ? 'Player publicly backed' : 'Player publicly criticised')
  }
  const coachId = item.coachId as CoachId; const profile = next.coachReputationProfilesByCoachId[coachId]
  if (profile !== undefined) { const result = applyCoachReputationEvent(profile, { id: eventId, gameDate: item.gameDate, source: 'publicEvent', deltas: { publicStanding: stance === 'aggressive' ? -2 : stance === 'protective' ? 2 : 1 }, context: { kind: 'publicEvent', key: eventId } }); if (result.ok && result.applied) next = updateGameWorld(next, { coachReputationProfilesByCoachId: { ...next.coachReputationProfilesByCoachId, [coachId]: result.profile } }) }
  const profileBefore = next.mediaProfilesByCoachId[item.coachId] ?? createMediaProfile(item.coachId); const mediaProfile: MediaProfile = { ...profileBefore, stanceCounts: { ...profileBefore.stanceCounts, [stance]: (profileBefore.stanceCounts[stance] ?? 0) + 1 } }
  const completed = { ...item, status: 'completed' as const }; const interaction = { id: eventId, opportunityId: item.id, coachId: item.coachId, gameDate: item.gameDate, questionId: question.id, stance, ...(playerId === undefined ? {} : { targetPlayerId: playerId }), consequences }
  return updateGameWorld(next, { mediaOpportunitiesById: { ...next.mediaOpportunitiesById, [item.id]: completed }, mediaInteractionsById: { ...next.mediaInteractionsById, [interaction.id]: interaction }, mediaProfilesByCoachId: { ...next.mediaProfilesByCoachId, [item.coachId]: mediaProfile } })
}

export function skipMediaOpportunity(world: GameWorld, opportunityId: string): GameWorld { const item = world.mediaOpportunitiesById[opportunityId]; if (item === undefined || item.status !== 'pending') return world; const profile = world.mediaProfilesByCoachId[item.coachId] ?? createMediaProfile(item.coachId); return updateGameWorld(world, { mediaOpportunitiesById: { ...world.mediaOpportunitiesById, [item.id]: { ...item, status: 'skipped' } }, mediaProfilesByCoachId: { ...world.mediaProfilesByCoachId, [item.coachId]: { ...profile, reservedCount: profile.reservedCount + 1 } } }) }

function addOpportunity(world: GameWorld, item: MediaOpportunity): GameWorld { if (Object.values(world.mediaOpportunitiesById).some((current) => current.semanticKey === item.semanticKey || current.narrativeThreadId !== undefined && current.narrativeThreadId === item.narrativeThreadId && current.gameDate === item.gameDate)) return world; const next = updateGameWorld(world, { mediaOpportunitiesById: { ...world.mediaOpportunitiesById, [item.id]: item } }); return addNewsItem(next, { id: `news:${item.id}`, gameDate: item.gameDate, category: 'career', headline: `La prensa pone el foco en ${item.questions[0]!.topic}`, body: item.questions[0]!.text, context: { mediaOpportunityId: item.id, topic: item.questions[0]!.topic, ...(item.narrativeThreadId === undefined ? {} : { narrativeThreadId: item.narrativeThreadId }) } }) }
function opportunity(item: Omit<MediaOpportunity, 'status'>): MediaOpportunity { return { ...item, status: 'pending', questions: item.questions.map((question) => ({ ...question, context: { ...question.context } })), answers: item.answers.map((answer) => ({ ...answer })) } }
function question(id: string, topic: MediaQuestion['topic'], text: string, narrativeThreadId?: string): MediaQuestion { return { id: `${id}:question:1`, topic, text, ...(narrativeThreadId === undefined ? {} : { narrativeThreadId }), context: { topic } } }
function answersFor(topic: MediaQuestion['topic']): readonly MediaAnswer[] { return topic === 'rivalry' ? [{ stance: 'diplomatic', intent: 'DOWNPLAY', text: 'Hay respeto; el partido habla por sí solo.' }, { stance: 'aggressive', intent: 'PROVOKE', text: 'Estamos preparados para imponer nuestro juego.' }, { stance: 'confident', intent: 'CONFIRM', text: 'Confiamos plenamente en nuestro trabajo.' }] : topic === 'player' ? [{ stance: 'protective', intent: 'DEFEND', text: 'El jugador cuenta con todo mi respaldo.' }, { stance: 'critical', intent: 'CHALLENGE', text: 'Todos debemos asumir nuestra responsabilidad.' }, { stance: 'deflect', intent: 'DEFLECT', text: 'Lo analizaremos internamente.' }] : [{ stance: 'diplomatic', intent: 'TAKE_RESPONSIBILITY', text: 'El foco está en el equipo y el próximo reto.' }, { stance: 'confident', intent: 'CONFIRM', text: 'Estamos listos para responder en la cancha.' }, { stance: 'deflect', intent: 'DEFLECT', text: 'No voy a alimentar la polémica.' }] }
function preMatchText(topic: MediaQuestion['topic']): string { return topic === 'formerClub' || topic === 'revenge' ? 'Vuelves a enfrentarte a un club con una historia importante. ¿Tiene este partido un significado especial?' : topic === 'rivalry' ? 'Esta rivalidad vuelve a escena en un partido relevante. ¿Se ha vuelto personal?' : topic === 'dynasty' ? 'Con un periodo dominante detrás, ¿cómo manejas las expectativas?' : 'Se acerca un partido de máxima importancia. ¿Cómo afronta el equipo la presión?' }
function postMatchText(topic: MediaQuestion['topic']): string { return topic === 'revenge' ? 'Has superado al club que te despidió. ¿Qué significa esta victoria?' : topic === 'rivalry' ? 'Otro capítulo importante de esta rivalidad acaba de disputarse. ¿Qué lectura haces?' : topic === 'dynasty' ? 'La conversación vuelve a girar alrededor de vuestro legado. ¿Cómo responde el equipo?' : 'Tras un partido relevante, ¿qué mensaje manda al equipo?' }
