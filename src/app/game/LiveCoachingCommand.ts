import type { PlayerId, TeamId } from '@/domain/ids'
import type { ManualSubstitution, MatchTacticalPlan, MatchSession } from '@/engine/match'

/**
 * The single canonical shape for a coaching order issued during a live match.
 * Extensible by category; only the categories with a real, tested runtime effect
 * today are represented (see MG1/MG2B). A category with no functional runtime
 * yet must resolve to an 'unsupported' LiveCoachingCommandResult, never a fake
 * 'applied' one.
 */
export type LiveCoachingCommand =
  | { readonly type: 'SUBSTITUTION'; readonly teamId: TeamId; readonly substitutions: readonly ManualSubstitution[] }
  | { readonly type: 'TACTICAL_CHANGE'; readonly teamId: TeamId; readonly tacticalPlan: MatchTacticalPlan }

export type LiveCoachingRejectionReason =
  | 'MATCH_NOT_ACTIVE'
  | 'INVALID_TEAM'
  | 'PLAYER_NOT_ON_COURT'
  | 'PLAYER_NOT_ON_BENCH'
  | 'DUPLICATE_OR_SAME_PLAYER'
  | 'TOO_MANY_SUBSTITUTIONS'
  | 'INVALID_TACTICAL_PLAN'

/**
 * The explicit outcome of a LiveCoachingCommand. Never `void`: a caller can always
 * distinguish a command that changed the runtime from one that did not, and why.
 * `unsupported` is reserved for command categories with no real runtime effect —
 * it must never be produced for SUBSTITUTION or TACTICAL_CHANGE, both of which
 * have a functional engine boundary (ManualSubstitutions.ts, MatchCoachingState.ts).
 */
export type LiveCoachingCommandResult =
  | { readonly status: 'applied' }
  | { readonly status: 'rejected'; readonly reason: LiveCoachingRejectionReason; readonly message: string }
  | { readonly status: 'unsupported'; readonly message: string }

function rejected(reason: LiveCoachingRejectionReason, message: string): LiveCoachingCommandResult {
  return { status: 'rejected', reason, message }
}

/**
 * Validates a SUBSTITUTION command against the actual live session state before the
 * engine boundary (ManualSubstitutions.ts) is ever called, so rejections carry a
 * precise, stable reason instead of parsing a thrown error message. Mirrors the
 * same invariants applyManualSubstitutions enforces (team membership, batch size,
 * distinct players, on-court/on-bench membership, no duplicate resulting lineup
 * slot) so a 'rejected' result here always matches what the engine would refuse.
 */
export function validateSubstitutionCommand(session: MatchSession, teamId: TeamId, substitutions: readonly ManualSubstitution[]): LiveCoachingCommandResult | null {
  const state = session.state
  if (state.isComplete) return rejected('MATCH_NOT_ACTIVE', 'The match has already finished')
  const isHome = teamId === state.homeTeamId
  if (!isHome && teamId !== state.awayTeamId) return rejected('INVALID_TEAM', `Team ${teamId} is not in this Game`)
  if (substitutions.length === 0) return null
  if (substitutions.length > 5) return rejected('TOO_MANY_SUBSTITUTIONS', 'A manual substitution batch may contain at most five changes')

  const squad = isHome ? state.squads.home : state.squads.away
  let draft = [...(isHome ? state.activeLineups.home : state.activeLineups.away)]
  const seenOut = new Set<PlayerId>()
  const seenIn = new Set<PlayerId>()
  for (const substitution of substitutions) {
    if (substitution.playerOutId === substitution.playerInId) return rejected('DUPLICATE_OR_SAME_PLAYER', 'The outgoing and incoming player must be different')
    if (seenOut.has(substitution.playerOutId) || seenIn.has(substitution.playerInId)) return rejected('DUPLICATE_OR_SAME_PLAYER', 'Each player may appear at most once in a substitution batch')
    if (!draft.includes(substitution.playerOutId)) return rejected('PLAYER_NOT_ON_COURT', `Player ${substitution.playerOutId} is not currently on court for this team`)
    if (!squad.includes(substitution.playerInId)) return rejected('PLAYER_NOT_ON_BENCH', `Player ${substitution.playerInId} is not available on this team's squad`)
    if (draft.includes(substitution.playerInId)) return rejected('PLAYER_NOT_ON_BENCH', `Player ${substitution.playerInId} is already on court`)
    seenOut.add(substitution.playerOutId)
    seenIn.add(substitution.playerInId)
    draft = draft.map((playerId) => (playerId === substitution.playerOutId ? substitution.playerInId : playerId))
  }
  return null
}

/** Maps an unexpected thrown error from the engine coaching boundary onto a rejection, as a safety net behind validateSubstitutionCommand. */
export function classifySubstitutionError(error: unknown): LiveCoachingCommandResult {
  return rejected('PLAYER_NOT_ON_COURT', error instanceof Error ? error.message : 'Substitution could not be applied')
}

/** Maps a thrown validation error from the engine tactics boundary onto a stable rejection reason. */
export function classifyTacticalChangeError(error: unknown): LiveCoachingCommandResult {
  const message = error instanceof Error ? error.message : 'Tactical change could not be applied'
  if (message.includes('is not in this Game')) return rejected('INVALID_TEAM', message)
  if (message.includes('completed MatchSession')) return rejected('MATCH_NOT_ACTIVE', message)
  return rejected('INVALID_TACTICAL_PLAN', message)
}
