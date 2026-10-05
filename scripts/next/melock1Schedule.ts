/** ME-LOCK1: how many Games the world resolves per simulated day / week / season (generated prototype world and ACB universe). */
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import type { GameWorld } from '@/domain/world'
function stats(label: string, world: GameWorld): void {
  const games = Object.values(world.games)
  const byDate = new Map<string, number>()
  for (const g of games) { const k = String(g.date); byDate.set(k, (byDate.get(k) ?? 0) + 1) }
  const counts = [...byDate.values()].sort((a, b) => a - b)
  const byComp = new Map<string, number>()
  for (const g of games) byComp.set(String(g.competitionId), (byComp.get(String(g.competitionId)) ?? 0) + 1)
  const kinds = Object.values(world.competitions).map((c) => `${c.id}:${world.ecosystems[c.ecosystemId]?.kind}:${c.gender}:${byComp.get(String(c.id)) ?? 0}`)
  console.log(JSON.stringify({ label, totalGames: games.length, gameDays: counts.length, perGameDay: { min: counts[0], median: counts[Math.floor(counts.length / 2)], p90: counts[Math.floor(counts.length * 0.9)], max: counts.at(-1), mean: +(games.length / counts.length).toFixed(1) }, competitions: kinds }, null, 1))
}
stats('prototype (createNewGame)', createNewGame())
stats('ACB universe', createAcbTestGame())
// weekly view for the prototype: games per ISO week (7-day buckets from the first game)
const w = createNewGame()
const dates = Object.values(w.games).map((g) => Date.parse(String(g.date)))
const first = Math.min(...dates)
const weeks = new Map<number, number>()
for (const d of dates) { const k = Math.floor((d - first) / (7 * 86400000)); weeks.set(k, (weeks.get(k) ?? 0) + 1) }
const wc = [...weeks.values()].sort((a, b) => a - b)
console.log(JSON.stringify({ prototypeWeeks: weeks.size, perWeek: { min: wc[0], median: wc[Math.floor(wc.length / 2)], max: wc.at(-1) }, seasonSpanDays: Math.round((Math.max(...dates) - first) / 86400000) }))
