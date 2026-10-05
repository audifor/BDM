/**
 * BT6 summary tables from docs/match-next-bt6/audit/exp-<prefix>-*.json.
 * usage: node scripts/next/bt6Summary.mjs <prefix> [> out.md]
 */
import { readdirSync, readFileSync } from 'node:fs'

const prefix = process.argv[2] ?? 'base'
const dir = 'docs/match-next-bt6/audit'
const all = {}
for (const file of readdirSync(dir).filter((f) => f.startsWith(`exp-${prefix}-`) && f.endsWith('.json'))) {
  const json = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))
  Object.assign(all, json.out)
}
const f = (v, d = 2) => (v === undefined || v === null || Number.isNaN(v) ? '-' : typeof v === 'number' ? v.toFixed(d) : String(v))
const pct = (v) => (v === undefined ? '-' : `${(100 * v).toFixed(1)}%`)
const row = (cells) => `| ${cells.join(' | ')} |`
const names = Object.keys(all)
const out = []

out.push(`## Totals (both teams, per game) · ${prefix}`, '')
out.push(row(['config', 'poss', 'pts', 'PPP', 'FGA', '2PA', '3PA', 'FTA', 'TOV', 'TOV%', 'STL', 'OREB', 'DREB', 'OREB%', 'AST', 'fouls', 'BLK', 'trans', 'shots<=8', 'HC poss', 's/poss', 'pass/poss', 'drives', 'BS', 'offball', 'post']))
out.push(row(Array(26).fill('---')))
for (const name of names) {
  const t = all[name].totals
  out.push(row([name, f(t.possessions, 1), f(t.points, 1), f(t.ppp), f(t.fga, 1), f(t.twoPa, 1), f(t.threePa, 1), f(t.fta, 1), f(t.turnovers, 1), f(t.tovPct, 1), f(t.steals, 1), f(t.oreb, 1), f(t.dreb, 1), f(t.orebPct, 1), f(t.assists, 1), f(t.fouls, 1), f(t.blocks, 1), f(t.transitionPossessions, 1), f(t.shotsWithin8, 1), f(t.halfCourtPossessions, 1), f(t.possessionSecondsMean), f(t.passesPerPossession), f(t.drives, 1), f(t.ballScreens, 1), f(t.offBallActions, 1), f(t.postPlays, 1)]))
}

out.push('', '## Home DEFENSE (what the home team concedes and forces)', '')
out.push(row(['config', 'opp PPP', 'opp TOV/poss', 'STL/opp poss', 'drives faced/g', 'blow-by', 'contained', 'ball gap', 'tight', 'pass loss pressured', 'pass loss free', 'helps/g', 'helper travel', 'kick-out share', 'kick-out PPS', 'kick-out 3 share', 'opp rim FG', 'BLK/opp rim', 'fouls (def)']))
out.push(row(Array(19).fill('---')))
for (const name of names) {
  const d = all[name].home.bt6.defense
  const away = all[name].away
  const fouls = Object.entries(d.foulsCommitted).filter(([k]) => k.startsWith('def:')).reduce((a, [, v]) => a + v, 0)
  out.push(row([name, f(away.fingerprint.ppp), f(away.fingerprint.tovPerPossession, 3), f(d.stealsPerOppPossession, 3), f(d.drivesFacedPerGame, 1), pct(d.blowByShare), pct(d.containedShare), f(d.ballPressure.meanGap), pct(d.ballPressure.tightShare), pct(d.ballPressure.passLossUnderPressure), pct(d.ballPressure.passLossFree), f(d.help.triggeredPerGame, 1), f(d.help.helperTravelMean), pct(d.help.kickOutShare), f(d.help.kickOutPpShot), pct(d.help.kickOutThreeShare), pct(d.oppRimFgPct), pct(d.blocksPerOppRim), f(fouls, 1)]))
}

out.push('', '## Away OFFENSE shot profile vs the home defense', '')
out.push(row(['config', 'rim', 'paint', 'mid', 'three', 'C&S', 'pull-up', 'FTA/FGA', 'rim FG']))
out.push(row(Array(9).fill('---')))
for (const name of names) {
  const p = all[name].away.fingerprint
  out.push(row([name, pct(p.rimShare), pct(p.paintShare), pct(p.midShare), pct(p.threeShare), pct(p.catchShootShare), pct(p.pullUpShare), f(p.ftaPerFga), pct(all[name].away.bt6.offense.rimFgPct)]))
}

out.push('', '## Turnover causes (both teams, per game)', '')
const causes = new Set()
for (const name of names) for (const side of ['home', 'away']) for (const k of Object.keys(all[name][side].bt6.offense.turnoverCauses)) causes.add(k)
const causeList = [...causes].sort()
out.push(row(['config', ...causeList]))
out.push(row(Array(causeList.length + 1).fill('---')))
for (const name of names) {
  const c = (k) => (all[name].home.bt6.offense.turnoverCauses[k] ?? 0) + (all[name].away.bt6.offense.turnoverCauses[k] ?? 0)
  out.push(row([name, ...causeList.map((k) => f(c(k), 1))]))
}

out.push('', '## Steals by kind (both teams, per game)', '')
const kinds = ['CLEAN_STEAL', 'POKE_LOOSE', 'DEFLECTION', 'PASS_INTERCEPTION']
out.push(row(['config', ...kinds]))
out.push(row(Array(kinds.length + 1).fill('---')))
for (const name of names) out.push(row([name, ...kinds.map((k) => f((all[name].home.bt6.defense.stealKinds[k] ?? 0) + (all[name].away.bt6.defense.stealKinds[k] ?? 0), 1))]))

out.push('', '## Possession durations (both teams, per game)', '')
const buckets = ['<=4', '5-8', '9-12', '13-16', '17-20', '>20']
const classes = ['fastBreak', 'earlyOffense', 'earlyAfterInbound', 'halfCourt']
out.push(row(['config', 'class', ...buckets, 'total']))
out.push(row(Array(buckets.length + 3).fill('---')))
for (const name of names) {
  for (const klass of classes) {
    const v = (b) => (all[name].home.bt6.offense.durationBuckets[`${klass}|${b}`] ?? 0) + (all[name].away.bt6.offense.durationBuckets[`${klass}|${b}`] ?? 0)
    out.push(row([name, klass, ...buckets.map((b) => f(v(b), 1)), f(buckets.reduce((a, b) => a + v(b), 0), 1)]))
  }
  const e = (b) => (all[name].home.bt6.offense.durationByEnd[`turnover|${b}`] ?? 0) + (all[name].away.bt6.offense.durationByEnd[`turnover|${b}`] ?? 0)
  out.push(row([name, 'ended by turnover', ...buckets.map((b) => f(e(b), 1)), f(buckets.reduce((a, b) => a + e(b), 0), 1)]))
  const h = all[name].home.bt6.offense
  out.push(row([name, `OREB continuation: ${f(h.orebContinuations, 1)}/g home, mean ${f(h.orebContinuationSecondsMean)} s`, '', '', '', '', '', '', '']))
}

out.push('', '## Paint crowding (home offense)', '')
out.push(row(['config', 'off in paint', 'def in paint', 'crowded', 'crowded (not drive/post/rebound)', 'episodes/g', 'long episodes/g']))
out.push(row(Array(7).fill('---')))
for (const name of names) {
  const p = all[name].home.bt6.offense.paint
  out.push(row([name, f(p.offenseInPaintAvg), f(p.defenseInPaintAvg), pct(p.crowdedShare), pct(p.crowdedIllegitShare), f(p.episodesPerGame, 1), f(p.longEpisodesPerGame, 1)]))
}

out.push('', '## Identity (home offense fingerprint)', '')
out.push(row(['config', 'PPP', 's/poss', 'trans', 'pass/poss', 'drives/poss', 'screens/poss', 'cuts/poss', 'rim', 'three', 'OREB%', 'AST/FGM', 'top init', 'top shooter', 'families', 'coverage used', 'adapt']))
out.push(row(Array(17).fill('---')))
for (const name of names) {
  const p = all[name].home.fingerprint
  const top = (rec) => Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k.replace('BALL_SCREEN', 'BS').replace('CIRCULATION', 'CIRC').replace('DRIVE_KICK', 'DK').replace('MOVEMENT', 'MOV').replace('ISOLATION', 'ISO')} ${Math.round(v * 100)}`).join(' · ')
  out.push(row([name, f(p.ppp), f(p.secondsPerPossession), pct(p.transitionShare), f(p.passesPerPossession), f(p.drivesPerPossession), f(p.screensPerPossession), f(p.cutsPerPossession), pct(p.rimShare), pct(p.threeShare), pct(p.orebRate), f(p.assistsPerFgm), pct(p.topInitiatorShare), pct(p.topShooterShare), top(p.playFamilies), top(p.coverageUsed), f(p.adaptations, 1)]))
}

out.push('', '## Variation across seeds (both teams)', '')
out.push(row(['config', 'possessions min-max', 'turnovers min-max', 'steals min-max', 'home-away scores']))
out.push(row(Array(5).fill('---')))
for (const name of names) {
  const s = all[name].perSeed
  const mm = (k) => `${Math.min(...s.map((x) => x[k]))}-${Math.max(...s.map((x) => x[k]))}`
  out.push(row([name, mm('possessions'), mm('turnovers'), mm('steals'), s.map((x) => `${x.score.home}-${x.score.away}`).join(', ')]))
}
console.log(out.join('\n'))

// BT5.31 identity distance (same scales as fingerprint.ts STYLE_SCALES), home fingerprints.
const SCALES = { secondsPerPossession: 1.5, transitionShare: 0.05, passesPerPossession: 0.5, drivesPerPossession: 0.12, screensPerPossession: 0.12, cutsPerPossession: 0.05, rimShare: 0.05, midShare: 0.04, threeShare: 0.05, catchShootShare: 0.05, pullUpShare: 0.03, prShare: 0.04, orebRate: 0.04, tovPerPossession: 0.02 }
const distance = (a, b) => Object.entries(SCALES).reduce((s, [k, sc]) => s + Math.abs(a[k] - b[k]) / sc, 0) / Object.keys(SCALES).length
const PAIRS = [['coachA', 'coachB'], ['coachA', 'coachC'], ['coachB', 'coachC'], ['neutral', 'coachA'], ['neutral', 'coachB'], ['rosterCreation', 'rosterInterior'], ['rosterCreation', 'rosterDefense'], ['rosterInterior', 'rosterDefense'], ['coachA_creation', 'coachA_interior'], ['planInside', 'planSpread'], ['planSpread', 'planPush'], ['planInside', 'planPush'], ['covDrop', 'covSwitch'], ['covDrop', 'covBlitz'], ['covSwitch', 'covBlitz'], ['covDrop', 'covHedge'], ['pressureLow', 'pressureHigh'], ['helpLow', 'helpHigh'], ['familiarityLow', 'familiarityHigh'], ['adaptHigh', 'adaptLow'], ['neutral', 'oppCreation'], ['neutral', 'oppDefense']]
const dist = ['', `## Identity distances (home fingerprint; ≈0.4 = seed noise, ≥1 = clearly different) · ${prefix}`, '', row(['pair', 'distance']), row(['---', '---'])]
for (const [a, b] of PAIRS) if (all[a] && all[b]) dist.push(row([`${a} ↔ ${b}`, f(distance(all[a].home.fingerprint, all[b].home.fingerprint))]))
console.log(dist.join('\n'))
const DEF_PAIRS = [['covDrop', 'covSwitch'], ['covDrop', 'covBlitz'], ['covSwitch', 'covBlitz'], ['covDrop', 'covHedge'], ['pressureLow', 'pressureHigh'], ['pressureLow', 'pressureMid'], ['pressureMid', 'pressureHigh'], ['helpLow', 'helpHigh'], ['pressureLowDef', 'pressureHighDef'], ['pressureLowVsCreation', 'pressureHighVsCreation']]
const ddist = ['', `## Defensive identity: distance between what the RIVAL offense does against each home defense · ${prefix}`, '', row(['pair', 'distance']), row(['---', '---'])]
for (const [a, b] of DEF_PAIRS) if (all[a] && all[b]) ddist.push(row([`${a} ↔ ${b}`, f(distance(all[a].away.fingerprint, all[b].away.fingerprint))]))
console.log(ddist.join('\n'))
