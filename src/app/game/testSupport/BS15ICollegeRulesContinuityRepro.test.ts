import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { ensureCollegeRulesetContinuity, resolveCollegeRuleset } from '@/engine/eligibility'
import { advanceDay } from '@/engine/calendar'
import { assertNcaaViability, collectNcaaContinuity } from './NcaaContinuityCertification'

it('continues the actual expired NCAA policies through the calendar without changing academic facts', () => {
  const path = process.env.BS15I_COLLEGE_RULES_REPRO_SAVE
  if (path === undefined) return
  const world = deserializeGameWorldV4(JSON.parse(readFileSync(path, 'utf8')))
  expect(collectNcaaContinuity(world).eligible).toBe(0)
  const repaired = ensureCollegeRulesetContinuity(world)
  assertNcaaViability(repaired)
  for (const ecosystem of Object.values(world.ecosystems).filter(item => item.kind === 'ncaaLike')) {
    const rule = resolveCollegeRuleset(repaired, ecosystem.id, repaired.currentDate)!
    expect(rule.minimumAcademicPerformance).toBe(75)
    expect(rule.minimumAcademicProgress).toBe(65)
    expect(rule.provenance).toBe('SIMULATED_CARRY_FORWARD')
    expect(rule.basedOnRulesetId).toContain(':v2')
    expect(rule.effectiveFrom).toBe('2036-08-01')
  }
  expect(repaired.academicProfilesById).toEqual(world.academicProfilesById)
  expect(repaired.academicTermRecordsById).toEqual(world.academicTermRecordsById)
  expect(repaired.playerEnrollmentsById).toEqual(world.playerEnrollmentsById)
  expect(repaired.teams).toEqual(world.teams)
  expect(ensureCollegeRulesetContinuity(repaired)).toBe(repaired)
  const advanced = advanceDay(world)
  assertNcaaViability(advanced)
  expect(advanced.academicProfilesById).toEqual(world.academicProfilesById)
  const restored = deserializeGameWorldV4(serializeGameWorldV4(advanced, '2036-10-02T00:00:00.000Z'))
  expect(restored.collegeRulesetsById).toEqual(advanced.collegeRulesetsById)
  process.stdout.write(`[BS15I NCAA policy continuity] ${JSON.stringify({ date: restored.currentDate, eligible: collectNcaaContinuity(restored).eligible, minimumEligible: Math.min(...collectNcaaContinuity(restored).teams.map(team => team.eligible)) })}\n`)
}, 90_000)
