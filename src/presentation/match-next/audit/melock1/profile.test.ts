import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { Session } from 'node:inspector'
import { createNewGame } from '@/app/game'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { getNextUserGame } from '@/engine/calendar'

/** ME-LOCK1 profiling run: one Instant match through the production port. MELOCK_PROFILE=1 [MELOCK_SEED=..] (run with NODE_OPTIONS=--cpu-prof). */
it.skipIf(process.env.MELOCK_PROFILE === undefined)('ME-LOCK1 profile one match', async () => {
  const world = createNewGame()
  const game = getNextUserGame(world)!
  const port = createMatchEnginePort('match-next')
  const t0 = performance.now()
  const setup = port.prepare(world, game, Number(process.env.MELOCK_SEED ?? 3_498_342_002))
  const session = new Session()
  const cpu = process.env.MELOCK_CPU !== undefined
  const post = (method: string, params?: object): Promise<any> => new Promise((resolve, reject) => session.post(method, params ?? {}, (error, value) => error ? reject(error) : resolve(value)))
  if (cpu) { session.connect(); await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 250 }); await post('Profiler.start') }
  const t1 = performance.now()
  const result = port.runInstant(setup)
  const t2 = performance.now()
  if (cpu) { const { profile } = await post('Profiler.stop'); mkdirSync('docs/match-next-melock1', { recursive: true }); writeFileSync(process.env.MELOCK_CPU!, JSON.stringify(profile)); session.disconnect() }
  const s = result.finalState
  mkdirSync('docs/match-next-melock1', { recursive: true })
  writeFileSync('docs/match-next-melock1/profile-run.json', JSON.stringify({ prepareMs: t1 - t0, instantMs: t2 - t1, ticks: s.t, possessions: s.possessions.length, events: s.events.length, score: result.score }, null, 1))
}, 6_000_000)
