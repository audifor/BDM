import { getRelationshipDimensions, relationshipKey } from '@/domain/relationships'
import { responsibilityDefinition } from '@/domain/responsibility'
import { calculateStaffRoleProficiencyByRoleId, staffRoleDefinition } from '@/domain/staff'
import { staffReputationScore } from '@/domain/staffReputation'
import { getStaffAssignment, type GameWorld } from '@/domain/world'
import type { StaffHumanContext } from '@/domain/staffHumanState'

export interface StaffPoliticalInfluence {
  readonly staffId: StaffHumanContext['staffId']
  readonly teamId: StaffHumanContext['teamId']
  readonly formalAuthority: number
  readonly responsibilityAuthority: number
  readonly leadershipAccess: number
  readonly professionalCredibility: number
  readonly networkBacking: number
  readonly tenureWeight: number
  readonly overall: number
}

export const STAFF_POLITICAL_INFLUENCE_TUNING = Object.freeze({
  overallWeights: { formalAuthority: 0.28, responsibilityAuthority: 0.25, leadershipAccess: 0.15, professionalCredibility: 0.22, networkBacking: 0.07, tenureWeight: 0.03 },
  tenureMonthsForMaximum: 60,
})

export const STAFF_POLITICAL_INFLUENCE_BANDS = ['PERIPHERAL', 'LIMITED', 'ESTABLISHED', 'INFLUENTIAL', 'CENTRAL'] as const
export type StaffPoliticalInfluenceBand = typeof STAFF_POLITICAL_INFLUENCE_BANDS[number]

/**
 * Ephemeral batch projection for the weekly Reality pass. It indexes only canonical sparse rows;
 * it is deliberately not GameWorld state and has no save representation.
 */
export interface StaffPoliticalInfluenceIndex {
  readonly responsibilityAuthorityByStaffId: Readonly<Record<string, number>>
  readonly leadershipAccessByStaffId: Readonly<Record<string, number>>
  readonly leadershipActorByStaffId: Readonly<Record<string, string>>
  readonly leadershipRelationshipByStaffId: Readonly<Record<string, true>>
  readonly networkBackingByStaffId: Readonly<Record<string, number>>
  readonly relationshipRowsScanned: number
}

export function classifyStaffPoliticalInfluenceBand(overall: number): StaffPoliticalInfluenceBand {
  if (overall < 25) return 'PERIPHERAL'
  if (overall < 45) return 'LIMITED'
  if (overall < 65) return 'ESTABLISHED'
  if (overall < 82) return 'INFLUENTIAL'
  return 'CENTRAL'
}

/** Pure political-structure projection. It deliberately never reads Human State or Career Autonomy. */
export function buildStaffPoliticalInfluenceIndex(world: GameWorld): StaffPoliticalInfluenceIndex {
  const staffTeamById: Record<string, string> = {}
  const leadershipActorByStaffId: Record<string, string> = {}
  const leadershipRelationshipByStaffId: Record<string, true> = {}
  for (const assignment of Object.values(world.teamStaffAssignmentsById)) {
    const employment = world.staffEmploymentByStaffId[assignment.staffPersonId]
    if (employment?.status !== 'employed' || employment.teamId !== assignment.teamId) continue
    staffTeamById[assignment.staffPersonId] = assignment.teamId
    const leaderId = world.teams[assignment.teamId]?.coachId
    if (leaderId !== undefined) {
      leadershipActorByStaffId[assignment.staffPersonId] = leaderId
      if (world.relationshipsByKey[relationshipKey(assignment.staffPersonId, leaderId)] !== undefined) leadershipRelationshipByStaffId[assignment.staffPersonId] = true
    }
  }

  const responsibilityAuthorityByStaffId: Record<string, number> = {}
  const responsibilityDomainsByStaffId: Record<string, Set<string>> = {}
  for (const responsibility of Object.values(world.responsibilitiesById)) {
    const staffId = responsibility.holderStaffId
    if (staffId === undefined || staffTeamById[staffId] !== responsibility.teamId) continue
    const definition = responsibilityDefinition(responsibility.kind)
    const modeMultiplier = responsibility.mode === 'delegated' ? 1 : responsibility.mode === 'advisory' ? 0.7 : 0
    responsibilityAuthorityByStaffId[staffId] = (responsibilityAuthorityByStaffId[staffId] ?? 0) + definition.capacityCost * 15 * modeMultiplier
    const domains = responsibilityDomainsByStaffId[staffId] ??= new Set()
    domains.add(definition.domain)
  }
  for (const [staffId, domains] of Object.entries(responsibilityDomainsByStaffId)) responsibilityAuthorityByStaffId[staffId] = clamp((responsibilityAuthorityByStaffId[staffId] ?? 0) + domains.size * 6)

  const leadershipAccessByStaffId: Record<string, number> = Object.fromEntries(Object.entries(leadershipActorByStaffId).map(([staffId, leaderId]) => [staffId, leadershipAccessFor(world, staffId, leaderId)]))
  const networkTotals: Record<string, { total: number; count: number }> = {}
  const relationships = Object.values(world.relationshipsByKey)
  for (const profile of relationships) {
    const sourceTeamId = staffTeamById[profile.sourceId]
    const targetTeamId = staffTeamById[profile.targetId]
    // Backing is directional: an active same-team Staff peer must support the target Staff member.
    if (sourceTeamId === undefined || sourceTeamId !== targetTeamId) continue
    const score = networkScore(profile)
    const accumulator = networkTotals[profile.targetId] ?? (networkTotals[profile.targetId] = { total: 0, count: 0 })
    accumulator.total += score; accumulator.count += 1
  }
  const networkBackingByStaffId = Object.fromEntries(Object.entries(networkTotals).map(([staffId, value]) => [staffId, clamp(value.total / value.count)]))
  return { responsibilityAuthorityByStaffId, leadershipAccessByStaffId, leadershipActorByStaffId, leadershipRelationshipByStaffId, networkBackingByStaffId, relationshipRowsScanned: relationships.length }
}

/** Pure political-structure projection. It deliberately never reads Human State or Career Autonomy. */
export function deriveStaffPoliticalInfluence(world: GameWorld, context: StaffHumanContext, index = buildStaffPoliticalInfluenceIndex(world)): StaffPoliticalInfluence {
  const assignment = getStaffAssignment(world, context.staffId)
  const activeAssignment = assignment?.teamId === context.teamId ? assignment : undefined
  const role = activeAssignment === undefined ? undefined : staffRoleDefinition(activeAssignment.role)
  const formalAuthority = role === undefined ? 0 : seniorityAuthority(role.seniority)
  const responsibilityAuthority = index.responsibilityAuthorityByStaffId[context.staffId] ?? 0
  const leadershipAccess = index.leadershipAccessByStaffId[context.staffId] ?? 50
  const staff = world.staffPeopleById[context.staffId]
  const proficiency = staff === undefined || activeAssignment === undefined ? 0 : calculateStaffRoleProficiencyByRoleId(staff, activeAssignment.role)
  const reputation = world.staffReputationProfilesByStaffId[context.staffId]
  const professionalCredibility = clamp(proficiency * 0.6 + (reputation === undefined ? 50 : staffReputationScore(reputation) / 10) * 0.4)
  const networkBacking = index.networkBackingByStaffId[context.staffId] ?? 50
  const tenureWeight = tenureFor(context.startedOn, world.currentDate)
  const weights = STAFF_POLITICAL_INFLUENCE_TUNING.overallWeights
  const overall = clamp(formalAuthority * weights.formalAuthority + responsibilityAuthority * weights.responsibilityAuthority + leadershipAccess * weights.leadershipAccess + professionalCredibility * weights.professionalCredibility + networkBacking * weights.networkBacking + tenureWeight * weights.tenureWeight)
  return { staffId: context.staffId, teamId: context.teamId, formalAuthority, responsibilityAuthority, leadershipAccess, professionalCredibility, networkBacking, tenureWeight, overall }
}

function seniorityAuthority(seniority: 'junior' | 'standard' | 'senior' | 'director'): number {
  return seniority === 'director' ? 90 : seniority === 'senior' ? 70 : seniority === 'standard' ? 50 : 30
}

function leadershipAccessFor(world: GameWorld, staffId: string, leaderId: string): number {
  const dimensions = getRelationshipDimensions(world.relationshipsByKey[relationshipKey(staffId, leaderId)])
  return professionalFacetScore([dimensions.trust, dimensions.professionalRespect, dimensions.communicationQuality, dimensions.perceivedSupport, dimensions.professionalAlignment])
}

function networkScore(profile: import('@/domain/relationships').RelationshipProfile): number { const dimensions = getRelationshipDimensions(profile); return professionalFacetScore([dimensions.trust, dimensions.professionalRespect, dimensions.collaboration, dimensions.perceivedSupport, dimensions.professionalAlignment]) }

function professionalFacetScore(values: readonly number[]): number { return clamp(50 + values.reduce((sum, value) => sum + value, 0) / values.length / 2) }
function tenureFor(startedOn: string, currentDate: string): number { return clamp(monthsBetween(startedOn, currentDate) / STAFF_POLITICAL_INFLUENCE_TUNING.tenureMonthsForMaximum * 100) }
function monthsBetween(from: string, to: string): number { const [fy, fm] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number); return Math.max(0, (ty! - fy!) * 12 + (tm! - fm!)) }
function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))) }
