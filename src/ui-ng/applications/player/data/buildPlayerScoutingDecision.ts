import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { BasketballPosition } from '@/domain/primitives/BasketballPosition'
import type { ScoutingRosterComparisonRow } from './buildScoutingRosterComparison'
import type { PlayerScoutingModel } from './buildPlayerScoutingModel'
import { getUserTeam } from '@/engine/calendar'
import { derivePlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import { positionEvidenceKeys, sharedScoutingPositions } from './scoutingPositionEvidence'

export type ScoutingBenchmarkMode = 'role-peer' | 'rating-leader' | 'manual'

export interface PlayerScoutingDecision {
  readonly headline: string
  readonly meaning: string
  readonly tone: 'positive' | 'caution' | 'neutral'
  readonly status: 'supported' | 'provisional' | 'insufficient'
  readonly basis: string
  readonly strengths: readonly string[]
  readonly concerns: readonly string[]
  /** Overall 80-rating diagnostic (not an assessment of positional fit). */
  readonly confirmedAdvantageCount: number
  readonly confirmedConcernCount: number
  readonly comparableCount: number
  readonly evidenceCount: number
  readonly nextStep: string
  readonly uncertainComparableCount: number
  readonly confidenceNote: string
  readonly position: BasketballPosition
  readonly positionMatched: boolean
  readonly positionalComparableCount: number
  readonly positionalEvidenceTotal: number
  readonly positionalAdvantageCount: number
  readonly positionalConcernCount: number
}

/**
 * Position-peer and leader use only roster players who can actually play a
 * position shared with the subject. Secondary positions count, exact primary
 * positions are favored. When no eligible peer exists we return null, never
 * silently substitute a center for a guard. Manual exploration stays possible.
 *
 * Rating leader = arithmetic mean of the EXPLICIT unweighted position lens
 * among those players, NOT game/coach rating, starter selection or tactical fit.
 */
export function scoutingRosterBenchmarks(world: GameWorld, inspectedId: PlayerId) {
  const team = getUserTeam(world)
  if (team === undefined) return { rolePeer: null, ratingLeader: null, position: null }
  const subject = world.players[inspectedId]?.basketball
  if (subject === undefined) return {rolePeer:null,ratingLeader:null,position:null}
  const candidates = team.rosterPlayerIds.filter(id=>id !== inspectedId &&
    world.players[id] !== undefined)
  const peers = candidates.filter(id=>
    sharedScoutingPositions(subject,world.players[id]!.basketball).length > 0)
  const rankedByPriority = peers.slice().sort((a,b)=>{
    const first = world.players[a]!.basketball
    const second = world.players[b]!.basketball
    const firstExact = Number(first.primaryPosition === subject.primaryPosition)
    const secondExact = Number(second.primaryPosition === subject.primaryPosition)
    return secondExact - firstExact || String(a).localeCompare(String(b))
  })
  const rolePeer = rankedByPriority[0] ?? null
  const ratingsFor = (id:PlayerId) => {
    const player = world.players[id]!.basketball
    const shared = sharedScoutingPositions(subject,player)
    const position = shared.includes(subject.primaryPosition) ? subject.primaryPosition : shared[0]
    const access = derivePlayerKnowledgeAccess(world,id)
    if (position === undefined || access.kind !== 'own-roster') return 0
    const keys = positionEvidenceKeys(position)
    return keys.reduce((sum,key)=>sum+access.currentRatings[key],0)/keys.length
  }
  const leader = rankedByPriority.slice().sort((a,b)=>ratingsFor(b)-ratingsFor(a) ||
    String(a).localeCompare(String(b)))[0] ?? null
  return {rolePeer, ratingLeader:leader,position:subject.primaryPosition}
}

export function defaultScoutingRosterComparisonId(world: GameWorld, inspectedId: PlayerId): PlayerId | null {
  return scoutingRosterBenchmarks(world,inspectedId).rolePeer
}

/** All assessments are interface interpretations, never invented quotations or Scout AI. */
export function buildPlayerScoutingDecision(input: {
  readonly own: boolean
  readonly rows: readonly ScoutingRosterComparisonRow[]
  readonly scouting: PlayerScoutingModel
  readonly comparatorName: string | null
  readonly subjectPosition: BasketballPosition
  readonly sharedPositions: readonly BasketballPosition[]
}): PlayerScoutingDecision {
  const {own,rows,scouting,comparatorName,subjectPosition,sharedPositions}=input
  const positionMatched = sharedPositions.length > 0
  const effectivePosition = sharedPositions.includes(subjectPosition) ? subjectPosition :
    sharedPositions[0] ?? subjectPosition
  const positionalKeys = new Set(positionEvidenceKeys(effectivePosition))
  const eligible = rows.filter(row=>row.subject!==null && row.low!==null && row.high!==null)
  const stronger = eligible.filter(row=>row.low! >= row.own+5)
    .sort((a,b)=>(b.low!-b.own)-(a.low!-a.own))
  const weaker = eligible.filter(row=>row.high! <= row.own-5)
    .sort((a,b)=>(a.high!-a.own)-(b.high!-b.own))
  const positional = eligible.filter(row=>positionalKeys.has(row.id))
  const posBetter = positional.filter(row=>row.low! >= row.own+5)
    .sort((a,b)=>(b.low!-b.own)-(a.low!-a.own))
  const posWorse = positional.filter(row=>row.high! <= row.own-5)
    .sort((a,b)=>(a.high!-a.own)-(b.high!-b.own))
  const reportCount = scouting.noteTimeline.length
  const suffix = comparatorName ?? 'your roster'
  const basis = own ? 'Direct roster ratings' : 'Scouting estimates and recorded reports'
  const base = {
    basis,
    strengths:posBetter.slice(0,2).map(row=>`${row.label}: +${row.low!-row.own} vs ${suffix}`),
    concerns:posWorse.slice(0,2).map(row=>`${row.label}: −${row.own-row.high!} vs ${suffix}`),
    confirmedAdvantageCount:stronger.length,
    confirmedConcernCount:weaker.length,
    comparableCount:eligible.length,
    evidenceCount:reportCount,
    uncertainComparableCount:eligible.filter(row=>row.high!-row.low! > 16).length,
    confidenceNote:own?'Verified roster ratings':'Scouting ranges, not Player Truth',
    position:effectivePosition,
    positionMatched,
    positionalComparableCount:positional.length,
    positionalEvidenceTotal:positionalKeys.size,
    positionalAdvantageCount:posBetter.length,
    positionalConcernCount:posWorse.length,
  }
  // The 80-rating comparison is available for exploratory study, but it must
  // never claim a sporting positional advantage for a PG vs C or SF vs PG.
  if (!positionMatched) return {
    ...base, headline:'CROSS-POSITION · NO FIT VERDICT',tone:'neutral',status:'insufficient',
    meaning:`You are comparing ${subjectPosition} with ${suffix} outside a shared playable position. Attribute differences are visible for exploration, but cannot justify a same-position recommendation.`,
    nextStep:'Choose a player who shares a primary or secondary position before drawing a sporting conclusion.',
  }
  if (positional.length < Math.ceil(positionalKeys.size*.65)) return {
    ...base, headline:own?'POSITION REVIEW · MORE DATA NEEDED':'SCOUT POSITION · MORE EVIDENCE',
    tone:'neutral',status:'insufficient',
    meaning:`Only ${positional.length}/${positionalKeys.size} relevant attributes for ${effectivePosition} can be compared with ${suffix}. The full 80-rating count is not a substitute for positional coverage.`,
    nextStep:own?'Choose another positional peer.':'Request scouting for the missing positional attributes.',
  }
  if (own) {
    if (posBetter.length >= 4 && posBetter.length >= posWorse.length+2) return {
      ...base,headline:'STRONG IN POSITION MATCHUP',tone:'positive',status:'supported',
      meaning:`${posBetter.length} advantages and ${posWorse.length} concerns in ${positional.length} relevant ${effectivePosition} attributes vs ${suffix}. Not a judgment of tactical role, starter status or entire squad quality.`,
      nextStep:'Review performance, development and actual role before deciding playing time.',
    }
    if (posWorse.length >= 4 && posWorse.length >= posBetter.length+2) return {
      ...base,headline:'POSITIONAL GAPS TO ADDRESS',tone:'caution',status:'supported',
      meaning:`${posWorse.length} weaknesses vs ${suffix} among the ${effectivePosition} evidence attributes. A different role could change which skills matter most.`,
      nextStep:'Review Development and actual performance; do not infer the player must leave.',
    }
    return {
      ...base,headline:'BALANCED POSITION MATCHUP',tone:'neutral',status:'supported',
      meaning:`${posBetter.length} advantages, ${posWorse.length} concerns across ${positional.length} relevant ${effectivePosition} attributes vs ${suffix}. This is positional evidence, not calculated squad-and-role fit.`,
      nextStep:'Inspect positional strengths and review the current role and game context.',
    }
  }
  if (reportCount===0) return {
    ...base,headline:'SCOUT FIRST · NO VERDICT',tone:'neutral',status:'insufficient',
    meaning:'No filed staff report supports a recruitment recommendation. Unknown values and role fit are not inferred from Player Truth.',
    nextStep:'Commission a scout report or watch a game.',
  }
  const reliability = scouting.statusPanel?.confidenceLabel.toLowerCase() ?? 'low'
  const broad = positional.filter(row=>row.high!-row.low! > 16).length
  // V1 uses unweighted position-important keys. A wide report interval,
  // unknown archetype or missing staff strength is insufficient for signing.
  const evidenceReady = positional.length >= Math.ceil(positionalKeys.size*.85) &&
    reliability==='high' && broad/positional.length<=.25 &&
    scouting.strengths.length>0 &&
    scouting.archetypeTitle!=='Insufficient scouting information'
  if (!evidenceReady) return {
    ...base,headline:'INTERESTING · VERIFY POSITIONAL CASE',tone:'neutral',status:'provisional',
    meaning:`Against ${suffix}: ${posBetter.length} robust advantages and ${posWorse.length} concerns in ${effectivePosition} attributes; ${broad} positional estimates are wide. Further proof of role, availability and competition rules is needed.`,
    nextStep:'Request targeted scouting, clarify the sporting role and check contractual/competition eligibility before contact.',
  }
  if (posBetter.length >= 4 && posBetter.length >= posWorse.length+2) return {
    ...base,headline:'POSITIONAL UPGRADE · REVIEW OPTIONS',tone:'positive',status:'supported',
    meaning:`The conservative scouting range outperforms ${suffix} in ${posBetter.length} position-relevant attributes. This only supports further investigation; tactical, squad-and-role fit, contract, cost and NBA/NCAA/FIBA eligibility remain unverified.`,
    nextStep:'Review the contact pathway and verify eligibility and club rights.',
  }
  if (posWorse.length>=4 && posWorse.length>=posBetter.length+2) return {
    ...base,headline:'NOT A CLEAR POSITIONAL UPGRADE',tone:'caution',status:'supported',
    meaning:`${posWorse.length} supported concerns in ${effectivePosition} attributes vs ${suffix}. May have value in a different role; do not infer that role here.`,
    nextStep:'Scout a complementary role or compare with another positional peer.',
  }
  return {
    ...base,headline:'POSITIONAL EVIDENCE MIXED',tone:'neutral',status:'provisional',
    meaning:`${posBetter.length} supported advantages and ${posWorse.length} concerns in the ${effectivePosition} evidence set vs ${suffix}. A signing recommendation remains premature.`,
    nextStep:'Confirm tactical role and collect more specific scouting evidence.',
  }
}
