import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { ScoutingRosterComparisonRow } from './buildScoutingRosterComparison'
import type { PlayerScoutingModel } from './buildPlayerScoutingModel'
import { getUserTeam } from '@/engine/calendar'
import { derivePlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import { PLAYER_TRUTH_RATING_KEYS } from '@/domain/player'

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
  readonly uncertainComparableCount: number
  readonly confidenceNote: string
}

/**
 * Explicit roster baselines, based only on OWN roster ratings.
 * The leader is the top mean over the 80 canonical ratings, which is not
 * a tactical overall, a starting-lineup selection or a minutes prediction.
 */
export type ScoutingBenchmarkMode = 'role-peer' | 'rating-leader' | 'manual'
export function scoutingRosterBenchmarks(world: GameWorld, inspectedId: PlayerId) {
  const team = getUserTeam(world)
  if (team === undefined) return { rolePeer: null, ratingLeader: null }
  const player = world.players[inspectedId]
  const candidates = team.rosterPlayerIds.filter(id => id !== inspectedId && world.players[id] !== undefined)
  const positionPeers = candidates.filter(id =>
    world.players[id]?.basketball.primaryPosition === player?.basketball.primaryPosition)
  const group = positionPeers.length > 0 ? positionPeers : candidates
  const rolePeer = group[0] ?? null
  const scored = group.map(id => {
    const access = derivePlayerKnowledgeAccess(world, id)
    const average = access.kind === 'own-roster'
      ? PLAYER_TRUTH_RATING_KEYS.reduce((sum, key) => sum + access.currentRatings[key], 0) / PLAYER_TRUTH_RATING_KEYS.length
      : 0
    return { id, average }
  }).sort((a,b)=>b.average-a.average || String(a.id).localeCompare(String(b.id)))
  return { rolePeer, ratingLeader: scored[0]?.id ?? null }
}

export function defaultScoutingRosterComparisonId(world: GameWorld, inspectedId: PlayerId): PlayerId | null {
  return scoutingRosterBenchmarks(world, inspectedId).rolePeer
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
    uncertainComparableCount: eligible.filter(row => row.high! - row.low! > 16).length,
    confidenceNote: own ? 'Verified roster ratings' : 'Scouting ranges, not Player Truth',
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
  const uncertainCount = base.uncertainComparableCount
  const uncertainShare = eligible.length > 0 ? uncertainCount / eligible.length : 1
  // Broad intervals can be confident in provenance but still unsuitable for
  // a firm player-replacement verdict. A report count alone never proves fit.
  const strongEvidence = eligible.length >= 40 && reliability === 'high' &&
    uncertainShare <= .25 &&
    scouting.strengths.length >= 1 && scouting.archetypeTitle !== 'Insufficient scouting information'
  if (!strongEvidence) return {
    ...base, headline:'INTERESTING · VERIFY BEFORE CONTACT',
    tone:'neutral',status:'provisional',
    meaning:`${stronger.length} supported attribute advantages and ${weaker.length} concerns vs ${suffix}, but ${uncertainCount} of ${eligible.length} comparisons have wide ranges. A trustworthy signing recommendation still needs narrower evidence and a verified playing profile.`,
    nextStep:'Request targeted scouting, confirm the role and review contractual/competition eligibility before contact.',
  }
  if (stronger.length >= 5 && stronger.length >= weaker.length + 3) return {
    ...base, headline:'SPORTING UPGRADE · REVIEW OPTIONS',
    tone:'positive',status:'supported',
    meaning:`The conservative scouting bound is ahead of ${suffix} in ${stronger.length} attributes. This supports further recruitment work, not a confirmed signing or tactical fit. Cost, contract and NCAA/NBA/FIBA eligibility remain unverified here.`,
    nextStep:'Review contact pathways, competition eligibility and the employing club before any offer.',
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
