import type { PlayerId, TeamId } from '@/domain/ids'
import { substitutePlayer, type MatchSession } from '../MatchEngine'

export interface ManualSubstitution { readonly playerOutId: PlayerId; readonly playerInId: PlayerId }
export interface ManualSubstitutionBatch { readonly teamId: TeamId; readonly substitutions: readonly ManualSubstitution[] }

export function applyManualSubstitutions(session: MatchSession, batch: ManualSubstitutionBatch): MatchSession {
  if (session.state.isComplete) throw new Error('Cannot substitute in a completed MatchSession')
  if (batch.substitutions.length === 0) return session
  if (batch.substitutions.length > 5) throw new Error('A manual substitution batch may contain at most five changes')
  const isHome = batch.teamId === session.state.homeTeamId
  if (!isHome && batch.teamId !== session.state.awayTeamId) throw new Error('Manual substitutions Team is not in this Game')
  const squad = isHome ? session.state.squads.home : session.state.squads.away
  let draft = [...(isHome ? session.state.activeLineups.home : session.state.activeLineups.away)]
  const seenOut = new Set<PlayerId>(); const seenIn = new Set<PlayerId>()
  for (const substitution of batch.substitutions) {
    if (substitution.playerOutId === substitution.playerInId || seenOut.has(substitution.playerOutId) || seenIn.has(substitution.playerInId)) throw new Error('Manual substitutions must use unique distinct players')
    if (!draft.includes(substitution.playerOutId) || !squad.includes(substitution.playerInId) || draft.includes(substitution.playerInId)) throw new Error('Manual substitution does not match the active lineup and squad')
    seenOut.add(substitution.playerOutId); seenIn.add(substitution.playerInId)
    draft = draft.map((playerId) => playerId === substitution.playerOutId ? substitution.playerInId : playerId)
  }
  let next = session
  for (const substitution of batch.substitutions) next = substitutePlayer(next, { ...substitution, teamId: batch.teamId, source: 'manual' })
  return next
}
