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

/**
 * ME-LOCK1.2: the roles are read several times per tick and only change with the lineup, its fatigue, the plan or the intent's off-ball
 * and crash levels. The last answer per team is kept with exactly those inputs (every player field the scores below read, by value or by
 * the reference of a ratings object that is never rebuilt during a game) and reused while they are all equal.
 */
interface RolesInputs {
  readonly homeTeamId: TeamId; readonly plans: MatchState['tacticalPlans']; readonly offBall: number; readonly crash: number
  readonly lineup: readonly MatchPlayerState[]; readonly roles: LineupRoles
}
const lastRolesByTeam = new Map<TeamId, RolesInputs>()

function sameRoleInputs(left: MatchPlayerState, right: MatchPlayerState): boolean {
  return left === right || left.playerId === right.playerId && left.fatigue === right.fatigue && left.offense === right.offense && left.passing === right.passing
    && left.kinematics === right.kinematics && left.heightCm === right.heightCm && left.weightKg === right.weightKg && left.reboundingImpact === right.reboundingImpact
}

export function lineupRoles(state: MatchState, teamId: TeamId, intent: TacticalIntent): LineupRoles {
  const last = lastRolesByTeam.get(teamId)
  if (last !== undefined && last.homeTeamId === state.homeTeamId && last.plans === state.tacticalPlans && last.offBall === intent.offense.offBall && last.crash === intent.offense.crash) {
    let count = 0
    let same = true
    for (const player of state.players) {
      if (!player.active || player.teamId !== teamId) continue
      const previous = last.lineup[count]
      if (previous === undefined || !sameRoleInputs(previous, player)) { same = false; break }
      count += 1
    }
    if (same && count === last.lineup.length) return last.roles
  }
  const lineup = state.players.filter((player) => player.active && player.teamId === teamId)
  const roles = computeLineupRoles(state, teamId, intent, lineup)
  lastRolesByTeam.set(teamId, { homeTeamId: state.homeTeamId, plans: state.tacticalPlans, offBall: intent.offense.offBall, crash: intent.offense.crash, lineup, roles })
  return roles
}

function computeLineupRoles(state: MatchState, teamId: TeamId, intent: TacticalIntent, lineup: readonly MatchPlayerState[]): LineupRoles {
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
