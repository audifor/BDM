import type { BasketballRatingKey } from '@/domain/player'
import { ratingKnowledgeView, type BasketballRatingKnowledgeView, type PlayerKnowledgeRecord } from '@/domain/knowledge'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
export function getPlayerKnowledge(world: GameWorld, observerTeamId: TeamId, playerId: PlayerId): PlayerKnowledgeRecord | undefined { return Object.values(world.playerKnowledgeById).find((record) => record.observerTeamId === observerTeamId && record.subjectPlayerId === playerId) }
export function getKnownBasketballRating(world: GameWorld, observerTeamId: TeamId, playerId: PlayerId, key: BasketballRatingKey): BasketballRatingKnowledgeView { return ratingKnowledgeView(getPlayerKnowledge(world, observerTeamId, playerId)?.basketball.ratings[key]) }
export function getPlayerBasketballKnowledgeView(world: GameWorld, observerTeamId: TeamId, playerId: PlayerId) { return Object.fromEntries(['finishing','shooting','playmaking','perimeterDefense','interiorDefense','rebounding','athleticism'].map((key) => [key, getKnownBasketballRating(world, observerTeamId, playerId, key as BasketballRatingKey)])) as Readonly<Record<BasketballRatingKey, BasketballRatingKnowledgeView>> }
