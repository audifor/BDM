/**
 * ME-LOCK1.2: allocation profile of FAST simulation only (prepare excluded), counting objects later collected by the scavenger,
 * i.e. the transient allocation of the immutable step pipeline. Writes a .heapprofile for melock12HeapSum.mjs.
 *   node <bundle> [seed] [out.heapprofile]
 */
import { Session } from 'node:inspector/promises'
import { writeFileSync } from 'node:fs'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEnginePort } from '@/app/matchNext/MatchNextEnginePort'
import { getNextUserGame } from '@/engine/calendar'

const seed = Number(process.argv[2] ?? 3_498_342_002)
const out = process.argv[3] ?? 'alloc.heapprofile'
const world = createNewGame()
const port = createMatchEnginePort('match-next') as MatchNextEnginePort
const setup = port.prepare(world, getNextUserGame(world)!, seed)
const session = new Session()
session.connect()
await session.post('HeapProfiler.enable')
await session.post('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
const t0 = performance.now()
const result = port.simulate(setup, 'FAST')
const ms = performance.now() - t0
const { profile } = await session.post('HeapProfiler.stopSampling')
writeFileSync(out, JSON.stringify(profile))
console.log(JSON.stringify({ ms: Math.round(ms), ticks: result.finalState.t, events: result.events.length }))
