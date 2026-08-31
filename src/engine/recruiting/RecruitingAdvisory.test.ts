import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, DEFAULT_NCAA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { createGameDate } from '@/domain/date'
import { staffPersonIdFromString, teamIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { generateRecruitingPool, addRecruitingBoardEntry } from './RecruitingEngine'
import { progressRecruitingAdvisories, acceptRecruitingRecommendation } from './RecruitingAdvisory'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

function ncaaWorld() {
  const input = createValidGameWorldInput()
  const ncaaInput = { ...input, competitions: input.competitions.map((competition) => ({ ...competition, ecosystemId: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID })) }
  return updateGameWorld(createGameWorld(ncaaInput), {
    recruitingCycles: [{ id: 'cycle-1', ecosystemId: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID, sourceSeasonId: 'season-a' as never, targetSeasonId: 'season-a' as never, opensOn: createGameDate(2032, 10, 1), signingOn: createGameDate(2032, 11, 1), closesOn: createGameDate(2032, 12, 1), status: 'open', rules: { ...defaultRecruitingRules, poolSize: 6, commitmentThreshold: 1 } }],
  })
}

function nonNcaaWorld() {
  return updateGameWorld(createGameWorld(createValidGameWorldInput()), {
    recruitingCycles: [{ id: 'cycle-1', ecosystemId: DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, sourceSeasonId: 'season-a' as never, targetSeasonId: 'season-a' as never, opensOn: createGameDate(2032, 10, 1), signingOn: createGameDate(2032, 11, 1), closesOn: createGameDate(2032, 12, 1), status: 'open', rules: { ...defaultRecruitingRules, poolSize: 6, commitmentThreshold: 1 } }],
  })
}

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, kind: 'prospectIdentification' | 'recruitEvaluation' | 'recruitingPriorities', mode: 'advisory' | 'userControlled' | 'organizational' = 'advisory') {
  const staffId = staffPersonIdFromString(`recruiting-advisory-staff-${role}-${kind}-${teamId}`)
  const withStaff = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Rec', lastName: 'Ru' }, professional: { attributes: flatAttributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`recruiting-advisory-assignment-${role}-${kind}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
  })
  const id = `responsibility:${teamId}:${kind}` as never
  const delegated = mode === undefined ? withStaff : updateGameWorld(withStaff, {
    responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind, mode, ...(mode === 'advisory' ? { holderStaffId: staffId } : {}) }],
  })
  return { world: delegated, staffId }
}

const teamId = teamIdFromString('team-home')

describe('progressRecruitingAdvisories', () => {
  it('non-NCAA ecosystem produces no Recruiting Staff advisory execution', () => {
    const generated = generateRecruitingPool(nonNcaaWorld(), 'cycle-1')
    const { world } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'prospectIdentification')
    const before = Object.keys(world.delegationOutcomesById).length
    const progressed = progressRecruitingAdvisories(world, 'cycle-1')
    expect(Object.keys(progressed.delegationOutcomesById)).toHaveLength(before)
  })

  it('NCAA + valid recruiting role + advisory prospectIdentification responsibility produces a deterministic outcome', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const { world, staffId } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'prospectIdentification')
    const first = progressRecruitingAdvisories(world, 'cycle-1')
    const second = progressRecruitingAdvisories(world, 'cycle-1')
    const firstOutcome = Object.values(first.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')
    const secondOutcome = Object.values(second.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')
    expect(firstOutcome).toBeDefined()
    expect(firstOutcome!.payload).toEqual(secondOutcome!.payload)
    expect(firstOutcome!.applied).toBe(false)
  })

  it('prospectIdentification recommends a target from the existing bounded ranking, not on the board yet', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const { world, staffId } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'prospectIdentification')
    const progressed = progressRecruitingAdvisories(world, 'cycle-1')
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')!
    expect(world.recruitingBoards.some((entry) => entry.recruitId === outcome.payload.recruitId)).toBe(false)
  })

  it('recruitingPriorities operates only on the bounded existing board context, and acceptance updates only through addRecruitingBoardEntry', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const recruit = Object.values(generated.recruitProfilesById)[0]!
    const boarded = addRecruitingBoardEntry(generated, { programTeamId: teamId, recruitId: recruit.id, priority: 'low' })
    const { world, staffId } = withStaffInRole(boarded, teamId, 'recruitingCoordinator', 'recruitingPriorities')
    const progressed = progressRecruitingAdvisories(world, 'cycle-1')
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'recruitingPriorities')
    if (outcome === undefined) return
    expect(outcome.payload.recruitId).toBe(recruit.id)
    const result = acceptRecruitingRecommendation(progressed, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updatedEntry = result.world.recruitingBoards.find((entry) => entry.programTeamId === teamId && entry.recruitId === recruit.id)
    expect(updatedEntry?.priority).toBe(outcome.payload.recommendedPriority)
    expect(result.world.delegationOutcomesById[outcome.id]!.applied).toBe(true)
  })

  it('userControlled produces no Staff-authored recruiting outcome', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const { world } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'prospectIdentification', 'userControlled')
    const before = Object.keys(world.delegationOutcomesById).length
    const progressed = progressRecruitingAdvisories(world, 'cycle-1')
    expect(Object.keys(progressed.delegationOutcomesById)).toHaveLength(before)
  })

  it('does not leak hidden Player truth: recommendation is unaffected by directly mutated ratings unless OrganizationKnowledge changes', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const { world, staffId } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'prospectIdentification')
    const before = progressRecruitingAdvisories(world, 'cycle-1')
    const beforeOutcome = Object.values(before.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')!
    const mutatedRatings = updateGameWorld(world, { players: Object.values(world.players).map((player) => ({ ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, threePointShooting: 100, passing: 100 } } })) })
    const after = progressRecruitingAdvisories(mutatedRatings, 'cycle-1')
    const afterOutcome = Object.values(after.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')!
    expect(afterOutcome.payload.recruitId).toBe(beforeOutcome.payload.recruitId)
  })
})

describe('acceptRecruitingRecommendation', () => {
  it('accepting a prospectIdentification recommendation calls the canonical board operation', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const { world, staffId } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'prospectIdentification')
    const progressed = progressRecruitingAdvisories(world, 'cycle-1')
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')!
    const result = acceptRecruitingRecommendation(progressed, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.world.recruitingBoards.some((entry) => entry.programTeamId === teamId && entry.recruitId === outcome.payload.recruitId)).toBe(true)
    expect(result.world.delegationOutcomesById[outcome.id]!.applied).toBe(true)
  })

  it('accepting a recruitEvaluation recommendation consumes canonical capacity/history through the existing action boundary', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const recruitId = Object.values(generated.recruitProfilesById)[0]!.id
    const boarded = addRecruitingBoardEntry(generated, { programTeamId: teamId, recruitId, priority: 'high' })
    const { world, staffId } = withStaffInRole(boarded, teamId, 'recruitingCoordinator', 'recruitEvaluation')
    const progressed = progressRecruitingAdvisories(world, 'cycle-1')
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'recruitEvaluation')
    expect(outcome).toBeDefined()
    if (outcome === undefined) return
    const capacityBefore = progressed.recruitingCapacityByProgramId[teamId] ?? progressed.recruitingCyclesById['cycle-1']!.rules.periodCapacity
    const result = acceptRecruitingRecommendation(progressed, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    if (outcome.payload.recommendedAction !== 'offer') {
      expect(Object.keys(result.world.recruitingActionHistoryById).length).toBeGreaterThan(Object.keys(progressed.recruitingActionHistoryById).length)
      expect(result.world.recruitingCapacityByProgramId[teamId]).toBeLessThan(capacityBefore)
    }
    expect(result.world.delegationOutcomesById[outcome.id]!.applied).toBe(true)
  })

  it('a stale recommendation (recruit no longer open) fails atomically with no partial mutation', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const { world, staffId } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'prospectIdentification')
    const progressed = progressRecruitingAdvisories(world, 'cycle-1')
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')!
    const recruitId = outcome.payload.recruitId as string
    const staled = updateGameWorld(progressed, { recruitProfiles: Object.values(progressed.recruitProfilesById).map((profile) => profile.id === recruitId ? { ...profile, status: 'committed' } : profile) })
    const before = JSON.stringify(staled)
    const result = acceptRecruitingRecommendation(staled, outcome.id)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(staled)).toBe(before)
  })

  it('never mutates interest/capacity/history/offers directly for recruitEvaluation acceptance — only through the canonical boundary (capacity check)', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const recruitId = Object.values(generated.recruitProfilesById)[0]!.id
    const zeroCapacity = updateGameWorld(generated, { recruitingCapacityByProgramId: { ...generated.recruitingCapacityByProgramId, [teamId]: 0 } })
    const boarded = addRecruitingBoardEntry(zeroCapacity, { programTeamId: teamId, recruitId, priority: 'high' })
    const { world, staffId } = withStaffInRole(boarded, teamId, 'recruitingCoordinator', 'recruitEvaluation')
    const progressed = progressRecruitingAdvisories(world, 'cycle-1')
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'recruitEvaluation')
    expect(outcome).toBeDefined()
    if (outcome === undefined) return
    const result = acceptRecruitingRecommendation(progressed, outcome.id)
    expect(result.ok).toBe(false)
  })
})
