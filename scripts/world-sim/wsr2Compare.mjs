/**
 * WSR2 exact-world comparison between two wsr2Lifecycle outputs (baseline vs candidate): per day, the whole-world hash and every
 * differing domain; plus lifecycle timing per day.
 *   node scripts/world-sim/wsr2Compare.mjs <base.json> <candidate.json>
 */
import { readFileSync } from 'node:fs'
const [baseFile, candidateFile] = process.argv.slice(2)
const base = JSON.parse(readFileSync(baseFile, 'utf8'))
const next = JSON.parse(readFileSync(candidateFile, 'utf8'))
let differing = 0
base.days.forEach((day, index) => {
  const other = next.days[index]
  if (other === undefined) { console.log(`day ${index}: missing in candidate`); differing += 1; return }
  const domains = Object.keys(day.domains).filter((key) => day.domains[key] !== other.domains[key])
  const extra = Object.keys(other.domains).filter((key) => day.domains[key] === undefined)
  if (day.world !== other.world) differing += 1
  console.log(`day ${index} games ${day.games}: ${day.world === other.world ? 'IDENTICAL' : `DIFFERENT (${[...domains, ...extra].join(', ')})`}  lifecycle ${day.lifecycleMs} -> ${other.lifecycleMs} ms  total ${day.totalMs} -> ${other.totalMs} ms`)
})
console.log(differing === 0 ? `EXACT · ${base.days.length} days · ${base.census.teams} teams` : `${differing} DIFFERENT day(s)`)
if (differing > 0) process.exitCode = 1
