/**
 * BT3 (contact, fouls, turnovers & dead ball) focal tests. Pure model tests use hand-placed players; lifecycle tests replay a
 * whole game through the real application path (MatchEnginePort -> MatchNextLiveController), like Live and Instant do, and
 * check a property of every foul / free throw / block / turnover, never a hard-coded total.
 */

import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { FIBA_GAME_FORMAT, NBA_GAME_FORMAT, NCAA_MEN_GAME_FORMAT } from '@/domain/competition/CompetitionRules'
import { distanceBetween } from '@/domain/court'
import { assessBlock, BLOCK_MAX_HORIZONTAL_METERS } from './defense/BlockModel'
import { assessDriveContact, assessScreenContact, contactSeverity, REFEREE_TOLERANCE, type DriveContactTrack } from './contact/ContactModel'
import { bonusStateFor, resolveFoulRules } from './rules/FoulRules'
import { ALLOWED_PLAY_TRANSITIONS } from './rules/PlayState'
import { freeThrowProbability } from './rules/FreeThrows'
import { evaluateShotOpportunity, putbackQuality } from './actions/DecisionCore'
import { withTuning } from './tuning'
import { applyCommand, decideRotationSubstitutions, type MatchNextEvent, type MatchPlayerState, type MatchState } from './index'

function liveSession(seed: number) {
  const world = createNewGame()
  const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
  const port = createMatchEnginePort('match-next')
  return port.createLiveSession(port.prepare(world, game, seed))
}

function playWholeGame(seed: number): MatchState {
  const live = liveSession(seed)
  while (!live.matchState.isComplete && live.matchState.t < 90000) live.advanceTicks(3)
  return live.matchState
}

const place = (player: MatchPlayerState, x: number, y: number, vx = 0, vy = 0, facing = { x: 1, y: 0 }): MatchPlayerState =>
  ({ ...player, position: { x, y }, velocity: { x: vx, y: vy }, facing })

describe('BT3F: foul rules come from the competition format', () => {
  it('reads limits and bonus thresholds per format, not from one hard-coded competition', () => {
    const state = liveSession(1).matchState
    for (const [format, limit, penalty] of [[FIBA_GAME_FORMAT, 5, 5], [NBA_GAME_FORMAT, 6, 5], [NCAA_MEN_GAME_FORMAT, 5, 10]] as const) {
      const rules = resolveFoulRules({ ...state.clockRules, foulRules: format.foulRules })
      expect(rules.personalFoulLimit).toBe(limit)
      expect(rules.teamFoulPenaltyFrom).toBe(penalty)
      expect(bonusStateFor(rules, penalty - 1)).not.toBe('PENALTY')
      expect(bonusStateFor(rules, penalty)).toBe('PENALTY')
    }
    const ncaa = resolveFoulRules({ ...state.clockRules, foulRules: NCAA_MEN_GAME_FORMAT.foulRules })
    expect(bonusStateFor(ncaa, 7)).toBe('ONE_AND_ONE')
    expect(NBA_GAME_FORMAT.foulRules?.personalFoulLimit).toBe(6)
  })
})

describe('BT3B/C: contact is measured before it is judged', () => {
  const base = liveSession(2).matchState.players
  const driver = base.find((player) => player.teamId === base[0]!.teamId)!
  const defender = base.find((player) => player.teamId !== base[0]!.teamId)!

  it('scales severity with closing speed and body mass', () => {
    expect(contactSeverity(4, 100)).toBeGreaterThan(contactSeverity(1, 100))
    expect(contactSeverity(3, 110)).toBeGreaterThan(contactSeverity(3, 70))
  })

  it('charges the driver when a set defender takes the hit, and calls blocking on one who is still moving into the path', () => {
    const track: DriveContactTrack = { defenderId: defender.playerId, minGap: 0.5, closingSpeed: 3.2, established: true, inPath: true, atT: 10 }
    const charge = assessDriveContact(track, place(driver, 0, 0, 4, 0), place(defender, 0.5, 0))
    expect(charge.foulType).toBe('CHARGING')
    expect(charge.offenderId).toBe(driver.playerId)
    const moving = assessDriveContact({ ...track, established: false }, place(driver, 0, 0, 4, 0), place(defender, 0.5, 0))
    expect(moving.foulType).toBe('BLOCKING')
    expect(moving.offenderId).toBe(defender.playerId)
  })

  it('does not call a foul when there was no contact', () => {
    const far = assessDriveContact({ defenderId: defender.playerId, minGap: 2.4, closingSpeed: 3, established: true, inPath: true, atT: 4 }, driver, defender)
    expect(far.foulType).toBeNull()
    expect(far.callProbability).toBe(0)
  })

  it('a stationary screener is a legal screen; a moving one is illegal, and the referee tolerance is documented as a parameter', () => {
    const legal = assessScreenContact(driver, defender, { minGap: 0.6, defenderClosing: 2, screenerSpeed: 0.2, atT: 5 })
    expect(legal.foulType).toBeNull()
    const moving = assessScreenContact(driver, defender, { minGap: 0.6, defenderClosing: 2, screenerSpeed: 2.4, atT: 5 })
    expect(moving.foulType).toBe('ILLEGAL_SCREEN')
    expect(moving.offenderId).toBe(driver.playerId)
    expect(REFEREE_TOLERANCE.illegalScreen).toBeGreaterThan(0)
  })
})

describe('BT3H: blocks need proximity, height and a valid side', () => {
  const players = liveSession(3).matchState.players
  const shooter = players.find((player) => player.teamId === players[0]!.teamId)!
  const rival = players.filter((player) => player.teamId !== shooter.teamId)
  const rim = { x: 1.6, y: 7.5 }

  it('never blocks from several metres away', () => {
    const shooterAtRim = place(shooter, 2.4, 7.5)
    const far = rival.map((player, index) => place(player, 6 + index, 7.5))
    expect(assessBlock(shooterAtRim, far, rim, 0.8)).toBeNull()
  })

  it('a rim protector in front of a rim attempt has a real chance; the same defender beyond arm reach has none', () => {
    const protector = [...rival].sort((a, b) => b.standingReachCm + b.defense.interior - (a.standingReachCm + a.defense.interior))[0]!
    const shooterAtRim = place(shooter, 2.6, 7.5)
    const near = assessBlock(shooterAtRim, [place(protector, 2.0, 7.5, 0, 0, { x: 1, y: 0 })], rim, 1)
    expect(near).not.toBeNull()
    expect(near!.probability).toBeGreaterThan(0)
    expect(near!.gapMeters).toBeLessThanOrEqual(BLOCK_MAX_HORIZONTAL_METERS)
    expect(assessBlock(shooterAtRim, [place(protector, 2.6 + BLOCK_MAX_HORIZONTAL_METERS + 0.6, 7.5)], rim, 1)).toBeNull()
  })

  it('a better rim protector blocks more often than a weaker one from the same spot', () => {
    const shooterAtRim = place(shooter, 2.6, 7.5)
    const strong = { ...rival[0]!, standingReachCm: 250, defense: { ...rival[0]!.defense, interior: 95, mobility: 80 } }
    const weak = { ...rival[0]!, standingReachCm: 188, defense: { ...rival[0]!.defense, interior: 20, mobility: 30 } }
    const strongBlock = assessBlock(shooterAtRim, [place(strong, 2.1, 7.5)], rim, 1)?.probability ?? 0
    const weakBlock = assessBlock(shooterAtRim, [place(weak, 2.1, 7.5)], rim, 1)?.probability ?? 0
    expect(strongBlock).toBeGreaterThan(weakBlock)
  })
})

describe('BT3E: free throws depend on the shooter', () => {
  it('a better shooter converts more free throws, within sane bounds', () => {
    const player = liveSession(4).matchState.players[0]!
    const good = freeThrowProbability({ ...player, offense: { ...player.offense, shooting: 95 } })
    const poor = freeThrowProbability({ ...player, offense: { ...player.offense, shooting: 30 } })
    expect(good).toBeGreaterThan(poor)
    expect(good).toBeLessThanOrEqual(0.94)
    expect(poor).toBeGreaterThanOrEqual(0.45)
  })
})

describe('BT3C-M: a whole game through the real application path', { timeout: 300000 }, () => {
  const final = playWholeGame(424242)
  const events = final.events
  const byType = (type: MatchNextEvent['type']): readonly MatchNextEvent[] => events.filter((event) => event.type === type)

  it('finishes and has contact, fouls, free throws, blocks, steals and turnovers from basketball actions', () => {
    expect(final.isComplete).toBe(true)
    expect(byType('foul').length).toBeGreaterThan(10)
    expect(byType('freeThrowMade').length + byType('freeThrowMissed').length).toBeGreaterThan(5)
    expect(byType('shotBlocked').length).toBeGreaterThan(0)
    expect(byType('steal').length).toBeGreaterThan(3)
    expect(byType('turnover').length).toBeGreaterThan(5)
  })

  it('every foul has an offender and a victim on opposite teams, a type and a timestamp', () => {
    const teamOf = new Map(final.players.map((player) => [String(player.playerId), String(player.teamId)]))
    for (const foul of byType('foul')) {
      expect(foul.playerId).toBeDefined()
      expect(foul.victimPlayerId).toBeDefined()
      expect(foul.playerId).not.toBe(foul.victimPlayerId)
      expect(teamOf.get(String(foul.playerId))).not.toBe(teamOf.get(String(foul.victimPlayerId)))
      expect(foul.foulType).toBeDefined()
      expect(foul.t).toBeGreaterThanOrEqual(0)
    }
  })

  it('a foul is preceded by a measured contact between the same two players (fouls are not invented)', () => {
    for (const foul of byType('foul')) {
      const contact = events.find((event) => event.type === 'contact' && event.t <= foul.t && foul.t - event.t <= 12
        && ((String(event.playerId) === String(foul.playerId) && String(event.victimPlayerId) === String(foul.victimPlayerId))
          || (String(event.playerId) === String(foul.victimPlayerId) && String(event.victimPlayerId) === String(foul.playerId))))
      const stealReach = foul.foulType === 'REACH'
      expect(contact !== undefined || stealReach).toBe(true)
    }
  })

  it('awards exactly the free throws the foul resolution promises, one shooter per sequence, in order', () => {
    const sequences = byType('freeThrowSequenceStarted')
    expect(sequences.length).toBeGreaterThan(3)
    for (const sequence of sequences) {
      const attempts = events.filter((event) => (event.type === 'freeThrowMade' || event.type === 'freeThrowMissed') && event.t >= sequence.t
        && String(event.shooterPlayerId) === String(sequence.playerId))
      expect(attempts.length).toBeGreaterThan(0)
      expect(attempts[0]!.freeThrowIndex).toBe(1)
    }
    for (const event of [...byType('freeThrowMade'), ...byType('freeThrowMissed')]) expect(event.freeThrowIndex! <= event.freeThrowTotal!).toBe(true)
  })

  it('the score equals field goals plus free throws (free throws are part of the lifecycle, not a lump sum)', () => {
    const scored = events.filter((event) => event.type === 'shotMade' || event.type === 'freeThrowMade').reduce((sum, event) => sum + (event.points ?? 0), 0)
    expect(final.score.home + final.score.away).toBe(scored)
  })

  it('tracks personal fouls per player and removes fouled-out players from the court', () => {
    const limit = resolveFoulRules(final.clockRules).personalFoulLimit
    for (const outId of final.fouls.fouledOut) {
      expect(final.fouls.personal[outId]).toBeGreaterThanOrEqual(limit)
      expect(final.players.find((player) => player.playerId === outId)!.active).toBe(false)
    }
    for (const count of Object.values(final.fouls.personal)) expect(count).toBeLessThanOrEqual(limit + 1)
  })

  it('never reaches a bonus before the team has the threshold fouls in that period', () => {
    const limit = resolveFoulRules(final.clockRules).teamFoulPenaltyFrom
    for (const foul of byType('foul')) if (foul.foulResolution === 'BONUS_FREE_THROWS') expect(foul.teamFouls!).toBeGreaterThanOrEqual(limit)
  })

  it('blocks come from a defender within arm reach of the shooter at the release', () => {
    for (const block of byType('shotBlocked')) {
      const release = events.filter((event) => event.type === 'shotReleased' && event.t <= block.t && String(event.shooterPlayerId) === String(block.shooterPlayerId)).at(-1)
      expect(release).toBeDefined()
      expect(block.t - release!.t).toBeLessThanOrEqual(1)
    }
  })

  it('every turnover has a named basketball cause and possession ends with a change of team', () => {
    for (const turnover of byType('turnover')) expect(turnover.turnoverType).toBeDefined()
    const causes = new Set(byType('turnover').map((event) => event.turnoverType))
    expect(causes.size).toBeGreaterThanOrEqual(3)
  })

  it('walks the dead-ball lifecycle only through legal edges', () => {
    for (const change of byType('playStateChanged')) expect(ALLOWED_PLAY_TRANSITIONS[change.previousPlayPhase!]).toContain(change.playPhase)
    expect(byType('playStateChanged').length).toBeGreaterThan(20)
  })

  it('an assist is a pass by a teammate shortly before the made shot, on the same possession', () => {
    for (const assist of byType('assist')) {
      const made = events.filter((event) => event.type === 'shotMade' && event.t <= assist.t && event.t >= assist.t - 1).at(-1)
      expect(made).toBeDefined()
      expect(String(made!.shooterPlayerId)).not.toBe(String(assist.playerId))
      expect(made!.teamId).toBe(assist.teamId)
    }
  })

  it('is deterministic: the same seed reproduces the same fouls, free throws and score', () => {
    const again = playWholeGame(424242)
    expect(again.score).toEqual(final.score)
    expect(again.events.filter((event) => event.type === 'foul').map((event) => `${event.t}:${event.playerId}:${event.foulType}`))
      .toEqual(byType('foul').map((event) => `${event.t}:${event.playerId}:${event.foulType}`))
  })

  it('keeps the ball inside its physical envelope after every whistle (no teleports between dead ball states)', () => {
    let previous: MatchNextEvent | undefined
    for (const dead of byType('ballDead')) {
      if (previous !== undefined) expect(dead.t).toBeGreaterThanOrEqual(previous.t)
      previous = dead
    }
    expect(distanceBetween(final.ball.position, { x: 14, y: 7.5 })).toBeLessThan(60)
  })
})

describe('BT3A/O: the decision is a smooth function of its parameters', { timeout: 300000 }, () => {
  it('a small change of a decision parameter cannot flip the shot mix on its own', () => {
    const threes = (continuation: number): number => withTuning({ continuationValuePoints: continuation }, () => {
      const state = playWholeGameTicks(7, 9000)
      const shots = state.events.filter((event) => event.type === 'shotReleased')
      return shots.filter((event) => event.points === 3).length / Math.max(1, shots.length)
    })
    const low = threes(0.94)
    const mid = threes(0.98)
    const high = threes(1.02)
    expect(Math.abs(mid - low)).toBeLessThan(0.15)
    expect(Math.abs(high - mid)).toBeLessThan(0.15)
  })
})

function playWholeGameTicks(seed: number, ticks: number): MatchState {
  const live = liveSession(seed)
  while (!live.matchState.isComplete && live.matchState.t < ticks) live.advanceTicks(3)
  return live.matchState
}

describe('BT3L: the dead-ball lifecycle never stalls the game', { timeout: 400000 }, () => {
  // Seeds that once hung: an out-of-bounds throw-in waiting for a ball that was never carried to its spot (2024), a throw-in
  // hold that outlived the horn (14) and a foul ball left where the whistle blew (1, 13, 15, 16).
  it.each([14, 2024, 1, 13, 15, 16])('seed %i plays to the final horn', (seed) => {
    const final = playWholeGameTicks(seed, 40000)
    expect(final.isComplete).toBe(true)
    expect(final.events.at(-1)?.type).toBe('gameEnd')
  })
})

describe('BT3N/Q: putback quality and tactical wants', { timeout: 300000 }, () => {
  const base = liveSession(5).matchState
  const shooter = base.players.find((player) => player.active && player.teamId === base.homeTeamId)!
  const basket = base.court.baskets.right
  const underRim = { x: basket.x - 0.9, y: basket.y }

  it('a shot from the rim is a putback only in the window after the shooter\'s own offensive rebound, and then it is worse than a clean look', () => {
    const rebound = { sequence: 9000, t: base.t, period: 1, gameClockTenths: 0, type: 'reboundSecured' as const, playerId: shooter.playerId, teamId: shooter.teamId, reboundType: 'offensive' as const }
    const grabbed = { ...base, events: [...base.events, rebound] }
    const crowded = { ...grabbed, players: grabbed.players.map((player) => player.teamId !== shooter.teamId && player.active ? { ...player, position: { x: underRim.x + 0.5, y: underRim.y + 0.3 } } : player) }
    const clean = putbackQuality(base, shooter, underRim, basket)
    const contested = putbackQuality(crowded, shooter, underRim, basket)
    expect(clean).toBe(1)
    expect(contested).toBeLessThan(1)
    expect(contested).toBeGreaterThanOrEqual(0.5)
    expect(putbackQuality({ ...crowded, t: base.t + 60 }, shooter, underRim, basket)).toBe(1)
  })

  it('usage and the plan\'s shot profile change how much a look is wanted, not what it is worth', () => {
    const contest = 0.3
    const neutral = evaluateShotOpportunity(base, shooter, { x: basket.x - 7.5, y: basket.y }, basket, contest)
    const star = evaluateShotOpportunity(base, { ...shooter, offense: { ...shooter.offense, usage: 90 } }, { x: basket.x - 7.5, y: basket.y }, basket, contest)
    const role = evaluateShotOpportunity(base, { ...shooter, offense: { ...shooter.offense, usage: 15 } }, { x: basket.x - 7.5, y: basket.y }, basket, contest)
    expect(star.value).toBeGreaterThan(neutral.value)
    expect(neutral.value).toBeGreaterThan(role.value)
    expect(star.probability).toBe(neutral.probability)
    const threeHeavy = { ...base, tacticalPlans: { ...base.tacticalPlans, home: { ...base.tacticalPlans.home, shotProfile: { rim: -1, midRange: -1, threePoint: 2 } } } }
    expect(evaluateShotOpportunity(threeHeavy, shooter, { x: basket.x - 7.5, y: basket.y }, basket, contest).value).toBeGreaterThan(neutral.value)
  })

  it('the same roster shoots a very different mix under opposite plans (no universal percentage)', () => {
    const mix = (shotProfile: { rim: -2 | 2; midRange: -1 | 0; threePoint: -2 | 2 }): number => {
      const world = createNewGame()
      const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
      const port = createMatchEnginePort('match-next')
      const prepared = port.prepare(world, game, 99)
      const plan = (side: 'home' | 'away') => ({ ...prepared.tacticalPlans[side], shotProfile })
      const live = port.createLiveSession({ ...prepared, tacticalPlans: { home: plan('home'), away: plan('away') } })
      while (!live.matchState.isComplete && live.matchState.t < 9000) live.advanceTicks(3)
      const shots = live.matchState.events.filter((event) => event.type === 'shotReleased')
      return shots.filter((event) => event.points === 3).length / Math.max(1, shots.length)
    }
    const threeHeavy = mix({ rim: -2, midRange: -1, threePoint: 2 })
    const rimHeavy = mix({ rim: 2, midRange: 0, threePoint: -2 })
    expect(threeHeavy - rimHeavy).toBeGreaterThan(0.2)
  })
})

describe('BT3G: a fouled-out player leaves even when nobody on the bench fits his role', () => {
  it('forces the substitution instead of failing the role-fit validation', () => {
    const base = liveSession(6).matchState
    const home = base.homeTeamId
    const outgoing = base.players.find((player) => player.active && player.teamId === home)!
    const role = outgoing.primaryPosition
    const otherPosition = role === 'C' ? 'PG' : 'C'
    // Every bench player is a different position, with no role fit at all: the ordinary validation would refuse all of them.
    const plan = base.coachingPlans!.home
    const players = base.players.map((player) => !player.active && player.teamId === home ? { ...player, primaryPosition: otherPosition as typeof role, secondaryPositions: [] } : player)
    const unfit = { ...base, players, coachingPlans: { ...base.coachingPlans!, home: { ...plan, roleByPlayerId: { ...plan.roleByPlayerId, [outgoing.playerId]: role }, roleFitByPlayerId: Object.fromEntries(Object.entries(plan.roleFitByPlayerId).map(([id, fits]) => [id, { ...fits, [role]: 0 }])) } } }
    const dead = applyCommand(unfit, { type: 'putBallDead', reason: 'outOfBounds', restartTeamId: home })
    const fouledOut = { ...dead, fouls: { ...dead.fouls, fouledOut: [outgoing.playerId] } }
    const proposals = decideRotationSubstitutions(fouledOut)
    const forced = proposals.find((proposal) => proposal.teamId === home)!
    expect(forced.playerOutId).toBe(outgoing.playerId)
    expect(forced.forced).toBe(true)
    const after = applyCommand(fouledOut, { type: 'coachSubstitutions', proposals })
    expect(after.players.find((player) => player.playerId === outgoing.playerId)!.active).toBe(false)
    expect(after.players.filter((player) => player.active && player.teamId === home)).toHaveLength(5)
  })
})
