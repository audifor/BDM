/** ME-LOCK1.2: allocation by TS file/function from a sampling heap profile. node scripts/next/melock12HeapSum.mjs <profile> <bundle.map> [bundleName] */
import { readFileSync } from 'node:fs'
import { SourceMapConsumer } from 'source-map-js'
const prof = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const smc = new SourceMapConsumer(JSON.parse(readFileSync(process.argv[3], 'utf8')))
const byFn = new Map(), byFile = new Map(); let total = 0
const src = (s) => (s ?? '?').replace(/^.*?\/src\//, 'src/')
const walk = (n) => {
  const self = (n.selfSize ?? 0)
  if (self > 0) {
    const cf = n.callFrame
    let key = `(native) ${cf.functionName}`, file = '(native)'
    if (cf.url.endsWith(process.argv[4] ?? 'run.mjs')) { const p = smc.originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber }); key = `${cf.functionName || '(anon)'} ${src(p.source)}:${p.line}`; file = src(p.source) }
    byFn.set(key, (byFn.get(key) ?? 0) + self); byFile.set(file, (byFile.get(file) ?? 0) + self); total += self
  }
  for (const c of n.children ?? []) walk(c)
}
walk(prof.head)
const mb = (b) => (b / 1e6).toFixed(0).padStart(6) + ' MB ' + (100 * b / total).toFixed(1).padStart(5) + '%'
console.log('TOTAL sampled', (total / 1e6).toFixed(0), 'MB')
for (const [k, v] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(mb(v), k)
console.log('--')
for (const [k, v] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log(mb(v), k)
