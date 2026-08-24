import type { GameDate } from '@/domain/date'

export type MediaOpportunityType = 'preMatch' | 'postMatch' | 'career' | 'competition' | 'narrative'
export type MediaOpportunityStatus = 'pending' | 'completed' | 'skipped' | 'archived'
export type MediaIntent = 'DEFEND' | 'CHALLENGE' | 'DEFLECT' | 'TAKE_RESPONSIBILITY' | 'BLAME' | 'PRAISE' | 'DENY' | 'CONFIRM' | 'PROVOKE' | 'DOWNPLAY' | 'REFUSE'
export type MediaTopic = 'performance' | 'pressure' | 'player' | 'relationship' | 'rivalry' | 'formerClub' | 'formerPlayer' | 'dynasty' | 'promotionJourney' | 'revenge'
export type MediaStance = 'diplomatic' | 'confident' | 'aggressive' | 'protective' | 'critical' | 'humble' | 'deflect' | 'ambitious'
export interface MediaQuestion { readonly id: string; readonly topic: MediaTopic; readonly text: string; readonly narrativeThreadId?: string; readonly targetPlayerId?: string; readonly context: Readonly<Record<string, string | number | boolean>> }
export interface MediaAnswer { readonly stance: MediaStance; readonly intent?: MediaIntent; readonly text: string }
export interface MediaOpportunity { readonly id: string; readonly semanticKey: string; readonly coachId: string; readonly gameDate: GameDate; readonly type: MediaOpportunityType; readonly status: MediaOpportunityStatus; readonly importance: number; readonly gameId?: string; readonly narrativeThreadId?: string; readonly questions: readonly MediaQuestion[]; readonly answers: readonly MediaAnswer[] }
export interface MediaInteraction { readonly id: string; readonly opportunityId: string; readonly coachId: string; readonly gameDate: GameDate; readonly questionId: string; readonly stance: MediaStance; readonly targetPlayerId?: string; readonly consequences: readonly string[] }
export interface MediaProfile { readonly coachId: string; readonly stanceCounts: Readonly<Partial<Record<MediaStance, number>>>; readonly reservedCount: number }
export function createMediaProfile(coachId: string): MediaProfile { return { coachId, stanceCounts: {}, reservedCount: 0 } }
export function getMediaProfileDescriptor(profile: MediaProfile): 'reserved' | 'diplomatic' | 'provocative' | 'protective' | 'frontal' | undefined {
  if (profile.reservedCount >= 3) return 'reserved'
  const ranked = (Object.entries(profile.stanceCounts) as [MediaStance, number][]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  if (ranked === undefined || ranked[1] < 3) return undefined
  return ranked[0] === 'aggressive' ? 'provocative' : ranked[0] === 'protective' ? 'protective' : ranked[0] === 'critical' ? 'frontal' : 'diplomatic'
}
