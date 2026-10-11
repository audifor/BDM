import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { updateGameWorld } from '@/domain/world'
import { parseGameDate } from '@/domain/date'
import { progressAiAcademicSupport, resolveAcademicTerm } from '@/engine/academic'
import { collectNcaaContinuity } from './NcaaContinuityCertification'

it('prepares the retained NCAA population for the published stricter term within real capacity', () => {
  const save = process.env.BS15I_NCAA_BUDGET_SAVE
  if (save === undefined) return
  let world = deserializeGameWorldV4(JSON.parse(readFileSync(save, 'utf8')))
  const players = Object.keys(world.players).sort()
  const enrollments = world.playerEnrollmentsById
  for (const date of ['2035-01-01', '2035-07-01', '2036-01-01']) {
    const term = `academic:${date.slice(0, 4)}:${date.slice(5, 7)}`
    world = progressAiAcademicSupport(updateGameWorld(world, { currentDate: parseGameDate(date) }), term)
    for (const team of Object.values(world.teams)) expect(Object.values(world.academicSupportPlansById).filter(plan => plan.termId === term && plan.programTeamId === team.id).reduce((sum, plan) => sum + plan.cost, 0)).toBeLessThanOrEqual(8)
    world = resolveAcademicTerm(world, term)
    if (date === '2035-01-01') continue
    const ledger = collectNcaaContinuity(world)
    expect(ledger.teams.filter(team => team.deficit > 0)).toEqual([])
    process.stdout.write(`[BS15I actual NCAA academic budget] ${JSON.stringify({ date, eligible: ledger.eligible, minimumTeamEligible: Math.min(...ledger.teams.map(team => team.eligible)) })}\n`)
  }
  expect(Object.keys(world.players).sort()).toEqual(players)
  expect(world.playerEnrollmentsById).toBe(enrollments)
}, 60_000)
