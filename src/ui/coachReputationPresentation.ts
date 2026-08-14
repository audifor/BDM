import { getCoachReputationBand, type CoachReputationEvent, type CoachReputationSource } from '@/domain/coachReputation'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'

type CoachReputationBand = ReturnType<typeof getCoachReputationBand>

const BAND_LABELS: Readonly<Record<CoachReputationBand, string>> = {
  unknown: 'Unknown', emerging: 'Emerging', established: 'Established', respected: 'Respected', renowned: 'Renowned', elite: 'Elite', iconic: 'Iconic', legendary: 'Legendary',
}
const SOURCE_LABELS: Readonly<Record<CoachReputationSource, string>> = {
  matchResult: 'Match Result', seasonAchievement: 'Season Achievement', professionalEvent: 'Professional Event', developmentEvent: 'Development Event', publicEvent: 'Public Event',
}

export function coachReputationBandLabel(band: CoachReputationBand): string { return BAND_LABELS[band] }
export function coachReputationSourceLabel(source: CoachReputationSource): string { return SOURCE_LABELS[source] ?? 'Reputation Event' }
export function formatCoachReputationDelta(value: number): string { return `${value > 0 ? '+' : ''}${value}` }
export function coachReputationEventLabel(world: GameWorld, event: CoachReputationEvent): string {
  if (event.context.kind === 'matchResult' && 'opponentTeamId' in event.context) {
    const opponent = world.teams[event.context.opponentTeamId as TeamId]
    const result = event.context.result === 'win' ? 'Win' : 'Loss'
    return opponent === undefined ? `${result} · Match Result` : `${result} vs ${opponent.name}`
  }
  if (event.context.kind === 'seasonAchievement' && 'achievement' in event.context && event.context.achievement === 'champion') return 'Season Champion'
  return coachReputationSourceLabel(event.source)
}
