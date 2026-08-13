import type { GameDate } from '@/domain/date'
import type { PlayerKnowledgeId, PlayerId, TeamId } from '@/domain/ids'
import { BASKETBALL_RATING_KEYS, type BasketballRatingKey } from '@/domain/player'

export interface BasketballRatingKnowledge { readonly estimatedValue: number; readonly uncertainty: number }
export interface PlayerBasketballKnowledge { readonly ratings: Readonly<Record<BasketballRatingKey, BasketballRatingKnowledge>> }
export interface PlayerKnowledgeRecord { readonly id: PlayerKnowledgeId; readonly observerTeamId: TeamId; readonly subjectPlayerId: PlayerId; readonly assessedOn: GameDate; readonly basketball: PlayerBasketballKnowledge }
export type KnowledgeConfidence = 'high' | 'medium' | 'low'
export type BasketballRatingKnowledgeView = { readonly status: 'unknown' } | { readonly status: 'estimated'; readonly min: number; readonly max: number; readonly confidence: KnowledgeConfidence }
export function createPlayerKnowledge(input: PlayerKnowledgeRecord): PlayerKnowledgeRecord { for (const key of BASKETBALL_RATING_KEYS) { const rating = input.basketball.ratings[key]; if (!rating || !Number.isInteger(rating.estimatedValue) || rating.estimatedValue < 0 || rating.estimatedValue > 100 || !Number.isInteger(rating.uncertainty) || rating.uncertainty < 0 || rating.uncertainty > 20) throw new RangeError(`Invalid knowledge rating ${key}`) }; return input }
export function knowledgeConfidence(uncertainty: number): KnowledgeConfidence { return uncertainty <= 2 ? 'high' : uncertainty <= 5 ? 'medium' : 'low' }
export function ratingKnowledgeView(value: BasketballRatingKnowledge | undefined): BasketballRatingKnowledgeView { return value === undefined ? { status: 'unknown' } : { status: 'estimated', min: Math.max(0, value.estimatedValue - value.uncertainty), max: Math.min(100, value.estimatedValue + value.uncertainty), confidence: knowledgeConfidence(value.uncertainty) } }
