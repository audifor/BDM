import { getMemoriesBetweenEntities, getStaffPerson, type GameWorld } from '@/domain/world'
import { getRecentMemories } from '@/domain/memory'
import {
  getRelationshipDimensions,
  getRelationshipFacetBand,
  RELATIONSHIP_DIMENSION_KEYS,
  type RelationshipDimensionKey,
  type RelationshipFacetBand,
  type RelationshipPersonId,
  type RelationshipProfile,
} from '@/domain/relationships'

/**
 * Wave 5B §19-21 — pure, read-only projection over the existing PERSON↔PERSON `RelationshipProfile`
 * + its 8 facets + real `MemoryRecord`s. Never computes new psychological semantics beyond
 * interpreting/labeling what the domain already derived. No pairwise scans — always resolves a
 * SINGLE directional profile for the two people asked about.
 */
export type WorkingRelationshipState = 'EXCELLENT' | 'STRONG' | 'GOOD' | 'PROFESSIONAL' | 'MIXED' | 'STRAINED' | 'POOR'
export type WorkingRelationshipTrend = 'IMPROVING' | 'STABLE' | 'WORSENING'

export interface WorkingRelationshipFacetDisplay {
  readonly key: RelationshipDimensionKey
  readonly label: string
  readonly band: RelationshipFacetBand
}

export interface WorkingRelationshipMemoryDisplay {
  readonly id: string
  readonly summary: string
  readonly occurredOn: string
  readonly positive: boolean
}

export interface WorkingRelationshipExplanation {
  readonly targetPersonId: RelationshipPersonId
  readonly state: WorkingRelationshipState
  readonly trend: WorkingRelationshipTrend
  readonly facets: readonly WorkingRelationshipFacetDisplay[]
  readonly strengths: readonly string[]
  readonly concerns: readonly string[]
  readonly recentInteractions: readonly string[]
  readonly memories: readonly WorkingRelationshipMemoryDisplay[]
}

const FACET_LABELS: Readonly<Record<RelationshipDimensionKey, string>> = {
  professionalRespect: 'Professional respect',
  trust: 'Trust',
  communicationQuality: 'Communication',
  collaboration: 'Collaboration',
  perceivedSupport: 'Support',
  reliability: 'Reliability',
  professionalAlignment: 'Alignment',
  personalCloseness: 'Personal closeness',
}

/** §28 — display priority order; `personalCloseness` is shown last, and only if it carries real signal. */
const FACET_DISPLAY_ORDER: readonly RelationshipDimensionKey[] = ['professionalRespect', 'trust', 'communicationQuality', 'collaboration', 'perceivedSupport', 'reliability', 'professionalAlignment', 'personalCloseness']

/** §19 — derived professional relationship state, never persisted, never a plain alias of `value`. */
export function deriveWorkingRelationshipState(profile: RelationshipProfile | undefined): WorkingRelationshipState {
  const dims = getRelationshipDimensions(profile)
  const value = profile?.value ?? 0
  if (dims.trust <= -40 || dims.communicationQuality <= -40 || dims.professionalRespect <= -40) return 'POOR'
  if (dims.trust < -15 || dims.communicationQuality < -15 || dims.professionalRespect < -15) return 'STRAINED'
  const hasSignal = profile !== undefined && profile.events.length > 0
  if (!hasSignal) return 'PROFESSIONAL'
  const strongCore = dims.trust >= 55 && dims.professionalRespect >= 55 && dims.collaboration >= 40
  if (strongCore && value >= 60) return 'EXCELLENT'
  if (dims.professionalRespect >= 35 && dims.trust >= 25) return 'STRONG'
  if (dims.professionalRespect > 5 || dims.trust > 5 || value > 15) return 'GOOD'
  if (dims.professionalRespect < -5 || dims.trust < -5 || value < -15) return 'MIXED'
  return 'PROFESSIONAL'
}

/** §20 — derived from recent event history; a single minor isolated event never flips this. */
export function deriveWorkingRelationshipTrend(profile: RelationshipProfile | undefined): WorkingRelationshipTrend {
  if (profile === undefined || profile.events.length === 0) return 'STABLE'
  const recent = [...profile.events].sort((a, b) => b.gameDate.localeCompare(a.gameDate) || b.id.localeCompare(a.id)).slice(0, 6)
  const net = recent.reduce((sum, event) => sum + event.delta, 0)
  if (net > 6) return 'IMPROVING'
  if (net < -6) return 'WORSENING'
  return 'STABLE'
}

const STRENGTH_THRESHOLD = 30
const CONCERN_THRESHOLD = -20

function facetStrengthPhrase(key: RelationshipDimensionKey): string {
  const phrases: Readonly<Record<RelationshipDimensionKey, string>> = {
    trust: 'Trusts their judgment.',
    professionalRespect: 'Strong professional respect.',
    communicationQuality: 'Communication has been positive.',
    collaboration: 'Collaboration has gone well.',
    perceivedSupport: 'Feels supported.',
    reliability: 'Considers them reliable.',
    professionalAlignment: 'Feels aligned on approach.',
    personalCloseness: 'A genuine personal rapport.',
  }
  return phrases[key]
}
function facetConcernPhrase(key: RelationshipDimensionKey): string {
  const phrases: Readonly<Record<RelationshipDimensionKey, string>> = {
    trust: 'Trust has been shaken.',
    professionalRespect: 'Professional respect has taken a hit.',
    communicationQuality: 'Communication has been strained.',
    collaboration: 'Collaboration has not gone smoothly.',
    perceivedSupport: 'Does not feel well supported.',
    reliability: 'Reliability is in question.',
    professionalAlignment: 'Feels misaligned on approach.',
    personalCloseness: 'No real personal rapport.',
  }
  return phrases[key]
}

const EVENT_KIND_LABEL: Readonly<Record<string, string>> = {
  responsibilityGranted: 'Granted a Responsibility.',
  responsibilityModeIncreased: 'Given greater decision authority.',
  responsibilityRemoved: 'Had a Responsibility removed.',
  recommendationAccepted: 'A recommendation was accepted.',
  importantRecommendationAccepted: 'An important recommendation was accepted.',
  actionableRecommendationRejected: 'A recommendation was rejected.',
  importantRecommendationRejected: 'An important recommendation was rejected.',
  recommendationPatternPositive: 'A pattern of well-received recommendations.',
  recommendationPatternNegative: 'A pattern of professional disagreement.',
}

export function explainWorkingRelationship(world: GameWorld, sourcePersonId: RelationshipPersonId, targetPersonId: RelationshipPersonId): WorkingRelationshipExplanation | undefined {
  const profile = world.relationshipsByKey[`${sourcePersonId}->${targetPersonId}`]
  if (profile === undefined) return undefined

  const dims = getRelationshipDimensions(profile)
  const facets = FACET_DISPLAY_ORDER
    .filter((key) => key !== 'personalCloseness' || dims.personalCloseness !== 0)
    .map((key) => ({ key, label: FACET_LABELS[key], band: getRelationshipFacetBand(dims[key]) }))

  const strengths = RELATIONSHIP_DIMENSION_KEYS.filter((key) => dims[key] >= STRENGTH_THRESHOLD).map(facetStrengthPhrase)
  const concerns = RELATIONSHIP_DIMENSION_KEYS.filter((key) => dims[key] <= CONCERN_THRESHOLD).map(facetConcernPhrase)

  const recentEvents = [...profile.events].sort((a, b) => b.gameDate.localeCompare(a.gameDate) || b.id.localeCompare(a.id)).slice(0, 5)
  const recentInteractions = recentEvents.map((event) => {
    const kind = typeof event.context.eventKind === 'string' ? event.context.eventKind : undefined
    return kind !== undefined && EVENT_KIND_LABEL[kind] !== undefined ? `${EVENT_KIND_LABEL[kind]} (${event.gameDate})` : `Professional interaction (${event.gameDate})`
  })

  const memories = getRecentMemories(getMemoriesBetweenEntities(world, sourcePersonId, targetPersonId), 3).map((memory) => ({
    id: memory.id,
    summary: memory.valence >= 0 ? `Positive shared memory (${memory.type}).` : `Negative shared memory (${memory.type}).`,
    occurredOn: memory.occurredOn,
    positive: memory.valence >= 0,
  }))

  return {
    targetPersonId,
    state: deriveWorkingRelationshipState(profile),
    trend: deriveWorkingRelationshipTrend(profile),
    facets,
    strengths,
    concerns,
    recentInteractions,
    memories,
  }
}

function resolvePersonLabel(world: GameWorld, personId: string): string {
  const staff = getStaffPerson(world, personId as never)
  if (staff !== undefined) return `${staff.identity.firstName} ${staff.identity.lastName}`
  const coach = world.coaches[personId as never]
  if (coach !== undefined) return `${coach.firstName} ${coach.lastName}`
  return personId
}

export { resolvePersonLabel }
