import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { runPaceGame, summarizePace } from './pace'

/**
 * BT4A root cause: which BT3 change shortens the half court? Each variant switches ONE BT3 mechanism back to its BT2 behaviour.
 * BT2_AUDIT=1 BT4_SEEDS=3 npx vitest run .../ablation.test.ts -> docs/match-next-bt4/audit/ablation.json
 */
const VARIANTS: Readonly<Record<string, Partial<MatchNextTuning>>> = {
  current: {},
  argmaxChoice: { decisionTemperaturePoints: 0 },
  noUsageWant: { usageValuePerPoint: 0 },
  noBlockOrFoulValue: { blockRiskWeight: 0, foulDrawWeight: 0 },
  bt2RimShot: { rimBaseMakeProbability: 0.66, rimContestPenalty: 0.28 },
  noPutbackPenalty: { putbackQualityWeight: 0 },
  slowCloseout: { closeoutReactionTicks: 4 },
  helpBelief25: { helpCloseoutBelief: 0.25 },
  helpBelief40: { helpCloseoutBelief: 0.4 },
  continuation100: { continuationValuePoints: 1.0 },
  continuation115: { continuationValuePoints: 1.15 },
  continuation130: { continuationValuePoints: 1.3 },
  continuation145: { continuationValuePoints: 1.45 },
  noStop: { driveStopEnabled: 0 },
  noControlledAdvance: { controlledAdvance: 0 },
}

it.skipIf(process.env.BT2_AUDIT === undefined)('BT4A ablation', () => {
  const seeds = [424242, 7, 1, 99, 2024].slice(0, Number(process.env.BT4_SEEDS ?? 3))
  const names = (process.env.BT4_VARIANTS ?? Object.keys(VARIANTS).join(',')).split(',')
  const out: Record<string, unknown> = {}
  for (const name of names) {
    const games = seeds.map((seed) => withTuning(VARIANTS[name]!, () => runPaceGame(seed)))
    const summary = summarizePace(games) as { counts: Record<string, number>; perGame: Record<string, number>; possessionSeconds: { mean: number }; phases: { phase: string; secondsPerPossession: { mean: number } }[]; byEnd: Record<string, { perGame: number }> }
    out[name] = {
      counts: summary.counts, possessions: summary.perGame.possessions, possessionSeconds: summary.possessionSeconds.mean,
      byEnd: Object.fromEntries(Object.entries(summary.byEnd).map(([k, v]) => [k, v.perGame])),
      secondsPerPossession: Object.fromEntries(summary.phases.map((p) => [p.phase, p.secondsPerPossession.mean])),
    }
  }
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4/audit/ablation${process.env.BT4_TAG ? `-${process.env.BT4_TAG}` : ''}.json`, JSON.stringify({ seeds, out }, null, 2))
}, 6_000_000)
