/** ME-LOCK1 standalone runner (bundled with esbuild, no vitest): plays Instant matches through the production port and prints timings.
 *  node scripts/next/melock1Bench.mjs [matches=1] [seed] */
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { getNextUserGame } from '@/engine/calendar'

const matches = Number(process.argv[2] ?? 1)
const seed0 = Number(process.argv[3] ?? 3_498_342_002)
const w0 = performance.now()
const world = createNewGame()
const game = getNextUserGame(world)!
const port = createMatchEnginePort('match-next')
const worldMs = performance.now() - w0
const rows: unknown[] = []
for (let i = 0; i < matches; i++) {
  const t0 = performance.now()
  const setup = port.prepare(world, game, seed0 + i)
  const t1 = performance.now()
  const result = port.runInstant(setup)
  const t2 = performance.now()
  const completed = port.complete(world, result)
  const t3 = performance.now()
  rows.push({ seed: seed0 + i, prepareMs: +(t1 - t0).toFixed(1), simulateMs: +(t2 - t1).toFixed(1), completeMs: +(t3 - t2).toFixed(1), ticks: result.finalState.t, possessions: result.finalState.possessions.length, events: result.finalState.events.length, score: `${result.score.home}-${result.score.away}`, applied: completed !== world })
}
console.log(JSON.stringify({ worldMs: +worldMs.toFixed(0), rows }, null, 1))
