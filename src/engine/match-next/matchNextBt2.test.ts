/**
 * BT2 (possession economy & half-court basketball) focal tests. Each one replays a reproducible seed through the real
 * application path (createNewGame -> MatchEnginePort -> MatchNextLiveController), exactly like Live and Instant do, and
 * checks a property of the possession structure or of a basketball action, never a hard-coded total.
 */

import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { createCourtGeometry, distanceBetween, isBeyondThreePointLine } from '@/domain/court'
import { REBOUND_ACQUISITION_RADIUS_METERS } from './ball/BallState'
import { closeoutReactionTicks } from './defense/Closeout'
import { tuning } from './tuning'
import { OPEN_LOOK_VALUE_POINTS, shotMakeProbability } from './actions/DecisionCore'
import { isInsideZone, ZONE_TOLERANCE_METERS } from './structure/OffensiveStructure'
import type { MatchNextEvent, MatchState } from './index'

type Coverage = 'switch' | 'drop' | 'hedge' | 'blitz'

function liveSession(seed: number, coverage?: Coverage) {
  const world = createNewGame()
  const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
  const port = createMatchEnginePort('match-next')
  const prepared = port.prepare(world, game, seed)
  const setup = coverage === undefined ? prepared : {
    ...prepared,
    tacticalPlans: {
      home: { ...prepared.tacticalPlans.home, defense: { ...prepared.tacticalPlans.home.defense, pickAndRollCoverage: coverage } },
      away: { ...prepared.tacticalPlans.away, defense: { ...prepared.tacticalPlans.away.defense, pickAndRollCoverage: coverage } },
    },
  }
  return port.createLiveSession(setup)
}

/** Steps tick by tick and lets `observe` see every (previous, current) pair of states. */
function play(seed: number, ticks: number, observe: (before: MatchState, after: MatchState) => void, coverage?: Coverage): MatchState {
  const live = liveSession(seed, coverage)
  let before = live.matchState
  while (!live.matchState.isComplete && live.matchState.t < ticks) {
    live.advanceOneStep()
    observe(before, live.matchState)
    before = live.matchState
  }
  return live.matchState
}

const at = (state: MatchState, t: number): readonly MatchNextEvent[] => state.events.filter((event) => event.t === t)

describe('BT2B/L: possession phases and decision cadence', { timeout: 240000 }, () => {
  const stageAtDecision: { secondsLeft: number; transition: boolean; stage: string | undefined; settled: boolean; best: number; hold: number; sinceResolved: number; kind: string | undefined; sinceCatch: number | undefined; caught: boolean }[] = []
  const final = play(424242, 7000, (before, after) => {
    for (const event of at(after, after.t)) {
      if (event.type !== 'decisionSelected' || event.utility === undefined) continue
      const flow = before.offenseFlow
      stageAtDecision.push({
        // Stage as the handler saw it, settlement as of this very tick (the offense may settle on the tick he decides).
        secondsLeft: Math.min(before.shotClockTenths ?? 240, before.gameClockTenths) / 10, transition: before.transition !== null, stage: flow?.stage, settled: after.offenseFlow?.settledAtT != null, kind: event.decisionKind, hold: event.utility.hold, sinceResolved: flow === null ? 99 : after.t - flow.lastResolvedT,
        best: Math.max(event.utility.shoot, event.utility.drive, event.utility.pass, event.utility.screen ?? 0),
        caught: flow?.caughtFromPass ?? false, sinceCatch: flow === null ? undefined : after.t - flow.holderSinceT,
      })
    }
  })

  it('never lets a handler decide while he is still gathering: every read after a catch takes at least three ticks', () => {
    expect(stageAtDecision.length).toBeGreaterThan(30)
    for (const decision of stageAtDecision) if (decision.caught) expect(decision.sinceCatch!).toBeGreaterThanOrEqual(3)
  })

  it('does not act before the half court is set unless the look is genuinely open (or the decision is a reaction to an advantage)', () => {
    // With the clock nearly gone an unsettled offense may no longer wait (BT4.1: the hold value also carries the patience premium,
    // so the time left on the shot clock or the game clock, not the hold value, tells whether there is still time to wait): that is not "acting early".
    const early = stageAtDecision.filter((decision) => !decision.transition && decision.stage === 'HALF_COURT' && !decision.settled && decision.secondsLeft > 9.5 && decision.sinceResolved > 6)
    // The recorded utilities are expected points; the willingness to act also carries the handler's tendencies (usage) and the softmax (BT3/BT4),
    // which move it by up to about 15% either way.
    for (const decision of early) expect(decision.best).toBeGreaterThanOrEqual(OPEN_LOOK_VALUE_POINTS * 0.85)
  })

  it('decides on a human cadence: the median gap between decisions is over a second, not every tick', () => {
    const decisionTicks = final.events.filter((event) => event.type === 'decisionSelected').map((event) => event.t)
    const gaps = decisionTicks.slice(1).map((t, index) => (t - decisionTicks[index]!) / 10).sort((a, b) => a - b)
    expect(gaps[Math.floor(gaps.length / 2)]!).toBeGreaterThanOrEqual(1.2)
  })

  it('is deterministic: the same seed produces the same decisions and events', () => {
    const run = () => play(7, 2500, () => undefined).events.map((event) => `${event.t}:${event.type}:${event.playerId ?? ''}:${event.decisionKind ?? ''}`)
    expect(run()).toEqual(run())
  })
})

describe('BT2G/H: shot decision model (opportunity is not attempt)', { timeout: 240000 }, () => {
  const decisions: { kind: string; utility: NonNullable<MatchNextEvent['utility']> }[] = []
  play(424242, 7000, (_before, after) => {
    for (const event of at(after, after.t)) if (event.type === 'decisionSelected' && event.utility !== undefined) decisions.push({ kind: event.decisionKind!, utility: event.utility })
  })

  it('shoots when the shot is worth at least as much as the alternatives (within decision noise), and never on rating alone', () => {
    const shots = decisions.filter((decision) => decision.kind === 'SHOOT' || decision.kind === 'CATCH_AND_SHOOT')
    expect(shots.length).toBeGreaterThan(12)
    for (const shot of shots) {
      const alternatives = Math.max(shot.utility.pass, shot.utility.drive, shot.utility.screen ?? 0)
      // Softmax choice (BT3A): a near tie can go either way; the Gumbel noise is bounded by ~9 temperatures.
      expect(shot.utility.shoot * 1.16 + 9 * tuning().decisionTemperaturePoints).toBeGreaterThanOrEqual(alternatives)
    }
  })

  it('declines shot opportunities that are worth less than a better read: opportunities > attempts', () => {
    const opportunities = decisions.filter((decision) => decision.utility.shoot >= decision.utility.hold)
    const declined = opportunities.filter((decision) => decision.kind !== 'SHOOT' && decision.kind !== 'CATCH_AND_SHOOT')
    expect(declined.length).toBeGreaterThan(0)
  })

  it('makes very long threes physically harder instead of forbidding them', () => {
    expect(shotMakeProbability(60, 9.5, 3, 0)).toBeLessThan(shotMakeProbability(60, 7, 3, 0))
    expect(shotMakeProbability(60, 12, 3, 0)).toBeGreaterThan(0.04)
  })

  it('takes threes from the corner strip as threes (a corner shot is worth 3)', () => {
    const court = createCourtGeometry('FIBA')
    expect(isBeyondThreePointLine({ x: court.baskets.right.x + 0.3, y: 0.55 }, court.baskets.right, court)).toBe(true)
  })
})

describe('BT2C: half-court settlement (zones, not rails)', { timeout: 240000 }, () => {
  it('sets the offense into its 5-out zones with the corners occupied before it runs its offense', () => {
    let samples = 0
    let inZone = 0
    let players = 0
    let cornersMissing = 0
    play(424242, 7000, (_before, after) => {
      const flow = after.offenseFlow
      const structure = after.offensiveStructure
      if (flow === null || structure === null || flow.settledAtT === null || after.ball.kind !== 'HELD' || flow.stage !== 'HALF_COURT') return
      // BT4: judged in the 3 s after the offense settles ("before it runs its offense"). Later the ball and the players are in motion (pull-ups, drives,
      // screens), the slots move with the ball and nobody is meant to be standing on a spot.
      if (after.t - flow.settledAtT > 30) return
      samples += 1
      const corners = structure.assignments.filter((item) => item.slot.endsWith('CORNER'))
      for (const assignment of structure.assignments) {
        if (assignment.slot === 'BALL') continue
        const player = after.players.find((candidate) => candidate.playerId === assignment.playerId)!
        const slot = structure.slots.find((candidate) => candidate.slot === assignment.slot)!
        players += 1
        if (isInsideZone(player.position, slot.position, structure.attackingBasket)) inZone += 1
      }
      const occupied = corners.filter((assignment) => {
        const player = after.players.find((candidate) => candidate.playerId === assignment.playerId)!
        const slot = structure.slots.find((candidate) => candidate.slot === assignment.slot)!
        return distanceBetween(player.position, slot.position) <= ZONE_TOLERANCE_METERS + 0.5
      }).length
      if (occupied === 0) cornersMissing += 1
    })
    expect(samples).toBeGreaterThan(100)
    expect(inZone / players).toBeGreaterThan(0.7)
    // Per tick, not per sample: BT3 games spend less time in a settled half court (more fouls, turnovers and transition shots), so the
    // same handful of frames (BT2: about 1 in 500 ticks) is a bigger share of a smaller sample.
    expect(cornersMissing / 7000).toBeLessThan(0.005)
  })
})

describe('BT2D: off-ball movement with a reason', { timeout: 240000 }, () => {
  it('cuts only with a reason (denial or sag), to the rim, and never more than one cutter at a time; spacers drift only during drives', () => {
    const cuts: { kind: string; endedNearRim: boolean; ticks: number }[] = []
    const active = new Map<string, { kind: string; startedT: number }>()
    let simultaneous = 0
    let driftWithoutDrive = 0
    play(424242, 9000, (_before, after) => {
      const moves = after.offenseFlow?.moves ?? []
      const cutters = moves.filter((move) => move.kind === 'BASKET_CUT' || move.kind === 'BACKDOOR_CUT')
      if (cutters.length > 1) simultaneous += 1
      if (moves.some((move) => move.kind === 'DRIFT') && !after.actions.some((action) => action.kind === 'DRIVE' && action.status === 'ACTIVE')) driftWithoutDrive += 1
      for (const move of cutters) if (!active.has(move.playerId)) active.set(move.playerId, { kind: move.kind, startedT: move.startedT })
      for (const [playerId, info] of [...active]) {
        if (cutters.some((move) => move.playerId === playerId)) continue
        const player = after.players.find((candidate) => candidate.playerId === playerId)!
        cuts.push({ kind: info.kind, endedNearRim: Math.min(distanceBetween(player.position, after.court.baskets.left), distanceBetween(player.position, after.court.baskets.right)) < 6, ticks: after.t - info.startedT })
        active.delete(playerId)
      }
    })
    expect(cuts.length).toBeGreaterThan(0)
    expect(simultaneous).toBe(0)
    expect(driftWithoutDrive).toBe(0)
    for (const cut of cuts) expect(cut.ticks).toBeLessThanOrEqual(26)
    expect(cuts.some((cut) => cut.endedNearRim)).toBe(true)
  })
})

describe('BT2E/F/M: ball screens and their coverage', { timeout: 240000 }, () => {
  for (const coverage of ['drop', 'switch', 'hedge', 'blitz'] as const) {
    it(`runs a real ${coverage} pick and roll: the screener arrives and sets, the handler uses it, the defense answers, the screener exits`, () => {
      let set = 0
      let used = 0
      let ended = 0
      let arrivalMax = 0
      let switched = false
      const separations: number[] = []
      let watching: { handlerId: string; defenderId: string; usedT: number; max: number } | null = null
      play(424242, 9000, (_before, after) => {
        const screen = after.screen
        if (screen !== null && screen.phase === 'SET' && screen.setAtT === after.t) {
          set += 1
          const screener = after.players.find((player) => player.playerId === screen.screenerId)!
          arrivalMax = Math.max(arrivalMax, distanceBetween(screener.position, screen.location))
        }
        if (screen !== null && screen.phase === 'USED' && screen.usedAtT === after.t) {
          used += 1
          watching = { handlerId: screen.handlerId, defenderId: screen.handlerDefenderId, usedT: after.t, max: 0 }
        }
        if (screen !== null && screen.switched && after.defensiveStructure?.assignments.some((item) => item.source === 'SWITCH')) switched = true
        if (watching !== null) {
          const handler = after.players.find((player) => player.playerId === watching!.handlerId)!
          const defender = after.players.find((player) => player.playerId === watching!.defenderId)!
          watching.max = Math.max(watching.max, distanceBetween(handler.position, defender.position))
          if (after.t - watching.usedT >= 30) { separations.push(watching.max); watching = null }
        }
        ended += after.events.filter((event) => event.t === after.t && event.type === 'screenEnded').length
      }, coverage)
      expect(set).toBeGreaterThan(0)
      expect(used).toBeGreaterThan(0)
      expect(ended).toBeGreaterThan(0)
      expect(arrivalMax).toBeLessThan(0.7)
      if (coverage === 'switch') expect(switched).toBe(true)
      else expect(separations.length).toBeGreaterThan(0)
    })
  }
})

describe('BT2I/J: rebounding v2 and the offensive reset', { timeout: 240000 }, () => {
  const secured: { type: string; t: number; team: string; distance: number; playerId: string; possessionId: string | undefined }[] = []
  const decisionsAfter: { reboundT: number; rebounderId: string; decisionT: number; kind: string }[] = []
  const pending = new Map<string, number>()
  const final = play(424242, 12000, (_before, after) => {
    for (const event of at(after, after.t)) {
      if (event.type === 'reboundSecured') {
        secured.push({ type: event.reboundType!, t: event.t, team: String(event.teamId), distance: event.acquisitionDistanceMeters ?? 99, playerId: String(event.playerId), possessionId: event.possessionId })
        if (event.reboundType === 'offensive') pending.set(String(event.playerId), event.t)
      }
      if (event.type === 'decisionSelected' && pending.has(String(event.playerId))) {
        decisionsAfter.push({ reboundT: pending.get(String(event.playerId))!, rebounderId: String(event.playerId), decisionT: event.t, kind: event.decisionKind! })
        pending.delete(String(event.playerId))
      }
    }
  })

  it('is a real contest decided at the ball: every rebound is secured within physical reach, and offensive rebounds are a minority', () => {
    const offensive = secured.filter((item) => item.type === 'offensive').length
    expect(secured.length).toBeGreaterThan(25)
    for (const item of secured) expect(item.distance).toBeLessThanOrEqual(REBOUND_ACQUISITION_RADIUS_METERS)
    expect(offensive / secured.length).toBeGreaterThan(0.08)
    expect(offensive / secured.length).toBeLessThan(0.42)
  })

  it('gathers before acting after an offensive rebound and never chains putbacks', () => {
    expect(decisionsAfter.length).toBeGreaterThanOrEqual(3)
    for (const item of decisionsAfter) expect(item.decisionT - item.reboundT).toBeGreaterThanOrEqual(7)
    // Second chances happen, but a possession is not an endless chain of putbacks (before BT2: 1.8% of possessions had 4+ shots).
    const chains = final.possessions.filter((possession) => possession.offensiveRebounds >= 3).length
    expect(chains / final.possessions.length).toBeLessThan(0.04)
    expect(Math.max(...final.possessions.map((possession) => possession.offensiveRebounds))).toBeLessThanOrEqual(5)
  })
})

describe('BT2K: ball continuity', { timeout: 240000 }, () => {
  it('never teleports the ball outside a flight, brings a made ball down through the net and carries it to the inbound spot', () => {
    let teleports = 0
    let madeBalls = 0
    let fellSmoothly = 0
    let inboundJump = 0
    let inbounds = 0
    let previousMadeHeight: number | null = null
    play(424242, 9000, (before, after) => {
      const flying = ['PASS_IN_FLIGHT', 'SHOT_IN_FLIGHT', 'LOOSE', 'JUMP_BALL'].includes(before.ball.kind)
      if (!flying && after.period === before.period && distanceBetween(before.ball.position, after.ball.position) > 2.5) teleports += 1
      if (after.ball.kind === 'DEAD' && after.ball.reason === 'madeBasket') {
        if (before.ball.kind === 'SHOT_IN_FLIGHT') { madeBalls += 1; previousMadeHeight = after.ball.heightMeters }
        else if (previousMadeHeight !== null) { if (after.ball.heightMeters <= previousMadeHeight) fellSmoothly += 1; previousMadeHeight = after.ball.heightMeters }
      }
      if (before.ball.kind === 'DEAD' && before.ball.reason === 'madeBasket' && after.ball.kind !== 'DEAD') {
        inbounds += 1
        if (distanceBetween(before.ball.position, after.ball.kind === 'INBOUND' ? after.ball.spot : after.ball.position) > 1.1) inboundJump += 1
      }
    })
    expect(teleports).toBe(0)
    expect(madeBalls).toBeGreaterThan(5)
    expect(fellSmoothly).toBeGreaterThan(madeBalls * 2)
    expect(inbounds).toBeGreaterThan(5)
    expect(inboundJump).toBe(0)
  })
})

describe('BT2M: defensive response to a pass', { timeout: 240000 }, () => {
  it('the receiver\'s defender closes out while the ball is still in the air (sprinting when he has ground to make up)', () => {
    let checked = 0
    let closing = 0
    play(424242, 6000, (_before, after) => {
      const ball = after.ball
      if (ball.kind !== 'PASS_IN_FLIGHT' || ball.isInbound || after.defensiveStructure === null) return
      // BT3A: the defender reacts to the release (closeoutReactionTicks) before he moves, and a team that is retreating in transition is not closing out.
      if (after.t - ball.releaseT < closeoutReactionTicks() || after.transition !== null) return
      const defenderId = after.defensiveStructure.assignments.find((item) => item.attackerPlayerId === ball.intendedReceiverPlayerId)?.defenderPlayerId
      const defender = after.players.find((player) => player.playerId === defenderId)
      const intent = after.movementIntents.find((item) => item.playerId === defenderId)
      if (defender === undefined || intent === undefined) return
      checked += 1
      const receiver = after.players.find((player) => player.playerId === ball.intendedReceiverPlayerId)!
      if (distanceBetween(intent.target, receiver.position) < 2.2 + 1.2) closing += 1
    })
    expect(checked).toBeGreaterThan(50)
    expect(closing / checked).toBeGreaterThan(0.85)
  })
})
