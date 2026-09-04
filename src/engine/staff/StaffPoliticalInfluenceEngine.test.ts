import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import { relationshipKey } from '@/domain/relationships'
import { staffHumanContextIdFor, createStaffHumanContext } from '@/domain/staffHumanState'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { buildStaffPoliticalInfluenceIndex, classifyStaffPoliticalInfluenceBand, deriveStaffPoliticalInfluence } from './StaffPoliticalInfluenceEngine'

function baseWorld(): GameWorld { return createNewGame() }
function staffFor(world: GameWorld, teamId: TeamId, role: string): StaffPersonId { return getTeamStaffAssignments(world, teamId).find((item) => item.role === role)!.staffPersonId }
function contextFor(world: GameWorld, staffId: StaffPersonId, teamId: TeamId, startedOn = world.currentDate) { return createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, startedOn), staffId, teamId, startedOn }) }
function withProfessionalRelationship(world: GameWorld, staffId: StaffPersonId, targetId: string, value: number): GameWorld {
  const dimensions = { trust: value, professionalRespect: value, communicationQuality: value, collaboration: value, personalCloseness: 0, perceivedSupport: value, reliability: 0, professionalAlignment: value }
  return updateGameWorld(world, { relationshipsByKey: { ...world.relationshipsByKey, [relationshipKey(staffId, targetId)]: { sourceId: staffId, targetId, value: 0, events: [], dimensions } } })
}

describe('StaffPoliticalInfluenceEngine', () => {
  it('uses canonical role seniority for monotonic formal authority', () => {
    const world = baseWorld(); const teamId = Object.values(world.teams)[0]!.id; const staffId = staffFor(world, teamId, 'assistantCoach')
    const assignment = getTeamStaffAssignments(world, teamId).find((item) => item.staffPersonId === staffId)!
    const withRole = (role: typeof assignment.role) => ({ ...world, teamStaffAssignmentsById: { ...world.teamStaffAssignmentsById, [assignment.id]: { ...assignment, role } } }) as GameWorld
    const director = deriveStaffPoliticalInfluence(withRole('headScout'), contextFor(world, staffId, teamId))
    const senior = deriveStaffPoliticalInfluence(withRole('associateCoach'), contextFor(world, staffId, teamId))
    const standard = deriveStaffPoliticalInfluence(withRole('assistantCoach'), contextFor(world, staffId, teamId))
    const junior = deriveStaffPoliticalInfluence(withRole('shootingCoach'), contextFor(world, staffId, teamId))
    expect(director.formalAuthority).toBeGreaterThanOrEqual(senior.formalAuthority)
    expect(senior.formalAuthority).toBeGreaterThanOrEqual(standard.formalAuthority)
    expect(standard.formalAuthority).toBeGreaterThanOrEqual(junior.formalAuthority)
  })

  it('uses real delegated responsibility rows and never synthesizes absent ones', () => {
    const world = baseWorld(); const teamId = Object.values(world.teams)[0]!.id; const staffId = staffFor(world, teamId, 'assistantCoach'); const context = contextFor(world, staffId, teamId)
    const without = deriveStaffPoliticalInfluence(world, context)
    const delegated = setTeamResponsibility(world, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    const withResponsibility = deriveStaffPoliticalInfluence(delegated, context)
    expect(withResponsibility.responsibilityAuthority).toBeGreaterThan(without.responsibilityAuthority)
    expect(Object.keys(delegated.responsibilitiesById)).toHaveLength(Object.keys(world.responsibilitiesById).length)
  })

  it('reads only directed professional leadership facets; legacy and personal closeness stay neutral', () => {
    const world = baseWorld(); const teamId = Object.values(world.teams)[0]!.id; const staffId = staffFor(world, teamId, 'assistantCoach'); const coachId = world.teams[teamId]!.coachId!
    const neutral = deriveStaffPoliticalInfluence(world, contextFor(world, staffId, teamId)).leadershipAccess
    const positive = deriveStaffPoliticalInfluence(withProfessionalRelationship(world, staffId, coachId, 80), contextFor(world, staffId, teamId)).leadershipAccess
    const negative = deriveStaffPoliticalInfluence(withProfessionalRelationship(world, staffId, coachId, -80), contextFor(world, staffId, teamId)).leadershipAccess
    const closenessOnly = updateGameWorld(world, { relationshipsByKey: { [relationshipKey(staffId, coachId)]: { sourceId: staffId, targetId: coachId, value: 0, events: [], dimensions: { trust: 0, professionalRespect: 0, communicationQuality: 0, collaboration: 0, personalCloseness: 100, perceivedSupport: 0, reliability: 0, professionalAlignment: 0 } } } })
    expect(positive).toBeGreaterThan(neutral); expect(negative).toBeLessThan(neutral)
    expect(deriveStaffPoliticalInfluence(closenessOnly, contextFor(world, staffId, teamId)).leadershipAccess).toBe(neutral)
  })

  it('derives sparse network backing and bounded tenure without creating relationship rows', () => {
    const world = baseWorld(); const teamId = Object.values(world.teams)[0]!.id; const staffId = staffFor(world, teamId, 'assistantCoach'); const peerId = staffFor(world, teamId, 'regionalScout')
    const positive = withProfessionalRelationship(world, peerId, staffId, 70)
    const current = deriveStaffPoliticalInfluence(positive, contextFor(positive, staffId, teamId))
    const veteran = deriveStaffPoliticalInfluence(positive, contextFor(positive, staffId, teamId, '2020-01-01' as never))
    expect(current.networkBacking).toBeGreaterThan(50)
    expect(Object.keys(positive.relationshipsByKey)).toHaveLength(1)
    expect(veteran.tenureWeight).toBeGreaterThanOrEqual(current.tenureWeight)
    expect(veteran.tenureWeight).toBeLessThanOrEqual(100)
  })

  it('counts incoming same-team backing only and excludes external and head-coach ties', () => {
    const world = baseWorld(); const teamId = Object.values(world.teams)[0]!.id; const otherTeamId = Object.values(world.teams)[1]!.id
    const staffId = staffFor(world, teamId, 'assistantCoach'); const peerId = staffFor(world, teamId, 'regionalScout'); const externalStaffId = staffFor(world, otherTeamId, 'assistantCoach'); const externalActorId = Object.values(world.players)[0]!.id; const coachId = world.teams[teamId]!.coachId!
    const context = contextFor(world, staffId, teamId)
    const peer = deriveStaffPoliticalInfluence(withProfessionalRelationship(world, peerId, staffId, 80), context)
    const outgoingOnly = deriveStaffPoliticalInfluence(withProfessionalRelationship(world, staffId, peerId, 80), context)
    const external = deriveStaffPoliticalInfluence(withProfessionalRelationship(world, externalStaffId, staffId, 80), context)
    const unrelated = deriveStaffPoliticalInfluence(withProfessionalRelationship(world, staffId, externalActorId, 80), context)
    const leader = deriveStaffPoliticalInfluence(withProfessionalRelationship(world, staffId, coachId, 80), context)
    expect(peer.networkBacking).toBeGreaterThan(50)
    expect(outgoingOnly.networkBacking).toBe(50)
    expect(external.networkBacking).toBe(50)
    expect(unrelated.networkBacking).toBe(50)
    expect(leader.networkBacking).toBe(50)
    expect(leader.leadershipAccess).toBeGreaterThan(50)
  })

  it('uses canonical proficiency and reputation for monotonic credibility', () => {
    const world = baseWorld(); const teamId = Object.values(world.teams)[0]!.id; const staffId = staffFor(world, teamId, 'assistantCoach'); const context = contextFor(world, staffId, teamId)
    const baseline = deriveStaffPoliticalInfluence(world, context).professionalCredibility
    const reputation = updateGameWorld(world, { staffReputationProfilesByStaffId: { ...world.staffReputationProfilesByStaffId, [staffId]: { values: { competence: 1000, reliability: 1000, publicStanding: 1000 } } } })
    const staff = world.staffPeopleById[staffId]!
    const highProficiency = { ...world, staffPeopleById: { ...world.staffPeopleById, [staffId]: { ...staff, professional: { attributes: Object.fromEntries(Object.keys(staff.professional.attributes).map((key) => [key, 100])) as typeof staff.professional.attributes } } } } as GameWorld
    expect(deriveStaffPoliticalInfluence(reputation, context).professionalCredibility).toBeGreaterThanOrEqual(baseline)
    expect(deriveStaffPoliticalInfluence(highProficiency, context).professionalCredibility).toBeGreaterThanOrEqual(baseline)
  })

  it('builds one sparse index for the multi-staff path and reuses it for every derivation', () => {
    const world = baseWorld(); const relationshipCount = Object.keys(world.relationshipsByKey).length; const index = buildStaffPoliticalInfluenceIndex(world)
    for (const assignment of Object.values(world.teamStaffAssignmentsById)) deriveStaffPoliticalInfluence(world, contextFor(world, assignment.staffPersonId, assignment.teamId), index)
    expect(index.relationshipRowsScanned).toBe(relationshipCount)
    expect(Object.keys(world.relationshipsByKey)).toHaveLength(relationshipCount)
  })

  it('is deterministic, bounded, and presents a qualitative band only', () => {
    const world = baseWorld(); const teamId = Object.values(world.teams)[0]!.id; const staffId = staffFor(world, teamId, 'assistantCoach'); const context = contextFor(world, staffId, teamId)
    const first = deriveStaffPoliticalInfluence(world, context); const second = deriveStaffPoliticalInfluence(world, context)
    expect(first).toEqual(second)
    expect(Object.values(first).filter((value) => typeof value === 'number').every((value) => value >= 0 && value <= 100)).toBe(true)
    expect(classifyStaffPoliticalInfluenceBand(first.overall)).toMatch(/PERIPHERAL|LIMITED|ESTABLISHED|INFLUENTIAL|CENTRAL/)
  })
})
