import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { advanceGameDayWithResult } from '@/app/game/advanceGameDay'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { SeededRandomSource } from '@/engine/random'
import { collectNcaaContinuity } from './NcaaContinuityCertification'

it('captures the exact NCAA shortage and annual population ledger', () => {
  if (process.env.BS15I_NCAA_AUDIT !== '1') return
  const rows = [collectNcaaContinuity(createNewGame({ seed: 15015 }))]
  for (const date of ['2033-10-01', '2034-10-01', '2035-10-01', '2036-02-03']) {
    const path = date === '2036-02-03' ? 'C:/Temp/BS15I-2036-02-03-failed-save-v4.json' : `C:/Temp/BS15I-5y-save-v4.${date}.json`
    const world = deserializeGameWorldV4(JSON.parse(readFileSync(path, 'utf8')))
    rows.push(collectNcaaContinuity(world))
    if (date !== '2036-02-03') continue
    const random = new SeededRandomSource(15015)
    for (const game of Object.values(world.games)) if (game.status === 'completed') random.nextInt(0, 0xffff_ffff)
    const result = advanceGameDayWithResult(world, () => random.nextInt(0, 0xffff_ffff), ['seasonComplete', 'userGame'])
    expect(result.status).toBe('FAILED')
    expect(result.failure?.message).toBe('away team has 2 available players; 5 are required')
    expect(result.world).toBe(world)
    writeFileSync('C:/Temp/BS15I-NCAA-exact-reproduction.json', JSON.stringify({ date, failure: result.failure }, null, 2))
  }
  writeFileSync('docs/strengthening/BS15I_NCAA_POPULATION_LEDGER_BEFORE.json', JSON.stringify(rows, null, 2))
  for (const { teams: _teams, cycles: _cycles, ...row } of rows) process.stdout.write(`[BS15I NCAA ledger] ${JSON.stringify(row)}\n`)
}, 90_000)
