import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { distanceBetween } from '@/domain/court'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { isHalfCourtSet, runNextAudit } from '../nextAudit'

/**
 * BT4.1: "the defenders look lost". For stable half-court frames, per defender: distance to his man, whether he is chasing (fast and far
 * from his man), how often his heading reverses, how often his movement target jumps, and how the man-distance splits by relationship to
 * the ball. BT2_AUDIT=1 BT41_TAG=x npx vitest run .../defenseWatch.test.ts -> docs/match-next-bt4-1/audit/defense-watch-<tag>.json
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4.1 defense watch', () => {
  const seeds = [424242, 7, 1].slice(0, Number(process.env.BT41_SEEDS ?? 2))
  interface Row { backpedal: boolean; sideways: boolean; awayFromTarget: boolean; turning: number; toMan: number; speed: number; kind: string; relation: string; reversal: boolean; targetJump: boolean; ballToMan: number; manToBasket: number }
  const rows: Row[] = []
  const overrides = JSON.parse(process.env.BT41_TUNING ?? '{}') as Partial<MatchNextTuning>
  withTuning(overrides, () => { for (const seed of seeds) {
    let run = 0
    const lastPosition = new Map<string, { x: number; y: number }>()
    const lastStep = new Map<string, { x: number; y: number }>()
    const lastTarget = new Map<string, { x: number; y: number }>()
    const lastAngle = new Map<string, number>()
    const turnWindow = new Map<string, number[]>()
    runNextAudit(seed, { maxTicks: 12000, onFrame: (f) => {
      run = isHalfCourtSet(f) ? run + 1 : 0
      const offense = f.players.filter((p) => p.isOffense)
      const ball = f.ball.position
      for (const defender of f.players.filter((p) => !p.isOffense)) {
        const id = String(defender.playerId)
        const previous = lastPosition.get(id)
        const step = previous === undefined ? undefined : { x: defender.position.x - previous.x, y: defender.position.y - previous.y }
        const stepPrevious = lastStep.get(id)
        let reversal = false
        if (step !== undefined && stepPrevious !== undefined) {
          const a = Math.hypot(step.x, step.y)
          const b = Math.hypot(stepPrevious.x, stepPrevious.y)
          if (a > 0.05 && b > 0.05) reversal = (step.x * stepPrevious.x + step.y * stepPrevious.y) / (a * b) < -0.35
        }
        const target = defender.intentTarget
        const previousTarget = lastTarget.get(id)
        const targetJump = target !== undefined && previousTarget !== undefined && distanceBetween(target, previousTarget) > 1.2
        const faceLen = Math.hypot(defender.facing.x, defender.facing.y)
        const velLen = Math.hypot(defender.velocity.x, defender.velocity.y)
        const cosFace = faceLen > 1e-6 && velLen > 1e-6 ? (defender.facing.x * defender.velocity.x + defender.facing.y * defender.velocity.y) / (faceLen * velLen) : 1
        const backpedal = velLen > 3 && cosFace < -0.5
        const sideways = velLen > 3 && cosFace >= -0.5 && cosFace < 0.4
        let turning = 0
        const speedNow = Math.hypot(defender.velocity?.x ?? 0, defender.velocity?.y ?? 0)
        if (speedNow > 1) {
          const angle = Math.atan2(defender.velocity!.y, defender.velocity!.x)
          const before = lastAngle.get(id)
          if (before !== undefined) { let d = angle - before; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const window = turnWindow.get(id) ?? []; window.push(Math.abs(d)); if (window.length > 15) window.shift(); turnWindow.set(id, window) }
          lastAngle.set(id, angle)
        } else { turnWindow.set(id, []); lastAngle.delete(id) }
        turning = (turnWindow.get(id) ?? []).reduce((a, b) => a + b, 0)
        const awayFromTarget = target !== undefined && speedNow > 1.5 && distanceBetween(defender.position, target) < 4 && ((defender.velocity!.x * (target.x - defender.position.x) + defender.velocity!.y * (target.y - defender.position.y)) < 0)
        lastPosition.set(id, { ...defender.position })
        if (step !== undefined) lastStep.set(id, step)
        if (target !== undefined) lastTarget.set(id, { ...target })
        if (run <= 8) continue
        const man = offense.find((o) => o.playerId === defender.guarding)
        if (man === undefined) continue
        rows.push({ backpedal, sideways, awayFromTarget, turning, toMan: distanceBetween(defender.position, man.position), speed: defender.speedMps, kind: defender.responsibility ?? '?', relation: defender.ballRelation ?? '?', reversal, targetJump, ballToMan: distanceBetween(ball, man.position), manToBasket: 0 })
      }
    } })
  } })
  const mean = (values: readonly number[]): number => Number((values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)).toFixed(2))
  const share = (test: (r: Row) => boolean, list: readonly Row[] = rows): number => Number((list.filter(test).length / Math.max(1, list.length)).toFixed(3))
  const split = (key: (r: Row) => string) => Object.fromEntries([...new Set(rows.map(key))].map((k) => {
    const list = rows.filter((r) => key(r) === k)
    return [k, { share: share(() => true, list) * (list.length / rows.length) / Math.max(1e-9, share(() => true, list)) , frames: list.length, toMan: mean(list.map((r) => r.toMan)), beyond3m: share((r) => r.toMan > 3, list), chasing: share((r) => r.speed > 4.5 && r.toMan > 3, list), reversalsPerSecond: Number((share((r) => r.reversal, list) * 10).toFixed(2)), targetJumpsPerSecond: Number((share((r) => r.targetJump, list) * 10).toFixed(2)) }]
  }))
  const summary = {
    frames: rows.length, meanToMan: mean(rows.map((r) => r.toMan)), within1_5m: share((r) => r.toMan <= 1.5), within2_5m: share((r) => r.toMan <= 2.5), beyond3m: share((r) => r.toMan > 3), beyond4m: share((r) => r.toMan > 4),
    chasing: share((r) => r.speed > 4.5 && r.toMan > 3), backpedalFast: share((r) => r.backpedal), slidingFast: share((r) => r.sideways), fastFrames: share((r) => r.speed > 3), orbiting: share((r) => r.turning > 4.2), awayFromTarget: share((r) => r.awayFromTarget), reversalsPerSecond: Number((share((r) => r.reversal) * 10).toFixed(2)), targetJumpsPerSecond: Number((share((r) => r.targetJump) * 10).toFixed(2)),
    meanSpeed: mean(rows.map((r) => r.speed)), byKind: split((r) => r.kind), byRelation: split((r) => r.relation),
  }
  mkdirSync('docs/match-next-bt4-1/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4-1/audit/defense-watch-${process.env.BT41_TAG ?? 'run'}.json`, JSON.stringify(summary, null, 2))
}, 900_000)
