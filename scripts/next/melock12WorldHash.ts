/**
 * ME-LOCK1.2 world equivalence: resolves consecutive game days with real (full-length) games through the production day path and hashes
 * the whole GameWorld and each of its top-level domains (standings, stats, fatigue, schedule, histories...), key-sorted.
 *   node <bundle> <prototype|acb> [days=2] [format=FIBA|NBA]  -> JSON { world, parts: { key: hash } }
 */
import { createHash } from 'node:crypto'
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { simulateRemainingGamesToday } from '@/app/game/advanceGameDay'
import { NBA_GAME_FORMAT } from '@/domain/competition'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { canonicalJson } from './melock12Corpus'

const which = process.argv[2] ?? 'prototype'
const days = Number(process.argv[3] ?? 2)
const format = process.argv[4] ?? 'FIBA'
let world: GameWorld = which === 'acb' ? createAcbTestGame() : createNewGame()
if (format === 'NBA') world = updateGameWorld(world, { competitions: Object.values(world.competitions).map((c) => ({ ...c, rules: { ...c.rules, gameFormat: NBA_GAME_FORMAT } })) })
const hash = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 20)
let seed = 5000
let games = 0
const t0 = performance.now()
for (let day = 0; day < days; day += 1) {
  while (getScheduledGamesToday(world).length === 0) world = advanceDay(world)
  games += getScheduledGamesToday(world).length
  world = advanceDay(simulateRemainingGamesToday(world, () => seed++, ['userGame']))
}
const record = world as unknown as Record<string, unknown>
console.log(JSON.stringify({ which, days, format, games, ms: Math.round(performance.now() - t0), world: hash(world), parts: Object.fromEntries(Object.keys(record).sort().map((key) => [key, hash(record[key])])) }))
