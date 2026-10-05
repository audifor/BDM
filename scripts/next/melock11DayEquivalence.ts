/** ME-LOCK1.1 audit: the phased day resolution (prepare all from the start-of-day world -> simulate -> apply in order) equals the
 *  strictly sequential one (prepare each Game after the previous were applied), as whole-world JSON, over consecutive game days. */
import { createHash } from 'node:crypto'
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { resolveDayGames, simulateAndApplyGame, dayGamesAreIndependent } from '@/app/game/matchResolution'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import type { GameWorld } from '@/domain/world'
const which = process.argv[2] ?? 'prototype'
const days = Number(process.argv[3] ?? 2)
let world: GameWorld = which === 'acb' ? createAcbTestGame() : createNewGame()
const h = (w: GameWorld): string => createHash('sha256').update(JSON.stringify(w)).digest('hex').slice(0, 20)
const out: unknown[] = []
for (let d = 0; d < days; d++) {
  while (getScheduledGamesToday(world).length === 0) world = advanceDay(world)
  const games = getScheduledGamesToday(world)
  let seedA = 5000 + d * 100, seedB = seedA
  const t0 = performance.now()
  const sequential = games.reduce((current, game) => simulateAndApplyGame(current, game, seedA++), world)
  const t1 = performance.now()
  const phased = resolveDayGames(world, games, () => seedB++)
  const t2 = performance.now()
  out.push({ date: world.currentDate, games: games.length, independent: dayGamesAreIndependent(games), equal: h(sequential) === h(phased), sequentialMs: Math.round(t1 - t0), phasedMs: Math.round(t2 - t1) })
  world = advanceDay(sequential)
}
console.log(JSON.stringify({ which, out }))
