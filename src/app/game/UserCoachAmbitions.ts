import { getCoachNetWorth } from '@/domain/coachFinances'
import type { UserCoachAmbition } from '@/domain/coachRpg'
import type { CoachId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

/** BS19B: factual progress toward the user's declared long-term ambition.
 * Read-only derivation from canonical reputation, recorded coaching events and personal money.
 * These are first milestones, not a claim that a person's entire legacy can be reduced to a score.
 * The world and its NPCs keep evolving independently of this personal preference.
 */
export interface UserCoachAmbitionProgress {
  readonly ambition: UserCoachAmbition
  readonly metric: 'titlesWon' | 'playerDevelopmentEvents' | 'publicReputation' | 'netWorth'
  readonly current: number
  readonly target: number
  readonly completed: boolean
}

export function getUserCoachAmbitionProgress(world: GameWorld, coachId: CoachId = world.userCoachId): UserCoachAmbitionProgress | null {
  const ambition = world.coachRpgProfilesByCoachId[coachId]?.creatorOrigin?.ambition
  if (ambition === undefined) return null
  const reputation = world.coachReputationProfilesByCoachId[coachId]
  if (reputation === undefined) throw new Error('Coach career ambition requires canonical reputation')
  if (ambition === 'firstTitle') {
    const current = reputation.events.filter((event) => event.source === 'seasonAchievement' && (event.context as { readonly achievement?: string }).achievement === 'champion').length
    return { ambition, metric: 'titlesWon', current, target: 1, completed: current >= 1 }
  }
  if (ambition === 'talentDeveloper') {
    const current = reputation.events.filter((event) => event.source === 'developmentEvent').length
    return { ambition, metric: 'playerDevelopmentEvents', current, target: 5, completed: current >= 5 }
  }
  if (ambition === 'eliteReputation') {
    return { ambition, metric: 'publicReputation', current: reputation.values.publicStanding, target: 800, completed: reputation.values.publicStanding >= 800 }
  }
  const finances = world.coachFinancesByCoachId[coachId]
  if (finances === undefined) throw new Error('Financial independence ambition requires canonical CoachFinances')
  const current = getCoachNetWorth(finances)
  const debtFree = finances.debts.every((debt) => debt.status === 'paid' || debt.principalRemaining <= 0)
  return { ambition, metric: 'netWorth', current, target: 1_000_000, completed: debtFree && current >= 1_000_000 }
}
