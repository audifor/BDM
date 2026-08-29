import type { TradeAsset, TradeAssetMovement, TradeProposal } from '@/domain/trade'
import { organizationIdForTeam, type OrganizationId, type TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { deriveOrganizationPlayerValuation, formatRatingEvaluation, getOrganizationRatingEvaluation, type OrganizationPlayerValuation } from '@/domain/intelligence'
import { getUserTeam } from '@/engine/calendar'
import { validateTrade, type TeamTradeValidation, type TradeValidationReason } from '@/engine/trade'

export interface TradeDraft { readonly participantTeamIds: readonly TeamId[]; readonly movements: readonly TradeAssetMovement[] }
export interface PresentedTradeAsset { readonly movement: TradeAssetMovement; readonly label: string; readonly sourceTeamName: string; readonly intelligence?:string }
export interface PresentedTradeTeam { readonly teamId: TeamId; readonly teamName: string; readonly received: readonly PresentedTradeAsset[]; readonly validation?: TeamTradeValidation }
export interface TradePresentation { readonly proposal: TradeProposal; readonly teams: readonly PresentedTradeTeam[]; readonly allowed: boolean; readonly globalReasons: readonly TradeValidationReason[]; readonly hasSalaryMatching: boolean }

export function createTradeDraft(world: GameWorld): TradeDraft {
  const team = getUserTeam(world)
  return { participantTeamIds: team === undefined ? [] : [team.id], movements: [] }
}

export function addTradeParticipant(draft: TradeDraft, teamId: TeamId, maximum: number): TradeDraft {
  return draft.participantTeamIds.includes(teamId) || draft.participantTeamIds.length >= maximum ? draft : { ...draft, participantTeamIds: [...draft.participantTeamIds, teamId] }
}

export function changeTradeCounterparty(draft: TradeDraft, userTeamId: TeamId, teamId: TeamId): TradeDraft {
  return { participantTeamIds: [userTeamId, teamId], movements: [] }
}

export function addTradeMovement(draft: TradeDraft, movement: TradeAssetMovement): TradeDraft {
  const key = tradeAssetKey(movement.asset)
  return draft.movements.some((item) => tradeAssetKey(item.asset) === key) ? draft : { ...draft, movements: [...draft.movements, movement] }
}

export function removeTradeMovement(draft: TradeDraft, movement: TradeAssetMovement): TradeDraft {
  const key = tradeAssetKey(movement.asset)
  return { ...draft, movements: draft.movements.filter((item) => !(tradeAssetKey(item.asset) === key && item.fromTeamId === movement.fromTeamId && item.toTeamId === movement.toTeamId)) }
}

export function buildTradePresentation(world: GameWorld, rules: NonNullable<GameWorld['tradeRulesBySeasonId'][keyof GameWorld['seasons']]>, draft: TradeDraft): TradePresentation {
  const proposal: TradeProposal = { id: `user-trade:${world.currentDate}:${draft.movements.map((item) => tradeAssetKey(item.asset)).join(':')}`, ecosystemId: rules.ecosystemId, seasonId: rules.seasonId, participantTeamIds: draft.participantTeamIds, movements: draft.movements }
  const validation = validateTrade(world, proposal)
  return {
    proposal,
    allowed: validation.allowed,
    globalReasons: validation.globalReasons,
    hasSalaryMatching: world.salaryRulesBySeasonId[rules.seasonId] !== undefined,
    teams: draft.participantTeamIds.map((teamId) => ({ teamId, teamName: world.teams[teamId]?.name ?? 'Unknown team', received: draft.movements.filter((movement) => movement.toTeamId === teamId).map((movement) => ({ movement, label: tradeAssetLabel(world, movement.asset), sourceTeamName: world.teams[movement.fromTeamId]?.name ?? 'Unknown team', intelligence: tradeAssetIntelligence(world, organizationIdForTeam(teamId), movement.asset) })), validation: validation.teamResults.find((result) => result.teamId === teamId) })),
  }
}
export function tradeAssetIntelligence(world:GameWorld,organizationId:OrganizationId,asset:TradeAsset):string|undefined{if(asset.kind!=='player')return undefined;const player=world.players[asset.playerId];if(!player)return undefined;return formatRatingEvaluation(getOrganizationRatingEvaluation({organizationId,playerId:player.id,dimension:'creation',knowledge:world.organizationKnowledge,currentDate:world.currentDate,publicPosition:player.basketball.primaryPosition}))}
/** Trade talent evaluation is observer-specific; legality remains in the trade engine. */
export function tradePlayerValuation(world: GameWorld, organizationId: OrganizationId, playerId: import('@/domain/ids').PlayerId): OrganizationPlayerValuation | undefined {
  const player = world.players[playerId]
  if (!player) return undefined
  return deriveOrganizationPlayerValuation({ organizationId, playerId, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context: 'TRADE', publicPosition: player.basketball.primaryPosition, policy: world.organizationEvaluationPoliciesById[organizationId] })
}

export function tradeAssetKey(asset: TradeAsset): string {
  return asset.kind === 'player' ? `player:${asset.playerId}` : asset.kind === 'draftPick' ? `draftPick:${asset.draftPickId}` : asset.kind === 'futureDraftPick' ? `futureDraftPick:${asset.futureDraftPickRightId}` : asset.kind === 'playerRights' ? `playerRights:${asset.playerRightsId}` : asset.kind === 'draftPickSwapRight' ? `draftPickSwapRight:${asset.draftPickSwapRightId}` : `cash:${asset.amount}`
}

export function tradeAssetLabel(world: GameWorld, asset: TradeAsset): string {
  if (asset.kind === 'player') { const player = world.players[asset.playerId]; return player === undefined ? 'Unknown player' : `${player.firstName} ${player.lastName} · ${player.basketball.primaryPosition}` }
  if (asset.kind === 'draftPick') { const pick = world.draftPicksById[asset.draftPickId]; return pick === undefined ? 'Unknown draft pick' : `${world.draftsById[pick.draftId]?.scheduledOn.slice(0, 4) ?? 'Draft'} · Round ${pick.round} · Pick ${pick.order}` }
  if (asset.kind === 'futureDraftPick') { const pick = world.futureDraftPickRightsById[asset.futureDraftPickRightId]; return pick === undefined ? 'Unknown future pick' : `${pick.cycle} · Round ${pick.round}${pick.protection === undefined ? '' : ' · Protected'}` }
  if (asset.kind === 'playerRights') { const right = world.playerRightsById[asset.playerRightsId]; const player = right === undefined ? undefined : world.players[right.playerId]; return player === undefined ? 'Player rights' : `${player.firstName} ${player.lastName} rights` }
  if (asset.kind === 'draftPickSwapRight') { const right = world.draftPickSwapRightsById[asset.draftPickSwapRightId]; return right === undefined ? 'Pick swap' : `${right.cycle} Round ${right.round} pick swap` }
  return `$${(asset.amount / 1_000_000).toFixed(1)}M cash`
}

export function humanizeTradeReason(reason: TradeValidationReason, teamName?: string, validation?: TeamTradeValidation): string {
  const subject = teamName ?? 'This team'
  if (reason === 'SALARY_MATCHING_FAILED') { const excess = validation?.incomingSalaryLimit === undefined ? undefined : validation.incomingSalary - validation.incomingSalaryLimit; return excess === undefined ? `${subject} cannot take on that salary.` : `${subject} would receive $${(excess / 1_000_000).toFixed(1)}M above its incoming salary limit.` }
  const messages: Record<Exclude<TradeValidationReason, 'SALARY_MATCHING_FAILED'>, string> = { RULES_UNAVAILABLE: 'Trade rules are not available for this season.', INVALID_PARTICIPANT: 'Every team in the proposal must belong to this trade ecosystem.', TOO_MANY_TEAMS: 'This proposal has too many participating teams.', EMPTY_PARTICIPANT: `${subject} must send or receive an asset.`, ASSET_TYPE_NOT_ALLOWED: 'That asset type cannot be included in this trade.', ASSET_NOT_OWNED: `${subject} does not own that asset.`, PLAYER_NOT_ON_TEAM: `${subject} does not have that player on its roster.`, DUPLICATE_ASSET: 'An asset can only appear once in a proposal.', SAME_TEAM_MOVEMENT: 'An asset must be sent to a different team.', INVALID_FUTURE_PICK: 'That future pick is not available to trade.', FUTURE_PICK_HORIZON_EXCEEDED: 'That future pick is outside the tradable horizon.', INVALID_SWAP_RIGHT: 'That pick swap is not available to trade.', CASH_NOT_ALLOWED: 'Cash consideration is not allowed by these rules.', CASH_LIMIT_EXCEEDED: 'Cash consideration exceeds the permitted limit.', RETAINED_SALARY_NOT_ALLOWED: 'Retained salary is not allowed by these rules.', RETAINED_SALARY_LIMIT_EXCEEDED: 'That retained salary term is not allowed.', EXCEPTION_UNAVAILABLE: 'The selected salary exception is unavailable.' }
  return messages[reason]
}
