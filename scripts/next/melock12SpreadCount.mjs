/** ME-LOCK1.2 profile tool: bundles an entry with every `{ ...state|next|input|current|base|s, ... }` in Match Next wrapped in a counter (globalThis.__sp), to count MatchState copies per tick.
 *  node scripts/next/melock12SpreadCount.mjs scripts/next/melock12SpreadRun.ts node_modules/.cache/melock12/spread.mjs && node node_modules/.cache/melock12/spread.mjs */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const plugin = { name: 'spreadcount', setup(b) {
  b.onLoad({ filter: /match-next.*\.ts$/ }, (args) => {
    let s = readFileSync(args.path, 'utf8')
    s = s.replace(/\{ ?\.\.\.(state|next|input|current|base|s)\b,/g, (m, v) => `{ ...(globalThis.__sp(${v})),`)
    return { contents: s, loader: 'ts' }
  })
} }
await build({ entryPoints: [process.argv[2]], outfile: process.argv[3], bundle: true, platform: 'node', format: 'esm', target: 'node22', alias: { '@': resolve('src') }, plugins: [plugin], logLevel: 'warning', define: { 'import.meta.env.DEV': 'false' } })
