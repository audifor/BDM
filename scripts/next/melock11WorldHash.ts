/** ME-LOCK1.1 equality guard for application: whole-world hash after resolving game days through simulateRemainingGamesToday. */
import { createHash } from 'node:crypto'
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { simulateRemainingGamesToday } from '@/app/game/advanceGameDay'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import { updateGameWorld, type GameWorld } from '@/domain/world'
const which = process.argv[2] ?? 'prototype'
const days = Number(process.argv[3] ?? 1)
// short games keep this guard fast; preparation and application are the subject here
const short = (w: GameWorld): GameWorld => updateGameWorld(w, { competitions: Object.values(w.competitions).map((c) => ({ ...c, rules: { ...c.rules, gameFormat: { ...c.rules.gameFormat, periodMinutes: 1, overtimeMinutes: 1 } } })) })
let world = short(which === 'acb' ? createAcbTestGame() : createNewGame())
let seed = 4000
const t0 = performance.now()
for (let d = 0; d < days; d++) {
  while (getScheduledGamesToday(world).length === 0) world = advanceDay(world)
  world = advanceDay(simulateRemainingGamesToday(world, () => seed++, ['userGame']))
}
console.log(JSON.stringify({ which, days, ms: Math.round(performance.now() - t0), hash: createHash('sha256').update(JSON.stringify(world)).digest('hex').slice(0, 24) }))
