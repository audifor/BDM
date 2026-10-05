/** ME-LOCK1 performance certification (observational). node <bundle> <scenario> [n]
 *  scenarios: fast <n> | legacy <n> | full 1 | day-prototype | day-acb | day-acb-legacy | day-prototype-legacy */
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { simulateRemainingGamesToday } from '@/app/game/advanceGameDay'
import { completeMatch, prepareMatchOptions } from '@/app/game/playUserGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { simulateMatchWithRotations } from '@/engine/match'
import { getNextUserGame, getScheduledGamesToday } from '@/engine/calendar'
import { advanceDay } from '@/engine/calendar'
import type { GameWorld } from '@/domain/world'

const [scenario = 'fast', nArg = '1'] = process.argv.slice(2)
const n = Number(nArg)
const mem = (): number => Math.round(process.memoryUsage().heapUsed / 1e6)
const out: Record<string, unknown> = { scenario, n, node: process.version }
let seed = 3_498_342_002
const t0 = performance.now()
if (scenario === 'fast' || scenario === 'legacy' || scenario === 'full') {
  const world = createNewGame()
  const game = getNextUserGame(world)!
  const port = createMatchEnginePort('match-next')
  const per: number[] = []
  let peak = 0
  for (let i = 0; i < n; i++) {
    const s = performance.now()
    if (scenario === 'legacy') completeMatch(world, simulateMatchWithRotations(prepareMatchOptions(world, game, undefined, seed++)))
    else port.complete(world, port.simulate(port.prepare(world, game, seed++), scenario === 'full' ? 'FULL' : 'FAST'))
    per.push(performance.now() - s)
    peak = Math.max(peak, mem())
  }
  per.sort((a, b) => a - b)
  Object.assign(out, { totalMs: Math.round(performance.now() - t0), perMatchMs: { mean: Math.round(per.reduce((a, b) => a + b, 0) / n), median: Math.round(per[Math.floor(n / 2)]!), max: Math.round(per.at(-1)!) }, heapPeakMb: peak })
} else {
  const acb = scenario.startsWith('day-acb')
  let world: GameWorld = acb ? createAcbTestGame() : createNewGame()
  // walk to the first date with games (advancing the calendar alone, no games played before it)
  while (getScheduledGamesToday(world).length === 0) world = advanceDay(world)
  const games = getScheduledGamesToday(world).length
  const s = performance.now()
  if (scenario.endsWith('-legacy')) {
    for (const game of getScheduledGamesToday(world)) world = completeMatch(world, simulateMatchWithRotations(prepareMatchOptions(world, game, undefined, seed++)))
  } else world = simulateRemainingGamesToday(world, () => seed++)
  Object.assign(out, { games, dayMs: Math.round(performance.now() - s), perGameMs: Math.round((performance.now() - s) / games), heapMb: mem(), remaining: getScheduledGamesToday(world).length })
}
console.log(JSON.stringify(out))
