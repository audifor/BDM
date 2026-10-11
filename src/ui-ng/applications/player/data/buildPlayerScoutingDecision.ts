import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { ScoutingRosterComparisonRow } from './buildScoutingRosterComparison'
import type { PlayerScoutingModel } from './buildPlayerScoutingModel'
import { getUserTeam } from '@/engine/calendar'

export interface PlayerScoutingDecision {
  readonly headline: string
  readonly meaning: string
  readonly tone: 'positive' | 'caution' | 'neutral'
  readonly status: 'supported' | 'provisional' | 'insufficient'
  readonly basis: string
  readonly strengths: readonly string[]
  readonly concerns: readonly string[]
  readonly confirmedAdvantageCount: number
  readonly confirmedConcernCount: number
  readonly comparableCount: number
  readonly evidenceCount: number
  readonly nextStep: string
}

/** Same-position roster alternative first, without rating or hidden-potential sorting. */
export function defaultScoutingRosterComparisonId(world: GameWorld, inspectedId: PlayerId): PlayerId | null {
  const team = getUserTeam(world)
  if (team === undefined) return null
  const position = world.players[inspectedId]?.basketball.primaryPosition
  const candidates = team.rosterPlayerIds.filter(id => id !== inspectedId && world.players[id] !== undefined)
  const samePosition = candidates.find(id => world.players[id]?.basketball.primaryPosition === position)
  return samePosition ?? candidates[0] ?? null
}

/**
 * Transparent *interface interpretation*, never an attributed scout quotation.
 * With external players only provable non-overlapping ranges are counted as
 * advantages/concerns. No transfer feasibility or salary judgment is inferred.
 */
export function buildPlayerScoutingDecision(input: {
  readonly own: boolean
  readonly rows: readonly ScoutingRosterComparisonRow[]
  readonly scouting: PlayerScoutingModel
  readonly comparatorName: string | null
}): PlayerScoutingDecision {
  const { own, rows, scouting, comparatorName } = input
  const eligible = rows.filter(row => row.subject !== null && row.low !== null && row.high !== null)
  const stronger = eligible.filter(row => row.low! >= row.own + 5)
    .sort((a,b) => (b.low! - b.own) - (a.low! - a.own))
  const weaker = eligible.filter(row => row.high! <= row.own - 5)
    .sort((a,b) => (a.high! - a.own) - (b.high! - b.own))
  const reportCount = scouting.noteTimeline.length
  const basis = own ? 'Direct roster ratings' : 'Scouting estimates and recorded reports'
  const suffix = comparatorName === null ? 'your roster' : comparatorName
  const strengths = stronger.slice(0,2).map(row => `${row.label}: ${own ? '+' : 'at least +'}${Math.max(0,row.low! - row.own)} vs ${suffix}`)
  const concerns = weaker.slice(0,2).map(row => `${row.label}: ${own ? '' : 'at least '}${Math.min(0,row.high! - row.own)} vs ${suffix}`)
  const base = {
    basis, strengths, concerns,
    confirmedAdvantageCount: stronger.length,
    confirmedConcernCount: weaker.length,
    comparableCount: eligible.length,
    evidenceCount: reportCount,
  }
  if (own) {
    if (eligible.length < 8) return {
      ...base, headline:'BUILD A ROSTER COMPARISON', meaning:'There are not enough shared rating values for this pairing.',
      tone:'neutral', status:'insufficient', nextStep:'Compare against another roster player.',
    }
    if (stronger.length >= 5 && stronger.length >= weaker.length + 3) return {
      ...base, headline:'STRONG SQUAD OPTION', tone:'positive',status:'supported',
      meaning:`Outperforms ${suffix} on ${stronger.length} attributes by at least 5 points. This is a relative skill comparison, not an automatic starting-role recommendation.`,
      nextStep:'Review development, actual performance and coaching role before deciding.',
    }
    if (weaker.length >= 5 && weaker.length >= stronger.length + 3) return {
      ...base, headline:'DEVELOPMENT PRIORITY', tone:'caution',status:'supported',
      meaning:`Trails ${suffix} on ${weaker.length} attributes by at least 5 points. Consider role and development before personnel changes.`,
      nextStep:'Open Development and check recent performance.',
    }
    return {
      ...base, headline:'USEFUL ROSTER OPTION', tone:'neutral',status:'supported',
      meaning:`A mixed attribute matchup with ${suffix}: ${stronger.length} clear advantages, ${weaker.length} clear concerns. Strength depends on the role and game context.`,
      nextStep:'Inspect the strongest differences, then review role and performance.',
    }
  }
  if (reportCount === 0 || eligible.length < 8) return {
    ...base, headline:reportCount > 0 ? 'PROMISING LEAD · PROOF NEEDED' : 'SCOUT FIRST · NO VERDICT',
    tone:'neutral',status:'insufficient',
    meaning:reportCount > 0
      ? `A report exists, but only ${eligible.length} individual attributes can be compared with ${suffix}. This cannot support a signing recommendation yet.`
      : 'There is no filed staff report supporting a signing recommendation. No hidden player ratings are used.',
    nextStep:'Obtain a fuller report or observe the next game.',
  }
  const reliability = scouting.statusPanel?.confidenceLabel.toLowerCase() ?? 'low'
  const enough = eligible.length >= 12 && reliability !== 'low'
  if (!enough) return {
    ...base, headline:'INTERESTING · VERIFY BEFORE CONTACT',
    tone:'neutral',status:'provisional',
    meaning:`${eligible.length} comparable attributes, but coverage or report confidence is not sufficient for a strong signing case.`,
    nextStep:'Commission additional scouting before committing resources.',
  }
  if (stronger.length >= 5 && stronger.length >= weaker.length + 3) return {
    ...base, headline:'STRONG TARGET · EXPLORE SIGNING',
    tone:'positive',status:'supported',
    meaning:`The scouting range is ahead of ${suffix} in at least ${stronger.length} attributes, even using its conservative bound. Sporting support only: availability, contracts, cost and NCAA/NBA/FIBA rules are not verified here.`,
    nextStep:'Review contact pathways and verify eligibility and contract status.',
  }
  if (weaker.length >= 5 && weaker.length >= stronger.length + 3) return {
    ...base, headline:'NOT A CLEAR UPGRADE', tone:'caution',status:'supported',
    meaning:`Estimated below ${suffix} in at least ${weaker.length} attributes. Other roles could still make this player relevant.`,
    nextStep:'Compare with a more appropriate teammate or scout a different role.',
  }
  return {
    ...base, headline:'SCOUTING CASE IS MIXED', tone:'neutral',status:'provisional',
    meaning:`The recorded ranges overlap many of ${suffix}'s ratings: ${stronger.length} supported advantages and ${weaker.length} concerns. A signing decision would be premature.`,
    nextStep:'Compare role-specific strengths and collect more evidence.',
  }
}
