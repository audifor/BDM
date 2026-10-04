/** ME-LOCK1.1 equality guard for preparation: hash of every prepared MatchSetup of the first two game days (prototype + ACB). */
import { createHash } from 'node:crypto'
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
const port = createMatchEnginePort('match-next')
const hash = createHash('sha256')
let count = 0
for (const make of [createNewGame, createAcbTestGame]) {
  let world = make()
  for (let day = 0; day < 2; day++) {
    while (getScheduledGamesToday(world).length === 0) world = advanceDay(world)
    for (const game of getScheduledGamesToday(world)) { hash.update(JSON.stringify(port.prepare(world, game, 99 + count))); count += 1 }
    world = advanceDay(world)
  }
}
console.log(JSON.stringify({ setups: count, hash: hash.digest('hex').slice(0, 24) }))
