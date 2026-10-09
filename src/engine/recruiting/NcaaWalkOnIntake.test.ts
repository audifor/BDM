import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { maintainAiTeamMinimumRosters } from '@/app/market/AiRosterMaintenance'
import { addDays, addYears } from '@/domain/date'
import { getPlayerContractStatus } from '@/domain/contract'
import { updateGameWorld } from '@/domain/world'
import { materializeTalentCandidates } from '@/engine/world/TalentSupply'
import { evaluatePlayerEligibility } from '@/engine/eligibility/EligibilityEngine'
import { initializeAcademicProfile } from '@/engine/academic'
import { recordPlayerPathway, type PlayerPathwaySource } from '@/domain/player'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { enrollNcaaWalkOn, isNcaaWalkOnAvailable, rankNcaaWalkOnCandidates } from './NcaaWalkOnIntake'

function fixture() {
  const base = createNewGame({ seed: 15015 })
  const competition = Object.values(base.competitions).find(item => base.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
  const teamId = competition.participantTeamIds.find(id => id !== Object.values(base.teams).find(item => item.coachId === base.userCoachId)?.id)!
  const cohort = Object.values(base.talentCohortsById).find(item => item.gender === base.teams[teamId]!.gender)!
  const supplied = materializeTalentCandidates(base, Array.from({ length: 12 }, (_, i) => ({ cohortId: cohort.id, candidateIndex: i + 1, cause: 'RECRUITING_POOL' as const })))
  return { world: supplied.world, playerId: supplied.players[0]!.id, teamId, competition, season: Object.values(base.seasons).find(item => item.competitionId === competition.id)! }
}

describe('canonical NCAA no-aid walk-on intake', () => {
  it.each(['US_HIGH_SCHOOL', 'JUCO', 'INTERNATIONAL_CLUB', 'ACADEMY_YOUTH', 'OTHER_PRECOLLEGE'] as const)('preserves %s provenance through no-aid admission', (source: PlayerPathwaySource) => {
    const { world, teamId, playerId } = fixture()
    const candidate = recordPlayerPathway(world.players[playerId]!, { id: `test-precollege:${source}`, source, occurredOn: world.currentDate })
    const withSource = updateGameWorld(world, { players: Object.values(world.players).map(item => item.id === playerId ? candidate : item) })
    const admitted = enrollNcaaWalkOn(withSource, teamId, playerId)
    expect(admitted.teams[teamId]!.rosterPlayerIds).toContain(playerId)
    expect(admitted.players[playerId]!.pathwayHistory).toEqual(candidate.pathwayHistory)
  })

  it('rejects a failing academic profile atomically and does not silently improve it', () => {
    const { world, teamId, playerId, competition } = fixture()
    const initialized = initializeAcademicProfile(world, playerId, teamId, competition.ecosystemId)
    const failing = updateGameWorld(initialized, { academicProfiles: Object.values(initialized.academicProfilesById).map(item => item.playerId === playerId ? { ...item, performance: 0 } : item) })
    expect(isNcaaWalkOnAvailable(failing, teamId, playerId)).toBe(true)
    expect(enrollNcaaWalkOn(failing, teamId, playerId)).toBe(failing)
  })

  it('preserves an ended undergraduate enrollment and enforces its midyear transfer delay', () => {
    const { world, teamId, playerId, competition } = fixture()
    const sourceId = competition.participantTeamIds.find(id => id !== teamId)!
    const admitted = enrollNcaaWalkOn(world, sourceId, playerId)
    expect(admitted).not.toBe(world)
    const detached = updateGameWorld(admitted, {
      teams: Object.values(admitted.teams).map(team => team.id === sourceId ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter(id => id !== playerId) } : team),
      playerEnrollments: Object.values(admitted.playerEnrollmentsById).map(item => item.playerId === playerId ? { ...item, status: 'ended' as const, endsOn: world.currentDate, firstAcademicTermEndsOn: addDays(world.currentDate, -1), nextAcademicYearStartsOn: addYears(world.currentDate, 1) } : item),
      playerRegistrations: Object.values(admitted.playerRegistrationsById).map(item => item.playerId === playerId ? { ...item, endsOn: world.currentDate } : item),
    })
    expect(isNcaaWalkOnAvailable(detached, teamId, playerId)).toBe(true)
    expect(enrollNcaaWalkOn(detached, teamId, playerId)).toBe(detached)
  })
  it('admits an existing identity with enrollment, eligibility, registration and persistent acquisition history', () => {
    const { world, playerId, teamId, competition, season } = fixture()
    const player = world.players[playerId]!
    const next = enrollNcaaWalkOn(world, teamId, playerId, 'WORLD_REPAIR')
    expect(next).not.toBe(world)
    expect(next.players).toBe(world.players)
    expect(next.personsById).toBe(world.personsById)
    expect(next.players[playerId]!.pathwayHistory).toEqual(player.pathwayHistory)
    expect(next.teams[teamId]!.rosterPlayerIds).toContain(playerId)
    expect(evaluatePlayerEligibility(next, { playerId, teamId, competitionId: competition.id, seasonId: season.id }).eligible).toBe(true)
    const enrollment = Object.values(next.playerEnrollmentsById).find(item => item.playerId === playerId && item.status === 'active')!
    expect(next.playerRegistrationsById[enrollment.sourceRegistrationId!]!.cause).toBe('NCAA_WALK_ON')
    expect(Object.values(next.playerTransactionsById).find(item => item.playerId === playerId)?.kind).toBe('ncaaWalkOn')
    for (const key of ['contractsById', 'athleticsAidAgreementsById', 'settlementBenefitsAgreementsById', 'nilDealsById', 'financialTransactionsById'] as const) expect(next[key]).toBe(world[key])
    expect(enrollNcaaWalkOn(next, teamId, playerId)).toBe(next)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(next, `${next.currentDate}T00:00:00.000Z`))
    expect(restored.players[playerId]).toEqual(next.players[playerId])
    expect(restored.playerEnrollmentsById).toEqual(next.playerEnrollmentsById)
    expect(restored.playerRegistrationsById).toEqual(next.playerRegistrationsById)
    expect(restored.playerTransactionsById).toEqual(next.playerTransactionsById)
  })

  it('rejects rostered, retired, contracted, rights-bound and incoming Players without partial changes', () => {
    const { world, playerId, teamId, competition } = fixture()
    const rostered = world.teams[teamId]!.rosterPlayerIds[0]!
    expect(enrollNcaaWalkOn(world, teamId, rostered)).toBe(world)
    const retired = updateGameWorld(world, { players: Object.values(world.players).map(item => item.id === playerId ? { ...item, careerEnd: { endedOn: world.currentDate, reason: 'manual' as const } } : item) })
    expect(enrollNcaaWalkOn(retired, teamId, playerId)).toBe(retired)
    const pro = Object.values(world.teams).find(item => item.id !== teamId && !competition.participantTeamIds.includes(item.id))!
    const template = Object.values(world.contractsById).find(item => getPlayerContractStatus(item, world.currentDate) === 'active')!
    for (const startsOn of [world.currentDate, addYears(world.currentDate, 1)]) {
      const bound = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), { ...template, id: 'walk-on-test-contract' as never, playerId, teamId: pro.id, term: { startsOn, expiresOn: addYears(startsOn, 1) } }] })
      expect(enrollNcaaWalkOn(bound, teamId, playerId)).toBe(bound)
    }
    const rights = updateGameWorld(world, { playerRights: [...Object.values(world.playerRightsById), { id: 'walk-on-test-rights', playerId, ownerTeamId: pro.id, ecosystemId: Object.values(world.competitions).find(item => item.participantTeamIds.includes(pro.id))!.ecosystemId, rightsType: 'draft', acquiredAt: world.currentDate, status: 'active' } as never] })
    expect(enrollNcaaWalkOn(rights, teamId, playerId)).toBe(rights)
    const cycle = Object.values(world.recruitingCyclesById).find(item => item.ecosystemId === competition.ecosystemId)!
    const profile = Object.values(world.recruitProfilesById).find(item => item.cycleId === cycle.id)!
    const incoming = updateGameWorld(world, { recruitProfiles: [...Object.values(world.recruitProfilesById), { ...profile, id: 'walk-on-test-profile', cycleId: cycle.id, playerId, status: 'incoming' }], recruitSignings: [...Object.values(world.recruitSigningsById), { id: 'walk-on-test-signing', cycleId: cycle.id, recruitId: 'walk-on-test-profile', playerId, programTeamId: teamId, targetSeasonId: cycle.targetSeasonId, signedOn: world.currentDate } as never] })
    expect(isNcaaWalkOnAvailable(incoming, teamId, playerId)).toBe(false)
    expect(enrollNcaaWalkOn(incoming, teamId, playerId)).toBe(incoming)
  })

  it('enforces age clocks and academic restrictions and does not consult hidden ratings when ranking', () => {
    const { world, playerId, teamId, competition } = fixture()
    const old = updateGameWorld(world, { currentDate: addYears(world.currentDate, 10) })
    expect(enrollNcaaWalkOn(old, teamId, playerId)).toBe(old)
    const restricted = updateGameWorld(world, { eligibilityRestrictions: [...Object.values(world.eligibilityRestrictionsById), { id: 'walk-on-test-restriction', playerId, ecosystemId: competition.ecosystemId, startsAt: world.currentDate, reasonCode: 'ACADEMIC_TEST', sourceType: 'academic', sourceId: 'walk-on-test' } as never] })
    expect(enrollNcaaWalkOn(restricted, teamId, playerId)).toBe(restricted)
    const changed = updateGameWorld(world, { players: Object.values(world.players).map(item => ({ ...item, basketball: { ...item.basketball, ratings: { ...item.basketball.ratings, shooting: 99 } } })) })
    expect(rankNcaaWalkOnCandidates(changed, teamId)).toEqual(rankNcaaWalkOnCandidates(world, teamId))
  })

  it('restores a deficient AI program through the canonical command and leaves ordinary depth alone', () => {
    const { world, teamId } = fixture()
    expect(maintainAiTeamMinimumRosters(world, { source: 'WORLD_REPAIR', teamIds: [teamId] }).world).toBe(world)
    const short = updateGameWorld(world, { teams: Object.values(world.teams).map(item => item.id === teamId ? { ...item, rosterPlayerIds: item.rosterPlayerIds.slice(0, 4) } : item) })
    const result = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR', teamIds: [teamId] })
    expect(result.unresolvedTeamIds).toEqual([])
    expect(result.world.teams[teamId]!.rosterPlayerIds).toHaveLength(7)
    expect(Object.values(result.world.playerTransactionsById).filter(item => item.kind === 'ncaaWalkOn')).toHaveLength(3)
    expect(result.world.players).toBe(world.players)
    expect(result.world.contractsById).toBe(world.contractsById)
  })
})
