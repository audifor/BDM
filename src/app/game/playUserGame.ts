import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import { getGamesToday, getUserTeam } from '@/engine/calendar'
import {
  applyCompletedMatch,
  simulateMatchWithRotations,
  type MatchTacticalPlan,
  type MatchSimulation,
} from '@/engine/match'
import { applyPostMatchInjuries } from '@/engine/injury'
import { LiveMatchController } from './LiveMatchController'
import { PlayUserGameError } from './PlayUserGameError'
import { resolveCanonicalMatchInput } from './resolveCanonicalMatchInput'

export { PlayUserGameError }

/**
 * Prepares the user's current game for a viewer without changing GameWorld.
 * `userTacticalPlan`, when supplied, overrides the user's side only (e.g. a
 * live pre-match tactics draft) — the resolver still resolves the opponent's
 * (and, when omitted, the user's own) plan from persisted configuration via
 * resolveCanonicalMatchInput, exactly as AI-vs-AI simulation does (MG3: Live
 * Match and Instant Result no longer diverge on this).
 */
export function prepareUserMatch(world: GameWorld, userTacticalPlan?: MatchTacticalPlan): MatchSimulation {
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) {
    throw new PlayUserGameError('The user coach is not assigned to a Team')
  }

  const game = getGamesToday(world).find(
    (candidate) => candidate.homeTeamId === userTeam.id || candidate.awayTeamId === userTeam.id,
  )
  if (game === undefined) {
    throw new PlayUserGameError(`The user Team has no Game on ${world.currentDate}`)
  }
  if (game.status !== 'scheduled') {
    throw new PlayUserGameError(`The user Game ${game.id} is already completed`)
  }

  return prepareMatch(world, game, userTacticalPlan === undefined ? undefined : {
    tacticalPlanOverrides: userTeam.id === game.homeTeamId ? { home: userTacticalPlan } : { away: userTacticalPlan },
  })
}

/** Live-match counterpart of prepareUserMatch; see its doc comment for tactical-plan resolution. */
export function createLiveUserMatch(world: GameWorld, userTacticalPlan?: MatchTacticalPlan): LiveMatchController {
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) throw new PlayUserGameError('The user coach is not assigned to a Team')
  const game = getGamesToday(world).find((candidate) => candidate.homeTeamId === userTeam.id || candidate.awayTeamId === userTeam.id)
  if (game === undefined || game.status !== 'scheduled') throw new PlayUserGameError('The user Team has no scheduled Game today')

  const input = resolveCanonicalMatchInput(world, game, userTacticalPlan === undefined ? undefined : {
    tacticalPlanOverrides: userTeam.id === game.homeTeamId ? { home: userTacticalPlan } : { away: userTacticalPlan },
  })
  return new LiveMatchController({ world, ...input })
}

export function prepareMatch(world: GameWorld, game: Game, options?: { readonly tacticalPlanOverrides?: { readonly home?: MatchTacticalPlan; readonly away?: MatchTacticalPlan } }): MatchSimulation {
  const input = resolveCanonicalMatchInput(world, game, { tacticalPlanOverrides: options?.tacticalPlanOverrides })
  return simulateMatchWithRotations({ world, ...input })
}

/** Applies a completed viewer simulation to GameWorld exactly through the result boundary. */
export function completeMatch(world: GameWorld, simulation: MatchSimulation): GameWorld {
  return applyPostMatchInjuries(applyCompletedMatch(world, simulation), simulation.gameId)
}

/** Instant Result uses the same detailed simulation as MatchViewer, then applies it immediately. */
export function instantResult(world: GameWorld, tacticalPlan?: MatchTacticalPlan): GameWorld {
  return completeMatch(world, prepareUserMatch(world, tacticalPlan))
}

/** Retained application alias for existing instant-result callers. */
export function playUserGame(world: GameWorld): GameWorld {
  return instantResult(world)
}

export function simulateAndApplyGame(world: GameWorld, game: Game): GameWorld {
  return completeMatch(world, prepareMatch(world, game))
}
