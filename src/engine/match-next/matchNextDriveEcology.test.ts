/**
 * BT6.1 drive ecology: what a possession can still do after its first action is contained, and the belief the decisions use matching the
 * physics (where a pass is thrown, a defender who has been beaten, a closeout read in the air). Focal tests on synthetic states, and one
 * real match for the reset.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { createCourtGeometry, type CourtPosition } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createMatchState, type MatchPlayerState, type MatchSetup, type MatchState } from './index'
import { catchPoint } from './actions/PassRisk'
import { perceivedCompletion, readDriveStop } from './actions/DecisionCore'
import { resetOffense } from './actions/OffenseFlow'

const HOME = teamIdFromString('de-home')
const AWAY = teamIdFromString('de-away')
const home = Array.from({ length: 5 }, (_, index) => playerIdFromString(`de-h${index}`))
const away = Array.from({ length: 5 }, (_, index) => playerIdFromString(`de-a${index}`))

function setup(): MatchSetup {
  const profile = (playerId: typeof home[number], teamId: typeof HOME) => ({
    playerId, teamId, primaryPosition: 'PG' as const,
    physical: { heightCm: 195, weightKg: 90, wingspanCm: 200, standingReachCm: 250 },
    kinematics: { maxSpeedMps: 6, accelerationMps2: 3, brakingMps2: 3.8 },
    offense: { usage: 50, rimAttack: 70, shooting: 50, creation: 70, ballSecurity: 60 },
    passing: { accuracy: 70, vision: 70, timing: 70 },
    defense: { pointOfAttack: 55, interior: 55, mobility: 55, steal: 55 },
    rebounding: { impact: 50 },
  })
  const plan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
  return {
    gameId: gameIdFromString('de-game'), homeTeamId: HOME, awayTeamId: AWAY, court: createCourtGeometry('FIBA'),
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24 },
    homeSquad: home, awaySquad: away, initialLineups: { home, away },
    players: [...home.map((id) => profile(id, HOME)), ...away.map((id) => profile(id, AWAY))],
    initialPlayerPositions: [...home.map((playerId, index) => ({ playerId, position: { x: 2 + index, y: 1 } })), ...away.map((playerId, index) => ({ playerId, position: { x: 2 + index, y: 14 } }))],
    tacticalPlans: { home: plan, away: plan },
    defensiveMatchupOverrides: { home: [], away: [] },
    matchSeed: 6101,
  }
}

/** A synthetic state: players where `at` puts them (everybody else far away), home attacks the right basket, away man-to-man. */
function staged(at: Partial<Record<string, { position: CourtPosition; velocity?: CourtPosition }>>): MatchState {
  const base = createMatchState(setup())
  const players = base.players.map((player, index): MatchPlayerState => {
    const spot = at[String(player.playerId)]
    return spot === undefined ? { ...player, position: { x: 1 + index * 0.6, y: 0.5 }, velocity: { x: 0, y: 0 } } : { ...player, position: spot.position, velocity: spot.velocity ?? { x: 0, y: 0 } }
  })
  const basket = base.court.baskets.right
  return {
    ...base, players,
    defensiveStructure: {
      teamId: AWAY, scheme: 'MAN', defendedBasket: basket, onBallDefenderPlayerId: null, helpDefenderPlayerIds: [], rimProtectorPlayerId: null,
      assignments: home.map((attacker, index) => ({ defenderPlayerId: away[index]!, attackerPlayerId: attacker, teamId: AWAY, startedT: 0, source: 'INITIAL' as const })),
      helpDecision: { status: 'NOT_NEEDED', ballHandlerPlayerId: null, reason: 'test', rotations: [] },
    },
  }
}

const find = (state: MatchState, id: string): MatchPlayerState => state.players.find((player) => String(player.playerId) === id)!

describe('BT6.1 the belief reads where the ball is thrown', () => {
  it('a pass to a cutter is read on the line to the catch point: a defender on that line is a risk, one on the line to where he stands now is not', () => {
    // Passer at (10, 7.5); cutter at (16, 7.5) running toward y+ at 5 m/s: he catches it about 3 m further on.
    const cutter = { position: { x: 16, y: 7.5 }, velocity: { x: 0, y: 5 } }
    const onCatchLine = staged({ [String(home[0])]: { position: { x: 10, y: 7.5 } }, [String(home[1])]: cutter, [String(away[2])]: { position: { x: 13.2, y: 9.1 } } })
    const onStandLine = staged({ [String(home[0])]: { position: { x: 10, y: 7.5 } }, [String(home[1])]: cutter, [String(away[2])]: { position: { x: 13.2, y: 7.5 } } })
    const passer = find(onCatchLine, String(home[0]))
    const receiver = find(onCatchLine, String(home[1]))
    const target = catchPoint(passer, receiver, onCatchLine.court)
    expect(target.y).toBeGreaterThan(9.5)
    expect(perceivedCompletion(onCatchLine, passer, receiver)).toBeLessThan(perceivedCompletion(onStandLine, find(onStandLine, String(home[0])), find(onStandLine, String(home[1]))) - 0.05)
  })

  it('a driver whose man is already behind him believes he gets to the rim; the same distance in front of him is a defender containing him', () => {
    const base = createMatchState(setup())
    const basket = base.court.baskets.right
    const driver = { position: { x: basket.x - 5, y: basket.y }, velocity: { x: 5, y: 0 } }
    const beaten = staged({ [String(home[0])]: driver, [String(away[0])]: { position: { x: basket.x - 7, y: basket.y + 0.5 } } })
    const inFront = staged({ [String(home[0])]: driver, [String(away[0])]: { position: { x: basket.x - 3, y: basket.y + 0.5 } } })
    const behind = readDriveStop(beaten, find(beaten, String(home[0])), basket)
    const front = readDriveStop(inFront, find(inFront, String(home[0])), basket)
    expect(behind.values.continue).toBeGreaterThan(front.values.continue)
  })
})

describe('BT6.1 offensive reset', () => {
  it('re-opens the half court for another action: new half-court start, not settled until the handler is back out, an offenseReset event', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const port = createMatchEnginePort('match-next')
    const live = port.createLiveSession(port.prepare(world, game, 31337))
    while (!(live.matchState.offenseFlow !== null && live.matchState.offenseFlow.settledAtT !== null && live.matchState.ball.kind === 'HELD') && live.matchState.t < 4000) live.advanceOneStep()
    const state = live.matchState
    expect(state.offenseFlow?.settledAtT).not.toBeNull()
    const handler = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
    const reset = resetOffense(state, handler!)
    expect(reset.offenseFlow?.settledAtT).toBeNull()
    expect(reset.offenseFlow?.halfCourtSinceT).toBe(state.t)
    expect(reset.offenseFlow?.resetHandlerId).toBe(handler)
    expect(reset.events.at(-1)?.type).toBe('offenseReset')
  })
})
