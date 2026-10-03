import type { PlayerId, TeamId } from '@/domain/ids'
import type { MatchPlayerState, MatchState } from '../state'
import { creatorScore, postScore, rollerScore, type TacticalIntent } from './TacticalIdentity'

/**
 * BT5.4: offensive responsibilities of the five on the floor, recomputed from who is on the floor (ratings, fatigue, the plan's featured
 * player, the coach's identity). They are not positions: a player can carry several and they change with every substitution.
 */
export type OffensiveRole = 'PRIMARY_CREATOR' | 'SECONDARY_CREATOR' | 'SPACER' | 'MOVEMENT_SHOOTER' | 'CUTTER' | 'SCREENER' | 'ROLLER' | 'POPPER' | 'INTERIOR_TARGET' | 'OFFENSIVE_REBOUNDER'

export interface LineupRoles {
  readonly teamId: TeamId
  readonly byPlayer: Readonly<Record<string, readonly OffensiveRole[]>>
  readonly primaryCreatorId: PlayerId | null
  readonly secondaryCreatorId: PlayerId | null
  readonly screenerId: PlayerId | null
  readonly interiorTargetId: PlayerId | null
  readonly movementShooterId: PlayerId | null
  readonly offensiveRebounderIds: readonly PlayerId[]
}

/** A creator's standing in this lineup: his creation, handle and vision, less what fatigue takes from it, plus the plan's featured player. */
export function creatorStanding(state: MatchState, player: MatchPlayerState): number {
  const featured = (player.teamId === state.homeTeamId ? state.tacticalPlans.home : state.tacticalPlans.away).featuredPlayerId === player.playerId
  return creatorScore(player) - player.fatigue * 0.15 + (featured ? 4 : 0)
}

export function lineupRoles(state: MatchState, teamId: TeamId, intent: TacticalIntent): LineupRoles {
  const lineup = state.players.filter((player) => player.active && player.teamId === teamId)
  const byId = (score: (player: MatchPlayerState) => number, pool: readonly MatchPlayerState[] = lineup): MatchPlayerState[] =>
    [...pool].sort((left, right) => score(right) - score(left) || String(left.playerId).localeCompare(String(right.playerId)))
  const roles = new Map<string, OffensiveRole[]>(lineup.map((player) => [String(player.playerId), []]))
  const add = (player: MatchPlayerState | undefined, role: OffensiveRole): void => { if (player !== undefined) roles.get(String(player.playerId))!.push(role) }
  const creators = byId((player) => creatorStanding(state, player))
  const primary = creators[0]
  // A second creator exists when he is close to the first or good on his own: two-guard lineups initiate from both sides.
  const secondary = creators[1] !== undefined && (creatorStanding(state, creators[1]) >= 62 || creatorStanding(state, primary!) - creatorStanding(state, creators[1]) <= 6) ? creators[1] : undefined
  add(primary, 'PRIMARY_CREATOR')
  add(secondary, 'SECONDARY_CREATOR')
  const nonCreators = lineup.filter((player) => player !== primary)
  // The interior target is the best post player, if he really is one (size and finishing): a lineup of guards has none.
  const post = byId(postScore, nonCreators)[0]
  const interior = post !== undefined && postScore(post) >= 58 && post.heightCm >= 198 ? post : undefined
  add(interior, 'INTERIOR_TARGET')
  // The screener: the big who threatens most after the screen, rolling or popping.
  const screener = byId((player) => Math.max(rollerScore(player), player.offense.shooting * 0.9) + (player.heightCm - 195) * 0.3, nonCreators)[0]
  add(screener, 'SCREENER')
  for (const player of lineup) {
    if (player.heightCm >= 198 || player === screener) {
      if (player.offense.shooting >= 58 && player.offense.shooting >= player.offense.rimAttack - 4) add(player, 'POPPER')
      if (player.offense.rimAttack >= 55 && rollerScore(player) >= 58) add(player, 'ROLLER')
    }
    if (player !== primary && player !== interior && player.offense.shooting >= 60) add(player, 'SPACER')
    if (player !== primary && player.offense.rimAttack >= 62 && (player.offense.shooting < 64 || intent.offense.offBall >= 0.55)) add(player, 'CUTTER')
  }
  const movement = byId((player) => player.offense.shooting + player.kinematics.maxSpeedMps * 2, lineup.filter((player) => player !== primary && player !== interior && player.offense.shooting >= 62))[0]
  add(movement, 'MOVEMENT_SHOOTER')
  const crashers = Math.round(1 + 2 * intent.offense.crash)
  const rebounders = byId((player) => player.reboundingImpact + (player.heightCm - 195) * 0.2, lineup.filter((player) => player !== primary)).slice(0, crashers)
  for (const player of rebounders) add(player, 'OFFENSIVE_REBOUNDER')
  return {
    teamId,
    byPlayer: Object.fromEntries([...roles.entries()].map(([id, list]) => [id, list])),
    primaryCreatorId: primary?.playerId ?? null,
    secondaryCreatorId: secondary?.playerId ?? null,
    screenerId: screener?.playerId ?? null,
    interiorTargetId: interior?.playerId ?? null,
    movementShooterId: movement?.playerId ?? null,
    offensiveRebounderIds: rebounders.map((player) => player.playerId),
  }
}
