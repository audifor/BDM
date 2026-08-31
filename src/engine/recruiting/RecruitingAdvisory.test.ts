import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, DEFAULT_NCAA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { createGameDate } from '@/domain/date'
import { organizationIdForTeam, staffPersonIdFromString, teamIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { generateRecruitingPool, addRecruitingBoardEntry, rankAiRecruitingTargets } from './RecruitingEngine'
import { progressRecruitingAdvisories, acceptRecruitingRecommendation } from './RecruitingAdvisory'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

function ncaaWorld(poolSize = 6) {
  const input = createValidGameWorldInput()
  const ncaaInput = { ...input, competitions: input.competitions.map((competition) => ({ ...competition, ecosystemId: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID })) }
  return updateGameWorld(createGameWorld(ncaaInput), {
    recruitingCycles: [{ id: 'cycle-1', ecosystemId: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID, sourceSeasonId: 'season-a' as never, targetSeasonId: 'season-a' as never, opensOn: createGameDate(2032, 10, 1), signingOn: createGameDate(2032, 11, 1), closesOn: createGameDate(2032, 12, 1), status: 'open', rules: { ...defaultRecruitingRules, poolSize, commitmentThreshold: 1 } }],
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

  /**
   * Wave 4B review Blocker 3A: `bandSize` must no longer be dead metadata — it must genuinely
   * bound which candidate is picked. Uses a large pool (poolSize 10, so ranking has real depth)
   * and drives `recruitingQuality` apart via attribute strength (weak `talentEvaluation`/
   * `communication`/`potentialEvaluation` for low quality, maxed for high quality — the same
   * technique `recruitingQuality.test.ts` uses). High quality must always land the band-1 (top
   * ranked) target; low quality may land a lower-ranked target within its wider band — proven
   * across a deterministic series of distinct team/staff ids, never probabilistically.
   */
  it('prospectIdentification actually consumes its quality band: high quality always selects the top-ranked target, low quality can select deeper in the ranking', () => {
    const teams = Object.values(ncaaWorld().teams)

    function outcomeFor(attributeStrength: number, teamIndex: number) {
      const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
      const target = teams[teamIndex % teams.length]!.id
      const staffId = staffPersonIdFromString(`prospect-band-staff-${attributeStrength}-${teamIndex}`)
      const withStaff = updateGameWorld(generated, {
        staffPeople: [...Object.values(generated.staffPeopleById), { id: staffId, identity: { firstName: 'Rec', lastName: 'Ru' }, professional: { attributes: { ...flatAttributes, talentEvaluation: attributeStrength, communication: attributeStrength, potentialEvaluation: attributeStrength } } }],
        teamStaffAssignments: [...Object.values(generated.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`prospect-band-assignment-${attributeStrength}-${teamIndex}`), staffPersonId: staffId, teamId: target, role: 'recruitingCoordinator', assignedOn: generated.currentDate }],
      })
      const id = `responsibility:${target}:prospectIdentification` as never
      const delegated = updateGameWorld(withStaff, { responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((item) => item.id !== id), { id, teamId: target, kind: 'prospectIdentification', mode: 'advisory', holderStaffId: staffId }] })
      const progressed = progressRecruitingAdvisories(delegated, 'cycle-1')
      const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')
      expect(outcome).toBeDefined()
      if (outcome === undefined) throw new Error('unreachable')
      const ranked = rankAiRecruitingTargets(generated, 'cycle-1', target)
      const selectedRankIndex = ranked.findIndex((profile) => profile.id === outcome.payload.recruitId)
      return { outcome, selectedRankIndex }
    }

    for (let index = 0; index < 6; index += 1) {
      const { outcome, selectedRankIndex } = outcomeFor(100, index)
      expect(outcome.payload.bandSize).toBe(1)
      expect(selectedRankIndex).toBe(0)
    }

    const lowQualitySelections = Array.from({ length: 6 }, (_, index) => outcomeFor(5, index))
    for (const { outcome, selectedRankIndex } of lowQualitySelections) {
      expect(outcome.payload.bandSize).toBe(3)
      expect(selectedRankIndex).toBeGreaterThanOrEqual(0)
      expect(selectedRankIndex).toBeLessThan(3)
    }
    expect(lowQualitySelections.some(({ selectedRankIndex }) => selectedRankIndex > 0)).toBe(true)
  })

  it('prospectIdentification band selection is deterministic: same world + same seed produces the same recruit', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const { world, staffId } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'prospectIdentification')
    const first = progressRecruitingAdvisories(world, 'cycle-1')
    const second = progressRecruitingAdvisories(world, 'cycle-1')
    const firstOutcome = Object.values(first.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')
    const secondOutcome = Object.values(second.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'prospectIdentification')
    expect(firstOutcome?.payload.recruitId).toBe(secondOutcome?.payload.recruitId)
  })
})

describe('recruitingPriorities canonical ranking/valuation consumption (Wave 4B review Blocker 3B)', () => {
  it('uses the canonical rankAiRecruitingTargets ranking, not just raw positional needs: two same-position/need board entries with different organizational valuation can receive different recommended priorities', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const ranked = rankAiRecruitingTargets(generated, 'cycle-1', teamId)
    if (ranked.length < 2) return
    const topRanked = ranked[0]!
    const bottomRanked = ranked[ranked.length - 1]!
    if (topRanked.position !== bottomRanked.position) return
    const boarded = addRecruitingBoardEntry(addRecruitingBoardEntry(generated, { programTeamId: teamId, recruitId: topRanked.id, priority: 'low' }), { programTeamId: teamId, recruitId: bottomRanked.id, priority: 'low' })
    const { world, staffId } = withStaffInRole(boarded, teamId, 'recruitingCoordinator', 'recruitingPriorities')
    const progressed = progressRecruitingAdvisories(world, 'cycle-1')
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'recruitingPriorities')
    expect(outcome).toBeDefined()
    if (outcome === undefined) return
    expect(outcome.payload.recruitId).toBe(topRanked.id)
  })

  it('hidden Player truth mutation without an OrganizationKnowledge change does not alter the priority recommendation', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const recruit = Object.values(generated.recruitProfilesById)[0]!
    const boarded = addRecruitingBoardEntry(generated, { programTeamId: teamId, recruitId: recruit.id, priority: 'low' })
    const { world, staffId } = withStaffInRole(boarded, teamId, 'recruitingCoordinator', 'recruitingPriorities')
    const before = progressRecruitingAdvisories(world, 'cycle-1')
    const beforeOutcome = Object.values(before.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'recruitingPriorities')
    const mutatedRatings = updateGameWorld(world, { players: Object.values(world.players).map((player) => ({ ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, threePointShooting: 100, passing: 100 } } })) })
    const after = progressRecruitingAdvisories(mutatedRatings, 'cycle-1')
    const afterOutcome = Object.values(after.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'recruitingPriorities')
    expect(beforeOutcome?.payload.recommendedPriority).toBe(afterOutcome?.payload.recommendedPriority)
  })

  /**
   * Fully-controlled scenario (no reliance on generated-pool randomness for rank order): every
   * open recruit for the cycle shares the SAME position (so `getTeamRecruitingNeeds` cannot
   * differentiate them and `rankAiRecruitingTargets`'s ordering is driven purely by
   * `deriveOrganizationPlayerValuation`/`OrganizationKnowledge`, which is what this test needs to
   * isolate). Boosting one recruit's `OrganizationKnowledge` to the top tier of every valuation
   * dimension deterministically makes it rank #0 among its otherwise-identical peers.
   */
  function singlePositionNcaaWorld(recruitCount: number) {
    const world = ncaaWorld(recruitCount)
    const generated = generateRecruitingPool(world, 'cycle-1')
    const samePosition = Object.values(generated.recruitProfilesById).map((profile) => ({ ...profile, position: 'PG' as const }))
    return updateGameWorld(generated, { recruitProfiles: samePosition })
  }

  it('an OrganizationKnowledge change that ranks a recruit #1 via the canonical valuation path upgrades its recommended priority', () => {
    const generated = singlePositionNcaaWorld(8)
    const ranked = rankAiRecruitingTargets(generated, 'cycle-1', teamId)
    expect(ranked.length).toBeGreaterThanOrEqual(4)
    const target = ranked[ranked.length - 1]!

    // This roster has a strong PG need (near-empty roster), so the unboosted, low-ranked target
    // reads 'normal' (strongNeed=true, outside the preferred band) — never 'high', since it is
    // not yet within the preferred band. Boosting its OrganizationKnowledge to rank #1 must push
    // it into the preferred band, which — combined with the still-strong need — upgrades the
    // recommendation to 'high'. This isolates the ranking's effect from the needs effect.
    const boarded = addRecruitingBoardEntry(generated, { programTeamId: teamId, recruitId: target.id, priority: 'low' })
    const { world: unboostedWorld, staffId: unboostedStaffId } = withStaffInRole(boarded, teamId, 'recruitingCoordinator', 'recruitingPriorities')
    const unboostedOutcome = Object.values(progressRecruitingAdvisories(unboostedWorld, 'cycle-1').delegationOutcomesById).find((item) => item.staffId === unboostedStaffId && item.kind === 'recruitingPriorities')
    expect(unboostedOutcome).toBeDefined()
    if (unboostedOutcome === undefined) return
    expect(unboostedOutcome.payload.recommendedPriority).toBe('normal')

    const organizationId = organizationIdForTeam(teamId)
    const highDimensions = Object.fromEntries(['finishing', 'shooting', 'creation', 'perimeterDefense', 'interiorDefense', 'rebounding', 'physical', 'potential:physical'].map((dimension) => [dimension, { coverage: 1, confidence: 1, assessedAt: generated.currentDate, provenance: 'scoutReport' as const, estimate: 99, uncertainty: 1 }]))
    const lowDimensions = Object.fromEntries(['finishing', 'shooting', 'creation', 'perimeterDefense', 'interiorDefense', 'rebounding', 'physical', 'potential:physical'].map((dimension) => [dimension, { coverage: 1, confidence: 1, assessedAt: generated.currentDate, provenance: 'scoutReport' as const, estimate: 1, uncertainty: 1 }]))
    const otherRecruits = ranked.filter((profile) => profile.id !== target.id)
    const boosted = updateGameWorld(boarded, {
      organizationKnowledge: [
        { organizationId, subjectPlayerId: target.playerId, dimensions: highDimensions },
        ...otherRecruits.map((profile) => ({ organizationId, subjectPlayerId: profile.playerId, dimensions: lowDimensions })),
      ],
    })
    const boostedRanked = rankAiRecruitingTargets(boosted, 'cycle-1', teamId)
    expect(boostedRanked[0]!.id).toBe(target.id)

    const { world: boostedWorld, staffId: boostedStaffId } = withStaffInRole(boosted, teamId, 'recruitingCoordinator', 'recruitingPriorities')
    const boostedOutcome = Object.values(progressRecruitingAdvisories(boostedWorld, 'cycle-1').delegationOutcomesById).find((item) => item.staffId === boostedStaffId && item.kind === 'recruitingPriorities')
    expect(boostedOutcome).toBeDefined()
    if (boostedOutcome === undefined) return
    expect(boostedOutcome.payload.recommendedPriority).toBe('high')
  })

  it('quality changes the preferred band threshold deterministically: the same rank position reads a stricter priority under high quality than under low quality', () => {
    const generated = singlePositionNcaaWorld(8)
    const ranked = rankAiRecruitingTargets(generated, 'cycle-1', teamId)
    expect(ranked.length).toBeGreaterThanOrEqual(8)
    // preferredBand = ceil(15%) for quality>=70 vs ceil(60%) for quality<40, over 8 entries: 2 vs 5.
    // Index 3 is outside the high-quality band (2) but inside the low-quality band (5).
    const target = ranked[3]!
    // strongNeed is true for this roster, so the only two possible recommendations are 'high'
    // (inside the preferred band) or 'normal' (outside it) — never 'low'. Seeding the board with
    // 'low' guarantees BOTH quality levels' recommendations differ from the current priority, so
    // neither call silently no-ops via the "already matches" guard.
    const boarded = addRecruitingBoardEntry(generated, { programTeamId: teamId, recruitId: target.id, priority: 'low' })

    function outcomeWith(attributeStrength: number) {
      const staffId = staffPersonIdFromString(`priorities-band-staff-${attributeStrength}`)
      const withStaff = updateGameWorld(boarded, {
        staffPeople: [...Object.values(boarded.staffPeopleById), { id: staffId, identity: { firstName: 'Rec', lastName: 'Ru' }, professional: { attributes: { ...flatAttributes, talentEvaluation: attributeStrength, communication: attributeStrength, potentialEvaluation: attributeStrength } } }],
        teamStaffAssignments: [...Object.values(boarded.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`priorities-band-assignment-${attributeStrength}`), staffPersonId: staffId, teamId, role: 'recruitingCoordinator', assignedOn: boarded.currentDate }],
      })
      const id = `responsibility:${teamId}:recruitingPriorities` as never
      const delegated = updateGameWorld(withStaff, { responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((item) => item.id !== id), { id, teamId, kind: 'recruitingPriorities', mode: 'advisory', holderStaffId: staffId }] })
      const progressed = progressRecruitingAdvisories(delegated, 'cycle-1')
      return Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'recruitingPriorities')
    }

    const highQualityOutcome = outcomeWith(100)
    const lowQualityOutcome = outcomeWith(5)
    expect(highQualityOutcome).toBeDefined()
    expect(lowQualityOutcome).toBeDefined()
    if (highQualityOutcome === undefined || lowQualityOutcome === undefined) return
    const priorityRank: Readonly<Record<string, number>> = { high: 0, normal: 1, low: 2 }
    // Rank index 3 is outside the narrow high-quality band, so quality>=70 cannot read 'high';
    // it IS inside the wide low-quality band, so quality<40 reads 'high'.
    expect(highQualityOutcome.payload.recommendedPriority).toBe('normal')
    expect(lowQualityOutcome.payload.recommendedPriority).toBe('high')
    expect(priorityRank[lowQualityOutcome.payload.recommendedPriority as string]!).toBeLessThan(priorityRank[highQualityOutcome.payload.recommendedPriority as string]!)
  })

  it('does not recommend a change when the current board priority already matches the recommendation', () => {
    const generated = generateRecruitingPool(ncaaWorld(), 'cycle-1')
    const ranked = rankAiRecruitingTargets(generated, 'cycle-1', teamId)
    if (ranked.length === 0) return
    const recruit = ranked[0]!
    const { world: withStaff, staffId } = withStaffInRole(generated, teamId, 'recruitingCoordinator', 'recruitingPriorities')
    const firstPass = progressRecruitingAdvisories(addRecruitingBoardEntry(withStaff, { programTeamId: teamId, recruitId: recruit.id, priority: 'low' }), 'cycle-1')
    const outcome = Object.values(firstPass.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'recruitingPriorities')
    expect(outcome).toBeDefined()
    if (outcome === undefined) return
    const accepted = acceptRecruitingRecommendation(firstPass, outcome.id)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    const removedOutcome = { ...accepted.world, delegationOutcomesById: Object.fromEntries(Object.entries(accepted.world.delegationOutcomesById).filter(([id]) => id !== outcome.id)) }
    const secondPass = progressRecruitingAdvisories(removedOutcome, 'cycle-1')
    const secondOutcome = Object.values(secondPass.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'recruitingPriorities' && item.payload.recruitId === recruit.id)
    expect(secondOutcome).toBeUndefined()
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
