import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { withTuning, type MatchNextTuning } from '@/engine/match-next/tuning'
import { fingerprint, identityDistance, runFingerprintGame, type FingerprintGame } from './fingerprint'
import { CONFIGS } from './configs'

/**
 * BT5 controlled experiments. BT2_AUDIT=1 BT5_CONFIGS=a,b BT5_SEEDS=4 BT5_TAG=x npx vitest run .../bt5/experiments.test.ts
 * -> docs/match-next-bt5/audit/exp-<tag>.json. Each config is a setup transform (configs.ts); the fingerprint of the side it targets is reported.
 */
function familyPpp(games: readonly FingerprintGame[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const side of ['home', 'away'] as const) {
    const sum: Record<string, { n: number; points: number }> = {}
    for (const game of games) for (const [family, record] of Object.entries(game.familyOutcomes[side])) { const item = sum[family] ?? { n: 0, points: 0 }; sum[family] = { n: item.n + record.n, points: item.points + record.points } }
    out[side] = Object.fromEntries(Object.entries(sum).map(([family, record]) => [family, `${(record.points / Math.max(1, record.n)).toFixed(2)} (n=${record.n})`]))
  }
  return out
}

it.skipIf(process.env.BT2_AUDIT === undefined)('BT5 experiments', () => {
  const seeds = [31337, 424242, 7, 1, 99, 2024, 11, 12, 3, 5, 21, 42].slice(0, Number(process.env.BT5_SEEDS ?? 4))
  const names = (process.env.BT5_CONFIGS ?? 'neutral').split(',')
  const overrides = JSON.parse(process.env.BT5_TUNING ?? '{}') as Partial<MatchNextTuning>
  const out: Record<string, unknown> = {}
  const prints: Record<string, ReturnType<typeof fingerprint>> = {}
  for (const name of names) {
    const config = CONFIGS[name]
    if (config === undefined) throw new Error(`Unknown config ${name}`)
    const started = Date.now()
    const games: FingerprintGame[] = seeds.map((seed) => withTuning(overrides, () => runFingerprintGame(seed, config.transform)))
    const home = fingerprint(games, 'home')
    const away = fingerprint(games, 'away')
    prints[name] = home
    out[name] = { description: config.description, msPerGame: Math.round((Date.now() - started) / games.length), complete: games.filter((g) => g.complete).length, home, away, score: games.map((g) => g.score), adjustments: games.map((g) => g.adjustments), familyPpp: familyPpp(games) }
  }
  const distances: Record<string, unknown> = {}
  for (let i = 0; i < names.length; i += 1) for (let j = i + 1; j < names.length; j += 1) distances[`${names[i]}|${names[j]}`] = identityDistance(prints[names[i]!]!, prints[names[j]!]!)
  mkdirSync('docs/match-next-bt5/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt5/audit/exp-${process.env.BT5_TAG ?? 'run'}.json`, JSON.stringify({ seeds, overrides, out, distances }, null, 2))
}, 60_000_000)
