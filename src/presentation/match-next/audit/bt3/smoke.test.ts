import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { preparedSetup } from '../bt2/economy'

/** Quick full-game smoke: event counts and the first fouls / free throws. BT2_AUDIT=1 BT3_SEED=424242 npx vitest run .../smoke.test.ts */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT3 smoke', () => {
  const seed = Number(process.env.BT3_SEED ?? 424242)
  const maxTicks = Number(process.env.BT3_TICKS ?? 90000)
  const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
  const errors: string[] = []
  try {
    while (!live.matchState.isComplete && live.matchState.t < maxTicks) live.advanceTicks(5)
  } catch (error) {
    errors.push(String((error as Error).stack ?? error))
  }
  const st = live.matchState
  const counts: Record<string, number> = {}
  for (const e of st.events) counts[e.type] = (counts[e.type] ?? 0) + 1
  const foulKinds: Record<string, number> = {}
  for (const e of st.events) if (e.type === 'foul') { const k = `${e.foulType}:${e.foulResolution}`; foulKinds[k] = (foulKinds[k] ?? 0) + 1 }
  const turnoverKinds: Record<string, number> = {}
  for (const e of st.events) if (e.type === 'turnover') turnoverKinds[e.turnoverType ?? '?'] = (turnoverKinds[e.turnoverType ?? '?'] ?? 0) + 1
  const stealKinds: Record<string, number> = {}
  for (const e of st.events) if (e.type === 'steal' || e.type === 'deflection' || e.type === 'stealAttempt') { const k = `${e.type}:${e.stealKind}`; stealKinds[k] = (stealKinds[k] ?? 0) + 1 }
  const phases: string[] = st.events.filter((e) => e.type === 'playStateChanged').slice(0, 60).map((e) => `${e.previousPlayPhase}>${e.playPhase}@${e.t}`)
  writeFileSync('C:/Users/jorge/AppData/Local/Temp/bt3smoke.json', JSON.stringify({ seed, t: st.t, complete: st.isComplete, score: st.score, errors, counts, foulKinds, turnoverKinds, stealKinds, fouls: st.fouls, phases }, null, 1))
}, 3_000_000)
