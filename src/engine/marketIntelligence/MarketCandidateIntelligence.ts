import { calculateAge } from '@/domain/player'
import { getMarketKnowledge, type MarketKnowledge } from '@/domain/market'
import type { OrganizationKnowledge, OrganizationKnowledgeDimension } from '@/domain/knowledge'
import type { ClubStrategicMode } from '@/domain/clubStrategy'
import type { GameDate } from '@/domain/date'
import type { OrganizationId, PlayerId, TeamId } from '@/domain/ids'
import type { BasketballPosition } from '@/domain/primitives'
import type { GameWorld } from '@/domain/world'
import { getEcosystemForTeam, getFreeAgents, getPlayerRosterTeamId } from '@/domain/world'
import { getPlayerContractStatus } from '@/domain/contract'
import type { ClubNeed, ClubNeedRole } from '@/engine/clubNeeds'

export type CandidateFitBand = 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN'
export type CandidateDiscoverySource = 'ORGANIZATION_KNOWLEDGE' | 'MARKET_SIGNAL' | 'PUBLIC_FREE_AGENT_LIST'
export type CandidateAcquisitionContext = 'FREE_AGENT' | 'CONTRACTED' | 'TRADE_CONTEXT' | 'TRANSFER_CONTEXT' | 'RECRUITING_CONTEXT' | 'UNKNOWN'
export type CandidateAvailability = 'FREE_AGENT' | 'OPEN' | 'LISTENING' | 'NOT_FOR_SALE' | 'UNKNOWN'

export interface KnownCandidateDimension extends OrganizationKnowledgeDimension {
  readonly estimate: number
  readonly freshness: number
}

export interface MarketCandidateIntelligence {
  readonly playerId: PlayerId
  readonly name: string
  readonly discoverySources: readonly CandidateDiscoverySource[]
  readonly knowledgeStatus: 'WELL_KNOWN' | 'LIMITED'
  readonly knowledgeConfidence: CandidateFitBand
  readonly knownDimensions: Readonly<Record<string, KnownCandidateDimension>>
  readonly missingKnowledge: readonly string[]
  readonly knownPosition: { readonly primary: string; readonly secondary: readonly string[] }
  readonly age?: number
  readonly acquisitionContext: CandidateAcquisitionContext
  readonly currentTeam?: { readonly teamId: TeamId; readonly name: string }
  readonly contractStatus: 'FREE_AGENT' | 'UNDER_CONTRACT' | 'UNKNOWN'
  readonly availabilityStatus: CandidateAvailability
  readonly availabilitySignal?: { readonly source: 'AGENT' | 'CLUB_CONTACT' | 'MEDIA'; readonly confidence: number; readonly assessedAt: GameDate }
  readonly needFit: CandidateFitBand
  readonly positionFit: CandidateFitBand
  readonly roleFit: CandidateFitBand
  readonly strategyFit: CandidateFitBand
  readonly timelineFit: CandidateFitBand
  readonly financialContext: ClubNeed['financialContext']
  readonly financialFeasibility: 'NOT_ASSESSED'
  readonly uncertainty: 'LOW' | 'MODERATE' | 'HIGH'
  readonly reasons: readonly CandidateIntelligenceReason[]
  readonly blockers: readonly string[]
}

export type CandidateIntelligenceReason =
  | 'POSITION_MATCH'
  | 'SECONDARY_POSITION_MATCH'
  | 'PRIMARY_HANDLER_EVIDENCE'
  | 'SHOOTING_EVIDENCE'
  | 'RIM_PROTECTION_EVIDENCE'
  | 'AGE_TIMELINE_FIT'
  | 'FREE_AGENT'
  | 'MARKET_SIGNAL'
  | 'KNOWN_BY_SCOUTING'
  | 'KNOWN_BY_ORGANIZATION'
  | 'HIGH_KNOWLEDGE_CONFIDENCE'
  | 'LOW_KNOWLEDGE_CONFIDENCE'
  | 'TEMPORARY_COVER_FIT'

export interface MarketCandidateAssessment {
  readonly teamId: TeamId
  readonly perspective: 'ORGANIZATION_KNOWLEDGE' | 'USER_ANALYTICS'
  readonly need: ClubNeed
  readonly strategy: ClubStrategicMode
  readonly candidates: readonly MarketCandidateIntelligence[]
  readonly knowledgeStatus: 'CANDIDATES_DISTINGUISHED' | 'MARKET_KNOWLEDGE_INSUFFICIENT'
}

const BASKETBALL_DIMENSIONS = ['finishing', 'shooting', 'creation', 'perimeterDefense', 'interiorDefense', 'rebounding', 'physical'] as const
const KNOWN_DIMENSIONS = new Set<string>([...BASKETBALL_DIMENSIONS, 'potential:physical'])
const ROLE_DIMENSION: Readonly<Record<ClubNeedRole, string>> = {
  PRIMARY_HANDLING: 'creation',
  SPACING: 'shooting',
  RIM_PROTECTION: 'interiorDefense',
}
const FIT_ORDER: Readonly<Record<CandidateFitBand, number>> = { HIGH: 0, MODERATE: 1, LOW: 2, UNKNOWN: 3 }
const AVAILABILITY_ORDER: Readonly<Record<CandidateAvailability, number>> = { FREE_AGENT: 0, OPEN: 1, LISTENING: 2, UNKNOWN: 3, NOT_FOR_SALE: 4 }

/** Pure, non-persistent candidate assessment. It reads public market facts and the club's own knowledge only. */
export function assessMarketCandidatesForNeed(world: GameWorld, teamId: TeamId, need: ClubNeed, strategy: ClubStrategicMode): MarketCandidateAssessment {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown Team ${teamId}`)

  const organizationId = team.organizationId
  const knowledgeByPlayer = consolidateOrganizationKnowledge(world.organizationKnowledge, organizationId)
  const marketByPlayer = consolidateMarketKnowledge(world.marketKnowledge, organizationId)
  const freeAgentIds = new Set(getFreeAgents(world).map((player) => player.id).filter((playerId) => !isDraftOrRecruitProspect(world, playerId)))
  const discoverable = new Set<PlayerId>([
    ...knowledgeByPlayer.keys(),
    ...marketByPlayer.keys(),
    ...freeAgentIds,
  ])
  const candidates = [...discoverable]
    .filter((playerId) => playerId !== undefined && world.players[playerId] !== undefined && !team.rosterPlayerIds.includes(playerId))
    .filter((playerId) => !isNcaaRosterPlayer(world, playerId))
    .map((playerId) => assessCandidate(world, teamId, organizationId, need, strategy, playerId, knowledgeByPlayer.get(playerId), marketByPlayer.get(playerId), freeAgentIds.has(playerId)))
    .sort(compareCandidates)

  return Object.freeze({
    teamId,
    perspective: team.coachId === world.userCoachId ? 'USER_ANALYTICS' : 'ORGANIZATION_KNOWLEDGE',
    need,
    strategy,
    candidates: Object.freeze(candidates),
    knowledgeStatus: candidates.some((candidate) => candidate.knowledgeConfidence === 'HIGH' || candidate.knowledgeConfidence === 'MODERATE')
      ? 'CANDIDATES_DISTINGUISHED'
      : 'MARKET_KNOWLEDGE_INSUFFICIENT',
  })
}

function assessCandidate(
  world: GameWorld,
  teamId: TeamId,
  organizationId: OrganizationId,
  need: ClubNeed,
  strategy: ClubStrategicMode,
  playerId: PlayerId,
  organizationKnowledge: OrganizationKnowledge | undefined,
  marketKnowledge: ReturnType<typeof getMarketKnowledge>,
  publicFreeAgent: boolean,
): MarketCandidateIntelligence {
  const player = world.players[playerId]!
  const rawDimensions = organizationKnowledge?.dimensions ?? {}
  const knownDimensions = Object.fromEntries(Object.entries(rawDimensions)
    .filter((entry): entry is [string, OrganizationKnowledgeDimension & { estimate: number }] => KNOWN_DIMENSIONS.has(entry[0]) && entry[1].estimate !== undefined)
    .map(([key, finding]) => [key, { ...finding, freshness: freshness(finding.assessedAt, world.currentDate) }]))
  const relevantFindings = BASKETBALL_DIMENSIONS.flatMap((dimension) => knownDimensions[dimension] === undefined ? [] : [knownDimensions[dimension]!])
  const evidenceStrength = mean(relevantFindings.map((finding) => finding.coverage * finding.confidence * finding.freshness))
  const knowledgeConfidence: CandidateFitBand = relevantFindings.length === 0 ? 'LOW'
    : relevantFindings.length >= 3 && evidenceStrength >= 0.7 ? 'HIGH'
      : relevantFindings.length >= 1 && evidenceStrength >= 0.4 ? 'MODERATE'
        : 'LOW'
  const missingKnowledge = [...BASKETBALL_DIMENSIONS.filter((dimension) => knownDimensions[dimension] === undefined), 'medical confidence']
  const primaryPosition = player.basketball.primaryPosition
  const secondaryPositions = player.basketball.secondaryPositions ?? []
  const requestedPosition: BasketballPosition | undefined = need.targetPosition ?? temporaryCoverPosition(world, teamId, need)
  const positionFit = requestedPosition === undefined ? 'UNKNOWN'
    : primaryPosition === requestedPosition ? 'HIGH'
      : secondaryPositions.includes(requestedPosition) ? 'MODERATE'
        : 'LOW'
  const roleFit = need.targetRole === undefined ? 'UNKNOWN' : fitBandForKnowledgeDimension(knownDimensions[ROLE_DIMENSION[need.targetRole]])
  const needFit = combineNeedFit(requestedPosition === undefined ? undefined : positionFit, need.targetRole === undefined ? undefined : roleFit)
  const age = calculateAge(player.bio.dateOfBirth, world.currentDate)
  const acquisition = acquisitionContext(world, teamId, playerId, publicFreeAgent)
  const currentTeamId = getPlayerRosterTeamId(world, playerId)
  const availabilityStatus = publicFreeAgent ? 'FREE_AGENT' : marketKnowledge?.availability ?? 'UNKNOWN'
  const timelineFit = timelineFitForNeed(need, age, publicFreeAgent, marketKnowledge?.availability)
  const strategyFit = strategyFitForCandidate(strategy, need, roleFit, knownDimensions, age)
  const reasons: CandidateIntelligenceReason[] = []
  if (requestedPosition !== undefined && primaryPosition === requestedPosition) reasons.push('POSITION_MATCH')
  else if (requestedPosition !== undefined && secondaryPositions.includes(requestedPosition)) reasons.push('SECONDARY_POSITION_MATCH')
  if (need.targetRole !== undefined && knownDimensions[ROLE_DIMENSION[need.targetRole]] !== undefined) reasons.push(roleEvidenceReason(need.targetRole))
  if (organizationKnowledge !== undefined) reasons.push(Object.values(knownDimensions).some((finding) => finding.provenance === 'scoutReport') ? 'KNOWN_BY_SCOUTING' : 'KNOWN_BY_ORGANIZATION')
  if (marketKnowledge !== undefined) reasons.push('MARKET_SIGNAL')
  if (knowledgeConfidence === 'HIGH') reasons.push('HIGH_KNOWLEDGE_CONFIDENCE')
  if (knowledgeConfidence === 'LOW') reasons.push('LOW_KNOWLEDGE_CONFIDENCE')
  if (publicFreeAgent) reasons.push('FREE_AGENT')
  if (need.temporalScope === 'TEMPORARY' && timelineFit === 'HIGH') reasons.push('TEMPORARY_COVER_FIT')
  if (age !== undefined && need.temporalScope === 'STRUCTURAL') reasons.push('AGE_TIMELINE_FIT')
  const contractStatus = publicFreeAgent ? 'FREE_AGENT' : hasCanonicalActiveContract(world, playerId) ? 'UNDER_CONTRACT' : 'UNKNOWN'

  return Object.freeze({
    playerId,
    name: `${player.firstName} ${player.lastName}`,
    discoverySources: Object.freeze([
      ...(organizationKnowledge === undefined ? [] : ['ORGANIZATION_KNOWLEDGE' as const]),
      ...(marketKnowledge === undefined ? [] : ['MARKET_SIGNAL' as const]),
      ...(publicFreeAgent ? ['PUBLIC_FREE_AGENT_LIST' as const] : []),
    ]),
    knowledgeStatus: knowledgeConfidence === 'HIGH' ? 'WELL_KNOWN' : 'LIMITED',
    knowledgeConfidence,
    knownDimensions: Object.freeze(knownDimensions),
    missingKnowledge: Object.freeze(missingKnowledge),
    knownPosition: Object.freeze({ primary: primaryPosition, secondary: Object.freeze([...secondaryPositions]) }),
    age,
    acquisitionContext: acquisition,
    ...(currentTeamId === undefined ? {} : { currentTeam: { teamId: currentTeamId, name: world.teams[currentTeamId]?.name ?? 'Unknown team' } }),
    contractStatus,
    availabilityStatus,
    ...(marketKnowledge === undefined ? {} : { availabilitySignal: { source: marketKnowledge.source, confidence: marketKnowledge.confidence, assessedAt: marketKnowledge.assessedAt } }),
    needFit,
    positionFit,
    roleFit,
    strategyFit,
    timelineFit,
    financialContext: need.financialContext,
    financialFeasibility: 'NOT_ASSESSED',
    uncertainty: knowledgeConfidence === 'HIGH' ? 'LOW' : knowledgeConfidence === 'MODERATE' ? 'MODERATE' : 'HIGH',
    reasons: Object.freeze(reasons),
    blockers: Object.freeze([
      ...(contractStatus === 'UNDER_CONTRACT' && availabilityStatus === 'UNKNOWN' ? ['CONTRACTED_PLAYER_AVAILABILITY_UNKNOWN'] : []),
      ...(needFit === 'UNKNOWN' ? ['NEED_FIT_EVIDENCE_INSUFFICIENT'] : []),
    ]),
  })
}

function compareCandidates(a: MarketCandidateIntelligence, b: MarketCandidateIntelligence): number {
  return FIT_ORDER[a.needFit] - FIT_ORDER[b.needFit]
    || FIT_ORDER[a.positionFit] - FIT_ORDER[b.positionFit]
    || FIT_ORDER[a.roleFit] - FIT_ORDER[b.roleFit]
    || FIT_ORDER[a.strategyFit] - FIT_ORDER[b.strategyFit]
    || FIT_ORDER[a.timelineFit] - FIT_ORDER[b.timelineFit]
    || FIT_ORDER[a.knowledgeConfidence] - FIT_ORDER[b.knowledgeConfidence]
    || AVAILABILITY_ORDER[a.availabilityStatus] - AVAILABILITY_ORDER[b.availabilityStatus]
    || a.playerId.localeCompare(b.playerId)
}

function fitBandForKnowledgeDimension(finding: KnownCandidateDimension | undefined): CandidateFitBand {
  if (finding === undefined || finding.coverage * finding.confidence * finding.freshness < 0.4) return 'UNKNOWN'
  const uncertainty = (finding.uncertainty ?? 20) + Math.round((1 - finding.freshness) * 5)
  const lowerBound = Math.max(0, finding.estimate - uncertainty)
  const upperBound = Math.min(100, finding.estimate + uncertainty)
  if (lowerBound >= 60) return 'HIGH'
  if (upperBound < 50) return 'LOW'
  return 'MODERATE'
}

function consolidateOrganizationKnowledge(records: readonly OrganizationKnowledge[], organizationId: OrganizationId): Map<PlayerId, OrganizationKnowledge> {
  const grouped = new Map<PlayerId, OrganizationKnowledge[]>()
  for (const record of records.filter((item) => item.organizationId === organizationId)) {
    const existing = grouped.get(record.subjectPlayerId) ?? []
    existing.push(record)
    grouped.set(record.subjectPlayerId, existing)
  }
  return new Map([...grouped].map(([playerId, playerRecords]) => {
    const dimensions: Record<string, OrganizationKnowledgeDimension> = {}
    for (const dimension of new Set(playerRecords.flatMap((record) => Object.keys(record.dimensions)))) {
      const candidates = playerRecords.flatMap((record) => record.dimensions[dimension] === undefined ? [] : [record.dimensions[dimension]!])
      candidates.sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)
        || (b.coverage * b.confidence) - (a.coverage * a.confidence)
        || (a.uncertainty ?? Number.POSITIVE_INFINITY) - (b.uncertainty ?? Number.POSITIVE_INFINITY)
        || a.provenance.localeCompare(b.provenance)
        || (a.estimate ?? Number.POSITIVE_INFINITY) - (b.estimate ?? Number.POSITIVE_INFINITY))
      const selected = candidates[0]
      if (selected !== undefined) dimensions[dimension] = selected
    }
    return [playerId, { organizationId, subjectPlayerId: playerId, dimensions }]
  }))
}

function consolidateMarketKnowledge(records: readonly MarketKnowledge[], organizationId: OrganizationId): Map<PlayerId, MarketKnowledge> {
  const grouped = new Map<PlayerId, MarketKnowledge[]>()
  for (const record of records.filter((item) => item.organizationId === organizationId)) {
    const existing = grouped.get(record.playerId) ?? []
    existing.push(record)
    grouped.set(record.playerId, existing)
  }
  return new Map([...grouped].map(([playerId, playerRecords]) => {
    playerRecords.sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)
      || b.confidence - a.confidence
      || a.source.localeCompare(b.source)
      || (a.availability ?? 'UNKNOWN').localeCompare(b.availability ?? 'UNKNOWN'))
    return [playerId, playerRecords[0]!]
  }))
}

function roleEvidenceReason(role: ClubNeedRole): CandidateIntelligenceReason {
  return role === 'PRIMARY_HANDLING' ? 'PRIMARY_HANDLER_EVIDENCE' : role === 'SPACING' ? 'SHOOTING_EVIDENCE' : 'RIM_PROTECTION_EVIDENCE'
}

function combineNeedFit(positionFit: CandidateFitBand | undefined, roleFit: CandidateFitBand | undefined): CandidateFitBand {
  const required = [positionFit, roleFit].filter((value): value is CandidateFitBand => value !== undefined)
  if (required.length === 0 || required.includes('UNKNOWN')) return 'UNKNOWN'
  if (required.includes('LOW')) return 'LOW'
  if (required.every((value) => value === 'HIGH')) return 'HIGH'
  return 'MODERATE'
}

function timelineFitForNeed(need: ClubNeed, age: number | undefined, publicFreeAgent: boolean, availability: 'NOT_FOR_SALE' | 'LISTENING' | 'OPEN' | undefined): CandidateFitBand {
  if (need.temporalScope === 'TEMPORARY') {
    if (availability === 'NOT_FOR_SALE') return 'LOW'
    return publicFreeAgent ? 'HIGH' : 'UNKNOWN'
  }
  if (need.temporalScope !== 'STRUCTURAL' || age === undefined) return 'UNKNOWN'
  return age <= 23 ? 'HIGH' : age <= 31 ? 'MODERATE' : 'LOW'
}

function strategyFitForCandidate(strategy: ClubStrategicMode, need: ClubNeed, roleFit: CandidateFitBand, dimensions: Readonly<Record<string, KnownCandidateDimension>>, age: number | undefined): CandidateFitBand {
  if (strategy === 'CONTEND' || strategy === 'COMPETE') return need.targetRole === undefined ? 'UNKNOWN' : roleFit
  if (strategy === 'DEVELOP' || strategy === 'REBUILD') {
    if (age === undefined || age > 23) return 'UNKNOWN'
    const potential = Object.entries(dimensions).filter(([dimension]) => dimension.startsWith('potential:'))
    if (potential.length === 0) return 'UNKNOWN'
    const potentialFits = potential.map(([, finding]) => fitBandForKnowledgeDimension(finding))
    if (potentialFits.includes('HIGH')) return 'HIGH'
    if (potentialFits.every((fit) => fit === 'LOW')) return 'LOW'
    return 'MODERATE'
  }
  return 'UNKNOWN'
}

function acquisitionContext(world: GameWorld, targetTeamId: TeamId, playerId: PlayerId, publicFreeAgent: boolean): CandidateAcquisitionContext {
  if (publicFreeAgent) return 'FREE_AGENT'
  if (!hasCanonicalActiveContract(world, playerId)) return 'UNKNOWN'
  const rosterTeamId = getPlayerRosterTeamId(world, playerId)
  if (rosterTeamId === undefined) return 'CONTRACTED'
  const sourceEcosystem = getEcosystemForTeam(world, rosterTeamId)
  const targetEcosystem = getEcosystemForTeam(world, targetTeamId)
  if (sourceEcosystem === undefined || targetEcosystem === undefined) return 'CONTRACTED'
  if (sourceEcosystem.kind === 'ncaaLike') return 'RECRUITING_CONTEXT'
  if (sourceEcosystem.id !== targetEcosystem.id) return 'TRANSFER_CONTEXT'
  const hasActiveTradeRules = Object.values(world.seasons).some((season) => {
    const competition = world.competitions[season.competitionId]
    const participants = season.participantTeamIds ?? competition?.participantTeamIds ?? []
    return competition?.ecosystemId === targetEcosystem.id
      && participants.includes(targetTeamId)
      && participants.includes(rosterTeamId)
      && world.tradeRulesBySeasonId[season.id] !== undefined
      && world.currentDate >= season.startDate
      && world.currentDate <= season.endDate
  })
  return hasActiveTradeRules ? 'TRADE_CONTEXT' : 'CONTRACTED'
}

function hasCanonicalActiveContract(world: GameWorld, playerId: PlayerId): boolean {
  return Object.values(world.contractsById).some((contract) => contract.playerId === playerId
    && ['active', 'scheduled'].includes(getPlayerContractStatus(contract, world.currentDate)))
}

function isNcaaRosterPlayer(world: GameWorld, playerId: PlayerId): boolean {
  const teamId = getPlayerRosterTeamId(world, playerId)
  return teamId === undefined ? false : getEcosystemForTeam(world, teamId)?.kind === 'ncaaLike'
}

function isDraftOrRecruitProspect(world: GameWorld, playerId: PlayerId): boolean {
  return Object.values(world.draftsById).some((draft) => draft.prospectPlayerIds.includes(playerId))
    || Object.values(world.recruitProfilesById).some((profile) => profile.playerId === playerId)
}

function temporaryCoverPosition(world: GameWorld, teamId: TeamId, need: ClubNeed): BasketballPosition | undefined {
  if (need.kind !== 'TEMPORARY_COVER') return undefined
  return need.relatedPlayerIds.map((playerId) => world.players[playerId])
    .find((player) => player !== undefined && world.teams[teamId]!.rosterPlayerIds.includes(player.id))?.basketball.primaryPosition
}

function freshness(assessedAt: GameDate, currentDate: GameDate): number {
  const days = Math.max(0, (Date.parse(`${currentDate}T00:00:00Z`) - Date.parse(`${assessedAt}T00:00:00Z`)) / 86_400_000)
  return Math.max(0, 1 - days / 365)
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}
