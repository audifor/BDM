import type { GameDate } from '@/domain/date'

export type RelationshipPersonId = string
export type RelationshipBand = 'hostile' | 'poor' | 'neutral' | 'positive' | 'strong'
export type RelationshipEventSource = 'careerEvent' | 'teamDecision' | 'playingTime' | 'developmentEvent' | 'professionalInteraction'
export interface RelationshipEvent { readonly id: string; readonly gameDate: GameDate; readonly source: RelationshipEventSource; readonly delta: number; readonly context: Readonly<Record<string, string | number | boolean>> }
export interface RelationshipProfile { readonly sourceId: RelationshipPersonId; readonly targetId: RelationshipPersonId; readonly value: number; readonly events: readonly RelationshipEvent[] }
export function relationshipKey(sourceId: RelationshipPersonId, targetId: RelationshipPersonId): string { return `${sourceId}->${targetId}` }
export function createRelationshipProfile(sourceId: RelationshipPersonId, targetId: RelationshipPersonId): RelationshipProfile {
  validatePeople(sourceId, targetId)
  return { sourceId, targetId, value: 0, events: [] }
}
export function applyRelationshipEvent(profile: RelationshipProfile, event: RelationshipEvent): RelationshipProfile {
  validateRelationshipProfile(profile)
  validateRelationshipEvent(event)
  if (profile.events.some((item) => item.id === event.id)) return profile
  const snapshot = { ...event, context: { ...event.context } }
  return { ...profile, value: clampRelationshipValue(profile.value + event.delta), events: [...profile.events, snapshot] }
}
export function validateRelationshipProfile(profile: RelationshipProfile): void {
  validatePeople(profile.sourceId, profile.targetId)
  if (!Number.isInteger(profile.value) || profile.value < -100 || profile.value > 100) throw new RangeError('Relationship value must be an integer from -100 to 100')
  const eventIds = new Set<string>()
  for (const event of profile.events) {
    validateRelationshipEvent(event)
    if (eventIds.has(event.id)) throw new RangeError('Relationship event IDs must be unique')
    eventIds.add(event.id)
  }
}
export function getRelationshipBand(value: number): RelationshipBand { if (!Number.isFinite(value)) throw new RangeError('Relationship value must be finite'); if (value < -60) return 'hostile'; if (value < -20) return 'poor'; if (value <= 20) return 'neutral'; if (value <= 60) return 'positive'; return 'strong' }

function validatePeople(sourceId: RelationshipPersonId, targetId: RelationshipPersonId): void { if (!sourceId.trim() || !targetId.trim() || sourceId === targetId) throw new RangeError('Relationship requires two distinct people') }
function validateRelationshipEvent(event: RelationshipEvent): void {
  if (!event.id.trim() || !['careerEvent','teamDecision','playingTime','developmentEvent','professionalInteraction'].includes(event.source) || !Number.isInteger(event.delta) || event.delta === 0 || !event.gameDate) throw new RangeError('Relationship event is invalid')
  for (const value of Object.values(event.context)) if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new RangeError('Relationship event context is invalid')
}
function clampRelationshipValue(value: number): number { return Math.max(-100, Math.min(100, value)) }
