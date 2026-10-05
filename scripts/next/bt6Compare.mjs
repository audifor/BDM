/** Compact BT6 comparison: node scripts/next/bt6Compare.mjs <prefix> [<prefix> ...] -> one line per config and prefix. */
import { readdirSync, readFileSync } from 'node:fs'
const dir = 'docs/match-next-bt6/audit'
const rows = []
for (const prefix of process.argv.slice(2)) {
  for (const file of readdirSync(dir).filter((f) => f.startsWith(`exp-${prefix}-`) && f.endsWith('.json'))) {
    const json = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))
    for (const [name, o] of Object.entries(json.out)) {
      const t = o.totals, d = o.home.bt6.defense, a = o.away.fingerprint, h = o.home.fingerprint
      const tc = {}; for (const s of ['home', 'away']) for (const [k, v] of Object.entries(o[s].bt6.offense.turnoverCauses)) tc[k] = (tc[k] ?? 0) + v
      const fouls = Object.entries(d.foulsCommitted).filter(([k]) => k.startsWith('def:')).reduce((x, [, v]) => x + v, 0)
      rows.push({ name, prefix, seeds: json.seeds.length, poss: t.possessions, ppp: t.ppp, tov: t.turnovers, stl: t.steals, fta: t.fta, s: t.possessionSecondsMean, w8: t.shotsWithin8, oppPPP: a.ppp, oppTOV: a.tovPerPossession, stlOpp: d.stealsPerOppPossession, blow: d.blowByShare, cont: d.containedShare, drv: d.drivesFacedPerGame, oppRim: a.rimShare, opp3: a.threeShare, defFouls: fouls, homePPP: h.ppp, ast: t.astPerFgm, trans: tc.transitionPass ?? 0, defl: tc.deflectedPass ?? 0, strip: tc.onBallStrip ?? 0, int: tc.interception ?? 0, pick: d.ballPressure.pickupsPerGame ?? 0, pt3: a.threeShare })
    }
  }
}
rows.sort((a, b) => a.name.localeCompare(b.name) || a.prefix.localeCompare(b.prefix))
const f = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : v)
console.log('config            prefix   n  poss   PPP   TOV   STL  FTA  s/pos  <=8 | oppPPP oppTOV stl/op blow  cont  drv  oppRim opp3 defF | hPPP  AST | TOVcause trans defl strip int | pick')
for (const r of rows) console.log(`${r.name.padEnd(17)} ${r.prefix.padEnd(8)} ${r.seeds} ${f(r.poss, 1).padStart(5)} ${f(r.ppp)} ${f(r.tov, 1).padStart(5)} ${f(r.stl, 1).padStart(5)} ${f(r.fta, 1).padStart(4)} ${f(r.s)} ${f(r.w8, 1).padStart(5)} | ${f(r.oppPPP)}  ${f(r.oppTOV, 3)}  ${f(r.stlOpp, 3)} ${f(r.blow)} ${f(r.cont)} ${f(r.drv, 0).padStart(3)}  ${f(r.oppRim)}  ${f(r.opp3)} ${f(r.defFouls, 1).padStart(4)} | ${f(r.homePPP)} ${f(r.ast)} | ${f(r.trans, 1)} ${f(r.defl, 1)} ${f(r.strip, 1)} ${f(r.int, 1)} | ${f(r.pick, 1)}`)
