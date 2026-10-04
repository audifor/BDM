/** ME-LOCK1.1: cost of the day's non-simulation phases (prepare from the world, apply results) on the ACB universe. */
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { applyDayResults, prepareDayGames, simulateDayGamesInline } from '@/app/game/matchResolution'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
let world = createAcbTestGame()
while (getScheduledGamesToday(world).length === 0) world = advanceDay(world)
const games = getScheduledGamesToday(world)
let seed = 1
const short = prepareDayGames(world, games, () => seed++).map((item) => ({ ...item, setup: { ...item.setup, clockRules: { ...item.setup.clockRules, periodCount: 1, periodSeconds: 30 } } }))
const results = simulateDayGamesInline(short)
const t0 = performance.now(); for (let i = 0; i < 3; i++) prepareDayGames(world, games, () => seed++); const t1 = performance.now()
for (let i = 0; i < 3; i++) applyDayResults(world, short, results); const t2 = performance.now()
console.log(JSON.stringify({ games: games.length, prepareMsPerGame: Math.round((t1 - t0) / 3 / games.length), applyMsPerGame: Math.round((t2 - t1) / 3 / games.length) }))
