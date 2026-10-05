/**
 * ME-LOCK1.2 parallel throughput: K independent processes (Node's equivalent of K Web Workers, one isolate each) each simulate the
 * same list of corpus matches; wall time from the first spawn to the last exit gives matches per second at K-way parallelism.
 * World creation happens once per process before its timer starts, so only simulation is measured (each child reports its own span).
 *   node scripts/next/melock12Scaling.mjs <corpus bundle> [K list=1,2,4,6,8,10,12] [ids]
 */
import { spawn } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const [bundle, kArg, idsArg] = process.argv.slice(2)
const ks = (kArg ?? '1,2,4,6,8,10,12').split(',').map(Number)
const ids = idsArg ?? 'p0-7,p1-11,p3-99,fiba-p1-5'
const perProcess = ids.split(',').length
const runOne = (k) => new Promise((resolve) => {
  const outs = Array.from({ length: k }, (_, i) => `${tmpdir()}/melock12-scale-${process.pid}-${k}-${i}.json`)
  let pending = k
  const t0 = performance.now()
  for (const out of outs) {
    const child = spawn(process.execPath, [bundle, '--only', ids, '--out', out], { stdio: 'ignore' })
    child.on('exit', () => { pending -= 1; if (pending === 0) resolve({ wall: performance.now() - t0, outs }) })
  }
})
const rows = []
for (const k of ks) {
  const { wall, outs } = await runOne(k)
  const sims = outs.map((out) => Object.values(JSON.parse(readFileSync(out, 'utf8'))).reduce((sum, r) => sum + r.ms, 0))
  for (const out of outs) rmSync(out, { force: true })
  const matches = k * perProcess
  const meanMatch = sims.reduce((a, b) => a + b, 0) / matches
  rows.push({ k, matches, wallS: +(wall / 1000).toFixed(1), meanMatchMs: Math.round(meanMatch), throughputPerS: +(matches / (wall / 1000)).toFixed(2) })
  console.log(JSON.stringify(rows.at(-1)))
}
const one = rows.find((row) => row.k === 1)
if (one) for (const row of rows) console.log(`K=${String(row.k).padStart(2)}  ${row.throughputPerS} matches/s  speedup x${(row.throughputPerS / one.throughputPerS).toFixed(2)}  efficiency ${(100 * row.throughputPerS / one.throughputPerS / row.k).toFixed(0)}%  mean match ${row.meanMatchMs} ms`)
