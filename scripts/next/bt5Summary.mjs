/**
 * BT5 audit summary: reads docs/match-next-bt5/audit/exp-<prefix>-<config>.json and prints the tables of the report.
 * usage: node scripts/next/bt5Summary.mjs [prefix=v1]
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'

const prefix = process.argv[2] ?? 'v1'
const dir = 'docs/match-next-bt5/audit'
const load = (name) => {
  const file = `${dir}/exp-${prefix}-${name}.json`
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf-8')).out[name]
}
const SCALES = { secondsPerPossession: 1.5, transitionShare: 0.05, passesPerPossession: 0.5, drivesPerPossession: 0.12, screensPerPossession: 0.12, cutsPerPossession: 0.05, rimShare: 0.05, midShare: 0.04, threeShare: 0.05, catchShootShare: 0.05, pullUpShare: 0.03, prShare: 0.04, orebRate: 0.04, tovPerPossession: 0.02 }
const distance = (a, b) => Object.entries(SCALES).reduce((s, [k, sc]) => s + Math.abs(a[k] - b[k]) / sc, 0) / Object.keys(SCALES).length
const f2 = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v))
const pct = (v) => (typeof v === 'number' ? (v * 100).toFixed(1) + '%' : String(v))
const lines = []
const out = (s = '') => { lines.push(s); console.log(s) }

const offenseRow = (name, f) => `| ${name} | ${f2(f.possessions)} | ${f2(f.secondsPerPossession)} | ${pct(f.transitionShare)} | ${f2(f.passesPerPossession)} | ${f2(f.drivesPerPossession)} | ${f2(f.screensPerPossession)} | ${f2(f.cutsPerPossession + f.offBallScreensPerPossession)} | ${pct(f.rimShare)} | ${pct(f.midShare)} | ${pct(f.threeShare)} | ${pct(f.catchShootShare)} | ${pct(f.pullUpShare)} | ${pct(f.orebRate)} | ${pct(f.tovPerPossession)} | ${f2(f.ppp)} | ${f2(f.assistsPerFgm)} | ${pct(f.topInitiatorShare)} | ${Object.entries(f.spacing).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')} |`
const offenseHeader = '| config | pos. | s/pos | trans. | pases/pos | penet./pos | bloq./pos | sin balón/pos | aro | media | triple | C&S | pull-up | %OREB | TOV/pos | PPP | AST/FGM | iniciador top | spacing |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'
const families = (f) => Object.entries(f.playFamilies).map(([k, v]) => `${k} ${Math.round(v * 100)}`).join(' · ')

const groups = {
  'TEST A · misma plantilla, distinto entrenador': ['neutral', 'coachA', 'coachB', 'coachC'],
  'TEST B · mismo entrenador (C), distinta plantilla': ['coachC', 'rosterCreation', 'rosterInterior', 'rosterDefense'],
  'TEST C · misma plantilla y entrenador (C), distinto plan': ['coachC', 'planInside', 'planSpread', 'planPush'],
  'BT5.23 · entrenador x plantilla': ['coachA', 'coachA_creation', 'coachA_interior', 'coachB', 'coachB_creation', 'coachB_interior'],
  'Familiaridad': ['coachC', 'familiarityLow', 'familiarityHigh'],
  'Mandos antiguos (perfil de tiro, ya no multiplica)': ['neutral', 'legacyThree', 'legacyRim'],
}
for (const [title, names] of Object.entries(groups)) {
  out(`\n### ${title}\n`)
  out(offenseHeader)
  const prints = names.map((n) => [n, load(n)]).filter(([, v]) => v !== undefined)
  for (const [n, v] of prints) out(offenseRow(n, v.home))
  out('')
  for (const [n, v] of prints) out(`- ${n}: familias ${families(v.home)}; cobertura usada ${JSON.stringify(v.home.coverageUsed)}; roll ${pct(v.home.rollShare)}; ajustes ${v.home.adaptations}`)
  out('\nDistancia de identidad (0 = mismo estilo):\n')
  for (let i = 0; i < prints.length; i += 1) for (let j = i + 1; j < prints.length; j += 1) out(`- ${prints[i][0]} ↔ ${prints[j][0]}: ${distance(prints[i][1].home, prints[j][1].home).toFixed(2)}`)
}

out('\n### TEST D · mismo equipo local (neutro), distinto rival\n')
out(offenseHeader)
for (const n of ['neutral', 'oppCreation', 'oppDefense', 'oppCoachA']) { const v = load(n); if (v) out(offenseRow(n, v.home)) }
for (const n of ['oppCreation', 'oppDefense', 'oppCoachA']) { const a = load('neutral'), b = load(n); if (a && b) out(`- neutral ↔ ${n} (local): ${distance(a.home, b.home).toFixed(2)}`) }

out('\n### BT5.19 · lo que concede cada cobertura (ataque rival frente a la defensa local)\n')
out('| cobertura | PPP rival | aro rival | triple rival | pull-up rival | PnR (manejador+roller) rival | TOV/pos rival | robos/pos local | switches/bloqueo | ayudas/penetración |\n|---|---|---|---|---|---|---|---|---|---|')
for (const n of ['covDrop', 'covSwitch', 'covHedge', 'covBlitz']) {
  const v = load(n); if (!v) continue
  out(`| ${n} | ${f2(v.away.ppp)} | ${pct(v.away.rimShare)} | ${pct(v.away.threeShare)} | ${pct(v.away.pullUpShare)} | ${pct(v.away.prShare)} | ${pct(v.away.tovPerPossession)} | ${pct(v.home.stealsPerOppPossession)} | ${f2(v.home.switchesPerScreenFaced)} | ${f2(v.home.helpsPerDriveFaced)} |`)
}
out('\n### BT5.19 · ayuda y presión (ataque rival frente a la defensa local)\n')
out('| defensa local | PPP rival | aro rival | triple rival | C&S rival | TOV/pos rival | robos/pos local | tapones/FGA | FTA/FGA rival | ayudas/penetración | TAG/DIG por partido |\n|---|---|---|---|---|---|---|---|---|---|---|')
for (const n of ['helpHigh', 'helpLow', 'pressureHigh', 'pressureLow', 'coachC']) {
  const v = load(n); if (!v) continue
  out(`| ${n} | ${f2(v.away.ppp)} | ${pct(v.away.rimShare)} | ${pct(v.away.threeShare)} | ${pct(v.away.catchShootShare)} | ${pct(v.away.tovPerPossession)} | ${pct(v.home.stealsPerOppPossession)} | ${pct(v.home.blocksPerOppFga)} | ${f2(v.away.ftaPerFga)} | ${f2(v.home.helpsPerDriveFaced)} | ${JSON.stringify(v.home.helpKinds)} |`)
}
out('\n### BT5.26 · adaptación\n')
for (const n of ['adaptHigh', 'adaptLow']) {
  const v = load(n); if (!v) continue
  out(`- ${n}: ajustes por partido ${v.home.adaptations}; cobertura usada ${JSON.stringify(v.home.coverageUsed)}; PPP rival ${f2(v.away.ppp)}`)
}
writeFileSync(`${dir}/summary-${prefix}.md`, lines.join('\n'))
