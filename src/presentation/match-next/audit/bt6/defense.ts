/**
 * BT6 defensive-truth audit. An observer for the BT5 fingerprint runner: one pass per tick over the state and the new canonical events.
 * Nothing here changes a game. Per TEAM (the offense it runs, the defense it plays):
 *  - turnover causes (BT6.9), steals by kind and by the stealer's responsibility (BT6.34)
 *  - possession durations by bucket and class (fast break / early offense / half court), offensive-rebound continuations (BT6.21-25)
 *  - drive containment classes (BT6.6-7): clean containment, partial edge, blow-by (with its cause), stripped, fouled
 *  - help geometry and its trade-off (BT6.15-16): how far the helper came, kick-outs, what the kick-out produced
 *  - paint crowding (BT6.19), fouls by type (BT6.33), pass disruption under ball pressure (BT6.8)
 */
import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { MatchNextEvent, MatchPlayerState, MatchSetup, MatchState } from '@/engine/match-next'
import { attackingBasketForTeam } from '@/engine/match-next/structure/FiveOutStructure'
import type { Side } from '../bt5/fingerprint'

export interface DefenseCounts {
  turnoverCauses: Record<string, number>
  stealKinds: Record<string, number>
  stealResponsibility: Record<string, number>
  fouls: Record<string, number>
  /** Possessions by class and duration bucket ("halfCourt|9-12"), and by how they ended. */
  durations: Record<string, number>
  durationByEnd: Record<string, number>
  possessionSeconds: number[]
  shotsWithin8: number
  shots: number
  orebContinuationSeconds: number[]
  drives: Record<string, number>
  blowByCauses: Record<string, number>
  /** Drive outcome by gap at the start ("1.0-1.5|blowBy") and by the handler's believed edge ("0.1-0.2|blowBy"). */
  drivesByGap: Record<string, number>
  drivesByEdge: Record<string, number>
  helps: { triggered: number; helperTravel: number; kickOuts: number; kickOutShots: number; kickOutThrees: number; kickOutPoints: number; kickOutContest: number; driverRimAttempts: number; driverRimPoints: number; rotations: number }
  rimAttempts: number; rimMakes: number; rimContest: number; blocks: number
  /** Shot economy by zone: attempts and makes ("RIM:a" / "RIM:m"), and by creation. */
  zones: Record<string, number>
  paint: { liveTicks: number; crowdedTicks: number; crowdedLegitTicks: number; episodes: number; longEpisodes: number; offenseInPaintTicks: number; defenseInPaintTicks: number }
  pressure: { pickups: number; heldTicks: number; gapSum: number; tightTicks: number; passesUnderPressure: number; passesUnderPressureLost: number; passesFree: number; passesFreeLost: number }
}

export function emptyDefense(): DefenseCounts {
  return {
    turnoverCauses: {}, stealKinds: {}, stealResponsibility: {}, fouls: {}, durations: {}, durationByEnd: {}, possessionSeconds: [], shotsWithin8: 0, shots: 0, orebContinuationSeconds: [],
    drives: {}, blowByCauses: {}, drivesByGap: {}, drivesByEdge: {},
    helps: { triggered: 0, helperTravel: 0, kickOuts: 0, kickOutShots: 0, kickOutThrees: 0, kickOutPoints: 0, kickOutContest: 0, driverRimAttempts: 0, driverRimPoints: 0, rotations: 0 },
    rimAttempts: 0, rimMakes: 0, rimContest: 0, blocks: 0, zones: {},
    paint: { liveTicks: 0, crowdedTicks: 0, crowdedLegitTicks: 0, episodes: 0, longEpisodes: 0, offenseInPaintTicks: 0, defenseInPaintTicks: 0 },
    pressure: { pickups: 0, heldTicks: 0, gapSum: 0, tightTicks: 0, passesUnderPressure: 0, passesUnderPressureLost: 0, passesFree: 0, passesFreeLost: 0 },
  }
}

const bump = (record: Record<string, number>, key: string, by = 1): void => { record[key] = (record[key] ?? 0) + by }

export function bucketOf(seconds: number): string {
  return seconds <= 4 ? '<=4' : seconds <= 8 ? '5-8' : seconds <= 12 ? '9-12' : seconds <= 16 ? '13-16' : seconds <= 20 ? '17-20' : '>20'
}

interface OpenPossession { side: Side; startReason: string; ticks: number; firstEndTicks: number | null; advantage: boolean; orebAt: number | null; turnover: boolean }
interface OpenDrive { side: Side; driverId: string; startT: number; tags: string[]; beaten: boolean; maxSeparation: number; gap: number; edge: number | null }
interface OpenHelp { side: Side; driverId: string; helperId: string; startT: number; helperStart: CourtPosition; kicked: boolean; kickT: number | null; receiverId: string | null }

/** The observer for one game. `counts` is filled per team; `observe` is passed to runFingerprintGame. */
export function defenseObserver(): { readonly counts: Record<Side, DefenseCounts>; readonly observe: (state: MatchState, events: readonly MatchNextEvent[], setup: MatchSetup) => void } {
  const counts: Record<Side, DefenseCounts> = { home: emptyDefense(), away: emptyDefense() }
  const open = new Map<string, OpenPossession>()
  const drives = new Map<string, OpenDrive>()
  let help: OpenHelp | null = null
  let helpSource: string | null = null
  let crowdRun = 0
  let lastPass: { t: number; inbound: boolean; teamSide: Side; pressured: boolean; deflected: boolean; transition: boolean } | null = null
  let lastLoose: { t: number; reason: string } | null = null
  let lastScreenUse: { t: number; handlerId: string } | null = null
  const passOutcome = new Map<string, boolean>()
  let lastShot: MatchNextEvent | null = null
  let prev: MatchState | null = null

  const observe = (s: MatchState, events: readonly MatchNextEvent[], setup: MatchSetup): void => {
    const sideOf = (teamId: unknown): Side => (teamId === setup.homeTeamId ? 'home' : 'away')
    const other = (side: Side): Side => (side === 'home' ? 'away' : 'home')
    const player = (id: unknown): MatchPlayerState | undefined => s.players.find((p) => p.playerId === id)
    const guardOf = (id: unknown): MatchPlayerState | undefined => player(s.defensiveStructure?.assignments.find((a) => a.attackerPlayerId === id)?.defenderPlayerId)
    const possession = s.activePossessionId === null ? undefined : s.possessions.find((p) => p.id === s.activePossessionId)
    const inTransition = s.transition !== null && possession !== undefined && s.transition.teamId === possession.teamId

    // Per tick: possession clock, advantage, ball pressure, drives, paint.
    if (possession !== undefined) {
      const row = open.get(possession.id)
      if (row !== undefined && s.clock.gameRunning) row.ticks += 1
      if (row !== undefined && s.transition?.teamId === possession.teamId && s.transition.advantage === 'ADVANTAGE' && row.firstEndTicks === null) row.advantage = true
      const side = sideOf(possession.teamId)
      if (s.ball.kind === 'HELD' && s.ball.ownerTeamId === possession.teamId && (possession.phase === 'SETUP' || possession.phase === 'ACTION') && !inTransition) {
        const handler = player(s.ball.ownerPlayerId)
        const guard = guardOf(s.ball.ownerPlayerId)
        if (handler !== undefined && guard !== undefined) {
          const gap = distanceBetween(handler.position, guard.position)
          const p = counts[other(side)].pressure
          p.heldTicks += 1; p.gapSum += gap; if (gap <= 1.15) p.tightTicks += 1
        }
        // Paint crowding (FIBA lane: 4.9 m wide, 5.8 m deep from the baseline the offense attacks).
        const basket = attackingBasketForTeam(possession.teamId, s.homeTeamId, s.period, s.court)
        const baselineX = basket.x > s.court.lengthMeters / 2 ? s.court.lengthMeters : 0
        const inPaint = (pos: CourtPosition): boolean => Math.abs(pos.x - baselineX) <= 5.8 && Math.abs(pos.y - s.court.widthMeters / 2) <= 2.45
        const offense = s.players.filter((p) => p.active && p.teamId === possession.teamId && inPaint(p.position)).length
        const defense = s.players.filter((p) => p.active && p.teamId !== possession.teamId && inPaint(p.position)).length
        const paint = counts[side].paint
        paint.liveTicks += 1; paint.offenseInPaintTicks += offense; paint.defenseInPaintTicks += defense
        const crowded = offense >= 3 || offense + defense >= 7
        const legit = s.actions.some((a) => a.kind === 'DRIVE' && a.status === 'ACTIVE') || (handler !== undefined && inPaint(handler.position)) || (open.get(possession.id)?.orebAt ?? -99) >= s.t - 15
        if (crowded) { paint.crowdedTicks += 1; if (legit) paint.crowdedLegitTicks += 1 }
        if (crowded && !legit) crowdRun += 1
        else { if (crowdRun >= 5) { paint.episodes += 1; if (crowdRun >= 20) paint.longEpisodes += 1 } crowdRun = 0 }
      }
    }
    for (const drive of drives.values()) {
      const driver = player(drive.driverId)
      const guard = guardOf(drive.driverId)
      const action = s.actions.find((a) => a.kind === 'DRIVE' && a.status === 'ACTIVE' && a.playerId === drive.driverId)
      if (driver === undefined || guard === undefined || action?.target === undefined) continue
      const gap = distanceBetween(guard.position, driver.position)
      const toRim = { x: action.target.x - driver.position.x, y: action.target.y - driver.position.y }
      const len = Math.hypot(toRim.x, toRim.y) || 1
      const ahead = ((guard.position.x - driver.position.x) * toRim.x + (guard.position.y - driver.position.y) * toRim.y) / len
      if (gap >= 1.2 && ahead < 0.2) drive.beaten = true
      if (ahead < 0.2) drive.maxSeparation = Math.max(drive.maxSeparation, gap)
    }
    const helpDecision = s.defensiveStructure?.helpDecision
    if (helpDecision?.status === 'TRIGGERED' && helpDecision.sourceActionId !== undefined && helpDecision.sourceActionId !== helpSource && helpDecision.helperPlayerId !== undefined) {
      helpSource = helpDecision.sourceActionId
      const helper = player(helpDecision.helperPlayerId)
      const side = sideOf(s.defensiveStructure!.teamId)
      if (helper !== undefined && helpDecision.ballHandlerPlayerId !== null) {
        help = { side, driverId: String(helpDecision.ballHandlerPlayerId), helperId: String(helper.playerId), startT: s.t, helperStart: { ...helper.position }, kicked: false, kickT: null, receiverId: null }
        counts[side].helps.triggered += 1
        counts[side].helps.rotations += helpDecision.rotations.length
      }
    }
    if (help !== null && s.t - help.startT > 40) {
      const helper = player(help.helperId)
      if (helper !== undefined) counts[help.side].helps.helperTravel += distanceBetween(helper.position, help.helperStart)
      help = null
    }

    for (const e of events) {
      switch (e.type) {
        case 'possessionStart':
          if (e.possessionId !== undefined) open.set(e.possessionId, { side: sideOf(e.teamId), startReason: String(e.startReason), ticks: 0, firstEndTicks: null, advantage: false, orebAt: null, turnover: false })
          break
        case 'possessionEnd': {
          const row = e.possessionId === undefined ? undefined : open.get(e.possessionId)
          if (row === undefined) break
          const seconds = row.ticks / 10
          const first = (row.firstEndTicks ?? row.ticks) / 10
          const klass = row.advantage && first <= 8 ? 'fastBreak' : first <= 8 && row.startReason !== 'madeBasketInbound' && row.startReason !== 'turnoverInbound' ? 'earlyOffense' : first <= 8 ? 'earlyAfterInbound' : 'halfCourt'
          const team = counts[row.side]
          bump(team.durations, `${klass}|${bucketOf(seconds)}`)
          bump(team.durationByEnd, `${row.turnover ? 'turnover' : String(e.endReason)}|${bucketOf(seconds)}`)
          team.possessionSeconds.push(seconds)
          if (row.orebAt !== null) team.orebContinuationSeconds.push((row.ticks - row.orebAt) / 10)
          open.delete(e.possessionId!)
          break
        }
        case 'reboundSecured':
          if (e.reboundType === 'offensive' && e.possessionId !== undefined) { const row = open.get(e.possessionId); if (row !== undefined) row.orebAt = row.ticks }
          break
        case 'shotReleased': {
          const side = sideOf(e.teamId)
          const row = e.possessionId === undefined ? undefined : open.get(e.possessionId)
          lastShot = e
          counts[side].shots += 1
          if (row !== undefined && row.firstEndTicks === null) { row.firstEndTicks = row.ticks; if (row.ticks <= 80) counts[side].shotsWithin8 += 1; if (e.shotCreation === 'TRANSITION') row.advantage = true }
          const zone = e.shotZone ?? ''
          bump(counts[side].zones, `${zone}:a`); bump(counts[side].zones, `${e.shotCreation ?? '?'}:a`)
          if (zone === 'RESTRICTED' || zone === 'RIM') { counts[side].rimAttempts += 1; counts[side].rimContest += e.contestScore ?? 0 }
          if (help !== null && sideOf(e.teamId) !== help.side) {
            if (help.kicked && help.kickT !== null && e.t - help.kickT <= 30) {
              const h = counts[help.side].helps
              h.kickOutShots += 1; h.kickOutContest += e.contestScore ?? 0; if (e.points === 3) h.kickOutThrees += 1
            } else if (!help.kicked && String(e.shooterPlayerId) === help.driverId && (zone === 'RESTRICTED' || zone === 'RIM' || zone === 'SHORT_PAINT')) counts[help.side].helps.driverRimAttempts += 1
          }
          break
        }
        case 'shotMade': {
          const side = sideOf(e.shootingTeamId ?? e.teamId)
          const last = lastShot ?? undefined
          if (last !== undefined) { bump(counts[side].zones, `${last.shotZone ?? ''}:m`); bump(counts[side].zones, `${last.shotCreation ?? '?'}:m`) }
          if (last !== undefined && (last.shotZone === 'RESTRICTED' || last.shotZone === 'RIM')) counts[side].rimMakes += 1
          if (help !== null && side !== help.side && last !== undefined) {
            if (help.kicked && help.kickT !== null && last.t - help.kickT <= 30) counts[help.side].helps.kickOutPoints += e.points ?? 0
            else if (!help.kicked && String(last.shooterPlayerId) === help.driverId) counts[help.side].helps.driverRimPoints += e.points ?? 0
          }
          break
        }
        case 'shotBlocked': counts[sideOf(e.teamId)].blocks += 1; break
        case 'actionStarted': {
          if (e.actionKind === 'DRIVE' && e.playerId !== undefined) {
            const side = sideOf(e.teamId)
            const driver = player(e.playerId)
            const guard = guardOf(e.playerId)
            const tags: string[] = []
            let gapAtStart = 9
            const decision = s.events.slice(-12).reverse().find((x) => x.type === 'decisionSelected' && x.playerId === e.playerId)
            const edge = decision?.utility?.drive ?? null
            if (lastScreenUse !== null && lastScreenUse.handlerId === String(e.playerId) && e.t - lastScreenUse.t <= 25) tags.push('screen')
            if (guard !== undefined && driver !== undefined) {
              const gap = distanceBetween(guard.position, driver.position)
              gapAtStart = gap
              if (gap > 1.8 && Math.hypot(guard.velocity.x, guard.velocity.y) > 2.2) tags.push('closeout')
              const edge = (driver.offense.rimAttack + driver.offense.creation) / 2 - (guard.defense.pointOfAttack + guard.defensiveMobility) / 2
              if (edge >= 15 || driver.heightCm - guard.heightCm <= -15) tags.push('mismatch')
              const assignment = s.defensiveStructure?.assignments.find((a) => a.attackerPlayerId === e.playerId)
              if (assignment?.source === 'SWITCH') tags.push('switched')
            }
            drives.set(e.actionId ?? `${e.t}`, { side, driverId: String(e.playerId), startT: e.t, tags, beaten: false, maxSeparation: 0, gap: gapAtStart, edge })
          }
          if ((e.actionKind === 'KICK_OUT' || e.actionKind === 'PASS') && help !== null && !help.kicked && String(e.playerId) === help.driverId && e.t - help.startT <= 30) {
            help.kicked = true; help.kickT = e.t; counts[help.side].helps.kickOuts += 1
          }
          break
        }
        case 'actionResolved': {
          if (e.actionKind !== 'DRIVE' || e.actionId === undefined) break
          const drive = drives.get(e.actionId)
          if (drive === undefined) break
          drives.delete(e.actionId)
          const defense = counts[other(drive.side)]
          const outcome = String(e.actionOutcome)
          const strip = lastLoose !== null && e.t - lastLoose.t <= 1
          const klass = outcome === 'FOULED' ? 'fouled'
            : strip ? 'stripped'
              : drive.beaten ? 'blowBy'
                : outcome === 'CONTAINED' ? 'contained'
                  : outcome === 'STOPPED' ? 'partialEdgeStop'
                    : outcome === 'FINISH' || outcome === 'ADVANTAGE' ? 'partialEdge'
                      : 'passedOrCancelled'
          bump(defense.drives, klass)
          const g = drive.gap < 1 ? '<1.0' : drive.gap < 1.5 ? '1.0-1.5' : drive.gap < 2 ? '1.5-2.0' : drive.gap < 3 ? '2.0-3.0' : '>=3.0'
          bump(defense.drivesByGap, `${g}|${klass}`)
          if (drive.edge !== null) bump(defense.drivesByEdge, `${drive.edge < 0.9 ? '<0.9' : drive.edge < 1.0 ? '0.9-1.0' : drive.edge < 1.1 ? '1.0-1.1' : drive.edge < 1.2 ? '1.1-1.2' : '>=1.2'}|${klass}`)
          if (klass === 'blowBy') bump(defense.blowByCauses, drive.tags.length === 0 ? 'handlerAdvantage' : drive.tags.join('+'))
          break
        }
        case 'screenUsed': if (s.screen !== null) lastScreenUse = { t: e.t, handlerId: String(s.screen.handlerId) }; break
        case 'passReleased': {
          const side = sideOf(e.teamId)
          const passer = player(e.passerPlayerId ?? e.playerId)
          const guard = passer === undefined ? undefined : guardOf(passer.playerId)
          const pressured = passer !== undefined && guard !== undefined && distanceBetween(passer.position, guard.position) <= 1.3
          const inbound = s.ball.kind === 'PASS_IN_FLIGHT' && s.ball.isInbound
          lastPass = { t: e.t, inbound, teamSide: side, pressured, deflected: false, transition: inTransition }
          if (!inbound && !inTransition) {
            const p = counts[other(side)].pressure
            if (pressured) p.passesUnderPressure += 1; else p.passesFree += 1
            passOutcome.set(`${e.t}`, pressured)
          }
          break
        }
        case 'deflection': if (lastPass !== null) lastPass.deflected = true; break
        case 'dribblePickedUp': counts[other(sideOf(e.teamId))].pressure.pickups += 1; break
        case 'passIntercepted': case 'passBecameLoose':
          if (lastPass !== null && !lastPass.inbound && !lastPass.transition && passOutcome.has(`${lastPass.t}`)) {
            const p = counts[other(lastPass.teamSide)].pressure
            if (passOutcome.get(`${lastPass.t}`)) p.passesUnderPressureLost += 1; else p.passesFreeLost += 1
            passOutcome.delete(`${lastPass.t}`)
          }
          break
        case 'looseBallCreated': lastLoose = { t: e.t, reason: String(e.ballReason) }; break
        case 'steal': {
          const side = sideOf(e.teamId)
          bump(counts[side].stealKinds, String(e.stealKind))
          const before = prev ?? s
          const wasTransition = before.transition !== null && before.transition.teamId !== e.teamId
          const resp = before.responsibilities.find((r) => r.playerId === e.playerId && r.owner === 'defensiveStructure')?.kind ?? (wasTransition ? 'TRANSITION' : before.ball.kind === 'INBOUND' || (before.ball.kind === 'PASS_IN_FLIGHT' && before.ball.isInbound) ? 'INBOUND' : '?')
          bump(counts[side].stealResponsibility, `${e.stealKind}|${resp}`)
          break
        }
        case 'foul': {
          const offender = player(e.playerId)
          if (offender === undefined) break
          const side = sideOf(offender.teamId)
          const before = prev ?? s
          const beforePossession = before.activePossessionId === null ? undefined : before.possessions.find((p) => p.id === before.activePossessionId)
          const offensive = beforePossession !== undefined && offender.teamId === beforePossession.teamId
          bump(counts[side].fouls, `${offensive ? 'off' : 'def'}:${e.foulType}`)
          break
        }
        case 'turnover': {
          const side = sideOf(e.teamId)
          const row = e.possessionId === undefined ? undefined : open.get(e.possessionId)
          if (row !== undefined) { row.turnover = true; if (row.firstEndTicks === null) row.firstEndTicks = row.ticks }
          const type = String(e.turnoverType)
          const recentPass = lastPass !== null && lastPass.teamSide === side && e.t - lastPass.t <= 30
          const loose = lastLoose !== null && e.t - lastLoose.t <= 40 ? lastLoose.reason : null
          const driving = (prev ?? s).actions.some((a) => a.kind === 'DRIVE' && a.playerId === e.playerId && (a.status === 'ACTIVE' || (a.resolvedT !== undefined && e.t - a.resolvedT <= 3)))
          const cause = type === 'INTERCEPTION' || type === 'BAD_PASS'
            ? (recentPass && lastPass!.inbound ? 'inbound' : recentPass && lastPass!.transition ? 'transitionPass' : type === 'INTERCEPTION' ? 'interception' : lastPass?.deflected === true ? 'deflectedPass' : 'badPass')
            : type === 'LOST_DRIBBLE'
              ? (driving ? 'strippedDrive' : loose === 'lostDribble' ? 'handleLoss' : loose === 'pokeLoose' ? 'pokedLoose' : 'onBallStrip')
              : type === 'OFFENSIVE_FOUL' ? 'offensiveFoul'
                : type === 'STEPPED_OUT' || type === 'OUT_OF_BOUNDS' ? (recentPass ? 'passOutOfBounds' : 'steppedOut')
                  : type === 'SHOT_CLOCK' ? 'shotClock' : type === 'EIGHT_SECOND' ? 'eightSecond' : `other:${type}`
          bump(counts[side].turnoverCauses, cause)
          break
        }
        default: break
      }
    }
    prev = s
  }
  return { counts, observe }
}

/** Sums the per-game counts of one side over a cohort and derives the BT6 rates. */
export function summarizeDefense(games: readonly Record<Side, DefenseCounts>[], side: Side, possessionsBySide: { readonly own: number; readonly opp: number }): Record<string, unknown> {
  const other: Side = side === 'home' ? 'away' : 'home'
  const n = Math.max(1, games.length)
  const merge = (f: (c: DefenseCounts) => Record<string, number>, s: Side = side): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const g of games) for (const [k, v] of Object.entries(f(g[s]))) bump(out, k, v)
    return Object.fromEntries(Object.entries(out).sort().map(([k, v]) => [k, Number((v / n).toFixed(2))]))
  }
  const sum = (f: (c: DefenseCounts) => number, s: Side = side): number => games.reduce((a, g) => a + f(g[s]), 0)
  const all = games.flatMap((g) => g[side].possessionSeconds)
  const sorted = [...all].sort((a, b) => a - b)
  const q = (p: number): number => sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
  const oreb = games.flatMap((g) => g[side].orebContinuationSeconds)
  const r = (v: number, d = 3): number => Number(v.toFixed(d))
  const drivesDefended = merge((c) => c.drives)
  const drivesTotal = Object.values(drivesDefended).reduce((a, b) => a + b, 0)
  const h = (k: keyof DefenseCounts['helps']): number => sum((c) => c.helps[k])
  const pr = (k: keyof DefenseCounts['pressure']): number => sum((c) => c.pressure[k])
  const pa = (k: keyof DefenseCounts['paint']): number => sum((c) => c.paint[k])
  return {
    offense: {
      turnoverCauses: merge((c) => c.turnoverCauses),
      turnoversPerPossession: r(sum((c) => Object.values(c.turnoverCauses).reduce((a, b) => a + b, 0)) / Math.max(1, possessionsBySide.own)),
      durationBuckets: merge((c) => c.durations),
      durationByEnd: merge((c) => c.durationByEnd),
      possessionSecondsMean: r(all.reduce((a, b) => a + b, 0) / Math.max(1, all.length), 2), possessionSecondsP25: r(q(0.25), 1), possessionSecondsP50: r(q(0.5), 1), possessionSecondsP75: r(q(0.75), 1),
      shotsWithin8PerGame: r(sum((c) => c.shotsWithin8) / n, 2),
      orebContinuations: oreb.length / n, orebContinuationSecondsMean: r(oreb.reduce((a, b) => a + b, 0) / Math.max(1, oreb.length), 2),
      paint: { offenseInPaintAvg: r(pa('offenseInPaintTicks') / Math.max(1, pa('liveTicks'))), defenseInPaintAvg: r(pa('defenseInPaintTicks') / Math.max(1, pa('liveTicks'))), crowdedShare: r(pa('crowdedTicks') / Math.max(1, pa('liveTicks'))), crowdedIllegitShare: r((pa('crowdedTicks') - pa('crowdedLegitTicks')) / Math.max(1, pa('liveTicks'))), episodesPerGame: r(pa('episodes') / n, 2), longEpisodesPerGame: r(pa('longEpisodes') / n, 2) },
      zones: (() => { const z = merge((c) => c.zones); return Object.fromEntries(Object.keys(z).filter((k) => k.endsWith(':a')).map((k) => { const key = k.slice(0, -2); return [key, `${z[k]} @ ${((z[`${key}:m`] ?? 0) / Math.max(1e-9, z[k]!)).toFixed(2)}`] })) })(),
      rimAttemptsPerGame: r(sum((c) => c.rimAttempts) / n, 2), rimFgPct: r(sum((c) => c.rimMakes) / Math.max(1, sum((c) => c.rimAttempts))), rimContestMean: r(sum((c) => c.rimContest) / Math.max(1, sum((c) => c.rimAttempts))),
    },
    defense: {
      stealsPerOppPossession: r(Object.values(merge((c) => c.stealKinds)).reduce((a, b) => a + b, 0) * n / Math.max(1, possessionsBySide.opp)),
      stealKinds: merge((c) => c.stealKinds), stealResponsibility: merge((c) => c.stealResponsibility),
      foulsCommitted: merge((c) => c.fouls),
      drivesFaced: drivesDefended, drivesFacedPerGame: r(drivesTotal, 2),
      blowByShare: r((drivesDefended.blowBy ?? 0) / Math.max(1e-9, drivesTotal)), containedShare: r((drivesDefended.contained ?? 0) / Math.max(1e-9, drivesTotal)),
      blowByCauses: merge((c) => c.blowByCauses), drivesByGap: merge((c) => c.drivesByGap), drivesByEdge: merge((c) => c.drivesByEdge),
      ballPressure: { pickupsPerGame: r(pr('pickups') / n, 2), meanGap: r(pr('gapSum') / Math.max(1, pr('heldTicks'))), tightShare: r(pr('tightTicks') / Math.max(1, pr('heldTicks'))), passLossUnderPressure: r(pr('passesUnderPressureLost') / Math.max(1, pr('passesUnderPressure'))), passLossFree: r(pr('passesFreeLost') / Math.max(1, pr('passesFree'))), pressuredPassShare: r(pr('passesUnderPressure') / Math.max(1, pr('passesUnderPressure') + pr('passesFree'))) },
      help: { triggeredPerGame: r(h('triggered') / n, 2), helperTravelMean: r(h('helperTravel') / Math.max(1, h('triggered')), 2), kickOutShare: r(h('kickOuts') / Math.max(1, h('triggered'))), kickOutShotsPerGame: r(h('kickOutShots') / n, 2), kickOutThreeShare: r(h('kickOutThrees') / Math.max(1, h('kickOutShots'))), kickOutPpShot: r(h('kickOutPoints') / Math.max(1, h('kickOutShots'))), kickOutContest: r(h('kickOutContest') / Math.max(1, h('kickOutShots'))), driverRimAfterHelpPerGame: r(h('driverRimAttempts') / n, 2), driverRimPpShot: r(h('driverRimPoints') / Math.max(1, h('driverRimAttempts'))), rotationsPerHelp: r(h('rotations') / Math.max(1, h('triggered'))) },
      blocksPerOppRim: r(sum((c) => c.blocks) / Math.max(1, sum((c) => c.rimAttempts, other))),
      oppRimFgPct: r(sum((c) => c.rimMakes, other) / Math.max(1, sum((c) => c.rimAttempts, other))),
    },
  }
}
