import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { createUniverseAcceptanceRunner } from './testSupport/WorldDbV2UniverseRunner'

it.skipIf(process.env.BDM_UNIVERSE_WORKER_PROOF !== '1')('the shipped worker bundle reproduces the source MatchEngine exactly', async () => {
  const world = deserializeGameWorldSaveV4(JSON.parse(readFileSync('.worlddb-v2/universe-05/opening.json', 'utf8')))
  const game = Object.values(world.games)[0]!
  const port = createMatchEnginePort('match-next')
  const setup = port.prepare(world, game, 12345)
  const expected = port.simulate(setup, 'FAST')
  const runner = createUniverseAcceptanceRunner()
  try {
    const [actual] = await runner.simulate([setup])
    expect(actual).toEqual(expected)
    writeFileSync('.worlddb-v2/universe-05/worker-equivalence.json', JSON.stringify({ passed: true, gameId: game.id, seed: 12345, comparison: 'complete MatchNextResult deep equality, source versus shipped FAST worker' }, null, 2))
  } finally { runner.dispose() }
}, 120_000)
