/** ME-LOCK1 equality guard: hash of the full Instant final state (and the result) per seed, plus timing.
 *  node <bundle> [seeds csv] -> JSON { seed: { hash, resultHash, ms, score } } */
import { createHash } from 'node:crypto'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { getNextUserGame } from '@/engine/calendar'
const seeds = (process.argv[2] ?? '3498342002,7,11,424242,13,99').split(',').map(Number)
const world = createNewGame()
const game = getNextUserGame(world)!
const port = createMatchEnginePort('match-next')
const out: Record<string, unknown> = {}
const h = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)
for (const seed of seeds) {
  const t0 = performance.now()
  const result = port.runInstant(port.prepare(world, game, seed))
  const ms = performance.now() - t0
  const { finalState, ...rest } = result
  out[seed] = { hash: h(finalState), resultHash: h(rest), ms: Math.round(ms), score: `${result.score.home}-${result.score.away}` }
}
console.log(JSON.stringify(out))
