import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { MatchNextEvent } from '@/engine/match-next'
import { runNextAudit } from '../nextAudit'

/**
 * BT4Z: reproducible windows (seed + ticks) for the new shot ecology and rhythm, found from the canonical event stream only.
 * BT2_AUDIT=1 npx vitest run .../incidents.test.ts -> docs/match-next-bt4/audit/scenarios.json
 */
interface Incident { readonly kind: string; readonly description: string; readonly find: (events: readonly MatchNextEvent[]) => { readonly from: number; readonly to: number } | undefined }

const around = (t: number, before = 40, after = 40) => ({ from: Math.max(0, t - before), to: t + after })
const shot = (creation: string, zones?: readonly string[]) => (events: readonly MatchNextEvent[]): { from: number; to: number } | undefined => {
  const found = events.find((e) => e.type === 'shotReleased' && e.shotCreation === creation && (zones === undefined || zones.includes(e.shotZone ?? '')))
  return found === undefined ? undefined : around(found.t, 45, 35)
}

const INCIDENTS: readonly Incident[] = [
  { kind: 'pullUp', description: 'Pull-up: the driver stops where the lane closed and shoots (creation PULL_UP)', find: shot('PULL_UP') },
  { kind: 'floater', description: 'Floater: a driver near the rim goes over the help (creation FLOATER)', find: shot('FLOATER') },
  { kind: 'midrange', description: 'Mid-range shot that comes out of a drive or a screen', find: (e) => { const x = e.find((v) => v.type === 'shotReleased' && (v.shotZone === 'MIDRANGE' || v.shotZone === 'LONG_MIDRANGE') && (v.shotCreation === 'PULL_UP' || v.shotCreation === 'PR_HANDLER')); return x && around(x.t, 50, 35) } },
  { kind: 'driveContained', description: 'A drive is contained: the driver is stopped and has to read again', find: (e) => { const x = e.find((v) => v.type === 'actionResolved' && v.actionKind === 'DRIVE' && v.actionOutcome === 'CONTAINED'); return x && around(x.t, 40, 40) } },
  { kind: 'rimAttack', description: 'Drive to the rim: finish through contact', find: (e) => { const x = e.find((v) => v.type === 'shotReleased' && v.shotCreation === 'DRIVE_FINISH' && v.shotZone === 'RESTRICTED'); return x && around(x.t, 45, 35) } },
  { kind: 'kickOut', description: 'Kick-out three after the defense collapses on a drive', find: (e) => { const x = e.find((v) => v.type === 'shotReleased' && v.shotCreation === 'KICK_OUT' && v.points === 3); return x && around(x.t, 55, 30) } },
  { kind: 'pnrHandler', description: 'Pick and roll: the handler uses the screen and shoots', find: shot('PR_HANDLER') },
  { kind: 'screen', description: 'Ball screen: approach, set, use', find: (e) => { const x = e.find((v) => v.type === 'screenSet'); return x && around(x.t, 30, 50) } },
  { kind: 'catchAndShoot', description: 'Catch-and-shoot three after ball movement', find: shot('CATCH_AND_SHOOT', ['CORNER_THREE', 'ABOVE_BREAK_THREE']) },
  { kind: 'shootingFoul', description: 'Shooting foul and free throws', find: (e) => { const x = e.find((v) => v.type === 'foul' && v.foulType === 'SHOOTING' && v.foulResolution === 'FREE_THROWS'); return x && around(x.t, 40, 110) } },
  { kind: 'offBallFoul', description: 'A non-shooting foul from contact away from a shot (team fouls build up)', find: (e) => { const x = e.find((v) => v.type === 'foul' && (v.foulType === 'BLOCKING' || v.foulType === 'REACH')); return x && around(x.t, 30, 90) } },
  { kind: 'block', description: 'A block: defender within reach at the release', find: (e) => { const x = e.find((v) => v.type === 'shotBlocked'); return x && around(x.t, 40, 50) } },
  { kind: 'rebound', description: 'Rebound contest with the contest positions around the landing spot', find: (e) => { const x = e.find((v) => v.type === 'reboundSecured' && v.reboundType === 'defensive'); return x && around(x.t, 50, 40) } },
  { kind: 'putback', description: 'Offensive rebound and the rebounder\'s own attempt', find: shot('PUTBACK') },
  {
    kind: 'longPossession', description: 'A long half-court possession (over 17 s): reversals, screens, a late shot',
    find: (e) => {
      const starts = e.filter((v) => v.type === 'possessionStart')
      for (const start of starts) {
        const end = e.find((v) => v.type === 'possessionEnd' && v.possessionId === start.possessionId)
        if (end !== undefined && end.t - start.t >= 170 && end.t - start.t <= 260) return { from: Math.max(0, start.t - 5), to: end.t + 25 }
      }
      return undefined
    },
  },
  {
    kind: 'quickTransition', description: 'A quick transition possession that ends in a shot inside 6 s',
    find: (e) => {
      const starts = e.filter((v) => v.type === 'possessionStart' && (v.startReason === 'steal' || v.startReason === 'defensiveRebound'))
      for (const start of starts) {
        const shotEvent = e.find((v) => v.type === 'shotReleased' && v.possessionId === start.possessionId)
        if (shotEvent !== undefined && shotEvent.t - start.t <= 55) return { from: Math.max(0, start.t - 15), to: shotEvent.t + 40 }
      }
      return undefined
    },
  },
  { kind: 'freeThrows', description: 'Free-throw sequence', find: (e) => { const x = e.find((v) => v.type === 'freeThrowSequenceStarted' && (v.freeThrowsAwarded ?? 0) >= 2); if (x === undefined) return undefined; const last = e.find((v) => (v.type === 'freeThrowMade' || v.type === 'freeThrowMissed') && v.t >= x.t && v.freeThrowIndex === v.freeThrowTotal); return { from: Math.max(0, x.t - 10), to: (last?.t ?? x.t + 120) + 40 } } },
]

it.skipIf(process.env.BT2_AUDIT === undefined)('BT4Z incident scenarios', () => {
  const seeds = (process.env.BT4_SCENARIO_SEEDS ?? '424242,7,1,99,2024').split(',').map(Number)
  const chosen: Record<string, unknown> = {}
  const runs = seeds.map((seed) => ({ seed, events: runNextAudit(seed, { maxTicks: 30000 }).events }))
  for (const incident of INCIDENTS) {
    for (const { seed, events } of runs) {
      const window = incident.find(events)
      if (window === undefined) continue
      chosen[incident.kind] = { kind: incident.kind, description: incident.description, seed, fromTick: window.from, toTick: window.to }
      break
    }
  }
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync('docs/match-next-bt4/audit/scenarios.json', JSON.stringify(Object.values(chosen), null, 2))
  writeFileSync('docs/match-next-bt4/audit/scenarios-missing.json', JSON.stringify(INCIDENTS.filter((i) => chosen[i.kind] === undefined).map((i) => i.kind)))
}, 3_000_000)
