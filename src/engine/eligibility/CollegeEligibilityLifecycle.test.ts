import { readLargeSaveV4File } from '@/app/game/testSupport/LargeSaveV4File'
import { deriveCollegeEligibilityClock, resolveCollegeRuleset, ensureCollegeRulesetContinuity } from './EligibilityEngine'
import { materializeTalentCandidates } from '@/engine/world/TalentSupply'
import { enrollNcaaWalkOn } from '@/engine/recruiting/NcaaWalkOnIntake'
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { updateGameWorld } from '@/domain/world'
import { addYears, addDays } from '@/domain/date'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { signDraftRightsToNba, getCollegeOrRosterSourceTeam } from '@/engine/career/EcosystemTransitions'
import { assessCollegeEligibility } from './EligibilityEngine'
import { progressCollegeEligibilityExits } from './CollegeEligibilityLifecycle'

function fixture() {
  const world = createNewGame({ seed: 15015 })
  const enrollment = Object.values(world.playerEnrollmentsById)[0]!
  expect(progressCollegeEligibilityExits(world)).toBe(world)
  const exhausted = updateGameWorld(world, { eligibilityProfiles: Object.values(world.eligibilityProfilesById).map(item => item.playerId === enrollment.playerId ? { ...item, seasonsUsed: 4 } : item) })
  return { world: exhausted, enrollment, playerId: enrollment.playerId, teamId: enrollment.teamId }
}

describe('permanent college sporting eligibility exits', () => {
  it('ends exhausted membership once while preserving identity, academics and canonical history through SaveV4', () => {
    const { world, enrollment, playerId, teamId } = fixture()
    expect(assessCollegeEligibility(world, { playerId, teamId, ecosystemId: enrollment.ecosystemId })!.reasons).toContain('PARTICIPATION_LIMIT_REACHED')
    const next = progressCollegeEligibilityExits(world)
    expect(next.teams[teamId]!.rosterPlayerIds).not.toContain(playerId)
    expect(next.playerEnrollmentsById[enrollment.id]).toMatchObject({ status: 'ended', endsOn: world.currentDate })
    expect(Object.values(next.playerRegistrationsById).filter(item => item.playerId === playerId && item.teamId === teamId && item.endsOn === undefined)).toEqual([])
    expect(next.players[playerId]).toBe(world.players[playerId])
    expect(next.personsById).toBe(world.personsById)
    expect(next.academicProfilesById).toBe(world.academicProfilesById)
    expect(next.eligibilityProfilesById).toBe(world.eligibilityProfilesById)
    expect(Object.values(next.playerTransactionsById).filter(item => item.playerId === playerId && item.kind === 'ncaaEligibilityExit')).toHaveLength(1)
    expect(progressCollegeEligibilityExits(next)).toBe(next)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(next, `${next.currentDate}T00:00:00.000Z`))
    expect(restored.playerEnrollmentsById).toEqual(next.playerEnrollmentsById)
    expect(restored.playerTransactionsById).toEqual(next.playerTransactionsById)
  })

  it('releases a known clock admission at its canonical expiry without changing its birth date', () => {
    const base = createNewGame({ seed: 15015 })
    const enrollment = Object.values(base.playerEnrollmentsById)[0]!
    const cohort = Object.values(base.talentCohortsById).find(item => item.gender === base.teams[enrollment.teamId]!.gender)!
    const supplied = materializeTalentCandidates(base, [{ cohortId: cohort.id, candidateIndex: 1, cause: 'RECRUITING_POOL' }])
    const playerId = supplied.players[0]!.id
    const admitted = enrollNcaaWalkOn(supplied.world, enrollment.teamId, playerId)
    expect(admitted).not.toBe(supplied.world)
    const rule = resolveCollegeRuleset(admitted, enrollment.ecosystemId, admitted.currentDate)!
    const clock = deriveCollegeEligibilityClock(admitted, playerId, rule)!
    const expired = ensureCollegeRulesetContinuity(updateGameWorld(admitted, { currentDate: addYears(clock.startsOn, rule.eligibilityClock!.periodYears) }))
    expect(assessCollegeEligibility(expired, { playerId, teamId: enrollment.teamId, ecosystemId: enrollment.ecosystemId })!.reasons).toContain('ELIGIBILITY_CLOCK_EXPIRED')
    const eve = updateGameWorld(expired, { currentDate: addDays(expired.currentDate, -1) })
    expect(progressCollegeEligibilityExits(eve).teams[enrollment.teamId]!.rosterPlayerIds).toContain(playerId)
    const released = progressCollegeEligibilityExits(expired)
    expect(released.teams[enrollment.teamId]!.rosterPlayerIds).not.toContain(playerId)
    expect(released.players[playerId]).toBe(admitted.players[playerId])
  })

  it('repairs the preserved actual Y7 exhausted-membership reproduction', () => {
    if (!process.env.BS15I_ELIGIBILITY_EXIT_REPRO) return
    const world = deserializeGameWorldV4(readLargeSaveV4File(process.env.BS15I_ELIGIBILITY_EXIT_REPRO))
    const teamId = 'generated-team-0017' as never
    const ids = [59, 187, 102].map(index => `player:talent:annual-talent:2032:generated-country-0001:male:${String(index).padStart(6, '0')}` as never)
    expect(world.teams[teamId]!.rosterPlayerIds).toHaveLength(10)
    const released = progressCollegeEligibilityExits(world)
    for (const playerId of ids) {
      expect(world.teams[teamId]!.rosterPlayerIds).toContain(playerId)
      expect(released.teams[teamId]!.rosterPlayerIds).not.toContain(playerId)
      expect(released.players[playerId]).toBe(world.players[playerId])
    }
    expect(released.teams[teamId]!.rosterPlayerIds).toHaveLength(7)
    process.stdout.write(`[BS15I actual Y7 permanent eligibility reproduction] removed=${ids.length} retained=7 date=${world.currentDate}\n`)
  }, 60_000)

  it('does not release temporarily academically ineligible Players', () => {
    const base = createNewGame({ seed: 15015 })
    const world = updateGameWorld(base, { academicProfiles: Object.values(base.academicProfilesById).map(item => ({ ...item, performance: 0 })) })
    expect(progressCollegeEligibilityExits(world)).toBe(world)
  })

  it('preserves a former college source for rights signing, blocks scheduled contracts, and never revives a ended career', () => {
    const { world, playerId, teamId, enrollment } = fixture()
    const competition = Object.values(world.competitions).find(item => world.ecosystems[item.ecosystemId]?.kind === 'nbaLike')!
    const toTeamId = competition.participantTeamIds[0]!
    const released = progressCollegeEligibilityExits(world)
    const available = updateGameWorld(released, { playerRights: [...Object.values(released.playerRightsById), { id: 'exhausted-college-rights', playerId, ownerTeamId: toTeamId, ecosystemId: competition.ecosystemId, rightsType: 'draft', acquiredAt: world.currentDate, status: 'active' }] })
    const input = { id: 'exhausted-college-sign', playerId, toTeamId, rightsId: 'exhausted-college-rights', annualSalary: 500_000, contractYears: 2 }
    expect(getCollegeOrRosterSourceTeam(available, playerId)?.id).toBe(teamId)
    const signed = signDraftRightsToNba(available, input)
    expect(signed.teams[toTeamId]!.rosterPlayerIds).toContain(playerId)
    expect(signed.playerEnrollmentsById[enrollment.id]).toEqual(available.playerEnrollmentsById[enrollment.id])
    expect(signed.players[playerId]).toBe(world.players[playerId])
    expect(signed.ecosystemTransitionsById[input.id]).toMatchObject({ fromTeamId: teamId, toTeamId, playerId })
    expect(signDraftRightsToNba(signed, input)).toBe(signed)
    expect(getCollegeOrRosterSourceTeam(signed, playerId)?.id).toBe(toTeamId)
    const template = Object.values(available.contractsById)[0]!
    const bound = updateGameWorld(available, { contracts: [...Object.values(available.contractsById), { ...template, id: 'future-college-contract' as never, playerId, teamId: toTeamId, term: { startsOn: addYears(world.currentDate, 1), expiresOn: addYears(world.currentDate, 2) } }] })
    expect(() => signDraftRightsToNba(bound, input)).toThrow('professional contract')
    const ended = updateGameWorld(available, { players: Object.values(available.players).map(item => item.id === playerId ? { ...item, careerEnd: { endedOn: world.currentDate, reason: 'manual' as const } } : item) })
    expect(() => signDraftRightsToNba(ended, input)).toThrow('career has ended')
  })
})
