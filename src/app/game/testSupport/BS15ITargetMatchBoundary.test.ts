import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getScheduledGamesToday } from '@/engine/calendar'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { SeededRandomSource } from '@/engine/random'
import { repairWorldAtLifecycleBoundary } from '@/app/repair'
import { simulateRemainingGamesToday } from '@/app/game/advanceGameDay'
import { readLargeSaveV4File } from './LargeSaveV4File'
import { createLongHorizonMutationGuard } from './LongHorizonMutationGuard'

it('restores the actual Y17 target-date fixture through canonical pre-match repair', () => {
  if (process.env.BS15I_TARGET_BOUNDARY_REPLAY !== '1') return
  const world = deserializeGameWorldV4(readLargeSaveV4File('C:/Temp/BS15I-failed-match-input-save-v4.json'))
  const diagnostic = JSON.parse(readFileSync('C:/Temp/BS15I-failed-match-input.json', 'utf8'))
  const game = world.games[diagnostic.game.id as never]!
  expect(world.currentDate).toBe('2049-10-01')
  expect(getAvailablePlayersForCompetition(world, game.awayTeamId, game.competitionId, game.seasonId, game.date)).toHaveLength(4)
  const games = getScheduledGamesToday(world)
  const repair = repairWorldAtLifecycleBoundary(world, [...new Set(games.flatMap(item => [item.homeTeamId, item.awayTeamId]))])
  expect(repair.unresolvedTeamIds).toHaveLength(0)
  expect(getAvailablePlayersForCompetition(repair.world, game.awayTeamId, game.competitionId, game.seasonId, game.date).length).toBeGreaterThanOrEqual(5)
  const seed = new SeededRandomSource(15015)
  for (const item of Object.values(world.games)) if (item.status === 'completed') seed.nextInt(0, 0xffff_ffff)
  let draws = 0
  const resolved = simulateRemainingGamesToday(repair.world, () => { draws++; return seed.nextInt(0, 0xffff_ffff) })
  createLongHorizonMutationGuard(world)(resolved)
  expect(resolved.currentDate).toBe(world.currentDate)
  expect(draws).toBe(games.length)
  expect(games.every(item => resolved.games[item.id]!.status === 'completed')).toBe(true)
  expect(Object.keys(resolved.players)).toEqual(Object.keys(world.players))
  expect(Object.keys(resolved.personsById)).toEqual(Object.keys(world.personsById))
  const report = { date: world.currentDate, game, team: world.teams[game.awayTeamId], beforeAvailable: 4, afterAvailable: getAvailablePlayersForCompetition(resolved, game.awayTeamId, game.competitionId, game.seasonId, game.date).length, reports: repair.reports, draws }
  writeFileSync('C:/Temp/BS15I-y17-target-repair-proof.json', JSON.stringify(report, null, 2))
  process.stdout.write(`[BS15I Y17 target repair] ${JSON.stringify({ date: world.currentDate, teamId: game.awayTeamId, draws, afterAvailable: report.afterAvailable })}\n`)
}, 180_000)
