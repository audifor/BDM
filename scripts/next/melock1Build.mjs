/** Bundles scripts/next/melock1Run.ts (and other ME-LOCK1 runners) for plain node with a source map. node scripts/next/melock1Build.mjs [entry] [out] */
import { build } from 'esbuild'
import { resolve } from 'node:path'
const entry = process.argv[2] ?? 'scripts/next/melock1Run.ts'
const outfile = process.argv[3] ?? 'node_modules/.cache/melock1/run.mjs'
await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true, alias: { '@': resolve('src') }, logLevel: 'warning', define: { 'import.meta.env.DEV': 'false' } })
console.log('built', outfile)
