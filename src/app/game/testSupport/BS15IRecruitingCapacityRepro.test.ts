import { readFileSync } from 'node:fs'
import { beforeAll, expect, it } from 'vitest'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { advanceDay } from '@/engine/calendar'
import { generateLegacyFixtureRecruitingPool as generateRecruitingPool, makeRecruitingOffer, performRecruitingAction } from '@/engine/recruiting'
import { recruitingStaffActionBlock, recruitingStaffActors } from '@/engine/recruiting/RecruitingStaffAuthority'
import { openInvestigation, progressEnforcement, reportViolation } from '@/engine/enforcement'

let checkpoint: GameWorld | undefined
beforeAll(() => {
  const path = process.env.BS15I_RECRUITING_CAPACITY_REPRO_SAVE
  if (path !== undefined) checkpoint = deserializeGameWorldV4(JSON.parse(readFileSync(path, 'utf8')))
}, 30_000)

it.each([false, true])('renews the actual exhausted annual Recruiting budget once, with active sanction %s', sanctioned => {
  if (checkpoint === undefined) return
  const cycle = Object.values(checkpoint.recruitingCyclesById).find(item => item.status === 'scheduled' && item.opensOn === '2036-12-30')!
  const team = Object.values(checkpoint.teams).find(item => item.coachId !== undefined && checkpoint!.recruitingCapacityByProgramId[item.id] === 0 && Object.values(checkpoint!.competitions).some(competition => competition.ecosystemId === cycle.ecosystemId && competition.participantTeamIds.includes(item.id)))!
  expect(team).toBeDefined()
  const otherPrograms = Object.values(checkpoint.competitions).filter(item => item.ecosystemId !== cycle.ecosystemId && checkpoint!.ecosystems[item.ecosystemId]?.kind === 'ncaaLike').flatMap(item => item.participantTeamIds)
  let world = updateGameWorld(checkpoint, { userCoachId: team.coachId!, currentDate: '2036-12-29' as never,
    // Selecting an existing Coach as the user must remove that Team's AI-only plans.
    gmPlanStates: Object.values(checkpoint.gmPlanStatesById).filter(plan => plan.teamId !== team.id),
  })
  if (sanctioned) {
    world = reportViolation(updateGameWorld(world, { currentDate: '2036-12-22' as never }), { ecosystemId: cycle.ecosystemId, programTeamId: team.id, category: 'recruiting', severity: 'minor', source: 'RECRUITING_PERIOD_CAPACITY_REGRESSION' })
    const violationId = Object.keys(world.violationsById).at(-1)!
    world = openInvestigation(world, violationId)
    world = progressEnforcement(updateGameWorld(world, { currentDate: '2036-12-29' as never }))
  }
  expect(world.recruitingCapacityByProgramId[team.id]).toBe(0)
  const reduction = Object.values(world.sanctionsById).filter(item => item.programTeamId === team.id && item.kind === 'recruitingCapacityReduction' && item.status === 'active').reduce((sum, item) => sum + (item.amount ?? 0), 0)
  expect(reduction).toBe(sanctioned ? 2 : 0)
  const opened = advanceDay(world)
  expect(opened.recruitingCyclesById[cycle.id]!.status).toBe('open')
  expect(opened.recruitingCapacityByProgramId[team.id]).toBe(cycle.rules.periodCapacity - reduction)
  for (const id of otherPrograms) expect(opened.recruitingCapacityByProgramId[id]).toBe(world.recruitingCapacityByProgramId[id])
  const actionWorld = updateGameWorld(opened, { currentDate: '2037-01-02' as never })
  const recruit = Object.values(actionWorld.recruitProfilesById).find(item => item.cycleId === cycle.id && item.status === 'open')!
  const pitched = performRecruitingAction(actionWorld, cycle.id, recruit.id, team.id, 'pitch')
  expect(pitched.ok, pitched.ok ? undefined : pitched.reason).toBe(true)
  if (!pitched.ok) throw new Error(pitched.reason)
  const remaining = cycle.rules.periodCapacity - reduction - cycle.rules.costs.pitch
  expect(pitched.value.recruitingCapacityByProgramId[team.id]).toBe(remaining)
  const restored = deserializeGameWorldV4(serializeGameWorldV4(pitched.value, '2037-01-02T00:00:00.000Z'))
  expect(advanceDay(restored).recruitingCapacityByProgramId[team.id]).toBe(remaining)
  expect(restored.sanctionsById).toEqual(pitched.value.sanctionsById)
}, 90_000)

it('applies the actual annual offer limit to the current cycle while preserving historical offers', () => {
  if (checkpoint === undefined) return
  const cycle = Object.values(checkpoint.recruitingCyclesById).find(item => item.status === 'scheduled' && item.opensOn === '2036-12-30')!
  const world = generateRecruitingPool(updateGameWorld(checkpoint, { currentDate: '2037-01-02' as never,
    recruitingCycles: Object.values(checkpoint.recruitingCyclesById).map(item => item.id === cycle.id ? { ...item, status: 'open' as const } : item),
  }), cycle.id)
  const offers = Object.values(world.recruitingOffersById)
  const team = Object.values(world.teams).find(item => Object.values(world.competitions).some(competition => competition.ecosystemId === cycle.ecosystemId && competition.participantTeamIds.includes(item.id)) && offers.filter(offer => offer.programTeamId === item.id && offer.status === 'active').length >= cycle.rules.maxOffers && recruitingStaffActionBlock(world, cycle, item.id, recruitingStaffActors(world, item.id).recruiterId) === undefined)!
  expect(team).toBeDefined()
  expect(offers.filter(item => item.cycleId === cycle.id && item.programTeamId === team.id)).toEqual([])
  const recruit = Object.values(world.recruitProfilesById).find(item => item.cycleId === cycle.id)!
  const offered = makeRecruitingOffer(world, cycle.id, recruit.id, team.id)
  expect(offered.ok, offered.ok ? undefined : offered.reason).toBe(true)
  if (!offered.ok) throw new Error(offered.reason)
  expect(Object.values(offered.value.recruitingOffersById).filter(item => item.cycleId === cycle.id && item.programTeamId === team.id)).toHaveLength(1)
  for (const oldOffer of offers) expect(offered.value.recruitingOffersById[oldOffer.id]).toEqual(oldOffer)
  const restored = deserializeGameWorldV4(serializeGameWorldV4(offered.value, '2037-01-02T00:00:00.000Z'))
  expect(restored.recruitingOffersById).toEqual(offered.value.recruitingOffersById)
}, 90_000)
