import { it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEvent } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'
import { quantiles } from './pace'

/**
 * BT4C action commitment and BT4D clock truth. From the event stream: how long each action really takes (start to resolution), what
 * it ends in, and whether any state is left in too little time. A second pass walks one game tick by tick and checks the clocks.
 * BT2_AUDIT=1 BT4_TAG=x BT4_SEEDS=4 npx vitest run .../actions.test.ts
 */
it.skipIf(process.env.BT2_AUDIT === undefined)('BT4C/D actions and clocks', () => {
  const seeds = [424242, 7, 1, 99, 2024, 31337].slice(0, Number(process.env.BT4_SEEDS ?? 4))
  const durations: Record<string, number[]> = {}
  const outcomes: Record<string, Record<string, number>> = {}
  const gaps: Record<string, number[]> = { rebound: [], screenSetup: [], screenUse: [], screenExit: [], inboundToFirstDecision: [], defensiveReboundToFirstDecision: [], offensiveReboundToNext: [], startToFirstShot: [], startToFirstPass: [] }
  const quickShots = { total: 0, under1s: 0, under15s: 0 }
  const shotClockAtStart: Record<string, number[]> = {}
  for (const seed of seeds) {
    const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(seed))
    while (!live.matchState.isComplete && live.matchState.t < 60000) live.advanceTicks(3)
    const events = live.matchState.events
    const started = new Map<string, MatchNextEvent>()
    for (const e of events) {
      if (e.type === 'actionStarted' && e.actionId !== undefined) started.set(e.actionId, e)
      if (e.type === 'actionResolved' && e.actionId !== undefined) {
        const start = started.get(e.actionId)
        const kind = e.actionKind ?? '?'
        if (start !== undefined) (durations[kind] ??= []).push((e.t - start.t) / 10)
        const o = (outcomes[kind] ??= {})
        o[e.actionOutcome ?? '?'] = (o[e.actionOutcome ?? '?'] ?? 0) + 1
      }
    }
    let lastMiss: MatchNextEvent | undefined
    let lastScreenAction: MatchNextEvent | undefined
    let lastScreenSet: MatchNextEvent | undefined
    let lastScreenUsed: MatchNextEvent | undefined
    let possessionStart: MatchNextEvent | undefined
    let firstShotSeen = false
    let firstPassSeen = false
    let pendingInbound: MatchNextEvent | undefined
    let pendingDefensiveRebound: MatchNextEvent | undefined
    let pendingOffensiveRebound: MatchNextEvent | undefined
    for (const e of events) {
      if (e.type === 'shotMissed') lastMiss = e
      if (e.type === 'reboundSecured' && lastMiss !== undefined) {
        gaps.rebound!.push((e.t - lastMiss.t) / 10)
        if (e.reboundType === 'defensive') pendingDefensiveRebound = e
        else pendingOffensiveRebound = e
        lastMiss = undefined
      }
      if (e.type === 'actionStarted' && e.actionKind === 'SCREEN') lastScreenAction = e
      if (e.type === 'screenSet' && lastScreenAction !== undefined) { gaps.screenSetup!.push((e.t - lastScreenAction.t) / 10); lastScreenSet = e }
      if (e.type === 'screenUsed' && lastScreenSet !== undefined) { gaps.screenUse!.push((e.t - lastScreenSet.t) / 10); lastScreenUsed = e }
      if (e.type === 'screenEnded' && lastScreenUsed !== undefined) { gaps.screenExit!.push((e.t - lastScreenUsed.t) / 10); lastScreenUsed = undefined }
      if (e.type === 'inboundReleased') pendingInbound = e
      if (e.type === 'possessionStart') {
        possessionStart = e
        firstShotSeen = false
        firstPassSeen = false
        const reason = e.startReason ?? '?'
        const shotClock = live.matchState.clockRules.shotClockSeconds
        ;(shotClockAtStart[reason] ??= []).push(shotClock)
      }
      if (e.type === 'decisionSelected') {
        if (pendingInbound !== undefined) { gaps.inboundToFirstDecision!.push((e.t - pendingInbound.t) / 10); pendingInbound = undefined }
        if (pendingDefensiveRebound !== undefined) { gaps.defensiveReboundToFirstDecision!.push((e.t - pendingDefensiveRebound.t) / 10); pendingDefensiveRebound = undefined }
        if (pendingOffensiveRebound !== undefined) { gaps.offensiveReboundToNext!.push((e.t - pendingOffensiveRebound.t) / 10); pendingOffensiveRebound = undefined }
      }
      if (e.type === 'passReleased' && possessionStart !== undefined && !firstPassSeen) { firstPassSeen = true; gaps.startToFirstPass!.push((e.t - possessionStart.t) / 10) }
      if (e.type === 'shotReleased' && possessionStart !== undefined) {
        quickShots.total += 1
        const after = (e.t - possessionStart.t) / 10
        if (after < 1) quickShots.under1s += 1
        if (after < 1.5) quickShots.under15s += 1
        if (!firstShotSeen) { firstShotSeen = true; gaps.startToFirstShot!.push(after) }
      }
    }
  }
  // Clock truth on one game, tick by tick.
  const live = createMatchEnginePort('match-next').createLiveSession(preparedSetup(424242))
  let violations = 0
  let checked = 0
  let previous = live.matchState
  let shotClockBelowZero = 0
  let runningTicksWithoutDecrement = 0
  while (!live.matchState.isComplete && live.matchState.t < 60000) {
    live.advanceOneStep()
    const now = live.matchState
    if (now.period === previous.period) {
      checked += 1
      const delta = previous.gameClockTenths - now.gameClockTenths
      if (delta !== (previous.clock.gameRunning ? 1 : 0) && !(previous.clock.gameRunning && previous.gameClockTenths === 0)) violations += 1
      if (previous.clock.gameRunning && delta === 0) runningTicksWithoutDecrement += 1
    }
    if (now.shotClockTenths !== null && now.shotClockTenths < 0) shotClockBelowZero += 1
    previous = now
  }
  const q = (values: readonly number[]): ReturnType<typeof quantiles> => quantiles(values)
  const out = {
    seeds,
    actionSeconds: Object.fromEntries(Object.entries(durations).map(([k, v]) => [k, q(v)])),
    actionOutcomes: outcomes,
    gapSeconds: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, q(v)])),
    quickShots: { ...quickShots, under1sShare: Number((quickShots.under1s / Math.max(1, quickShots.total)).toFixed(3)), under15sShare: Number((quickShots.under15s / Math.max(1, quickShots.total)).toFixed(3)) },
    clockTruth: { ticksChecked: checked, gameClockDeltaViolations: violations, runningTicksWithoutDecrement, shotClockBelowZero },
  }
  mkdirSync('docs/match-next-bt4/audit', { recursive: true })
  writeFileSync(`docs/match-next-bt4/audit/actions-${process.env.BT4_TAG ?? 'run'}.json`, JSON.stringify(out, null, 2))
}, 6_000_000)
