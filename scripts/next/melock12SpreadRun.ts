/** ME-LOCK1.2 profile tool (entry for melock12SpreadCount.mjs): MatchState copies per tick in one FAST match, and the cost of one copy. */
const counts = { match: 0, other: 0 }
let sample: unknown = null
;(globalThis as { __sp?: (value: unknown) => unknown }).__sp = (value: unknown) => {
  const state = value as { version?: number; events?: unknown } | null
  if (state && state.version === 5 && state.events) { counts.match += 1; if (counts.match === 400_000) sample = value } else counts.other += 1
  return value
}
const { createNewGame } = await import('@/app/game/createNewGame')
const { createMatchEnginePort } = await import('@/app/matchNext/MatchEnginePortFactory')
const { getNextUserGame } = await import('@/engine/calendar')
const world = createNewGame()
const port = createMatchEnginePort('match-next')
const result = port.simulate(port.prepare(world, getNextUserGame(world)!, 3_498_342_002), 'FAST')
console.log(JSON.stringify({ ...counts, ticks: result.finalState.t, perTick: +(counts.match / result.finalState.t).toFixed(1) }))
const state = (sample ?? result.finalState) as Record<string, unknown>
let sink: Record<string, unknown> = {}
const copies = 2_000_000
for (let index = 0; index < 200_000; index += 1) sink = { ...state, t: index }
const t0 = performance.now()
for (let index = 0; index < copies; index += 1) sink = { ...state, t: index }
console.log(JSON.stringify({ nsPerMatchStateCopy: +((performance.now() - t0) * 1e6 / copies).toFixed(1), keys: Object.keys(state).length, last: sink.t }))
