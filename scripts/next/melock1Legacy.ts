/** ME-LOCK1: legacy engine timing on the same Game (prepareMatchOptions + simulateMatchWithRotations + completeMatch). */
import { createNewGame } from '@/app/game/createNewGame'
import { completeMatch, prepareMatchOptions } from '@/app/game/playUserGame'
import { simulateMatchWithRotations } from '@/engine/match'
import { getNextUserGame } from '@/engine/calendar'
const n = Number(process.argv[2] ?? 10)
const world = createNewGame()
const game = getNextUserGame(world)!
let prep = 0, sim = 0, comp = 0
for (let i = 0; i < n; i++) {
  const t0 = performance.now(); const options = prepareMatchOptions(world, game, undefined, 3_498_342_002 + i)
  const t1 = performance.now(); const simulation = simulateMatchWithRotations(options)
  const t2 = performance.now(); completeMatch(world, simulation)
  const t3 = performance.now(); prep += t1 - t0; sim += t2 - t1; comp += t3 - t2
}
console.log(JSON.stringify({ matches: n, prepareMs: +(prep / n).toFixed(1), simulateMs: +(sim / n).toFixed(1), completeMs: +(comp / n).toFixed(1) }))
