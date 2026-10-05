/** Cross-config scorecard (mean over every config of a matrix, both teams): node scripts/next/bt6Scorecard.mjs <prefix> [<prefix> ...] */
import { readdirSync, readFileSync } from 'node:fs'
const dir = 'docs/match-next-bt6/audit'
const ZONES = ['RESTRICTED', 'RIM', 'SHORT_PAINT', 'FLOATER_RANGE', 'MIDRANGE', 'LONG_MIDRANGE', 'CORNER_THREE', 'ABOVE_BREAK_THREE', 'DEEP']
for (const prefix of process.argv.slice(2)) {
  const all = {}
  for (const f of readdirSync(dir).filter((x) => x.startsWith(`exp-${prefix}-g`))) Object.assign(all, JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).out)
  const configs = Object.values(all)
  const n = configs.length
  const avg = (f) => configs.reduce((s, o) => s + f(o), 0) / n
  const t = (k) => avg((o) => o.totals[k])
  const share = (keys) => { let a = 0, tot = 0; for (const o of configs) for (const s of ['home', 'away']) for (const k of ZONES) { const z = o[s].bt6.offense.zones[k]; const x = z ? +z.split(' @ ')[0] : 0; tot += x; if (keys.includes(k)) a += x } return (a / tot).toFixed(3) }
  const fg = (k) => { let a = 0, m = 0; for (const o of configs) for (const s of ['home', 'away']) { const z = o[s].bt6.offense.zones[k]; if (z) { const [x, y] = z.split(' @ '); a += +x; m += +x * +y } } return (m / a).toFixed(3) }
  const sum = (path) => { const out = {}; for (const o of configs) for (const s of ['home', 'away']) for (const [k, v] of Object.entries(path(o[s]) ?? {})) out[k] = (out[k] ?? 0) + v / n; return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +v.toFixed(2)])) }
  console.log(`${prefix}: configs ${n} poss ${t('possessions').toFixed(1)} PPP ${t('ppp').toFixed(3)} TOV ${t('turnovers').toFixed(1)} TOV% ${t('tovPct').toFixed(2)} STL ${t('steals').toFixed(1)} STL/poss ${(t('steals') / t('possessions')).toFixed(3)} FTA ${t('fta').toFixed(1)} FTr ${t('ftRate').toFixed(3)} AST/FGM ${t('astPerFgm').toFixed(2)} OREB% ${t('orebPct').toFixed(1)} FGA ${t('fga').toFixed(1)} s/poss ${t('possessionSecondsMean').toFixed(2)} <=8 ${t('shotsWithin8').toFixed(1)} fouls ${t('fouls').toFixed(1)} BLK ${t('blocks').toFixed(1)} drives ${t('drives').toFixed(1)}`)
  console.log(`  shares rim ${share(['RESTRICTED', 'RIM'])} paint ${share(['SHORT_PAINT', 'FLOATER_RANGE'])} mid ${share(['MIDRANGE', 'LONG_MIDRANGE'])} three ${share(['CORNER_THREE', 'ABOVE_BREAK_THREE', 'DEEP'])} | FG restricted ${fg('RESTRICTED')} rim ${fg('RIM')} paint ${fg('SHORT_PAINT')} above3 ${fg('ABOVE_BREAK_THREE')} corner3 ${fg('CORNER_THREE')}`)
  console.log(`  TOV causes ${JSON.stringify(sum((side) => side.bt6.offense.turnoverCauses))}`)
  console.log(`  steals ${JSON.stringify(sum((side) => side.bt6.defense.stealKinds))}`)
  if (configs[0]?.home.drives) {
    console.log(`  drives nextAct ${JSON.stringify(sum((side) => side.drives?.nextAct))}`)
    console.log(`  drives afterFirstPass ${JSON.stringify(sum((side) => side.drives?.afterFirstPass))}`)
    console.log(`  rim by source ${JSON.stringify(sum((side) => side.drives?.rimBySource))}`)
    console.log(`  shooting fouls by source ${JSON.stringify(sum((side) => side.drives?.shootingFoulsBySource))}`)
    const ip = avg((o) => (o.home.drives?.interiorPassesPerGame ?? 0) + (o.away.drives?.interiorPassesPerGame ?? 0))
    const il = avg((o) => (o.home.drives?.interiorPassesPerGame ?? 0) * (o.home.drives?.interiorLostShare ?? 0) + (o.away.drives?.interiorPassesPerGame ?? 0) * (o.away.drives?.interiorLostShare ?? 0))
    console.log(`  interior passes/g ${ip.toFixed(1)} lost/g ${il.toFixed(2)} (${(100 * il / Math.max(1e-9, ip)).toFixed(1)}%)`)
  }
}
