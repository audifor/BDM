import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { MatchNextEvent } from '@/engine/match-next'
import { runNextAudit } from '../nextAudit'

interface Incident { readonly kind: string; readonly description: string; readonly find: (events: readonly MatchNextEvent[]) => { readonly from: number; readonly to: number } | undefined }

const around = (t: number, before = 25, after = 45) => ({ from: Math.max(0, t - before), to: t + after })
const first = (events: readonly MatchNextEvent[], test: (event: MatchNextEvent) => boolean): MatchNextEvent | undefined => events.find(test)

const INCIDENTS: readonly Incident[] = [
  { kind: 'screenContact', description: 'A defender meets a ball screener (measured screen contact)', find: (e) => { const x = first(e, (v) => v.type === 'contact' && v.contactKind === 'SCREEN'); return x && around(x.t) } },
  { kind: 'driveContact', description: 'A driver and the on-ball defender make contact', find: (e) => { const x = first(e, (v) => v.type === 'contact' && v.contactKind === 'DRIVE'); return x && around(x.t) } },
  { kind: 'shootingFoul', description: 'Shooting foul that sends the shooter to the line', find: (e) => { const x = first(e, (v) => v.type === 'foul' && v.foulType === 'SHOOTING' && v.foulResolution === 'FREE_THROWS'); return x && around(x.t, 35, 110) } },
  { kind: 'andOne', description: 'Made basket with a foul: the AND-ONE free throw', find: (e) => { const x = first(e, (v) => v.type === 'foul' && v.foulResolution === 'AND_ONE'); return x && around(x.t, 35, 110) } },
  { kind: 'chargeOrBlocking', description: 'Charge (offense) or blocking (defense) call on a drive', find: (e) => { const x = first(e, (v) => v.type === 'foul' && (v.foulType === 'CHARGING' || v.foulType === 'BLOCKING')); return x && around(x.t, 30, 60) } },
  {
    kind: 'freeThrows', description: 'Free-throw sequence: formation, ready, each attempt, then live rebound or throw-in',
    find: (e) => {
      const x = first(e, (v) => v.type === 'freeThrowSequenceStarted' && (v.freeThrowsAwarded ?? 0) >= 2)
      if (x === undefined) return undefined
      const last = e.find((v) => (v.type === 'freeThrowMade' || v.type === 'freeThrowMissed') && v.t >= x.t && v.freeThrowIndex === v.freeThrowTotal)
      return { from: Math.max(0, x.t - 10), to: (last?.t ?? x.t + 120) + 40 }
    },
  },
  { kind: 'block', description: 'A real block: defender within reach at the release', find: (e) => { const x = first(e, (v) => v.type === 'shotBlocked'); return x && around(x.t, 30, 60) } },
  { kind: 'deflection', description: 'Pass deflected on its lane', find: (e) => { const x = first(e, (v) => v.type === 'deflection'); return x && around(x.t, 25, 50) } },
  { kind: 'steal', description: 'Clean steal or poke-loose by the on-ball defender', find: (e) => { const x = first(e, (v) => v.type === 'steal' && (v.stealKind === 'CLEAN_STEAL' || v.stealKind === 'POKE_LOOSE')); return x && around(x.t, 25, 50) } },
  { kind: 'interception', description: 'Pass intercepted in the lane', find: (e) => { const x = first(e, (v) => v.type === 'steal' && v.stealKind === 'PASS_INTERCEPTION'); return x && around(x.t, 25, 50) } },
  { kind: 'outOfBounds', description: 'Ball out of bounds with the correct team and spot for the throw-in', find: (e) => { const x = first(e, (v) => v.type === 'outOfBounds'); return x && around(x.t, 25, 90) } },
  { kind: 'foulInbound', description: 'Non-shooting foul: whistle, dead ball carried to the spot, throw-in', find: (e) => { const x = first(e, (v) => v.type === 'foul' && v.foulResolution === 'INBOUND'); return x && around(x.t, 25, 100) } },
  { kind: 'reboundContest', description: 'Rebound contested: contact recorded between the winner and an opponent', find: (e) => { const x = first(e, (v) => v.type === 'contact' && v.contactKind === 'REBOUNDING'); return x && around(x.t, 40, 40) } },
  {
    kind: 'putback', description: 'Offensive rebound followed by the rebounder\'s own attempt',
    find: (e) => {
      for (const r of e) {
        if (r.type !== 'reboundSecured' || r.reboundType !== 'offensive') continue
        const s = e.find((v) => v.type === 'shotReleased' && v.t >= r.t && v.t - r.t <= 25 && String(v.shooterPlayerId) === String(r.playerId))
        if (s !== undefined) return around(r.t, 30, 60)
      }
      return undefined
    },
  },
]

/** BT3U: reproducible windows (seed + ticks) for every new action, found from the canonical event stream only. */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT3U incident scenarios', () => {
  const seeds = (process.env.BT3_SCENARIO_SEEDS ?? '424242,7,1,99').split(',').map(Number)
  const chosen: Record<string, unknown> = {}
  const runs = seeds.map((seed) => ({ seed, events: runNextAudit(seed, { maxTicks: 20000 }).events }))
  for (const incident of INCIDENTS) {
    for (const { seed, events } of runs) {
      const window = incident.find(events)
      if (window === undefined) continue
      chosen[incident.kind] = { kind: incident.kind, description: incident.description, seed, fromTick: window.from, toTick: window.to }
      break
    }
  }
  mkdirSync('docs/match-next-bt3/audit', { recursive: true })
  writeFileSync('docs/match-next-bt3/audit/scenarios.json', JSON.stringify(Object.values(chosen), null, 2))
  writeFileSync('docs/match-next-bt3/audit/scenarios-missing.json', JSON.stringify(INCIDENTS.filter((i) => chosen[i.kind] === undefined).map((i) => i.kind)))
}, 3_000_000)
