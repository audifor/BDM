import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tacticalIntent, type MatchSetup } from '@/engine/match-next'
import { fingerprint, runFingerprintGame } from './fingerprint'

/**
 * BT5.25 / TEST E: same matchup, same seeds, different game context. Each game is the last four minutes of a final period with the
 * score already at home +15, home 0 or home -5 (the score is set on the state before the first tick; nothing else changes).
 * BT2_AUDIT=1 BT5_SEEDS=10 npx vitest run .../bt5/context.test.ts -> docs/match-next-bt5/audit/context-<tag>.json
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT5 context', () => {
  const seeds = Array.from({ length: Number(process.env.BT5_SEEDS ?? 10) }, (_, i) => 1000 + i * 37)
  const finalFour = (setup: MatchSetup): MatchSetup => ({ ...setup, clockRules: { ...setup.clockRules, periodCount: 1, periodSeconds: 240 } })
  const out: Record<string, unknown> = {}
  for (const margin of [15, 0, -5]) {
    const games = seeds.map((seed) => runFingerprintGame(seed, finalFour, {
      prepare: (state) => ({ ...state, score: { home: 70 + margin, away: 70 } }),
      sample: (state) => state.t === 1 ? { t: state.t, side: 'home', kind: 'intent', detail: tacticalIntent(state, state.homeTeamId) } : undefined,
    }))
    const intent = games[0]!.intents[0]?.detail as ReturnType<typeof tacticalIntent> | undefined
    out[`home${margin >= 0 ? '+' : ''}${margin}`] = {
      intentAtStart: intent === undefined ? null : { offense: intent.offense, defense: intent.defense, context: intent.layers.context },
      home: fingerprint(games, 'home'), away: fingerprint(games, 'away'),
      fouls: games.reduce((sum, g) => sum + g.teams.home.fouls, 0) / games.length,
    }
  }
  mkdirSync('docs/match-next-bt5/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt5/audit/context-${process.env.BT5_TAG ?? 'run'}.json`, JSON.stringify({ seeds, out }, null, 2))
}, 60_000_000)
