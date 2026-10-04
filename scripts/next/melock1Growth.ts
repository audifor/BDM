/** ME-LOCK1: core cost per 1000 ticks against history size (Instant-like stepping), and the cost of one MatchFrame at that size. */
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { getNextUserGame } from '@/engine/calendar'
import { toFrame } from '@/engine/match-next'
const world = createNewGame()
const port = createMatchEnginePort('match-next')
const live = port.createLiveSession(port.prepare(world, getNextUserGame(world)!, 3_498_342_002))
const rows: unknown[] = []
let coreTotal = 0
while (!live.matchState.isComplete) {
  const t0 = performance.now(), tick0 = live.matchState.t
  live.advanceTicks(1000)
  const core = performance.now() - t0
  coreTotal += core
  const s = live.matchState
  const f0 = performance.now(); for (let i = 0; i < 20; i++) toFrame(s); const frameMs = (performance.now() - f0) / 20
  rows.push({ t: s.t, coreMsPer1000Ticks: Math.round(core * 1000 / Math.max(1, s.t - tick0)), frameMs: +frameMs.toFixed(2), events: s.events.length, actions: s.actions.length, possessions: s.possessions.length })
}
console.table(rows)
console.log('core total ms', Math.round(coreTotal))
