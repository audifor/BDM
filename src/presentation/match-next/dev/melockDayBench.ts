/**
 * ME-LOCK1.1 dev benchmark page (dev-melock-bench.html): a real game day in the browser, inline vs the production Web Worker pool
 * (getWorldMatchRunner), on the same world and seeds. Writes JSON to #out and to window.__melock when done. Read-only tool.
 */
import { advanceGameDayWithResult, advanceGameDayWithResultAsync, getWorldMatchRunner } from '@/app/game'
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import type { GameWorld } from '@/domain/world'

function fnv(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0 }
  return hash.toString(16)
}
const firstGameDay = (world: GameWorld): GameWorld => { let current = world; while (getScheduledGamesToday(current).length === 0) current = advanceDay(current); return current }

async function run(): Promise<void> {
  const out: Record<string, unknown> = { cores: navigator.hardwareConcurrency, runner: getWorldMatchRunner().kind }
  for (const [label, make] of [['prototype', createNewGame], ['acb', createAcbTestGame]] as const) {
    const world = firstGameDay(make())
    let a = 1, b = 1, c = 1
    const s0 = performance.now(); const inline = advanceGameDayWithResult(world, () => a++); const s1 = performance.now()
    const p0 = performance.now(); const first = await advanceGameDayWithResultAsync(world, getWorldMatchRunner(), () => b++); const p1 = performance.now()
    const w0 = performance.now(); const warm = await advanceGameDayWithResultAsync(world, getWorldMatchRunner(), () => c++); const w1 = performance.now()
    const h = fnv(JSON.stringify(inline.world))
    out[label] = { games: getScheduledGamesToday(world).length, inlineMs: Math.round(s1 - s0), workersFirstMs: Math.round(p1 - p0), workersWarmMs: Math.round(w1 - w0), identical: h === fnv(JSON.stringify(first.world)) && h === fnv(JSON.stringify(warm.world)), status: warm.status }
  }
  const text = JSON.stringify(out)
  document.getElementById('out')!.textContent = text
  ;(window as unknown as { __melock?: string }).__melock = text
}
void run().catch((error) => { (window as unknown as { __melock?: string }).__melock = JSON.stringify({ error: String(error) }); document.getElementById('out')!.textContent = String(error) })
