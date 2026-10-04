/** ME-LOCK1: hottest source lines (self samples) of a .cpuprofile. node scripts/next/melock1Lines.mjs <file> [n] */
import { readFileSync } from 'node:fs'
const prof = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const interval = (prof.endTime - prof.startTime) / prof.samples.length
const lines = new Map()
for (const n of prof.nodes) for (const p of n.positionTicks ?? []) { const k = `${n.callFrame.url.replace(/^.*\/src\//, 'src/')}:${p.line} ${n.callFrame.functionName}`; lines.set(k, (lines.get(k) ?? 0) + p.ticks) }
const total = prof.samples.length
for (const [k, t] of [...lines].sort((a, b) => b[1] - a[1]).slice(0, Number(process.argv[3] ?? 40))) console.log(((t * interval) / 1000).toFixed(0).padStart(6), 'ms', (100 * t / total).toFixed(1).padStart(5) + '%', k)
