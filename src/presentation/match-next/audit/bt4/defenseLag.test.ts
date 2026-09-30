import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { distanceBetween } from '@/domain/court'
import { isHalfCourtSet, runNextAudit } from '../nextAudit'

/**
 * BT4A: is the defense loose because its TARGETS are loose or because the defenders arrive late? For stable half-court frames:
 * distance defender -> his man, defender -> his own movement target, urgency mix, speed, and how the man-distance depends on
 * whether the man just received the ball. BT2_AUDIT=1 npx vitest run .../defenseLag.test.ts
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4A defense lag', () => {
  const seeds = [424242, 7].slice(0, Number(process.env.BT4_SEEDS ?? 2))
  const rows: { toMan: number; toTarget: number; targetToMan: number; speed: number; urgency: string; ballRelation: string; kind: string }[] = []
  for (const seed of seeds) {
    let run = 0
    runNextAudit(seed, { maxTicks: 9000, onFrame: (f) => {
      run = isHalfCourtSet(f) ? run + 1 : 0
      if (run <= 8) return
      const offense = f.players.filter((p) => p.isOffense)
      for (const defender of f.players.filter((p) => !p.isOffense)) {
        const man = offense.find((o) => o.playerId === defender.guarding)
        if (man === undefined || defender.intentTarget === undefined) continue
        rows.push({
          toMan: distanceBetween(defender.position, man.position), toTarget: distanceBetween(defender.position, defender.intentTarget),
          targetToMan: distanceBetween(defender.intentTarget, man.position), speed: defender.speedMps, urgency: defender.intentUrgency ?? '?', ballRelation: defender.ballRelation ?? '?', kind: defender.responsibility ?? '?',
        })
      }
    } })
  }
  const mean = (values: readonly number[]): number => Number((values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)).toFixed(2))
  const byUrgency = Object.fromEntries([...new Set(rows.map((r) => r.urgency))].map((u) => [u, { share: Number((rows.filter((r) => r.urgency === u).length / rows.length).toFixed(3)), toMan: mean(rows.filter((r) => r.urgency === u).map((r) => r.toMan)) }]))
  const byRelation = Object.fromEntries([...new Set(rows.map((r) => r.ballRelation))].map((u) => [u, { share: Number((rows.filter((r) => r.ballRelation === u).length / rows.length).toFixed(3)), toMan: mean(rows.filter((r) => r.ballRelation === u).map((r) => r.toMan)), targetToMan: mean(rows.filter((r) => r.ballRelation === u).map((r) => r.targetToMan)) }]))
  const byKind = Object.fromEntries([...new Set(rows.map((r) => r.kind))].map((u) => [u, { share: Number((rows.filter((r) => r.kind === u).length / rows.length).toFixed(3)), toMan: mean(rows.filter((r) => r.kind === u).map((r) => r.toMan)), targetToMan: mean(rows.filter((r) => r.kind === u).map((r) => r.targetToMan)), speed: mean(rows.filter((r) => r.kind === u).map((r) => r.speed)) }]))
  const summary = {
    frames: rows.length, meanDistanceToMan: mean(rows.map((r) => r.toMan)), meanDistanceToOwnTarget: mean(rows.map((r) => r.toTarget)), meanTargetToMan: mean(rows.map((r) => r.targetToMan)),
    meanSpeed: mean(rows.map((r) => r.speed)), shareWithin1_5mOfMan: Number((rows.filter((r) => r.toMan <= 1.5).length / rows.length).toFixed(3)), shareBeyond3mOfMan: Number((rows.filter((r) => r.toMan > 3).length / rows.length).toFixed(3)), byUrgency, byRelation, byKind,
  }
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync('docs/match-next-bt4/audit/defense-lag.json', JSON.stringify(summary, null, 2))
}, 600000)
