import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { distanceBetween } from '@/domain/court'
import { runFingerprintGame } from '../bt5/fingerprint'
import { BT6_CONFIGS } from './configs'
import { CONFIGS } from '../bt5/configs'

/** BT6 probe: where the on-ball gap comes from. BT2_AUDIT=1 BT6_PROBE_CONFIG=pressureHigh npx vitest run .../bt6/gapProbe.test.ts */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT6 on-ball gap probe', () => {
  const name = process.env.BT6_PROBE_CONFIG ?? 'neutral'
  const config = BT6_CONFIGS[name] ?? CONFIGS[name]
  const buckets: Record<string, { n: number; sum: number; tight: number }> = {}
  const add = (key: string, gap: number): void => { const b = buckets[key] ?? { n: 0, sum: 0, tight: 0 }; b.n += 1; b.sum += gap; if (gap <= 1.15) b.tight += 1; buckets[key] = b }
  runFingerprintGame(31337, config?.transform, { maxTicks: 12000, observe: (s) => {
    const possession = s.possessions.find((p) => p.id === s.activePossessionId)
    if (possession === undefined || s.ball.kind !== 'HELD' || s.ball.ownerTeamId !== possession.teamId || (possession.phase !== 'SETUP' && possession.phase !== 'ACTION') || s.transition !== null) return
    if (possession.teamId === s.homeTeamId) return
    const ownerId = s.ball.kind === 'HELD' ? s.ball.ownerPlayerId : null
    const handler = s.players.find((p) => p.playerId === ownerId)
    if (handler === undefined) return
    const guardId = s.defensiveStructure?.assignments.find((a) => a.attackerPlayerId === handler.playerId)?.defenderPlayerId
    const guard = s.players.find((p) => p.playerId === guardId)
    if (guard === undefined) return
    const gap = distanceBetween(guard.position, handler.position)
    const sinceCatch = s.offenseFlow === null ? 99 : s.t - s.offenseFlow.holderSinceT
    const intent = s.movementIntents.find((m) => m.playerId === guard.playerId)
    const toTarget = intent === undefined ? -1 : distanceBetween(guard.position, intent.target)
    const key = s.screen !== null ? 'screen' : s.actions.some((a) => a.kind === 'DRIVE' && a.status === 'ACTIVE') ? 'drive' : sinceCatch <= 10 ? 'catch<=1s' : sinceCatch <= 25 ? 'catch1-2.5s' : 'settled'
    add(key, gap)
    if (key === 'settled') add(`settled:toTarget${toTarget < 0.5 ? '<0.5' : toTarget < 1.5 ? '0.5-1.5' : '>1.5'}`, gap)
    if (key === 'settled') add(`settled:handlerDist${distanceBetween(handler.position, s.defensiveStructure!.defendedBasket) < 6.75 ? '<6.75' : '>=6.75'}`, gap)
  } })
  writeFileSync(`docs/match-next-bt6/audit/gap-probe-${name}.json`, JSON.stringify(Object.fromEntries(Object.entries(buckets).map(([k, b]) => [k, { n: b.n, gap: Number((b.sum / b.n).toFixed(2)), tight: Number((b.tight / b.n).toFixed(2)) }])), null, 1))
}, 600_000)
