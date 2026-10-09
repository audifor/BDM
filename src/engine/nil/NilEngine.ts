import { addDays, compareGameDates } from '@/domain/date'
import type { EcosystemId, PlayerId, TeamId } from '@/domain/ids'
import { defaultNilRules, type NilOpportunityType, type NilRules, type NilOpportunity, type NilDeal } from '@/domain/nil'
import { GameWorldValidationError, updateGameWorld, type GameWorld } from '@/domain/world'
import { isNilRestricted } from '@/engine/enforcement'

const hash = (value: string) => [...value].reduce((n, c) => ((n * 31) + c.charCodeAt(0)) >>> 0, 17)
const profileId = (ecosystemId: EcosystemId, teamId: TeamId, playerId: PlayerId) => `nil-profile:${ecosystemId}:${teamId}:${playerId}`
const collectiveId = (ecosystemId: EcosystemId, teamId: TeamId) => `collective:${ecosystemId}:${teamId}`
export function marketabilityForPlayer(world: GameWorld, playerId: PlayerId): number { const player = world.players[playerId]; if (!player) return 0; const ratings = Object.values(player.basketball.ratings); return Math.max(20, Math.min(95, Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length * .7 + hash(`${player.id}:${player.firstName}:${player.lastName}`) % 31))) }
export function ensureNcaaNil(world: GameWorld): GameWorld { const profiles = Object.values(world.nilProfilesById), collectives = Object.values(world.collectivesById), rules = { ...world.nilRulesByEcosystemId }, addProfiles: any[] = [], addCollectives: any[] = []; for (const competition of Object.values(world.competitions)) { const ecosystem = world.ecosystems[competition.ecosystemId]; if (ecosystem?.kind !== 'ncaaLike') continue; rules[ecosystem.id] ??= defaultNilRules(ecosystem.id); for (const teamId of competition.participantTeamIds) { const team = world.teams[teamId]!, cid = collectiveId(ecosystem.id, teamId); if (!collectives.some((item) => item.id === cid)) addCollectives.push({ id: cid, ecosystemId: ecosystem.id, programTeamId: teamId, name: `${team.name} Collective`, resourceCapacity: 100, resourcesRemaining: 100 }); for (const playerId of team.rosterPlayerIds) if (!profiles.some((item) => item.id === profileId(ecosystem.id, teamId, playerId))) addProfiles.push({ id: profileId(ecosystem.id, teamId, playerId), playerId, ecosystemId: ecosystem.id, programTeamId: teamId, marketability: marketabilityForPlayer(world, playerId) }) } }; return addProfiles.length || addCollectives.length || Object.keys(rules).length !== Object.keys(world.nilRulesByEcosystemId).length ? updateGameWorld(world, { nilRulesByEcosystemId: rules, nilProfiles: [...profiles, ...addProfiles], collectives: [...collectives, ...addCollectives] }) : world }
export function initializeNilProfile(world: GameWorld, playerId: PlayerId, teamId: TeamId, ecosystemId: EcosystemId): GameWorld { if (world.ecosystems[ecosystemId]?.kind !== 'ncaaLike') return world; const id = profileId(ecosystemId, teamId, playerId); if (world.nilProfilesById[id]) return world; return ensureNcaaNil(updateGameWorld(world, { nilRulesByEcosystemId: { ...world.nilRulesByEcosystemId, [ecosystemId]: world.nilRulesByEcosystemId[ecosystemId] ?? defaultNilRules(ecosystemId) }, nilProfiles: [...Object.values(world.nilProfilesById), { id, playerId, ecosystemId, programTeamId: teamId, marketability: marketabilityForPlayer(world, playerId) }] })) }
export function createNilOpportunity(world: GameWorld, playerId: PlayerId, type: NilOpportunityType = 'localEndorsement', collectiveIdValue?: string) {
  const planned = planNilOpportunity(world, playerId, type, collectiveIdValue)
  if (!planned.ok) return planned
  return { ok: true as const, opportunityId: planned.opportunity.id, value: updateGameWorld(world, { nilOpportunities: [...Object.values(world.nilOpportunitiesById), planned.opportunity] }) }
}

function planNilOpportunity(world: GameWorld, playerId: PlayerId, type: NilOpportunityType, collectiveIdValue?: string, ordinal?: number) {
  const profile = Object.values(world.nilProfilesById).find(item => item.playerId === playerId)
  if (!profile) return { ok: false as const, reason: 'NIL_PROFILE_UNAVAILABLE' }
  const rules = world.nilRulesByEcosystemId[profile.ecosystemId] ?? defaultNilRules(profile.ecosystemId)
  if (!rules.enabled || isNilRestricted(world, profile.programTeamId)) return { ok: false as const, reason: 'NIL_DISABLED' }
  const collective = collectiveIdValue === undefined ? undefined : world.collectivesById[collectiveIdValue]
  if (type === 'collectiveBacked' && (!rules.collectiveParticipation || !collective || collective.programTeamId !== profile.programTeamId)) return { ok: false as const, reason: 'COLLECTIVE_UNAVAILABLE' }
  const opportunity: NilOpportunity = {
    id: `nil-opportunity:${world.currentDate}:${playerId}:${type}:${ordinal ?? Object.keys(world.nilOpportunitiesById).length + 1}`,
    playerId, type, estimatedValue: Math.max(100, profile.marketability * (type === 'collectiveBacked' ? 20 : 12)),
    durationDays: rules.dealDurationDays, status: 'available', createdAt: world.currentDate, expiresAt: addDays(world.currentDate,7),
    ...(collective ? { collectiveId: collective.id, resourceCost: type === 'collectiveBacked' ? Math.max(5,Math.round(profile.marketability/4)) : undefined } : {}),
  }
  return { ok: true as const, opportunity }
}

export function acceptNilOpportunity(world: GameWorld, opportunityId: string) {
  const planned = planNilAcceptance(world, opportunityId)
  if (!planned.ok) return planned
  const collectives = Object.values(world.collectivesById).map(item => planned.collective && item.id === planned.collective.id ? planned.collective : item)
  return { ok: true as const, value: updateGameWorld(world, { collectives, nilOpportunities: Object.values(world.nilOpportunitiesById).map(item => item.id === opportunityId ? planned.opportunity : item), nilDeals: [...Object.values(world.nilDealsById), planned.deal] }) }
}

function planNilAcceptance(world: GameWorld, opportunityId: string, activeDealCount?: number) {
  const opportunity = world.nilOpportunitiesById[opportunityId]
  if (!opportunity || opportunity.status !== 'available') return { ok: false as const, reason: 'NIL_OPPORTUNITY_UNAVAILABLE' }
  if (compareGameDates(world.currentDate, opportunity.expiresAt) > 0) return { ok: false as const, reason: 'NIL_OPPORTUNITY_EXPIRED' }
  const profile = Object.values(world.nilProfilesById).find(item => item.playerId === opportunity.playerId)
  if (!profile) return { ok: false as const, reason: 'NIL_PROFILE_UNAVAILABLE' }
  const rules = world.nilRulesByEcosystemId[profile.ecosystemId] ?? defaultNilRules(profile.ecosystemId)
  const active = activeDealCount ?? Object.values(world.nilDealsById).filter(deal => deal.playerId === opportunity.playerId && deal.status === 'active').length
  if (active >= rules.maxActiveDeals) return { ok: false as const, reason: 'NIL_ACTIVE_DEAL_LIMIT' }
  let collective: GameWorld['collectivesById'][string] | undefined
  if (opportunity.collectiveId) {
    const existing = world.collectivesById[opportunity.collectiveId], cost = opportunity.resourceCost ?? 0
    if (!existing || existing.resourcesRemaining < cost) return { ok: false as const, reason: 'COLLECTIVE_RESOURCES_EXHAUSTED' }
    collective = { ...existing, resourcesRemaining: existing.resourcesRemaining-cost }
  }
  const deal: NilDeal = { id: `nil-deal:${opportunity.id}`, playerId: opportunity.playerId, opportunityId: opportunity.id, type: opportunity.type, value: opportunity.estimatedValue, startsAt: world.currentDate, endsAt: addDays(world.currentDate,opportunity.durationDays), status: 'active' }
  return { ok: true as const, opportunity: { ...opportunity, status: 'accepted' as const }, deal, collective }
}
export function progressNilLifecycle(world: GameWorld): GameWorld { const oldOpportunities = Object.values(world.nilOpportunitiesById), oldDeals = Object.values(world.nilDealsById), opportunities = oldOpportunities.map((item) => item.status === 'available' && compareGameDates(world.currentDate, item.expiresAt) > 0 ? { ...item, status: 'expired' as const } : item), deals = oldDeals.map((item) => item.status === 'active' && compareGameDates(world.currentDate, item.endsAt) > 0 ? { ...item, status: 'completed' as const } : item); return opportunities.some((item, index) => item !== oldOpportunities[index]) || deals.some((item, index) => item !== oldDeals[index]) ? updateGameWorld(world, { nilOpportunities: opportunities, nilDeals: deals }) : world }
export function progressAiNil(world: GameWorld): GameWorld {
  // Stage the same ordered commands in private copies, then publish once through
  // the canonical world boundary. All historical records remain in these maps.
  const opportunities = { ...world.nilOpportunitiesById }, deals = { ...world.nilDealsById }, collectives = { ...world.collectivesById }
  const view: GameWorld = { ...world, nilOpportunitiesById: opportunities, nilDealsById: deals, collectivesById: collectives }
  const activeDeals = new Map<PlayerId,number>()
  for (const deal of Object.values(deals)) if (deal.status === 'active') activeDeals.set(deal.playerId,(activeDeals.get(deal.playerId) ?? 0)+1)
  let ordinal = Object.keys(opportunities).length+1, createdCount = 0, acceptedCount = 0
  const userTeam = Object.values(world.teams).find(team => team.coachId === world.userCoachId)?.id
  for (const profile of Object.values(world.nilProfilesById).filter(item => item.programTeamId !== userTeam).sort((a,b) => b.marketability-a.marketability || a.playerId.localeCompare(b.playerId))) {
    const collective = Object.values(collectives).find(item => item.programTeamId === profile.programTeamId)
    const created = planNilOpportunity(view,profile.playerId,collective ? 'collectiveBacked' : 'localEndorsement',collective?.id,ordinal)
    if (!created.ok) continue
    ordinal++; createdCount++
    if (Object.hasOwn(opportunities,created.opportunity.id)) throw new GameWorldValidationError(`Duplicate nilOpportunities ID: ${created.opportunity.id}`)
    opportunities[created.opportunity.id] = created.opportunity
    const accepted = planNilAcceptance(view,created.opportunity.id,activeDeals.get(profile.playerId) ?? 0)
    if (!accepted.ok) continue
    acceptedCount++
    opportunities[accepted.opportunity.id] = accepted.opportunity
    if (Object.hasOwn(deals,accepted.deal.id)) throw new GameWorldValidationError(`Duplicate nilDeals ID: ${accepted.deal.id}`)
    deals[accepted.deal.id] = accepted.deal
    if (accepted.collective) collectives[accepted.collective.id] = accepted.collective
    activeDeals.set(profile.playerId,(activeDeals.get(profile.playerId) ?? 0)+1)
  }
  return createdCount === 0 ? world : updateGameWorld(world, { nilOpportunities: Object.values(opportunities), ...(acceptedCount > 0 ? { nilDeals: Object.values(deals), collectives: Object.values(collectives) } : {}) })
}
export function nilRecruitingAppeal(world: GameWorld, teamId: TeamId, ecosystemId: EcosystemId): number { const rules: NilRules = world.nilRulesByEcosystemId[ecosystemId] ?? defaultNilRules(ecosystemId); if (!rules.enabled || rules.recruitingAppealFactor === 0) return 0; const collective = Object.values(world.collectivesById).find((item) => item.ecosystemId === ecosystemId && item.programTeamId === teamId); return collective ? Math.round(collective.resourcesRemaining / collective.resourceCapacity * rules.recruitingAppealFactor) : 0 }
