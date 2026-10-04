/** BT6.1 drive-ecology comparison: node scripts/next/bt61Drives.mjs <prefix> [<prefix> ...] (reads docs/match-next-bt6/audit/exp-<prefix>-*.json). */
import { readdirSync, readFileSync } from 'node:fs'
const dir = 'docs/match-next-bt6/audit'
const AWAY_OFFENSE = new Set(['helpHigh', 'helpLow', 'helpMid', 'pressureLow', 'pressureMid', 'pressureHigh', 'covDrop', 'covSwitch', 'covBlitz', 'covHedge'])
const f = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : '-')
const pick = (rec, keys) => keys.map((k) => `${k}:${f(rec?.[k] ?? 0, 1)}`).join(' ')
for (const prefix of process.argv.slice(2)) {
  for (const file of readdirSync(dir).filter((x) => x.startsWith(`exp-${prefix}-`) && x.endsWith('.json')).sort()) {
    const json = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))
    for (const [name, o] of Object.entries(json.out)) {
      const side = AWAY_OFFENSE.has(name) ? 'away' : 'home'
      const d = o[side].drives, t = o.totals, fp = o[side].fingerprint, z = o[side].bt6.offense
      const tc = {}; for (const s of ['home', 'away']) for (const [k, v] of Object.entries(o[s].bt6.offense.turnoverCauses)) tc[k] = (tc[k] ?? 0) + v
      const sk = {}; for (const s of ['home', 'away']) for (const [k, v] of Object.entries(o[s].bt6.defense.stealKinds)) sk[k] = (sk[k] ?? 0) + v
      console.log(`${name.padEnd(17)} ${prefix.padEnd(4)} poss ${f(t.possessions, 1)} PPP ${f(t.ppp)} TOV% ${f(t.tovPct, 1)} STL ${f(t.steals, 1)} FTr ${f(t.ftRate, 3)} | ${side} rim ${f(fp.rimShare, 3)} 3 ${f(fp.threeShare, 3)} FTr ${f(fp.ftaPerFga, 3)} AST/FGM ${f(fp.assistsPerFgm)} | drives ${f(d.drivesPerGame, 1)} PPPwithDrive ${f(d.pppPossessionsWithDrive)} secondary ${f(d.secondaryAdvantagePerGame, 1)} interior ${f(d.interiorPassesPerGame, 1)} lost ${f(d.interiorLostShare, 3)}`)
      console.log(`   act  ${pick(d.nextAct, ['rimAttempt', 'shortPaintAttempt', 'otherShot', 'kickOut', 'dumpOff', 'interiorEntry', 'shortRollPass', 'resetPass', 'reset', 'turnover', 'shootingFoul', 'foulOnDrive'])}`)
      console.log(`   after ${pick(d.afterFirstPass, ['extraPass', 'catchAndShootOpen', 'catchAndShootContested', 'closeoutAttack', 'secondDrive', 'heldOrReset', 'turnover'])}`)
      console.log(`   rim  ${pick(d.rimBySource, ['DRIVE_FINISH', 'TRANSITION', 'PR_HANDLER', 'PR_ROLLER', 'CUT_FINISH', 'PUTBACK', 'KICK_OUT', 'CATCH_AND_SHOOT'])} | FT fouls ${pick(d.shootingFoulsBySource, ['drive', 'putback', 'roll', 'nearRimOther', 'jumpShot'])}`)
      console.log(`   TOV  ${pick(tc, ['deflectedPass', 'interception', 'onBallStrip', 'transitionPass', 'strippedDrive', 'offensiveFoul'])} | STL ${pick(sk, ['CLEAN_STEAL', 'DEFLECTION', 'PASS_INTERCEPTION', 'POKE_LOOSE'])}`)
    }
  }
}
