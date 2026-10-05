import { describe, expect, it } from 'vitest'

import { getTeamLineup, updateGameWorld } from '@/domain/world'
import { assignLineupSlot, createDefaultTeamLineup } from '@/domain/tactics'
import { createNewGame } from '@/app/game/createNewGame'
import { createCoachRotationPlan } from '@/engine/tactics/CoachRotationEngine'
import { applyCommand, createMatchState, decideRotationSubstitutions, isSubstitutionOpportunity, tick, type MatchSetup, type MatchState } from '@/engine/match-next'
import { createMatchNextResult } from './MatchNextResult'
import { prepareMatchSetup } from './prepareMatchSetup'
import { MatchNextLiveController } from './MatchNextLiveController'
import { createMatchEnginePort } from './MatchEnginePortFactory'
import { deriveMatchNextDynamicConsequences } from './MatchNextDynamicConsequences'

function fixture() {
  const world = createNewGame()
  const team = Object.values(world.teams).find((candidate) => candidate.coachId === world.userCoachId)!
  const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled' && (candidate.homeTeamId === team.id || candidate.awayTeamId === team.id))!
  return { world, game, team, setup: prepareMatchSetup(world, game, 20260928) }
}

function ticks(state: MatchState, count: number): MatchState {
  let current = state
  for (let index = 0; index < count; index += 1) current = tick(current)
  return current
}

function urgentRotation(setup: MatchSetup, side: 'home' | 'away', periodMinutes: number) {
  const squad = side === 'home' ? setup.homeSquad : setup.awaySquad
  const starters = side === 'home' ? setup.initialLineups.home : setup.initialLineups.away
  const bench = squad.filter((playerId) => !starters.includes(playerId))
  const plan = setup.coachingPlans![side]
  const minutesByPeriod = Object.fromEntries(squad.map((playerId) => [playerId, [starters.includes(playerId) ? 0 : periodMinutes * 5 / bench.length]]))
  return { ...plan, minutesByPeriod, fatigueTolerance: 0.82 }
}

describe('BS8 coach and rotation authority', { timeout: 60000 }, () => {
  it('prefers a fresher positional equivalent when a starter becomes heavily fatigued', () => {
    const { world, team, setup } = fixture()
    const isHome = team.id === setup.homeTeamId
    const squad = (isHome ? setup.homeSquad : setup.awaySquad).slice(0, 6)
    const source = world.players[squad[0]!]!
    const equivalentPlayers = {
      ...world.players,
      ...Object.fromEntries(squad.map((playerId) => {
        const player = world.players[playerId]!
        return [playerId, {
          ...player,
          basketball: {
            ...player.basketball,
            primaryPosition: 'PG' as const,
            secondaryPositions: ['SG', 'SF', 'PF', 'C'] as const,
            ratings: { ...source.basketball.ratings },
          },
        }]
      })),
    }
    const base = {
      teamId: team.id,
      squad,
      players: equivalentPlayers,
      fatigueByPlayerId: world.careerFatigueByPlayerId,
      savedLineup: getTeamLineup(world, team.id),
      respectSavedLineup: false,
      matchTactics: (isHome ? setup.tacticalPlans.home : setup.tacticalPlans.away) as Parameters<typeof createCoachRotationPlan>[0]['matchTactics'],
      opponentPlayers: (isHome ? setup.awaySquad : setup.homeSquad).map((playerId) => world.players[playerId]!),
      regulationPeriodMinutes: [setup.clockRules.periodSeconds / 60],
    }
    const freshFive = createCoachRotationPlan(base).startingLineup
    const fatiguedStarter = freshFive[0]!
    const tiredFive = createCoachRotationPlan({ ...base, fatigueByPlayerId: { ...world.careerFatigueByPlayerId, [fatiguedStarter]: 100 } }).startingLineup

    expect(tiredFive).not.toContain(fatiguedStarter)
    expect(tiredFive).toHaveLength(5)
    expect(new Set(tiredFive).size).toBe(5)
  })

  it('selects a deterministic contextual five and allocates exactly five player-minutes per period minute', () => {
    const { world, team, setup } = fixture()
    const isHome = team.id === setup.homeTeamId
    const squad = isHome ? setup.homeSquad : setup.awaySquad
    const opponent = isHome ? setup.awaySquad : setup.homeSquad
    const tactics = isHome ? setup.tacticalPlans.home : setup.tacticalPlans.away
    const input = {
      teamId: team.id,
      squad,
      players: world.players,
      fatigueByPlayerId: world.careerFatigueByPlayerId,
      savedLineup: getTeamLineup(world, team.id),
      respectSavedLineup: false,
      matchTactics: tactics as Parameters<typeof createCoachRotationPlan>[0]['matchTactics'],
      opponentPlayers: opponent.map((playerId) => world.players[playerId]!),
      regulationPeriodMinutes: [setup.clockRules.periodSeconds / 60],
    }
    const first = createCoachRotationPlan(input)
    const repeated = createCoachRotationPlan(input)
    const totalPlannedMinutes = Object.values(first.minutesByPeriod).reduce((sum, periods) => sum + (periods[0] ?? 0), 0)

    expect(first).toEqual(repeated)
    expect(first.startingLineup).toHaveLength(5)
    expect(new Set(first.startingLineup).size).toBe(5)
    expect(first.startingLineup.every((playerId) => squad.includes(playerId))).toBe(true)
    expect(totalPlannedMinutes).toBe(setup.clockRules.periodSeconds / 60 * 5)
    expect(first.diagnostics.lineupSource).toBe('CONTEXTUAL_COACH_SELECTION')

    const savedInstructions = [{ period: 1, clockThresholdSeconds: 60, playerOutId: squad[0]!, playerInId: squad[5]! }]
    const savedMinutes = Object.fromEntries(squad.map((playerId, index) => [playerId, [index < 5 ? (setup.clockRules.periodSeconds / 60) : 0]]))
    const withIntent = createCoachRotationPlan({ ...input, rotationIntent: { teamId: team.id, instructions: savedInstructions, minutesByPeriod: savedMinutes } })
    expect(withIntent.minutesByPeriod).toEqual(savedMinutes)
    expect(withIntent.rotationInstructions).toEqual(savedInstructions)
  })

  it('keeps the valid user-saved starting five in the shared Match Next setup', () => {
    const { world, game, team, setup } = fixture()
    const side = team.id === setup.homeTeamId ? 'home' : 'away'
    const slots = ['PG', 'SG', 'SF', 'PF', 'C'] as const
    const explicitLineup = setup.initialLineups[side].reduce((lineup, playerId, index) => assignLineupSlot(lineup, slots[index]!, playerId), createDefaultTeamLineup(team.id))
    const savedWorld = updateGameWorld(world, { lineupsByTeamId: { ...world.lineupsByTeamId, [team.id]: explicitLineup } })
    const savedSetup = prepareMatchSetup(savedWorld, game, 20260928)

    expect(savedSetup.coachingPlans?.[side]?.diagnostics.lineupSource).toBe('SAVED_USER_LINEUP')
    expect(savedSetup.coachingPlans?.[side]?.startingLineup).toEqual(savedSetup.initialLineups[side])
  })

  it('applies one legal dead-ball substitution, preserves session fatigue, and records actual court seconds', () => {
    const { setup } = fixture()
    const homePlan = setup.coachingPlans!.home
    const homeIds = new Set(setup.homeSquad)
    const starters = setup.initialLineups.home
    const bench = setup.homeSquad.filter((playerId) => !starters.includes(playerId))
    const minutesByPeriod = Object.fromEntries(setup.homeSquad.map((playerId) => [playerId, [starters.includes(playerId) ? 0 : 10 / bench.length]]))
    const modifiedSetup: MatchSetup = {
      ...setup,
      clockRules: { ...setup.clockRules, periodCount: 1, periodSeconds: 120, overtimeSeconds: 30 },
      coachingPlans: {
        ...setup.coachingPlans!,
        home: { ...homePlan, minutesByPeriod, fatigueTolerance: 0.82 },
      },
    }
    let state = createMatchState(modifiedSetup)
    const outgoing = starters[0]!
    const incoming = bench.find((playerId) => homePlan.roleFitByPlayerId[playerId]?.[homePlan.roleByPlayerId[outgoing]!]! >= 46
      || setup.players.find((profile) => profile.playerId === playerId)!.primaryPosition === homePlan.roleByPlayerId[outgoing])!
    state = {
      ...state,
      ball: { kind: 'DEAD', reason: 'other', position: state.ball.position, heightMeters: 0.08 },
      players: state.players.map((player) => player.playerId === outgoing ? { ...player, fatigue: 90 }
        : player.playerId === incoming ? { ...player, fatigue: 23 } : player),
    }
    const proposals = decideRotationSubstitutions(state).filter((proposal) => proposal.teamId === setup.homeTeamId)
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({ playerOutId: outgoing, playerInId: incoming })

    state = { ...state, clock: { gameRunning: true, shotRunning: false } }
    state = ticks(state, 10)
    const incomingFatigueBefore = state.players.find((player) => player.playerId === incoming)!.fatigue
    const outgoingFatigueBefore = state.players.find((player) => player.playerId === outgoing)!.fatigue
    state = { ...state, clock: { gameRunning: false, shotRunning: false }, ball: { kind: 'DEAD', reason: 'other', position: state.ball.position, heightMeters: 0.08 } }
    state = applyCommand(state, { type: 'coachSubstitutions', proposals })
    expect(state.players.filter((player) => player.active && player.teamId === setup.homeTeamId)).toHaveLength(5)
    expect(state.players.find((player) => player.playerId === outgoing)).toMatchObject({ active: false })
    expect(state.players.find((player) => player.playerId === incoming)).toMatchObject({ active: true, fatigue: incomingFatigueBefore })
    expect(state.players.find((player) => player.playerId === incoming)!.position).toEqual(state.players.find((player) => player.playerId === outgoing)!.position)
    expect(state.events.filter((event) => event.type === 'substitution' && event.teamId === setup.homeTeamId)).toHaveLength(1)

    state = { ...state, clock: { gameRunning: true, shotRunning: false } }
    state = ticks(state, 20)
    expect(state.players.find((player) => player.playerId === outgoing)!.fatigue).toBeLessThan(outgoingFatigueBefore)
    const gameEnd = { sequence: state.nextEventSequence, t: state.t, period: state.period, gameClockTenths: state.gameClockTenths, type: 'gameEnd' as const }
    const result = createMatchNextResult(modifiedSetup, { ...state, isComplete: true, events: [...state.events, gameEnd] })

    expect(result.playerStats.find((line) => line.playerId === outgoing)?.secondsPlayed).toBe(1)
    expect(result.playerStats.find((line) => line.playerId === incoming)?.secondsPlayed).toBe(2)
    expect(result.playByPlay).toContainEqual(expect.objectContaining({ type: 'substitution', playerId: incoming, targetPlayerId: outgoing, substitutionReason: proposals[0]!.reason }))
    expect(homeIds.has(incoming)).toBe(true)
  })

  it('rejects a dead-ball substitution when competition rules do not open a substitution window', () => {
    const { setup } = fixture()
    const restrictedSetup = { ...setup, clockRules: { ...setup.clockRules, substitutionOpportunityReasons: [] } }
    const state = createMatchState({ ...restrictedSetup, autonomousActions: true })
    const starters = setup.initialLineups.home
    const incoming = setup.homeSquad.find((playerId) => !starters.includes(playerId))!
    const deadBall = { ...state, ball: { kind: 'DEAD' as const, reason: 'outOfBounds' as const, position: state.ball.position, heightMeters: 0.08 } }
    const proposal = { teamId: setup.homeTeamId, playerOutId: starters[0]!, playerInId: incoming, reason: 'test', expectedMinutes: 10 }

    expect(decideRotationSubstitutions(deadBall)).toEqual([])
    expect(() => applyCommand(deadBall, { type: 'coachSubstitutions', proposals: [proposal] })).toThrow('legal competition substitution opportunity')

    const homeStarters = setup.initialLineups.home
    const windowSetup: MatchSetup = {
      ...setup,
      clockRules: { ...setup.clockRules, substitutionOpportunityReasons: ['outOfBounds'] },
      coachingPlans: { ...setup.coachingPlans!, home: urgentRotation(setup, 'home', 10) },
    }
    const liveClockDeadBall = {
      ...createMatchState(windowSetup),
      clock: { gameRunning: true, shotRunning: false },
      ball: { kind: 'DEAD' as const, reason: 'outOfBounds' as const, position: state.ball.position, heightMeters: 0.08 },
      players: state.players.map((player) => player.playerId === homeStarters[0] ? { ...player, fatigue: 100 } : player),
    }
    expect(decideRotationSubstitutions(liveClockDeadBall).some((item) => item.teamId === setup.homeTeamId)).toBe(true)
  })

  it('applies the competition substitution-team rule after a made basket', () => {
    const { setup } = fixture()
    const scoringTeam = setup.homeTeamId
    const nonScoringTeam = setup.awayTeamId
    const restartTeamId = nonScoringTeam
    const period = setup.clockRules.periodCount
    const remainingTenths = (setup.clockRules.madeBasketSubstitutionUnderSecondsInFinalPeriod ?? 0) * 10

    expect(isSubstitutionOpportunity('madeBasket', period, remainingTenths, setup.clockRules, nonScoringTeam, restartTeamId)).toBe(true)
    expect(isSubstitutionOpportunity('madeBasket', period, remainingTenths, setup.clockRules, scoringTeam, restartTeamId)).toBe(false)
  })

  it('produces an automatic substitution during a regular match without manual UI commands', () => {
    const { world, game, setup } = fixture()
    const periodMinutes = 5
    const loadedWorld = updateGameWorld(world, { careerFatigueByPlayerId: {
      ...world.careerFatigueByPlayerId,
      ...Object.fromEntries(setup.players.map((player) => [player.playerId, 85])),
    } })
    const loadedSetup = prepareMatchSetup(loadedWorld, game, setup.matchSeed)
    const onePeriod: MatchSetup = {
      ...loadedSetup,
      clockRules: { ...setup.clockRules, periodCount: 1, periodSeconds: periodMinutes * 60, overtimeSeconds: 30 },
      coachingPlans: {
        ...loadedSetup.coachingPlans!,
        home: urgentRotation(loadedSetup, 'home', periodMinutes),
        away: urgentRotation(loadedSetup, 'away', periodMinutes),
      },
    }
    const controller = new MatchNextLiveController(onePeriod)
    const maxTicks = onePeriod.clockRules.periodSeconds * 10
    for (let step = 0; step < maxTicks && !controller.matchState.events.some((event) => event.type === 'substitution'); step += 1) controller.advanceOneStep()

    expect(controller.matchState.events.some((event) => event.type === 'substitution')).toBe(true)
    expect(controller.matchState.players.filter((player) => player.active && player.teamId === onePeriod.homeTeamId)).toHaveLength(5)
    expect(controller.matchState.players.filter((player) => player.active && player.teamId === onePeriod.awayTeamId)).toHaveLength(5)
    const stateBeforeProjection = controller.matchState
    const frame = controller.snapshot().frame
    expect(controller.matchState).toBe(stateBeforeProjection)
    expect(frame.rotationPlayers).toHaveLength(onePeriod.homeSquad.length + onePeriod.awaySquad.length)
    const change = [...frame.events].reverse().find((event) => event.type === 'substitution')!
    expect(frame.rotationPlayers.find((player) => player.playerId === change.outgoingPlayerId)).toMatchObject({ active: false })
    expect(frame.rotationPlayers.find((player) => player.playerId === change.playerId)?.active).toBe(true)
    expect(frame.rotationPlayers.find((player) => player.playerId === change.playerId)?.targetMinutes).not.toBeNull()
    expect(frame.rotationPlayers.every((player) => player.courtTimeTenths >= 0 && player.matchSessionFatigue >= 0 && player.matchSessionFatigue <= 100)).toBe(true)
    expect(frame.rotationPlayers.find((player) => player.playerId === change.outgoingPlayerId)?.stats).toHaveProperty('points')
    for (const projected of frame.rotationPlayers) {
      const canonical = controller.matchState.players.find((player) => player.playerId === projected.playerId)!
      expect(projected.courtTimeTenths).toBe(controller.matchState.courtTimeTenthsByPlayerId?.[projected.playerId] ?? 0)
      expect(projected.matchSessionFatigue).toBe(canonical.fatigue)
      expect(projected.preMatchCareerFatigue).toBe(canonical.preMatchCareerFatigue)
    }
  })

  it('uses the same deterministic rotation decisions for live playback and instant completion', () => {
    const { world, game, setup } = fixture()
    const periodMinutes = 5
    const loadedWorld = updateGameWorld(world, { careerFatigueByPlayerId: {
      ...world.careerFatigueByPlayerId,
      ...Object.fromEntries(setup.players.map((player) => [player.playerId, 85])),
    } })
    const loadedSetup = prepareMatchSetup(loadedWorld, game, setup.matchSeed)
    const onePeriod: MatchSetup = {
      ...loadedSetup,
      clockRules: { ...setup.clockRules, periodCount: 1, periodSeconds: periodMinutes * 60, overtimeSeconds: 30 },
      players: loadedSetup.players,
      coachingPlans: {
        ...loadedSetup.coachingPlans!,
        home: urgentRotation(loadedSetup, 'home', periodMinutes),
        away: urgentRotation(loadedSetup, 'away', periodMinutes),
      },
    }
    const liveController = new MatchNextLiveController(onePeriod)
    for (let step = 0; step < 6000 && !liveController.matchState.events.some((event) => event.type === 'substitution'); step += 1) liveController.advanceOneStep()
    expect(liveController.matchState.events.some((event) => event.type === 'substitution')).toBe(true)
    for (let step = 0; step < 400 && liveController.matchState.defensiveStructure === null; step += 1) liveController.advanceOneStep()
    const defensiveAssignments = liveController.matchState.defensiveStructure?.assignments ?? []
    expect(defensiveAssignments).toHaveLength(5)
    expect(new Set(defensiveAssignments.map((assignment) => assignment.defenderPlayerId)).size).toBe(5)
    expect(defensiveAssignments.every((assignment) => liveController.matchState.players.some((player) => player.active && player.playerId === assignment.defenderPlayerId)
      && liveController.matchState.players.some((player) => player.active && player.playerId === assignment.attackerPlayerId))).toBe(true)
    const live = liveController.skipToEnd()
    const instant = createMatchEnginePort('match-next').runInstant(onePeriod)
    const homeSubstitutions = live.events.filter((event) => event.type === 'substitution' && event.teamId === onePeriod.homeTeamId)
    const awaySubstitutions = live.events.filter((event) => event.type === 'substitution' && event.teamId === onePeriod.awayTeamId)
    const port = createMatchEnginePort('match-next')
    const consequences = deriveMatchNextDynamicConsequences(loadedWorld, live)
    const completed = port.complete(loadedWorld, live)
    // BT5: in a five-minute period a team may get no legal window (a substitution needs a stoppage for it); the checks follow whichever team subbed.
    const substitutions = homeSubstitutions.length > 0 ? homeSubstitutions : awaySubstitutions
    const outgoingId = substitutions[0]?.outgoingPlayerId
    const incomingId = substitutions[0]?.playerId
    // Someone who never got on the court: the player who was subbed out (more minutes) must carry more workload than him.
    const idleId = consequences.find((item) => item.workload.minutes === 0 && item.playerId !== incomingId)?.playerId

    expect(live.events).toEqual(instant.events)
    expect(live.playerStats).toEqual(instant.playerStats)
    expect(homeSubstitutions.length + awaySubstitutions.length).toBeGreaterThan(0)
    expect(live.playerStats.find((line) => line.playerId === outgoingId)!.secondsPlayed).toBeLessThan(periodMinutes * 60)
    expect(live.playerStats.find((line) => line.playerId === incomingId)!.secondsPlayed).toBeGreaterThan(0)
    // Minutes are rounded to two decimals: the rounding error may be exactly half a hundredth.
    expect(Math.abs(consequences.find((item) => item.playerId === outgoingId)!.workload.minutes - live.playerStats.find((line) => line.playerId === outgoingId)!.secondsPlayed / 60))
      .toBeLessThanOrEqual(0.005 + 1e-9)
    expect(idleId).toBeDefined()
    expect(consequences.find((item) => item.playerId === outgoingId)!.workload.minutes)
      .toBeGreaterThan(consequences.find((item) => item.playerId === idleId)!.workload.minutes)
    expect(consequences.find((item) => item.playerId === outgoingId)!.developmentStimulusDelta.stamina)
      .toBeGreaterThan(consequences.find((item) => item.playerId === idleId)!.developmentStimulusDelta.stamina ?? 0)
    expect(completed.developmentStimulusByPlayerId[outgoingId!]).not.toEqual(loadedWorld.developmentStimulusByPlayerId[outgoingId!])
    expect(completed.developmentStimulusByPlayerId[incomingId!]).not.toEqual(loadedWorld.developmentStimulusByPlayerId[incomingId!])
    // Career fatigue is capped: a player who was already at the cap stays there.
    expect(completed.careerFatigueByPlayerId[outgoingId!]).toBeGreaterThanOrEqual(loadedWorld.careerFatigueByPlayerId[outgoingId!]!)
  })
})
