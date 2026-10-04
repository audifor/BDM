/** ME-LOCK1.1 equality guard: hash of the full FAST result (final state included) per `seed@gameIndex`, plus timing.
 *  node <bundle> "3498342002@0,7@0,..." -> JSON { "seed@game": { hash, ms, score } } */
import { createHash } from 'node:crypto'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { getScheduledGamesToday } from '@/engine/calendar'
const cases = (process.argv[2] ?? '3498342002@0').split(',').map((item) => item.split('@').map(Number) as [number, number])
const world = createNewGame()
const games = getScheduledGamesToday(world)
const port = createMatchEnginePort('match-next')
const out: Record<string, unknown> = {}
for (const [seed, index] of cases) {
  const t0 = performance.now()
  const result = port.simulate(port.prepare(world, games[index]!, seed), 'FAST')
  const ms = performance.now() - t0
  out[`${seed}@${index}`] = { hash: createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 20), ms: Math.round(ms), score: `${result.score.home}-${result.score.away}` }
}
console.log(JSON.stringify(out))
