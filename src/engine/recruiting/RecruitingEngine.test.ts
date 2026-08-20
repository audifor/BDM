import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { DEFAULT_FIBA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { createGameDate } from '@/domain/date'
import { teamIdFromString } from '@/domain/ids'
import { generateRecruitingPool, makeRecruitingOffer, performRecruitingAction, resolveRecruitingCommitments } from './RecruitingEngine'

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
})
