import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dist, runGame, summarizeGame, type ReboundRecord, type ShotRecord } from './economy'

const BUCKETS: readonly { name: string; from: number; to: number }[] = [
  { name: 'rim <2.2m', from: 0, to: 2.2 }, { name: 'paint 2.2-4.5m', from: 2.2, to: 4.5 }, { name: 'mid 4.5-6.5m', from: 4.5, to: 6.5 },
  { name: 'three 6.5-8m', from: 6.5, to: 8 }, { name: 'three 8-9m', from: 8, to: 9 }, { name: 'deep >9m', from: 9, to: 99 },
]
function reboundSummary(records: readonly ReboundRecord[]) {
  const mean = (f: (r: ReboundRecord) => number): number => Number((records.reduce((a, r) => a + f(r), 0) / Math.max(1, records.length)).toFixed(2))
  const offenseWon = records.filter((r) => r.winnerTeam === 'offense').length
  return {
    n: records.length,
    offensiveShare: Number((offenseWon / Math.max(1, records.length)).toFixed(3)),
    meanOffenseNearest: mean((r) => r.offenseNearest), meanDefenseNearest: mean((r) => r.defenseNearest),
    meanOffenseWithin2m: mean((r) => r.offenseWithin2m), meanDefenseWithin2m: mean((r) => r.defenseWithin2m),
    meanLandingDistanceToRim: mean((r) => r.landingDistanceToRim), meanShotDistance: mean((r) => r.shotDistance),
    offensiveShareWhenOffenseNearer: Number((records.filter((r) => r.offenseNearest < r.defenseNearest && r.winnerTeam === 'offense').length / Math.max(1, records.filter((r) => r.offenseNearest < r.defenseNearest).length)).toFixed(3)),
    offensiveShareWhenDefenseNearer: Number((records.filter((r) => r.offenseNearest >= r.defenseNearest && r.winnerTeam === 'offense').length / Math.max(1, records.filter((r) => r.offenseNearest >= r.defenseNearest).length)).toFixed(3)),
    shareOffenseNearer: Number((records.filter((r) => r.offenseNearest < r.defenseNearest).length / Math.max(1, records.length)).toFixed(3)),
  }
}

function geography(shots: readonly ShotRecord[]) {
  const total = Math.max(1, shots.length)
  return BUCKETS.map((b) => {
    const list = shots.filter((s) => s.distance >= b.from && s.distance < b.to)
    const n = Math.max(1, list.length)
    return {
      bucket: b.name, attempts: list.length, share: Number((list.length / total).toFixed(3)),
      fgPct: Number((list.filter((s) => s.made).length / n).toFixed(3)), meanProbability: Number((list.reduce((a, s) => a + s.probability, 0) / n).toFixed(3)),
      meanContest: Number((list.reduce((a, s) => a + s.contest, 0) / n).toFixed(3)),
    }
  })
}

/** Writes docs/match-next-bt2/audit/economy-<tag>.json. Run: BT2_AUDIT=1 BT2_TAG=before BT2_SEEDS=8 npx vitest run .../run.test.ts */
it.skipIf(process.env.BT2_AUDIT === undefined)('economy over full games', () => {
  const tag = process.env.BT2_TAG ?? 'after'
  const n = Number(process.env.BT2_SEEDS ?? 8)
  const seeds = [424242, 7, 1, 99, 2024, 31337, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].slice(0, n)
  const games = seeds.map((seed) => runGame(seed))
  const summaries = games.map((g) => summarizeGame(g.economy))
  const col = (k: keyof (typeof summaries)[number]): number[] => summaries.map((s) => s[k] as number)
  const allPos = games.flatMap((g) => g.economy.possessions)
  const samples = games.flatMap((g) => g.samples)
  const out = {
    tag,
    seeds,
    perGame: summaries,
    distributions: {
      points: dist(col('points')), shots: dist(col('shots')), possessions: dist(col('possessions')), shotsPerPossession: dist(col('shotsPerPossession')),
      meanPossessionSeconds: dist(col('meanPossessionSeconds')), threeShare: dist(col('threeShare')), shotsOver9mShare: dist(col('shotsOver9mShare')),
      offensiveReboundShare: dist(col('offensiveReboundShare')), putbackShots: dist(col('putbackShots')), turnovers: dist(col('turnovers')), fieldGoalPct: dist(col('fieldGoalPct')),
      shotClockViolations: dist(col('shotClockViolations')),
    },
    possessionLevel: {
      seconds: dist(allPos.map((p) => p.seconds)), decisions: dist(allPos.map((p) => p.decisions)), passes: dist(allPos.map((p) => p.passes)), drives: dist(allPos.map((p) => p.drives)),
      screens: dist(allPos.map((p) => p.screens)), shots: dist(allPos.map((p) => p.shots)), offensiveRebounds: dist(allPos.map((p) => p.offensiveRebounds)),
      setupSeconds: dist(allPos.map((p) => p.setupSeconds)), firstShotSecondsAfterSetup: dist(allPos.flatMap((p) => (p.firstShotSecondsAfterSetup === undefined ? [] : [p.firstShotSecondsAfterSetup]))),
      shotsPerPossessionHistogram: [0, 1, 2, 3, 4].map((k) => ({ shots: k === 4 ? '4+' : String(k), share: Number((allPos.filter((p) => (k === 4 ? p.shots >= 4 : p.shots === k)).length / Math.max(1, allPos.length)).toFixed(3)) })),
      endReasons: Object.fromEntries([...new Set(allPos.map((p) => p.endReason))].map((r) => [r, Number((allPos.filter((p) => p.endReason === r).length / Math.max(1, allPos.length)).toFixed(3))])),
    },
    decisionGapsSeconds: dist(games.flatMap((g) => [...g.economy.decisionGapsSeconds])),
    setupDecisionsPerSecond: dist(games.map((g) => g.economy.setupDecisionsPerSecond)),
    shotDistanceMeters: dist(games.flatMap((g) => [...g.economy.shotDistances])),
    halfCourtSettlement: {
      samples: samples.length,
      cornersOccupied: dist(samples.map((s) => s.cornersOccupied)),
      cornersEmptyShare: Number((samples.filter((s) => s.cornersOccupied === 0).length / Math.max(1, samples.length)).toFixed(3)),
      withinOneMeterOfSlotShare: Number((samples.reduce((a, s) => a + s.withinOneMeterOfSlot, 0) / Math.max(1, samples.reduce((a, s) => a + s.offensivePlayers, 0))).toFixed(3)),
      meanDistanceToSlot: dist(samples.map((s) => s.meanDistanceToSlot)),
      minPairDistance: dist(samples.map((s) => s.minPairDistance)),
      paintOccupants: dist(samples.map((s) => s.paintOccupants)),
      ballHeldSeconds: dist(samples.map((s) => s.ballHeldSeconds)),
      guardDistance: dist(samples.map((s) => s.meanGuardDistance)),
      openAttackersShare: Number((samples.reduce((a, s) => a + s.openAttackers, 0) / Math.max(1, samples.length * 4)).toFixed(3)),
    },
    shotGeography: geography(games.flatMap((g) => [...g.economy.shotRecords])),
    rebounds: reboundSummary(games.flatMap((g) => [...g.economy.reboundRecords])),
    halfCourtSettled: (() => {
      const settled = samples.filter((s) => s.settled && s.phase === 'SETUP')
      const n = Math.max(1, settled.length)
      return {
        samples: settled.length,
        cornersEmptyShare: Number((settled.filter((s) => s.cornersOccupied === 0).length / n).toFixed(3)),
        cornersOccupied: dist(settled.map((s) => s.cornersOccupied)),
        inZoneShare: Number((settled.reduce((a, s) => a + s.inZone, 0) / Math.max(1, settled.reduce((a, s) => a + s.offensivePlayers, 0))).toFixed(3)),
        meanGuardDistance: dist(settled.map((s) => s.meanGuardDistance)),
        minPairDistance: dist(settled.map((s) => s.minPairDistance)),
        paintOccupants: dist(settled.map((s) => s.paintOccupants)),
      }
    })(),
    eventCountsFirstGame: games[0]!.economy.eventCounts,
  }
  mkdirSync('docs/match-next-bt2/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt2/audit/economy-${tag}.json`, JSON.stringify(out, null, 2))
}, 3_000_000)
