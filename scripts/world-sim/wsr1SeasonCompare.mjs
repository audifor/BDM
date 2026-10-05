/**
 * WSR1 continuity report from wsr1Season outputs: league aggregates per plan and per segment (FAST vs BACKGROUND universes), the
 * standings each plan produces, and player continuity across a resolution switch.
 *   node scripts/world-sim/wsr1SeasonCompare.mjs <dir>
 */
import { readFileSync } from 'node:fs'
const dir = process.argv[2] ?? '.'
const load = (name) => JSON.parse(readFileSync(`${dir}/season-${name}.json`, 'utf8'))
const plans = { FAST: load('FAST'), BG: load('BG'), 'BG>FAST': load('BG_FAST'), 'FAST>BG': load('FAST_BG') }
const keys = ['pts', 'fga', 'threeShare', 'fgPct', 'fta', 'tov', 'ast', 'reb', 'stl', 'blk', 'pf', 'topScorerShare']
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)) }
const row = (label, rows) => `${label.padEnd(26)} n=${String(rows.length).padStart(4)} ` + keys.map((k) => `${k}=${mean(rows.map((r) => r[k])).toFixed(k.includes('Share') || k === 'fgPct' ? 3 : 1)}`).join(' ') + ` homeWin=${mean(rows.filter((r) => r.isHome).map((r) => r.win)).toFixed(3)}`

console.log('== league universe by resolution (all plans pooled; the user\'s own games are always exact)')
const all = Object.values(plans).flatMap((p) => p.teamGames)
for (const r of ['FAST', 'BACKGROUND']) console.log(row(r, all.filter((g) => g.resolution === r)))
const f = all.filter((g) => g.resolution === 'FAST')
const b = all.filter((g) => g.resolution === 'BACKGROUND')
console.log('delta BACKGROUND - FAST (in FAST sd):', keys.map((k) => `${k} ${((mean(b.map((r) => r[k])) - mean(f.map((r) => r[k]))) / sd(f.map((r) => r[k]))).toFixed(2)}`).join('  '))

console.log('\n== segments of each plan (segment 0 = first half of the days, 1 = second half)')
for (const [name, p] of Object.entries(plans)) for (const s of [0, 1]) console.log(row(`${name} seg${s}`, p.teamGames.filter((g) => g.segment === s && g.resolution !== 'UNKNOWN')))

console.log('\n== standings: win share per team under each plan, correlation with the all-FAST plan')
const winShare = (p) => { const m = new Map(); for (const lines of Object.values(p.standings)) for (const l of lines) if (l.played > 0) m.set(l.teamId, l.wins / l.played); return m }
const base = winShare(plans.FAST)
for (const name of ['BG', 'BG>FAST', 'FAST>BG']) {
  const other = winShare(plans[name]); const ids = [...base.keys()].filter((id) => other.has(id))
  const xs = ids.map((id) => base.get(id)); const ys = ids.map((id) => other.get(id))
  const mx = mean(xs), my = mean(ys); let c = 0, vx = 0, vy = 0; xs.forEach((x, i) => { c += (x - mx) * (ys[i] - my); vx += (x - mx) ** 2; vy += (ys[i] - my) ** 2 })
  console.log(`${name.padEnd(8)} teams=${ids.length} winShareCorrelationWithFAST=${(c / Math.sqrt(vx * vy)).toFixed(3)} spread(sd) FAST=${sd(xs).toFixed(3)} ${name}=${sd(ys).toFixed(3)}`)
}

console.log('\n== player continuity across the switch: points per 36 minutes, segment 0 vs segment 1 (players with >= 60 minutes in each)')
for (const name of ['FAST', 'BG', 'BG>FAST', 'FAST>BG']) {
  const pairs = []
  for (const entry of Object.values(plans[name].players)) {
    const seg = (s) => { let pts = 0, min = 0; entry.segment.forEach((g, i) => { if (g === s) { pts += entry.points[i]; min += entry.minutes[i] } }); return { pts, min } }
    const a = seg(0), c = seg(1)
    if (a.min >= 60 && c.min >= 60) pairs.push([a.pts / a.min * 36, c.pts / c.min * 36])
  }
  const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1]); const mx = mean(xs), my = mean(ys); let cv = 0, vx = 0, vy = 0; xs.forEach((x, i) => { cv += (x - mx) * (ys[i] - my); vx += (x - mx) ** 2; vy += (ys[i] - my) ** 2 })
  console.log(`${name.padEnd(8)} players=${pairs.length} corr(seg0,seg1)=${(cv / Math.sqrt(vx * vy)).toFixed(3)} mean seg0=${mx.toFixed(2)} seg1=${my.toFixed(2)}`)
}
