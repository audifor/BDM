import type { PlayerId } from '@/domain/ids'
import type { PlayerHistoryItemModel } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'

export interface TalentHistoryDestination {
  readonly app: 'player' | 'recruiting' | 'portal' | 'draft'
  readonly playerId: PlayerId
  readonly playerView?: 'scouting' | 'history' | 'contract'
  readonly focusPlayerId?: PlayerId
}

/** Application-only mapping from recorded pathway events to an existing workspace. */
export function resolveTalentHistoryDestination(event: PlayerHistoryItemModel, playerId: PlayerId): TalentHistoryDestination | null {
  if (event.source === 'DRAFT_RECORD' || event.type === 'draft' || event.id.startsWith('career:rights:')) return { app: 'draft', playerId, focusPlayerId: playerId }
  if ((event.id.startsWith('ecosystem:') || event.id.startsWith('career:portal:')) && /transfer/i.test(event.title)) return { app: 'portal', playerId, focusPlayerId: playerId }
  if (event.id.startsWith('career:recruit-signing:')) return { app: 'recruiting', playerId, focusPlayerId: playerId }
  if (event.id.startsWith('career:enrollment:')) return { app: 'player', playerId, playerView: 'history' }
  if (event.source === 'CONTRACT_RECORD' || /professional contract/i.test(event.title)) return { app: 'player', playerId, playerView: 'contract' }
  if (event.id.startsWith('ecosystem:')) return { app: 'player', playerId, playerView: 'history' }
  return null
}
