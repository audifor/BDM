/** ME-LOCK1: summarize a V8 .cpuprofile. node scripts/next/melock1Profile.mjs <file.cpuprofile> [inclusiveNames,...] */
import { readFileSync } from 'node:fs'
const prof = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const nodes = new Map(prof.nodes.map((n) => [n.id, n]))
const parent = new Map(); for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
const self = new Map(); const dt = prof.timeDeltas; let total = 0
for (let i = 0; i < prof.samples.length; i++) { const d = dt[i] ?? 0; self.set(prof.samples[i], (self.get(prof.samples[i]) ?? 0) + d); total += d }
const short = (u) => (u || '(native)').replace(/^.*\/src\//, 'src/').replace(/^.*node_modules\//, 'nm/')
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${short(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`
const byFn = new Map(), byFile = new Map()
for (const [id, t] of self) { const n = nodes.get(id); byFn.set(key(n), (byFn.get(key(n)) ?? 0) + t); const f = short(n.callFrame.url); byFile.set(f, (byFile.get(f) ?? 0) + t) }
const ms = (t) => (t / 1000).toFixed(0).padStart(7) + ' ms ' + (100 * t / total).toFixed(1).padStart(5) + '%'
console.log('TOTAL sampled', (total / 1000).toFixed(0), 'ms')
console.log('\n== self time by file'); for (const [k, t] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(ms(t), k)
console.log('\n== self time by function'); for (const [k, t] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log(ms(t), k)
// inclusive time by function name (counted once per sample stack)
const names = (process.argv[3] ?? '').split(',').filter(Boolean)
if (names.length) {
  const inc = new Map(names.map((n) => [n, 0]))
  for (let i = 0; i < prof.samples.length; i++) { const d = dt[i] ?? 0; const seen = new Set(); let id = prof.samples[i]; while (id !== undefined) { const fn = nodes.get(id).callFrame.functionName; if (inc.has(fn) && !seen.has(fn)) { inc.set(fn, inc.get(fn) + d); seen.add(fn) } id = parent.get(id) } }
  console.log('\n== inclusive'); for (const [k, t] of inc) console.log(ms(t), k)
}
