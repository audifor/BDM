import { type RecruitingConcern, type RecruitingNegotiation, type RecruitingNegotiationTopic, type RecruitingProgramResponseKind, type RecruitingProspectResponse, type RecruitingPromise, type RecruitingPromiseTopic, type RecruitProfile } from '@/domain/recruiting'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { canRecruitTransferPlayer } from '@/engine/eligibility'
import { canPerformRecruitingAction } from './RecruitingPermission'
import { recruitingStaffActionBlock, recruitingStaffActors, recordRecruitingStaffAction } from './RecruitingStaffAuthority'
import { getRecruitingRoleOpportunity } from './RecruitingRosterPlanning'

export type RecruitingNegotiationResult = { readonly ok: true; readonly world: GameWorld; readonly negotiation: RecruitingNegotiation } | { readonly ok: false; readonly reason: string }

export function openRecruitingNegotiation(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId): RecruitingNegotiationResult {
  const profile = world.recruitProfilesById[recruitId]
  if (profile?.recruitingRpg === undefined) return { ok: false, reason: 'INVALID_RECRUIT' }
  const topics = [...Object.entries(profile.recruitingRpg.preferenceProfile.importance)]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([dimension]) => topicForDimension(dimension))
    .filter((topic, index, all) => all.indexOf(topic) === index)
    .slice(0, 2)
  return openNegotiationWithTopics(world, cycleId, recruitId, programTeamId, topics)
}

/** AI negotiation starts only from the program's own known belief bands. */
export function openAiRecruitingNegotiation(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId): RecruitingNegotiationResult {
  const profile = world.recruitProfilesById[recruitId]
  const intel = profile?.recruitingRpg?.intel.find((item) => item.programTeamId === programTeamId)
  if (!profile?.recruitingRpg || intel === undefined || Object.keys(intel.beliefs).length === 0) return { ok: false, reason: 'NO_RECRUITING_INTEL' }
  const topics = Object.entries(intel.beliefs)
    .sort((a, b) => bandRank(b[1]) - bandRank(a[1]) || a[0].localeCompare(b[0]))
    .map(([dimension]) => topicForDimension(dimension))
    .filter((topic, index, all) => all.indexOf(topic) === index)
    .slice(0, 2)
  return topics.length === 0 ? { ok: false, reason: 'NO_RECRUITING_INTEL' } : openNegotiationWithTopics(world, cycleId, recruitId, programTeamId, topics)
}

function openNegotiationWithTopics(world: GameWorld, cycleId: string, recruitId: string, programTeamId: TeamId, topics: readonly RecruitingNegotiationTopic[]): RecruitingNegotiationResult {
  const cycle = world.recruitingCyclesById[cycleId]
  const profile = world.recruitProfilesById[recruitId]
  if (!cycle || cycle.status !== 'open' || !profile || profile.cycleId !== cycleId || profile.status !== 'open' || !profile.recruitingRpg) return { ok: false, reason: 'INVALID_RECRUIT' }
  const permission = canPerformRecruitingAction({ date: world.currentDate, isNCAA: world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike', calendar: cycle.calendar, category: world.ecosystems[cycle.ecosystemId]?.category, prospectGroup: profile.prospectGroup, education: profile.education, ...(profile.origin === 'transfer' ? { recruitingContext: 'TRANSFER' as const, transferAuthorized: canRecruitTransferPlayer(world, profile.playerId, programTeamId) } : { recruitingContext: 'INITIAL' as const }), action: 'correspondence' })
  if (!permission.allowed) return { ok: false, reason: permission.reasonCode }
  const state = profile.recruitingRpg
  const priorNegotiations = (state.negotiations ?? []).filter((item) => item.cycleId === cycleId && item.programTeamId === programTeamId)
  const existing = priorNegotiations.find((item) => item.terminalState === 'active')
  if (existing) return { ok: true, world, negotiation: existing }
  if (priorNegotiations.some((item) => item.terminalState === 'committed') && profile.status !== 'open') return { ok: false, reason: 'NEGOTIATION_TERMINAL' }
  const recruiterId = recruitingStaffActors(world, programTeamId).recruiterId
  if (world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike') {
    const staffBlock = recruitingStaffActionBlock(world, cycle, programTeamId, recruiterId)
    if (staffBlock !== undefined) return { ok: false, reason: staffBlock }
  }
  const concerns: RecruitingConcern[] = topics.map((topic) => ({ id: `concern:${cycleId}:${programTeamId}:${recruitId}:${topic}`, topic, raisedOn: world.currentDate, description: concernDescription(topic), status: 'open' }))
  const baseId = `negotiation:${cycleId}:${programTeamId}:${recruitId}`
  const negotiation: RecruitingNegotiation = {
    id: priorNegotiations.length === 0 ? baseId : `${baseId}:attempt:${priorNegotiations.length + 1}`,
    cycleId, recruitId, programTeamId, stage: 'concernsRaised', currentConcerns: concerns,
    unresolvedTopics: topics, resolvedTopics: [], prospectRequests: topics.map(requestForTopic),
    programResponses: [], promisesProposed: [], promisesAccepted: [], rejectedAsks: [], pressure: 0,
    lastMeaningfulInteraction: world.currentDate, terminalState: 'active',
  }
  let updated = saveNegotiation(world, profile, negotiation, `${world.currentDate}: the prospect raised concerns about ${topics.join(' and ')}.`)
  if (world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike' && recruiterId !== undefined) updated = recordRecruitingStaffAction(updated, { id: `staff-action:negotiation:${negotiation.id}:open`, cycleId, recruitId, programTeamId, kind: 'negotiation', date: world.currentDate, cost: 1, effect: 0, countsAsOpportunity: false, staffPersonId: recruiterId, offCampus: false })
  return { ok: true, world: updated, negotiation }
}

function bandRank(band: 'low'|'moderate'|'high'|undefined): number { return band === 'high' ? 3 : band === 'moderate' ? 2 : band === 'low' ? 1 : 0 }

export function respondToRecruitingConcern(world: GameWorld, negotiationId: string, topic: RecruitingNegotiationTopic, kind: RecruitingProgramResponseKind): RecruitingNegotiationResult {
  const found = findNegotiation(world, negotiationId)
  if (!found) return { ok: false, reason: 'NEGOTIATION_NOT_FOUND' }
  const { profile, negotiation } = found
  const cycle = world.recruitingCyclesById[negotiation.cycleId]
  if (!cycle || negotiation.terminalState !== 'active' || (kind !== 'pressure' && !negotiation.unresolvedTopics.includes(topic))) return { ok: false, reason: 'NEGOTIATION_TOPIC_NOT_OPEN' }
  const permission = canPerformRecruitingAction({ date: world.currentDate, isNCAA: world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike', calendar: cycle.calendar, category: world.ecosystems[cycle.ecosystemId]?.category, prospectGroup: profile.prospectGroup, education: profile.education, ...(profile.origin === 'transfer' ? { recruitingContext: 'TRANSFER' as const, transferAuthorized: canRecruitTransferPlayer(world, profile.playerId, negotiation.programTeamId) } : { recruitingContext: 'INITIAL' as const }), action: 'correspondence' })
  if (!permission.allowed) return { ok: false, reason: permission.reasonCode }
  const recruiterId = recruitingStaffActors(world, negotiation.programTeamId).recruiterId
  if (world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike') {
    const staffBlock = recruitingStaffActionBlock(world, cycle, negotiation.programTeamId, recruiterId)
    if (staffBlock !== undefined) return { ok: false, reason: staffBlock }
  }
  const fact = factualSupport(world, profile, negotiation.programTeamId, topic)
  const preference = profile.recruitingRpg!.preferenceProfile.importance
  const importance = preference[dimensionForTopic(topic)] ?? 5
  const relationship = profile.recruitingRpg!.relationships.find((item) => item.programTeamId === negotiation.programTeamId && item.actor === 'program')
    ?? { programTeamId: negotiation.programTeamId, actor: 'program' as const, familiarity: 0, rapport: 0, trust: 50, credibility: 50, updatedOn: world.currentDate }
  let trustDelta = 0
  let credibilityDelta = 0
  let response: RecruitingProspectResponse = 'needsClarification'
  let resolved = false
  let acceptedPromiseId: string | undefined
  let proposedPromiseId: string | undefined
  if (kind === 'factualReassurance' || kind === 'explanation') {
    resolved = fact
    trustDelta = fact ? 5 : -4
    credibilityDelta = fact ? 2 : -3
    response = fact ? 'receptive' : 'unconvinced'
  } else if (kind === 'promise' || kind === 'strengthenAssurance') {
    const promiseTopic = promiseTopicForConcern(topic)
    if (promiseTopic === undefined || topic === 'commercialEnvironment') return { ok: false, reason: 'PROMISE_TOPIC_UNSUPPORTED' }
    const promise: RecruitingPromise = { id: `promise:${negotiationId}:${topic}:${negotiation.promisesProposed.length}`, programTeamId: negotiation.programTeamId, topic: promiseTopic, strength: kind === 'promise' ? 'explicit' : 'assurance', detail: promiseDetail(topic), madeOn: world.currentDate }
    proposedPromiseId = promise.id
    if (importance >= 5 && relationship.trust >= 40) {
      acceptedPromiseId = promise.id
      resolved = true
      trustDelta = 5
      credibilityDelta = -1
      response = 'receptive'
    } else {
      response = 'wantsStrongerAssurance'
      trustDelta = -1
    }
    const currentState = profile.recruitingRpg!
    const promisedProfile = { ...profile, recruitingRpg: { ...currentState, promises: [...currentState.promises, promise] } }
    world = updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById).filter((item) => item.id !== profile.id), promisedProfile] })
  } else if (kind === 'refuse') {
    response = importance >= 8 ? 'cooling' : 'unconvinced'
    trustDelta = -5
    credibilityDelta = -2
  } else if (kind === 'pressure') {
    const pressure = Math.min(100, negotiation.pressure + 18)
    const patient = profile.recruitingRpg!.preferenceProfile.decisionStyle === 'deliberate' || profile.recruitingRpg!.preferenceProfile.decisionStyle === 'loyal'
    response = patient ? 'wantsMoreTime' : pressure >= 54 ? 'cooling' : 'unconvinced'
    trustDelta = patient ? -1 : -3
    const progressed = saveRelationship(world, profile, negotiation.programTeamId, relationship, trustDelta, credibilityDelta)
    const nextNegotiation = { ...negotiation, pressure, stage: 'counterposition' as const, programResponses: [...negotiation.programResponses, { topic, kind, response, date: world.currentDate, note: 'The program applied decision pressure; the prospect reaction follows decision style and accumulated pressure.' }], lastMeaningfulInteraction: world.currentDate }
    let updated = saveNegotiation(progressed, profile, nextNegotiation, `${world.currentDate}: pressure changed the prospect's patience and trust.`)
    if (world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike' && recruiterId !== undefined) updated = recordRecruitingStaffAction(updated, { id: `staff-action:negotiation:${negotiation.id}:${world.currentDate}:${negotiation.programResponses.length}`, cycleId: negotiation.cycleId, recruitId: profile.id, programTeamId: negotiation.programTeamId, kind: 'negotiation', date: world.currentDate, cost: 1, effect: 0, countsAsOpportunity: false, staffPersonId: recruiterId, offCampus: false })
    return { ok: true, world: updated, negotiation: nextNegotiation }
  } else {
    response = kind === 'delay' ? 'wantsMoreTime' : kind === 'redirect' ? 'needsClarification' : 'wantsVisit'
  }
  const updatedRelationshipWorld = saveRelationship(world, profile, negotiation.programTeamId, relationship, trustDelta, credibilityDelta)
  const nextTopics = negotiation.unresolvedTopics.filter((item) => item !== topic || !resolved)
  const currentConcerns = negotiation.currentConcerns.map((item) => item.topic === topic && resolved ? { ...item, status: 'resolved' as const } : item)
  const nextNegotiation: RecruitingNegotiation = {
    ...negotiation,
    stage: nextTopics.length === 0 ? 'finalist' : 'counterposition',
    currentConcerns,
    unresolvedTopics: nextTopics,
    resolvedTopics: resolved && !negotiation.resolvedTopics.includes(topic) ? [...negotiation.resolvedTopics, topic] : negotiation.resolvedTopics,
    prospectRequests: negotiation.prospectRequests.filter((request) => request !== requestForTopic(topic) || response === 'receptive'),
    programResponses: [...negotiation.programResponses, { topic, kind, response, date: world.currentDate, note: kind === 'refuse' ? 'The program declined the request.' : fact ? 'The response matched modeled program context.' : 'The response did not resolve the concern.' }],
    promisesProposed: proposedPromiseId === undefined ? negotiation.promisesProposed : [...negotiation.promisesProposed, proposedPromiseId],
    promisesAccepted: acceptedPromiseId === undefined ? negotiation.promisesAccepted : [...negotiation.promisesAccepted, acceptedPromiseId],
    rejectedAsks: kind === 'refuse' ? [...negotiation.rejectedAsks, topic] : negotiation.rejectedAsks,
    lastMeaningfulInteraction: world.currentDate,
  }
  let updated = saveNegotiation(updatedRelationshipWorld, updatedRelationshipWorld.recruitProfilesById[profile.id]!, nextNegotiation, `${world.currentDate}: ${kind} response to ${topic}; prospect was ${response}.`)
  if (world.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike' && recruiterId !== undefined) updated = recordRecruitingStaffAction(updated, { id: `staff-action:negotiation:${negotiation.id}:${world.currentDate}:${negotiation.programResponses.length}`, cycleId: negotiation.cycleId, recruitId: profile.id, programTeamId: negotiation.programTeamId, kind: 'negotiation', date: world.currentDate, cost: 1, effect: 0, countsAsOpportunity: false, staffPersonId: recruiterId, offCampus: false })
  return { ok: true, world: updated, negotiation: nextNegotiation }
}

export function applyRecruitingPressure(world: GameWorld, negotiationId: string): RecruitingNegotiationResult {
  const found = findNegotiation(world, negotiationId)
  if (!found) return { ok: false, reason: 'NEGOTIATION_NOT_FOUND' }
  return respondToRecruitingConcern(world, negotiationId, found.negotiation.unresolvedTopics[0] ?? 'decisionTiming', 'pressure')
}

function saveRelationship(world: GameWorld, profile: RecruitProfile, programTeamId: TeamId, prior: NonNullable<RecruitProfile['recruitingRpg']>['relationships'][number], trustDelta: number, credibilityDelta: number): GameWorld {
  const currentProfile = world.recruitProfilesById[profile.id] ?? profile
  const rpg = currentProfile.recruitingRpg ?? profile.recruitingRpg!
  const relationship = { ...prior, trust: clamp(prior.trust + trustDelta), credibility: clamp(prior.credibility + credibilityDelta), updatedOn: world.currentDate }
  return updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById).filter((item) => item.id !== profile.id), { ...currentProfile, recruitingRpg: { ...rpg, relationships: [...rpg.relationships.filter((item) => !(item.programTeamId === programTeamId && item.actor === 'program')), relationship] } }] })
}

function saveNegotiation(world: GameWorld, profile: RecruitProfile, negotiation: RecruitingNegotiation, storyLine: string): GameWorld {
  const current = world.recruitProfilesById[profile.id] ?? profile
  const rpg = current.recruitingRpg ?? profile.recruitingRpg!
  return updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById).filter((item) => item.id !== profile.id), { ...current, recruitingRpg: { ...rpg, negotiations: [...(rpg.negotiations ?? []).filter((item) => item.id !== negotiation.id), negotiation], story: [...rpg.story, storyLine].slice(-24) } }] })
}

function findNegotiation(world: GameWorld, id: string) {
  for (const profile of Object.values(world.recruitProfilesById)) {
    const negotiation = profile.recruitingRpg?.negotiations?.find((item) => item.id === id)
    if (negotiation) return { profile, negotiation }
  }
  return undefined
}

function factualSupport(world: GameWorld, profile: RecruitProfile, teamId: TeamId, topic: RecruitingNegotiationTopic): boolean {
  if (['role', 'playingOpportunity', 'starterCompetition', 'rosterCompetition'].includes(topic)) {
    return getRecruitingRoleOpportunity(world, profile, teamId) >= 54
  }
  if (topic === 'headCoachInvolvement') return world.teams[teamId]?.coachId !== undefined
  if (topic === 'visit') return true
  return false
}

function topicForDimension(value: string): RecruitingNegotiationTopic {
  const topics: Record<string, RecruitingNegotiationTopic> = { playingTime: 'playingOpportunity', roleClarity: 'role', coachTrust: 'headCoachInvolvement', familyTrust: 'familyDistance', development: 'developmentPlan', winning: 'programStability', prestige: 'programStability', distance: 'familyDistance', academics: 'academics', professionalPathway: 'professionalPathway', internationalSupport: 'internationalAdaptation' }
  return topics[value] ?? 'programStability'
}
function dimensionForTopic(topic: RecruitingNegotiationTopic): keyof NonNullable<RecruitProfile['recruitingRpg']>['preferenceProfile']['importance'] {
  const dimensions: Partial<Record<RecruitingNegotiationTopic, keyof NonNullable<RecruitProfile['recruitingRpg']>['preferenceProfile']['importance']>> = { role: 'roleClarity', playingOpportunity: 'playingTime', starterCompetition: 'playingTime', rosterCompetition: 'playingTime', position: 'roleClarity', tacticalUsage: 'roleClarity', developmentPlan: 'development', headCoachInvolvement: 'coachTrust', recruiterContinuity: 'coachTrust', academics: 'academics', familyDistance: 'distance', internationalAdaptation: 'internationalSupport', professionalPathway: 'professionalPathway', commercialEnvironment: 'professionalPathway', programStability: 'winning', visit: 'familyTrust', decisionTiming: 'familyTrust' }
  return dimensions[topic] ?? 'roleClarity'
}
function promiseTopicForConcern(topic: RecruitingNegotiationTopic): RecruitingPromiseTopic | undefined {
  if (['role', 'playingOpportunity', 'starterCompetition', 'position', 'rosterCompetition', 'tacticalUsage'].includes(topic)) return 'role'
  if (topic === 'developmentPlan') return 'development'
  if (topic === 'headCoachInvolvement' || topic === 'recruiterContinuity') return 'coachInvolvement'
  if (topic === 'academics') return 'academicSupport'
  if (topic === 'professionalPathway') return 'pathway'
  return undefined
}
function requestForTopic(topic: RecruitingNegotiationTopic) {
  if (['role', 'playingOpportunity', 'starterCompetition', 'rosterCompetition', 'position', 'tacticalUsage'].includes(topic)) return 'clearerRole' as const
  if (topic === 'headCoachInvolvement') return 'headCoachMeeting' as const
  if (topic === 'visit') return 'visit' as const
  if (topic === 'familyDistance' || topic === 'academics') return 'familyDiscussion' as const
  if (topic === 'developmentPlan') return 'developmentExplanation' as const
  return 'strongerAssurance' as const
}
function concernDescription(topic: RecruitingNegotiationTopic): string {
  const descriptions: Record<RecruitingNegotiationTopic, string> = { role: 'I need a clearer picture of my role.', playingOpportunity: 'I am concerned about the playing opportunity.', starterCompetition: 'I want to understand the competition for a starting role.', position: 'I need to know how you see me fitting at my position.', tacticalUsage: 'I want to understand how I would be used in your system.', developmentPlan: 'I need a concrete explanation of how I will develop.', headCoachInvolvement: 'I want more direct time with the Head Coach.', recruiterContinuity: 'I want to know whether the staff relationship will stay stable.', rosterCompetition: 'I am concerned about the players already at my position.', academics: 'I need more information about academic support.', familyDistance: 'My family has questions about distance and support.', internationalAdaptation: 'I need clarity about adapting to a new country and school.', visit: 'I want to experience the campus before deciding.', professionalPathway: 'I need a clearer explanation of the professional pathway.', decisionTiming: 'I need more time to make a decision.', programStability: 'I am concerned about the program’s direction and stability.', commercialEnvironment: 'I want to understand the commercial environment without a cash promise.' }
  return descriptions[topic]
}
function promiseDetail(topic: RecruitingNegotiationTopic): string { return `Program-specific assurance addressing the prospect's ${topic} concern; actual fulfillment remains visible.` }
function clamp(value: number): number { return Math.max(0, Math.min(100, value)) }
