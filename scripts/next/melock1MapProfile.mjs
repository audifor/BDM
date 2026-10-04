/** ME-LOCK1: source-mapped CPU profile summary (self time by TS file, function and line) for a bundle built by melock1Build.mjs.
 *  node scripts/next/melock1MapProfile.mjs <profile> <bundle.mjs.map> [topLines] */
import { readFileSync } from 'node:fs'
import { SourceMapConsumer } from 'source-map-js'
const prof = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const smc = new SourceMapConsumer(JSON.parse(readFileSync(process.argv[3], 'utf8')))
const top = Number(process.argv[4] ?? 50)
const dt = prof.timeDeltas; const selfUs = new Map(); let total = 0
for (let i = 0; i < prof.samples.length; i++) { const d = dt[i] ?? 0; selfUs.set(prof.samples[i], (selfUs.get(prof.samples[i]) ?? 0) + d); total += d }
const src = (s) => (s ?? '?').replace(/^.*?\/src\//, 'src/').replace(/^.*node_modules\//, 'nm/')
const byFile = new Map(), byFn = new Map(), byLine = new Map()
const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v)
for (const n of prof.nodes) {
  const t = selfUs.get(n.id) ?? 0; if (t === 0) continue
  const cf = n.callFrame
  if (!cf.url.endsWith('run.mjs')) { add(byFile, cf.functionName ? `(native) ${cf.functionName}` : '(native/idle)', t); continue }
  const fnPos = smc.originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber })
  add(byFile, src(fnPos.source), t); add(byFn, `${cf.functionName || '(anon)'} ${src(fnPos.source)}:${fnPos.line}`, t)
  const ticks = n.positionTicks ?? []; const sum = ticks.reduce((a, p) => a + p.ticks, 0)
  for (const p of ticks) { const o = smc.originalPositionFor({ line: p.line, column: 0, bias: SourceMapConsumer.LEAST_UPPER_BOUND }); add(byLine, `${src(o.source)}:${o.line}`, t * p.ticks / Math.max(1, sum)) }
}
const ms = (t) => (t / 1000).toFixed(0).padStart(7) + ' ms ' + (100 * t / total).toFixed(1).padStart(5) + '%'
console.log('TOTAL', (total / 1000).toFixed(0), 'ms')
console.log('\n== by file'); for (const [k, t] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(ms(t), k)
console.log('\n== by function'); for (const [k, t] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(ms(t), k)
console.log('\n== by line'); for (const [k, t] of [...byLine].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(ms(t), k)
