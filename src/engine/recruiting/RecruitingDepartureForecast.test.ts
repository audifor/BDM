import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { addYears, createGameDate } from '@/domain/date'
import { createPlayerRights } from '@/domain/trade'
import { updateGameWorld } from '@/domain/world'
import { assessCollegeEligibility, resolveCollegeRuleset } from '@/engine/eligibility/EligibilityEngine'
import { getRecruitingPlanningRoster } from './RecruitingRosterPlanning'

function fixture() {
  const world = createNewGame({ seed: 15015 })
  const cycle = Object.values(world.recruitingCyclesById).find(item => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
  const season = world.seasons[cycle.sourceSeasonId]!
  const team = world.teams[world.competitions[season.competitionId]!.participantTeamIds[0]!]!
  const playerId = team.rosterPlayerIds[0]!
  const proCompetition = Object.values(world.competitions).find(item => world.ecosystems[item.ecosystemId]?.kind === 'nbaLike')!
  return { world, cycle, team, playerId, proCompetition }
}

it('plans for actual professional rights and scheduled contracts while preserving the current college roster', () => {
  const { world, cycle, team, playerId, proCompetition } = fixture()
  expect(getRecruitingPlanningRoster(world, team.id, cycle.id)).toContain(playerId)
  const rights = createPlayerRights({ id: 'forecast:draft-rights', playerId, ecosystemId: proCompetition.ecosystemId, ownerTeamId: proCompetition.participantTeamIds[0]!, rightsType: 'draft', acquiredAt: world.currentDate, status: 'active' })
  const reserved = updateGameWorld(world, { playerRights: [...Object.values(world.playerRightsById), rights] })
  expect(getRecruitingPlanningRoster(reserved, team.id, cycle.id)).not.toContain(playerId)
  const contracted = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), { id: 'forecast:pro-contract' as never, playerId, teamId: rights.ownerTeamId, kind: 'standard', term: { startsOn: addYears(world.currentDate, 1), expiresOn: addYears(world.currentDate, 2) }, compensation: { annualSalary: 100_000 } }] })
  expect(getRecruitingPlanningRoster(contracted, team.id, cycle.id)).not.toContain(playerId)
  expect(getRecruitingPlanningRoster(contracted, team.id)).toBe(contracted.teams[team.id]!.rosterPlayerIds)
})

it('forecasts a known eligibility deadline even before the successor ruleset has been materialized', () => {
  const { world, cycle, team, playerId } = fixture()
  const known = updateGameWorld(world, {
    players: Object.values(world.players).map(item => item.id === playerId ? { ...item, bio: { ...item.bio, dateOfBirth: createGameDate(2009, 1, 1) } } : item),
    playerEnrollments: Object.values(world.playerEnrollmentsById).map(item => item.playerId === playerId ? { ...item, fullTimeEnrollmentTermStartedAt: world.currentDate, firstClassAttendanceAt: world.currentDate } : item),
    collegeRulesets: Object.values(world.collegeRulesetsById).map(item => item.ecosystemId === cycle.ecosystemId && item.effectiveFrom <= world.currentDate ? { ...item, effectiveTo: createGameDate(2032, 12, 31) } : item),
  })
  expect(assessCollegeEligibility(known, { playerId, teamId: team.id, ecosystemId: cycle.ecosystemId })?.eligible).toBe(true)
  expect(resolveCollegeRuleset(known, cycle.ecosystemId, addYears(world.seasons[cycle.sourceSeasonId]!.startDate, 1))).toBeUndefined()
  expect(getRecruitingPlanningRoster(known, team.id, cycle.id)).not.toContain(playerId)
  expect(known.teams[team.id]!.rosterPlayerIds).toEqual(team.rosterPlayerIds)
})

it('plans for the canonical forthcoming age exit without retiring a still-active Player early', () => {
  const { world, cycle, team, playerId } = fixture()
  const aged = updateGameWorld(world, { players: Object.values(world.players).map(item => item.id === playerId ? { ...item, bio: { ...item.bio, dateOfBirth: createGameDate(1987, 1, 1) } } : item) })
  expect(aged.players[playerId]!.careerEnd).toBeUndefined()
  expect(getRecruitingPlanningRoster(aged, team.id, cycle.id)).not.toContain(playerId)
  expect(aged.teams[team.id]!.rosterPlayerIds).toContain(playerId)
})
