import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseGameDate } from '@/domain/date'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { runTalentLongHorizonCertification } from './TalentLongHorizonCertification'
import { collectNcaaContinuity, assertNcaaViability } from './NcaaContinuityCertification'

it('replays normal recruiting and arrival before the archived three-player departure pressure', async () => {
  if (process.env.BS15I_RECRUITING_TURNOVER_REPLAY !== '1') return
  const prefix = 'C:/Temp/BS15I-pathway-before-role-facts'
  const world = deserializeGameWorldV4(JSON.parse(readFileSync(`${prefix}.2034-10-01.json`, 'utf8')))
  const failed = deserializeGameWorldV4(JSON.parse(readFileSync(`${prefix}.2036-10-01.json`, 'utf8')))
  const teamId = 'generated-team-0018'
  const departures = Object.values(failed.ecosystemTransitionsById).filter(route => route.fromTeamId === teamId).map(route => route.playerId)
  expect(departures).toHaveLength(3)
  const targetDate = parseGameDate('2036-01-15')
  const checkpoints: unknown[] = []
  const result = await runTalentLongHorizonCertification({
    world, targetDate, seed: 15015,
    initialSeedDraws: Object.values(world.games).filter(game => game.status === 'completed').length,
    checkpointDates: [parseGameDate('2035-10-01'), targetDate], saveReloadDates: [targetDate], deepIntegrityDates: [targetDate],
    maximumRuntimeMs: 50 * 60 * 1000,
    onDayAdvance: day => {
      if (day.world.currentDate.endsWith('-01')) process.stdout.write(`[recruiting replay progress] ${day.world.currentDate}\n`)
    },
    onProgress: (checkpoint, current) => {
      const ncaa = collectNcaaContinuity(current)
      checkpoints.push({ ...checkpoint, source: ncaa.teams.find(team => team.teamId === teamId) })
      writeFileSync('C:/Temp/BS15I-pathway-recruiting-replay-metrics.json', JSON.stringify(checkpoints, null, 2))
      process.stdout.write(`[recruiting replay checkpoint] ${JSON.stringify(checkpoints.at(-1))}\n`)
      assertNcaaViability(current)
    },
  })
  writeFileSync('C:/Temp/BS15I-pathway-recruiting-replay-save-v4.json', JSON.stringify(serializeGameWorldV4(result.world, `${result.world.currentDate}T00:00:00.000Z`)))
  expect(result.stopReason).toBeUndefined(); expect(result.timedOutAt).toBeUndefined()
  expect(result.world.currentDate).toBe(targetDate)
  const source = collectNcaaContinuity(result.world).teams.find(team => team.teamId === teamId)!
  const roster = result.world.teams[source.teamId]!.rosterPlayerIds
  // This is the pressure actually observed in the archived failure, not a new
  // production departure or acquisition quota. No outcomes are inserted here.
  const stillRosteredDepartures = departures.filter(playerId => roster.includes(playerId))
  expect(source.eligible - stillRosteredDepartures.length, JSON.stringify(source)).toBeGreaterThanOrEqual(source.minimumRequired)
}, 55 * 60 * 1000)
