// Serial CPU profile of four real prepared fixtures, using the same built FAST worker as Windows.
import { Session } from 'node:inspector/promises'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const out = resolve('.worlddb-v2/v2-06', process.env.BDM_WORKER_PROFILE_LABEL ?? 'worker-baseline')
mkdirSync(out, { recursive: true })
const setups = JSON.parse(readFileSync('.worlddb-v2/v2-06/source-baseline/setups.json', 'utf8'))
const selected = ['ESP', 'FRA', 'ITA', 'BRA'].map(country => setups.find(setup => setup.gameId.includes(`:${country}:`)))
if (selected.some(setup => !setup)) throw Error('Expected fixtures from all four leagues')
const bundle = readdirSync('dist/assets').find(name => /^matchSimulation\.worker-.*\.js$/.test(name))
if (!bundle) throw Error('Build the FAST worker first')
globalThis.self = globalThis
let reply
globalThis.postMessage = value => { reply = value }
await import(pathToFileURL(resolve('dist/assets', bundle)).href)
const session = new Session(); session.connect()
await session.post('Profiler.enable')
await session.post('Profiler.setSamplingInterval', { interval: 1000 })
await session.post('Profiler.start')
const results = []
for (const [index, setup] of selected.entries()) {
  const start = performance.now()
  globalThis.onmessage({ data: { jobId: index + 1, setup } })
  const elapsedMs = performance.now() - start
  if (!reply.result || reply.error) throw Error(reply.error ?? 'No FAST result')
  if (process.env.BDM_WORKER_PROFILE_AUDIT === '1') writeFileSync(join(out, `result-${index}.json`), JSON.stringify(reply.result))
  results.push({ gameId: setup.gameId, matchSeed: setup.matchSeed, elapsedMs, resultSha256: createHash('sha256').update(JSON.stringify(reply.result)).digest('hex') })
}
const { profile } = await session.post('Profiler.stop')
session.disconnect()
writeFileSync(join(out, 'engine.cpuprofile'), JSON.stringify(profile))
writeFileSync(join(out, 'profile.json'), JSON.stringify({ bundle, bundleSha256: createHash('sha256').update(readFileSync(resolve('dist/assets', bundle))).digest('hex'), results }, null, 2))
console.log(JSON.stringify({ out, results }))
