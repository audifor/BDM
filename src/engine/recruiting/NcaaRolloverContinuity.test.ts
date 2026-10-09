import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { simulateAndApplyGame } from '@/app/game/playUserGame'
import { startNextSeasonFor } from '@/app/game/startNextSeason'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { addYears } from '@/domain/date'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { progressAiAcademicSupport, resolveAcademicTerm, evaluateAcademicEligibility } from '@/engine/academic'
import { assessCollegeEligibility } from '@/engine/eligibility'
import { arriveSignedRecruits, generateLegacyFixtureRecruitingPool as generateRecruitingPool, makeRecruitingOffer, resolveBasketballChampionshipDate, resolveRecruitingCommitments, signCommittedRecruit } from './RecruitingEngine'

let completed: GameWorld
let cycleId: string
beforeAll(() => {
  completed = createNewGame({ seed: 15015 })
  const cycle = Object.values(completed.recruitingCyclesById)[0]!
  cycleId = cycle.id
  for (const game of Object.values(completed.games).filter(item => item.seasonId === cycle.sourceSeasonId)) completed = simulateAndApplyGame(completed, game, 15015)
}, 30_000)

describe('NCAA successor continuity', () => {
  it('signs a generated recruit and enrolls in the background competition season after Save V4', () => {
    const source = completed.recruitingCyclesById[cycleId]!
    expect(resolveBasketballChampionshipDate(completed, source)).toBe(completed.seasonHistoryBySeasonId[source.sourceSeasonId]!.completedOn)
    let world = startNextSeasonFor(completed, source.sourceSeasonId)
    const cycle = world.recruitingCyclesById[cycleId]!
    world = generateRecruitingPool(updateGameWorld(world, { currentDate: cycle.signingOn, recruitingCycles: Object.values(world.recruitingCyclesById).map(item => item.id === cycleId ? { ...item, status: 'open', rules: { ...item.rules, commitmentThreshold: 1 } } : item) }), cycleId)
    const recruit = Object.values(world.recruitProfilesById).find(item => item.cycleId === cycleId)!
    const teamId = Object.values(world.competitions).find(item => item.ecosystemId === cycle.ecosystemId)!.participantTeamIds[0]!
    const offered = makeRecruitingOffer(world, cycleId, recruit.id, teamId)
    if (!offered.ok) throw new Error(offered.reason)
    const committed = resolveRecruitingCommitments(offered.value, cycleId)
    const signed = signCommittedRecruit(committed, cycleId, recruit.id)
    if (!signed.ok) throw new Error(signed.reason)
    const player = signed.value.players[recruit.playerId]!
    expect(arriveSignedRecruits(signed.value)).toBe(signed.value)
    world = deserializeGameWorldV4(serializeGameWorldV4(updateGameWorld(signed.value, { currentDate: signed.value.seasons[cycle.targetSeasonId]!.startDate }), '2033-12-30T00:00:00.000Z'))
    expect(world.currentSeasonId).not.toBe(cycle.targetSeasonId)
    const arrived = arriveSignedRecruits(world)
    expect(arrived.recruitProfilesById[recruit.id]!.status).toBe('arrived')
    expect(arrived.players[player.id]!.personId).toBe(player.personId)
    expect(arrived.teams[teamId]!.rosterPlayerIds.filter(id => id === player.id)).toHaveLength(1)
    expect(assessCollegeEligibility(arrived, { playerId: player.id, teamId, ecosystemId: cycle.ecosystemId })?.eligible).toBe(true)
    expect(arriveSignedRecruits(arrived)).toBe(arrived)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(arrived, '2033-12-30T00:00:00.000Z'))
    expect(restored.playerEnrollmentsById).toEqual(arrived.playerEnrollmentsById)
    expect(restored.academicProfilesById).toEqual(arrived.academicProfilesById)
  })

  it('carries institutional aid dates with the successor year', () => {
    const source = completed.recruitingCyclesById[cycleId]!
    const rolled = startNextSeasonFor(completed, source.sourceSeasonId)
    const target = Object.values(rolled.recruitingCyclesById).find(item => item.sourceSeasonId === rolled.recruitingCyclesById[cycleId]!.targetSeasonId)!
    expect(target.institutionalSigningPolicies).toHaveLength(source.institutionalSigningPolicies!.length)
    for (const policy of target.institutionalSigningPolicies!) {
      const previous = source.institutionalSigningPolicies!.find(item => item.programTeamId === policy.programTeamId)!
      expect(policy.finalAidSigningDate).toBe(addYears(previous.finalAidSigningDate, 1))
      expect(policy.provenance).toBe('SIMULATED_CARRY_FORWARD')
      expect(policy.basedOnSeasonId).toBe(source.sourceSeasonId)
    }
  })

  it('uses effective college thresholds for bounded AI support and clears superseded restrictions', () => {
    const base = createNewGame({ seed: 15015 })
    const profile = Object.values(base.academicProfilesById)[0]!
    const date = '2035-07-01' as GameWorld['currentDate']
    const world = updateGameWorld(base, { currentDate: date, academicProfiles: Object.values(base.academicProfilesById).map(item => ({ ...item, performance: item.id === profile.id ? 70 : 90, progress: 80 })), eligibilityRestrictions: [{ id: 'prior-academic-restriction', playerId: profile.playerId, ecosystemId: profile.ecosystemId, startsAt: base.currentDate, reasonCode: 'ACADEMIC_INELIGIBLE', sourceType: 'academic', sourceId: 'old-term' }] })
    expect(evaluateAcademicEligibility(world, profile.playerId).academicallyEligible).toBe(false)
    const supported = progressAiAcademicSupport(world, 'academic:2035:07')
    const plan = Object.values(supported.academicSupportPlansById).find(item => item.playerId === profile.playerId)!
    expect(plan.level).toBe('tutoring')
    for (const team of Object.values(supported.teams)) expect(Object.values(supported.academicSupportPlansById).filter(item => item.programTeamId === team.id).reduce((sum, item) => sum + item.cost, 0)).toBeLessThanOrEqual(8)
    expect(progressAiAcademicSupport(supported, 'academic:2035:07').academicSupportPlansById).toEqual(supported.academicSupportPlansById)
    const resolved = resolveAcademicTerm(supported, 'academic:2035:07')
    expect(resolved.academicProfilesById[profile.id]!.performance).toBe(75)
    expect(assessCollegeEligibility(resolved, { playerId: profile.playerId, teamId: profile.programTeamId, ecosystemId: profile.ecosystemId })?.eligible).toBe(true)
    expect(resolved.eligibilityRestrictionsById['prior-academic-restriction']).toBeUndefined()
    expect(resolveAcademicTerm(resolved, 'academic:2035:07')).toBe(resolved)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(resolved, `${date}T00:00:00.000Z`))
    const next = resolveAcademicTerm(progressAiAcademicSupport(updateGameWorld(restored, { currentDate: '2036-01-01' as GameWorld['currentDate'] }), 'academic:2036:01'), 'academic:2036:01')
    expect(next.academicProfilesById[profile.id]!.performance).toBe(76)
    expect(next.academicTermRecordsById[`academic-term:academic:2036:01:${profile.playerId}`]).toBeDefined()
  }, 10_000)
})
