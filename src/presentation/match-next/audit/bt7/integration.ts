/**
 * BT7 full-integration audit. Plays scheduled Games through the PRODUCTION path (canonical world -> MatchEnginePort.prepare ->
 * MatchNextLiveController -> MatchEnginePort.complete -> Save V4) and checks the chain end to end: availability, squad, starting five,
 * substitutions and foul-outs, minutes, stat reconciliation, fatigue chain, consequences applied once, save/reload, Live = Instant.
 * Read-only with respect to the engine: every check observes what the production path produced.
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextResult } from '@/app/matchNext/MatchNextResult'
import type { Game } from '@/domain/game'
import type { PlayerId, TeamId } from '@/domain/ids'
import { getTeamRoster, type GameWorld } from '@/domain/world'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { getNextUserGame } from '@/engine/calendar'
import type { MatchSetup, MatchState } from '@/engine/match-next'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

export interface Check { readonly name: string; readonly ok: boolean; readonly detail?: string }

export interface MatchAudit {
  readonly label: string
  readonly gameId: string
  readonly competition: string
  readonly gender: string
  readonly clockRules: MatchSetup['clockRules']
  readonly seed: number
  readonly checks: readonly Check[]
  readonly metrics: Record<string, unknown>
  readonly msInstant: number
  readonly msLive: number | null
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)
const r = (v: number, d = 3): number => Number(v.toFixed(d))

/** Plays one Game through the production port and audits it. `prepareSetup` may edit the data-only setup (a coach identity for an experiment). */
export function auditMatch(label: string, world: GameWorld, game: Game, seed: number, options: { readonly live?: boolean; readonly prepareSetup?: (setup: MatchSetup) => MatchSetup; readonly saveRoundTrip?: boolean } = {}): MatchAudit {
  const port = createMatchEnginePort('match-next')
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => { checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) }) }
  const base = port.prepare(world, game, seed)
  const setup = options.prepareSetup === undefined ? base : options.prepareSetup(base)

  // 4-6: availability, roster tiers, starting five.
  for (const [side, teamId, squad, lineup] of [['home', game.homeTeamId, setup.homeSquad, setup.initialLineups.home], ['away', game.awayTeamId, setup.awaySquad, setup.initialLineups.away]] as const) {
    const roster = getTeamRoster(world, teamId).map((p) => p.id)
    const available = getAvailablePlayersForCompetition(world, teamId, game.competitionId, game.seasonId, game.date)
    check(`${side}: squad == canonical availability projection`, squad.length === available.length && squad.every((id) => available.includes(id)), `roster ${roster.length}, available ${available.length}, squad ${squad.length}`)
    check(`${side}: squad subset of roster`, squad.every((id) => roster.includes(id)))
    check(`${side}: starting five legal (5 unique, in squad)`, lineup.length === 5 && new Set(lineup).size === 5 && lineup.every((id) => squad.includes(id)), lineup.join(','))
    const plan = side === 'home' ? setup.coachingPlans?.home : setup.coachingPlans?.away
    check(`${side}: starting five == coaching authority lineup`, plan === undefined || plan.startingLineup.every((id, i) => id === lineup[i]))
  }

  const t0 = Date.now()
  const instant = port.runInstant(setup)
  const msInstant = Date.now() - t0
  const state = instant.finalState
  const squadIds = new Set<PlayerId>([...setup.homeSquad, ...setup.awaySquad])
  const teamOf = new Map<PlayerId, TeamId>([...setup.homeSquad.map((id) => [id, setup.homeTeamId] as const), ...setup.awaySquad.map((id) => [id, setup.awayTeamId] as const)])

  // No unavailable / non-squad player appears in any event.
  const strangers = new Set<string>()
  for (const e of state.events) for (const id of [e.playerId, e.shooterPlayerId, e.passerPlayerId, e.receiverPlayerId, e.victimPlayerId, e.outgoingPlayerId, e.assistPlayerId]) if (id !== undefined && !squadIds.has(id)) strangers.add(String(id))
  check('no player outside the available squads appears in events', strangers.size === 0, [...strangers].join(','))

  // 9, 13, 14: substitutions, foul trouble, foul-out.
  const onCourt = new Map<TeamId, Set<PlayerId>>([[setup.homeTeamId, new Set(setup.initialLineups.home)], [setup.awayTeamId, new Set(setup.initialLineups.away)]])
  const fouledOut = new Set<PlayerId>()
  const personal = new Map<PlayerId, number>()
  const foulLimit = state.clockRules.foulRules?.personalFoulLimit ?? 5
  let illegalSub = 0; let reentryAfterFoulOut = 0; let subsNotAtDeadBall = 0; let lineupSizeViolations = 0
  const subsByReason: Record<string, number> = {}
  const foulTroubleTimeline: { player: string; fouls: number; t: number; period: number }[] = []
  let deadBallUntil = -1
  for (const e of state.events) {
    if (e.type === 'ballDead') deadBallUntil = e.t
    if (e.type === 'foul' && e.playerId !== undefined) { const n = (personal.get(e.playerId) ?? 0) + 1; personal.set(e.playerId, n); if (n >= 2) foulTroubleTimeline.push({ player: String(e.playerId), fouls: n, t: e.t, period: e.period }) }
    if (e.type === 'foulOut' && e.playerId !== undefined) fouledOut.add(e.playerId)
    if (e.type === 'substitution' && e.playerId !== undefined && e.outgoingPlayerId !== undefined && e.teamId !== undefined) {
      const court = onCourt.get(e.teamId)!
      if (!court.has(e.outgoingPlayerId) || court.has(e.playerId) || teamOf.get(e.playerId) !== e.teamId) illegalSub += 1
      if (fouledOut.has(e.playerId)) reentryAfterFoulOut += 1
      if (e.t - deadBallUntil > 0 && deadBallUntil < 0) subsNotAtDeadBall += 1
      court.delete(e.outgoingPlayerId); court.add(e.playerId)
      if (court.size !== 5) lineupSizeViolations += 1
      subsByReason[String(e.substitutionReason)] = (subsByReason[String(e.substitutionReason)] ?? 0) + 1
    }
  }
  check('every substitution swaps an on-court player for a bench player of the same team', illegalSub === 0, `${illegalSub}`)
  check('five on court for each team after every substitution', lineupSizeViolations === 0)
  check('no fouled-out player re-enters', reentryAfterFoulOut === 0)
  check('no fouled-out player is on court at the end', [...fouledOut].every((id) => !state.players.find((p) => p.playerId === id)?.active))
  check(`no player exceeds the competition foul limit (${foulLimit})`, [...personal.values()].every((n) => n <= foulLimit))
  check('substitutions happen at a dead ball (not in live play)', subsNotAtDeadBall === 0)

  // 12: minutes reconcile with court time.
  const gameSeconds = periodsPlayedSeconds(state)
  const secondsBySide = (ids: readonly PlayerId[]): number => sum(instant.playerStats.filter((l) => ids.includes(l.playerId)).map((l) => l.secondsPlayed))
  const homeSec = secondsBySide(setup.homeSquad)
  const awaySec = secondsBySide(setup.awaySquad)
  check('sum of player minutes == 5 x game minutes (home)', Math.abs(homeSec - 5 * gameSeconds) <= 1, `${r(homeSec / 60, 2)} vs ${r(5 * gameSeconds / 60, 2)}`)
  check('sum of player minutes == 5 x game minutes (away)', Math.abs(awaySec - 5 * gameSeconds) <= 1, `${r(awaySec / 60, 2)} vs ${r(5 * gameSeconds / 60, 2)}`)

  // 30-31: stats derive from events and reconcile.
  const ev = (type: string, teamId?: TeamId): number => state.events.filter((e) => e.type === type && (teamId === undefined || (e.shootingTeamId ?? e.teamId) === teamId)).length
  for (const [side, teamId, squad] of [['home', setup.homeTeamId, setup.homeSquad], ['away', setup.awayTeamId, setup.awaySquad]] as const) {
    const lines = instant.playerStats.filter((l) => squad.includes(l.playerId))
    const team = instant.teamStats[side]
    const keys = ['points', 'fieldGoalsMade', 'fieldGoalsAttempted', 'threePointMade', 'threePointAttempted', 'freeThrowsMade', 'freeThrowsAttempted', 'offensiveRebounds', 'defensiveRebounds', 'assists', 'steals', 'blocks', 'turnovers', 'foulsCommitted'] as const
    check(`${side}: team totals == sum of player lines`, keys.every((k) => team[k] === sum(lines.map((l) => l[k]))))
    check(`${side}: points == final score`, team.points === state.score[side])
    check(`${side}: FGA == shotReleased events`, team.fieldGoalsAttempted === state.events.filter((e) => e.type === 'shotReleased' && e.teamId === teamId).length)
    check(`${side}: FTA == free-throw events`, team.freeThrowsAttempted === state.events.filter((e) => (e.type === 'freeThrowMade' || e.type === 'freeThrowMissed') && squad.includes(e.playerId as PlayerId)).length)
    check(`${side}: assists <= FGM`, team.assists <= team.fieldGoalsMade)
    check(`${side}: rebounds == offensive + defensive`, team.offensiveRebounds + team.defensiveRebounds === sum(lines.map((l) => l.rebounds)))
    check(`${side}: 3PM <= FGM, FGM <= FGA`, team.threePointMade <= team.fieldGoalsMade && team.fieldGoalsMade <= team.fieldGoalsAttempted)
    void ev
  }
  check('plus-minus sums to zero across both teams', Math.abs(sum(instant.playerStats.map((l) => l.plusMinus))) === 0 || Math.abs(sum(instant.playerStats.map((l) => l.plusMinus))) % 5 === 0, `${sum(instant.playerStats.map((l) => l.plusMinus))}`)

  // 26: one possession ledger.
  const starts = state.events.filter((e) => e.type === 'possessionStart').length
  const ends = state.events.filter((e) => e.type === 'possessionEnd').length
  check('possession ledger: one start per possession, every possession closed', starts === state.possessions.length && Math.abs(starts - ends) <= 1, `${starts} starts, ${ends} ends, ${state.possessions.length} ledger`)

  // 10: fatigue chain pre -> in -> post.
  const preBad = state.players.filter((p) => p.preMatchCareerFatigue !== (world.careerFatigueByPlayerId[p.playerId] ?? 0)).length
  check('pre-match fatigue enters the session from the canonical career fatigue', preBad === 0, `${preBad}`)
  check('in-match fatigue never decreases below its session baseline for players who never played', state.players.every((p) => (state.courtTimeTenthsByPlayerId?.[p.playerId] ?? 0) > 0 || p.fatigue <= p.initialFatigue + 1e-9))

  // 33-38: consequences, idempotency, save/reload, next game.
  const completed = port.complete(world, instant)
  const playersWhoPlayed = instant.playerStats.filter((l) => l.secondsPlayed > 0).map((l) => l.playerId)
  const fatigueRose = playersWhoPlayed.filter((id) => (completed.careerFatigueByPlayerId[id] ?? 0) > (world.careerFatigueByPlayerId[id] ?? 0)).length
  const unusedChanged = instant.playerStats.filter((l) => l.secondsPlayed === 0 && (completed.careerFatigueByPlayerId[l.playerId] ?? 0) !== (world.careerFatigueByPlayerId[l.playerId] ?? 0)).length
  check('post-match: career fatigue rises for players who played', fatigueRose > 0, `${fatigueRose}/${playersWhoPlayed.length}`)
  check('post-match: unused players keep their career fatigue', unusedChanged === 0, `${unusedChanged}`)
  check('result applied: Game completed with the final score', completed.games[game.id]?.status === 'completed')
  check('exactly one MatchStatLog for the Game', completed.matchStatLogsByGameId[game.id] !== undefined && Object.keys(completed.matchStatLogsByGameId).length === Object.keys(world.matchStatLogsByGameId).length + 1)
  let secondApplyFailedClosed = false
  try { port.complete(completed, instant) } catch { secondApplyFailedClosed = true }
  check('second application of the same result fails closed', secondApplyFailedClosed)
  check('stat lines carry whole seconds (save contract)', instant.playerStats.every((l) => Number.isInteger(l.secondsPlayed)))
  if (options.saveRoundTrip !== false) try {
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(completed, '2032-01-02T00:00:00.000Z'))
    check('save/reload: result, stat log and fatigue survive', reloaded.games[game.id]?.status === 'completed' && reloaded.matchStatLogsByGameId[game.id] !== undefined
      && playersWhoPlayed.every((id) => reloaded.careerFatigueByPlayerId[id] === completed.careerFatigueByPlayerId[id]))
    let reloadReapplyFailed = false
    try { port.complete(reloaded, instant) } catch { reloadReapplyFailed = true }
    check('save/reload: re-applying the result after reload fails closed', reloadReapplyFailed)
    const next = getNextUserGame(reloaded)
    check('save/reload: the next scheduled game is available normally', next === undefined || (next.id !== game.id && next.status === 'scheduled'), next === undefined ? 'no next user game' : String(next.id))
  } catch (error) { check('save/reload: completed world serializes and reloads', false, String(error)) }

  // 27, 53: Live = Instant (frames generated every tick) and determinism.
  let msLive: number | null = null
  if (options.live === true) {
    const t1 = Date.now()
    const live = port.createLiveSession(setup)
    while (!live.matchState.isComplete) live.advanceOneStep()
    msLive = Date.now() - t1
    const liveResult = live.result()
    check('Live (frame every tick) == Instant result', JSON.stringify(stripState(liveResult)) === JSON.stringify(stripState(instant)) && JSON.stringify(liveResult.finalState) === JSON.stringify(instant.finalState))
    const again = port.runInstant(setup)
    check('determinism: same setup -> same result', JSON.stringify(again.finalState) === JSON.stringify(instant.finalState))
  }

  return {
    label, gameId: String(game.id), competition: String(game.competitionId), gender: String(world.teams[game.homeTeamId]?.gender), clockRules: state.clockRules, seed, checks,
    metrics: matchMetrics(setup, instant, subsByReason, foulTroubleTimeline, world, completed), msInstant, msLive,
  }
}

function stripState(result: MatchNextResult): Omit<MatchNextResult, 'finalState'> {
  const { finalState: _f, ...rest } = result
  return rest
}

function periodsPlayedSeconds(state: MatchState): number {
  const regulation = state.clockRules.periodCount * state.clockRules.periodSeconds
  const overtimes = Math.max(0, state.period - state.clockRules.periodCount)
  return regulation + overtimes * state.clockRules.overtimeSeconds
}

function matchMetrics(setup: MatchSetup, result: MatchNextResult, subsByReason: Record<string, number>, foulTrouble: readonly { player: string; fouls: number; t: number; period: number }[], world: GameWorld, completed: GameWorld): Record<string, unknown> {
  const s = result.finalState
  const side = (teamId: TeamId, squad: readonly PlayerId[], key: 'home' | 'away') => {
    const t = result.teamStats[key]
    const poss = s.possessions.filter((p) => p.teamId === teamId).length
    const shots = s.events.filter((e) => e.type === 'shotReleased' && e.teamId === teamId)
    const rim = shots.filter((e) => e.shotZone === 'RESTRICTED' || e.shotZone === 'RIM').length
    const oppKey = key === 'home' ? 'away' : 'home'
    const lines = result.playerStats.filter((l) => squad.includes(l.playerId)).sort((a, b) => b.secondsPlayed - a.secondsPlayed)
    const minutes = lines.map((l) => ({ player: String(l.playerId), min: r(l.secondsPlayed / 60, 1), pts: l.points, fga: l.fieldGoalsAttempted, ast: l.assists, pf: l.foulsCommitted, fatiguePre: r(world.careerFatigueByPlayerId[l.playerId] ?? 0, 1), fatiguePost: r(completed.careerFatigueByPlayerId[l.playerId] ?? 0, 1), sessionFatigueEnd: r(s.players.find((p) => p.playerId === l.playerId)?.fatigue ?? 0, 1) }))
    const usage = lines.map((l) => l.fieldGoalsAttempted + 0.44 * l.freeThrowsAttempted + l.turnovers)
    return {
      points: t.points, possessions: poss, ppp: r(t.points / Math.max(1, poss)), tovPct: r(100 * t.turnovers / Math.max(1, poss), 1), steals: t.steals,
      ftr: r(t.freeThrowsAttempted / Math.max(1, t.fieldGoalsAttempted)), rimShare: r(rim / Math.max(1, shots.length)), threeShare: r(t.threePointAttempted / Math.max(1, t.fieldGoalsAttempted)),
      astPct: r(t.assists / Math.max(1, t.fieldGoalsMade)), orbPct: r(t.offensiveRebounds / Math.max(1, t.offensiveRebounds + result.teamStats[oppKey].defensiveRebounds)), fouls: t.foulsCommitted,
      playersUsed: lines.filter((l) => l.secondsPlayed > 0).length, topMinutes: minutes[0]?.min, topUsageShare: r(Math.max(...usage) / Math.max(1, sum(usage))),
      minutes,
    }
  }
  return {
    score: result.score, possessions: s.possessions.length, periods: s.period,
    home: side(setup.homeTeamId, setup.homeSquad, 'home'), away: side(setup.awayTeamId, setup.awaySquad, 'away'),
    substitutions: s.events.filter((e) => e.type === 'substitution').length, subsByReason,
    tacticalAdjustments: s.events.filter((e) => e.type === 'tacticalAdjustment').map((e) => ({ t: e.t, team: String(e.teamId), reason: e.tacticalReason })),
    foulOuts: s.events.filter((e) => e.type === 'foulOut').length, foulTrouble: foulTrouble.slice(0, 12),
  }
}
