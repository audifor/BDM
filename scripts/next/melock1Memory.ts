/** ME-LOCK1: retained memory after FAST matches (run with node --expose-gc). Result payload size of one match. */
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { getNextUserGame } from '@/engine/calendar'
const gc = (globalThis as { gc?: () => void }).gc!
const mb = (): number => +(process.memoryUsage().heapUsed / 1e6).toFixed(1)
const world = createNewGame()
const game = getNextUserGame(world)!
const port = createMatchEnginePort('match-next')
gc(); const base = mb()
const rows: unknown[] = []
for (let i = 1; i <= Number(process.argv[2] ?? 20); i++) {
  const result = port.simulate(port.prepare(world, game, 1000 + i), 'FAST')
  const completed = port.complete(world, result)
  if (i === 1) rows.push({ resultJsonMb: +(JSON.stringify(result).length / 1e6).toFixed(2), finalStateEvents: result.finalState.events.length, statLogJsonKb: +(JSON.stringify(completed.matchStatLogsByGameId[game.id]).length / 1e3).toFixed(1) })
  if (i === 20 || i === 50 || i === 100) { gc(); rows.push({ afterMatches: i, retainedMbAboveBaseline: +(mb() - base).toFixed(1) }) }
}
console.log(JSON.stringify({ baselineMb: base, rows }))
