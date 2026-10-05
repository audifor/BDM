/**
 * ME-LOCK1.2 A/B timing: runs the same corpus cases with two corpus bundles, alternating (base, new, base, new, ...) so machine drift
 * hits both alike. Single process at a time, nothing else should run. Prints the per-round sums and the median ratio.
 *   node scripts/next/melock12Ab.mjs <base.mjs> <new.mjs> [rounds=3] [ids]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const [base, next, roundsArg, idsArg] = process.argv.slice(2)
const rounds = Number(roundsArg ?? 3)
const ids = idsArg ?? 'p0-3498342002,nba-p2-22,style-fast-ctrl,foul-limit-2-press,acb4-72'
const run = (bundle, tag) => {
  const out = `${tmpdir()}/melock12-ab-${process.pid}-${tag}.json`
  execFileSync(process.execPath, [bundle, '--only', ids, '--out', out], { stdio: ['ignore', 'ignore', 'ignore'] })
  const records = JSON.parse(readFileSync(out, 'utf8'))
  return { total: Object.values(records).reduce((sum, r) => sum + r.ms, 0), hashes: Object.values(records).map((r) => r.result).join(',') }
}
const ratios = []
for (let round = 0; round < rounds; round += 1) {
  const a = run(base, 'a')
  const b = run(next, 'b')
  ratios.push(b.total / a.total)
  console.log(`round ${round + 1}: base ${a.total} ms  new ${b.total} ms  ratio ${(b.total / a.total).toFixed(3)}  ${a.hashes === b.hashes ? 'same results' : 'RESULTS DIFFER'}`)
}
ratios.sort((x, y) => x - y)
console.log(`median ratio new/base ${ratios[Math.floor(ratios.length / 2)].toFixed(3)} over ${ids.split(',').length} cases`)
