import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { DEFAULT_FIBA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { createGameDate } from '@/domain/date'
import { organizationIdForTeam, teamIdFromString } from '@/domain/ids'
import { generateRecruitingPool, makeRecruitingOffer, performRecruitingAction, rankAiRecruitingTargets, resolveRecruitingCommitments } from './RecruitingEngine'

function world() { return updateGameWorld(createGameWorld(createValidGameWorldInput()), { recruitingCycles: [{ id: 'cycle-1', ecosystemId: DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, sourceSeasonId: 'season-a' as never, targetSeasonId: 'season-a' as never, opensOn: createGameDate(2032, 10, 1), signingOn: createGameDate(2032, 11, 1), closesOn: createGameDate(2032, 12, 1), status: 'open', rules: { ...defaultRecruitingRules, poolSize: 5, commitmentThreshold: 1 } }] }) }

describe('RecruitingEngine canonical operations', () => {
  it('generates deterministic canonical unrostered players', () => {
    const first = generateRecruitingPool(world(), 'cycle-1'); const second = generateRecruitingPool(world(), 'cycle-1')
    expect(Object.values(first.recruitProfilesById).map((profile) => profile.playerId)).toEqual(Object.values(second.recruitProfilesById).map((profile) => profile.playerId))
    expect(Object.values(first.recruitProfilesById)).toHaveLength(5)
    expect(first.teams[teamIdFromString('team-home')]!.rosterPlayerIds).toHaveLength(1)
  })
  it('consumes capacity, records actions and commits only after competition', () => {
    const generated = generateRecruitingPool(world(), 'cycle-1'); const recruit = Object.values(generated.recruitProfilesById)[0]!; const program = 'team-home' as never
    const contacted = performRecruitingAction(generated, 'cycle-1', recruit.id, program, 'contact'); expect(contacted.ok).toBe(true)
    if (!contacted.ok) return
    const offered = makeRecruitingOffer(contacted.value, 'cycle-1', recruit.id, program); expect(offered.ok).toBe(true)
    if (!offered.ok) return
    const committed = resolveRecruitingCommitments(offered.value, 'cycle-1')
    expect(Object.values(committed.recruitingCommitmentsById)[0]?.programTeamId).toBe(program)
    expect(Object.values(committed.recruitingActionHistoryById)).toHaveLength(1)
  })
  it('keeps AI target ordering invariant when only hidden prospect truth changes', () => {
    const generated = generateRecruitingPool(world(), 'cycle-1'); const program = teamIdFromString('team-home')
    const before = rankAiRecruitingTargets(generated, 'cycle-1', program).map((profile) => profile.id)
    const prospect = Object.values(generated.recruitProfilesById)[0]!
    const changed = updateGameWorld(generated, { players: Object.values(generated.players).map((player) => player.id !== prospect.playerId ? player : { ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, threePointShooting: 100, passing: 100 } } }) })
    expect(rankAiRecruitingTargets(changed, 'cycle-1', program).map((profile) => profile.id)).toEqual(before)
  })
  it('uses only the recruiting organization knowledge for its target ordering', () => {
    const generated = generateRecruitingPool(world(), 'cycle-1'); const program = teamIdFromString('team-home'); const other = teamIdFromString('team-away'); const prospect = Object.values(generated.recruitProfilesById)[0]!
    const before = rankAiRecruitingTargets(generated, 'cycle-1', program).map((profile) => profile.id)
    const changed = updateGameWorld(generated, { organizationKnowledge: [{ organizationId: organizationIdForTeam(other), subjectPlayerId: prospect.playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: generated.currentDate, provenance: 'scoutReport', estimate: 100, uncertainty: 1 } } }] })
    expect(rankAiRecruitingTargets(changed, 'cycle-1', program).map((profile) => profile.id)).toEqual(before)
  })
})
