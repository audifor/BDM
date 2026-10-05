/**
 * BT6.1 drive ecology audit. An observer for the BT5 fingerprint runner (read-only): what happens after a drive begins, until the
 * possession ends. Per TEAM on offense:
 *  - how the drive resolved (clean blow-by, partial edge, stop, contained, pickup, stripped, fouled, passed)
 *  - whether help arrived
 *  - the driver's NEXT act: rim / short paint / other shot, kick-out, dump-off, interior entry, short-roll pass, reset pass, turnover, foul
 *  - what the possession did after the first pass: second drive (closeout attack), extra pass, shot, reset, turnover
 *  - rim attempts and shooting fouls by source
 */
import { distanceBetween, isBeyondThreePointLine, type CourtPosition } from '@/domain/court'
import type { MatchNextEvent, MatchPlayerState, MatchSetup, MatchState } from '@/engine/match-next'
import { attackingBasketForTeam } from '@/engine/match-next/structure/FiveOutStructure'
import type { Side } from '../bt5/fingerprint'

export interface DriveCounts {
  drives: number
  resolution: Record<string, number>
  helped: Record<string, number>
  nextAct: Record<string, number>
  /** "resolution|nextAct" */
  resolutionToAct: Record<string, number>
  afterFirstPass: Record<string, number>
  possessionPointsAfterDrive: number
  possessionsWithDrive: number
  secondaryAdvantage: number
  rimBySource: Record<string, number>
  rimMadeBySource: Record<string, number>
  shootingFoulsBySource: Record<string, number>
  interiorPasses: number
  interiorLost: number
}

export function emptyDrives(): DriveCounts {
  return { drives: 0, resolution: {}, helped: {}, nextAct: {}, resolutionToAct: {}, afterFirstPass: {}, possessionPointsAfterDrive: 0, possessionsWithDrive: 0, secondaryAdvantage: 0, rimBySource: {}, rimMadeBySource: {}, shootingFoulsBySource: {}, interiorPasses: 0, interiorLost: 0 }
}

const bump = (record: Record<string, number>, key: string, by = 1): void => { record[key] = (record[key] ?? 0) + by }

interface OpenDrive { id: string; side: Side; driverId: string; possessionId: string; startT: number; helped: boolean; beaten: boolean; pickup: boolean; resolution: string | null; resolvedT: number | null; act: string | null; firstPassT: number | null; firstReceiver: string | null; after: string | null }

export function driveObserver(): { readonly counts: Record<Side, DriveCounts>; readonly observe: (state: MatchState, events: readonly MatchNextEvent[], setup: MatchSetup) => void } {
  const counts: Record<Side, DriveCounts> = { home: emptyDrives(), away: emptyDrives() }
  const drives = new Map<string, OpenDrive>()
  const possessionDrive = new Map<string, OpenDrive>()
  const possessionPoints = new Map<string, number>()
  let lastLoose: number | null = null
  let lastShot: MatchNextEvent | null = null
  const passes = new Map<string, { side: Side; interior: boolean }>()
  let lastPass: { t: number; side: Side; interior: boolean } | null = null
  const observe = (s: MatchState, events: readonly MatchNextEvent[], setup: MatchSetup): void => {
    const sideOf = (teamId: unknown): Side => (teamId === setup.homeTeamId ? 'home' : 'away')
    const player = (id: unknown): MatchPlayerState | undefined => s.players.find((p) => p.playerId === id)
    const basketFor = (teamId: MatchPlayerState['teamId']): CourtPosition => attackingBasketForTeam(teamId, s.homeTeamId, s.period, s.court)
    // Per tick: was the driver beaten past his man (same rule as the engine) and has help been triggered for this drive?
    for (const d of drives.values()) {
      if (d.resolution !== null) continue
      const help = s.defensiveStructure?.helpDecision
      if (help?.status === 'TRIGGERED' && help.sourceActionId === d.id) d.helped = true
      const driver = player(d.driverId)
      const guardId = s.defensiveStructure?.assignments.find((a) => a.attackerPlayerId === driver?.playerId)?.defenderPlayerId
      const guard = player(guardId)
      const action = s.actions.find((a) => a.id === d.id)
      if (driver && guard && action?.target) {
        const gap = distanceBetween(guard.position, driver.position)
        const toRim = { x: action.target.x - driver.position.x, y: action.target.y - driver.position.y }
        const len = Math.hypot(toRim.x, toRim.y) || 1
        const ahead = ((guard.position.x - driver.position.x) * toRim.x + (guard.position.y - driver.position.y) * toRim.y) / len
        if (gap >= 1.2 && ahead < 0.2) d.beaten = true
      }
    }
    const finishAct = (d: OpenDrive, act: string): void => {
      if (d.act !== null) return
      d.act = act
      const team = counts[d.side]
      bump(team.nextAct, act)
      bump(team.resolutionToAct, `${d.resolution ?? 'open'}|${act}`)
    }
    const finishAfter = (d: OpenDrive, after: string): void => {
      if (d.after !== null) return
      d.after = after
      bump(counts[d.side].afterFirstPass, after)
      if (after === 'secondDrive' || after === 'closeoutAttack' || after === 'catchAndShootOpen') counts[d.side].secondaryAdvantage += 1
    }
    for (const e of events) {
      switch (e.type) {
        case 'possessionStart': if (e.possessionId !== undefined) possessionPoints.set(e.possessionId, 0); break
        case 'shotMade': case 'freeThrowMade': if (e.possessionId !== undefined) possessionPoints.set(e.possessionId, (possessionPoints.get(e.possessionId) ?? 0) + (e.points ?? 0)); break
        case 'actionStarted': {
          if (e.actionKind === 'DRIVE' && e.actionId !== undefined && e.playerId !== undefined) {
            const side = sideOf(e.teamId)
            // A drive by the receiver of the first pass after another drive is the second advantage.
            const pid = s.activePossessionId ?? ''
            const prior = possessionDrive.get(pid)
            if (prior !== undefined && prior.firstReceiver === String(e.playerId) && prior.firstPassT !== null && e.t - prior.firstPassT <= 35) {
              const guardId = s.defensiveStructure?.assignments.find((a) => a.attackerPlayerId === e.playerId)?.defenderPlayerId
              const guard = player(guardId)
              const closing = guard !== undefined && Math.hypot(guard.velocity.x, guard.velocity.y) > 2
              finishAfter(prior, closing ? 'closeoutAttack' : 'secondDrive')
            }
            const d: OpenDrive = { id: e.actionId, side, driverId: String(e.playerId), possessionId: pid, startT: e.t, helped: false, beaten: false, pickup: false, resolution: null, resolvedT: null, act: null, firstPassT: null, firstReceiver: null, after: null }
            drives.set(e.actionId, d)
            if (!possessionDrive.has(pid)) { possessionDrive.set(pid, d); counts[side].possessionsWithDrive += 1 }
            counts[side].drives += 1
          }
          if ((e.actionKind === 'PASS' || e.actionKind === 'KICK_OUT') && e.playerId !== undefined) {
            const passer = player(e.playerId)
            const action = s.actions.find((a) => a.id === e.actionId)
            const receiver = player(action?.targetPlayerId)
            if (passer && receiver) {
              const basket = basketFor(passer.teamId)
              const rd = distanceBetween(receiver.position, basket)
              const interior = rd < 5
              lastPass = { t: e.t, side: sideOf(passer.teamId), interior }
              if (interior) counts[sideOf(passer.teamId)].interiorPasses += 1
              if (e.actionId) passes.set(e.actionId, { side: sideOf(passer.teamId), interior })
              // The driver's next act is this pass.
              for (const d of drives.values()) {
                if (d.driverId !== String(passer.playerId) || d.resolution === null || d.act !== null) continue
                const screen = s.screen
                const rolling = screen !== null && screen.screenerId === receiver.playerId && screen.exit === 'ROLL'
                const kind = rolling && rd <= 6.5 ? 'shortRollPass'
                  : rd <= 3 ? 'dumpOff'
                    : interior ? 'interiorEntry'
                      : isBeyondThreePointLine(receiver.position, basket, s.court) ? (distanceBetween(receiver.position, basket) > distanceBetween(passer.position, basket) + 1.5 && distanceBetween(passer.position, basket) > 6.5 ? 'resetPass' : 'kickOut')
                        : 'passOther'
                finishAct(d, kind)
                d.firstPassT = e.t
                d.firstReceiver = String(receiver.playerId)
              }
            }
          }
          break
        }
        case 'offenseReset': for (const d of drives.values()) if (d.driverId === String(e.playerId) && d.act === null) finishAct(d, 'reset'); break
        case 'dribblePickedUp': for (const d of drives.values()) if (d.driverId === String(e.playerId) && d.act === null) d.pickup = true; break
        case 'looseBallCreated': lastLoose = e.t; break
        case 'actionResolved': {
          if (e.actionKind !== 'DRIVE' || e.actionId === undefined) break
          const d = drives.get(e.actionId)
          if (d === undefined) break
          const outcome = String(e.actionOutcome)
          d.resolution = outcome === 'FOULED' ? 'fouled'
            : lastLoose !== null && e.t - lastLoose <= 1 ? 'stripped'
              : d.beaten ? 'cleanBlowBy'
                : outcome === 'CONTAINED' ? 'contained'
                  : outcome === 'STOPPED' ? 'pullUpStop'
                    : outcome === 'FINISH' || outcome === 'ADVANTAGE' ? 'partialEdge'
                      : 'passedOut'
          d.resolvedT = e.t
          bump(counts[d.side].resolution, d.resolution)
          bump(counts[d.side].helped, `${d.resolution}|${d.helped ? 'help' : 'noHelp'}`)
          if (d.resolution === 'fouled') finishAct(d, 'foulOnDrive')
          break
        }
        case 'shotReleased': {
          lastShot = e
          const zone = e.shotZone ?? ''
          const side = sideOf(e.teamId)
          if (zone === 'RESTRICTED' || zone === 'RIM') bump(counts[side].rimBySource, e.shotCreation ?? '?')
          for (const d of drives.values()) {
            if (d.driverId === String(e.shooterPlayerId) && d.act === null && (d.resolution !== null || d.resolvedT === null)) {
              finishAct(d, zone === 'RESTRICTED' || zone === 'RIM' ? 'rimAttempt' : zone === 'SHORT_PAINT' || zone === 'FLOATER_RANGE' ? 'shortPaintAttempt' : 'otherShot')
            } else if (d.firstReceiver === String(e.shooterPlayerId) && d.after === null && d.firstPassT !== null && e.t - d.firstPassT <= 35) {
              finishAfter(d, (e.contestScore ?? 1) < 0.35 ? 'catchAndShootOpen' : 'catchAndShootContested')
            }
          }
          break
        }
        case 'shotMade': {
          const last = lastShot
          if (last !== null && (last.shotZone === 'RESTRICTED' || last.shotZone === 'RIM')) bump(counts[sideOf(e.shootingTeamId ?? e.teamId)].rimMadeBySource, last.shotCreation ?? '?')
          break
        }
        case 'foul': {
          if (e.foulType !== 'SHOOTING') break
          const victim = player(e.victimPlayerId)
          if (victim === undefined) break
          const side = sideOf(victim.teamId)
          const recentDrive = s.actions.some((a) => a.kind === 'DRIVE' && a.playerId === victim.playerId && (a.status === 'ACTIVE' || (a.resolvedT !== undefined && s.t - a.resolvedT <= 20)))
          const oreb = s.events.slice(-40).some((x) => x.type === 'reboundSecured' && x.reboundType === 'offensive' && x.playerId === victim.playerId)
          const roll = s.screen !== null && s.screen.screenerId === victim.playerId
          const basket = basketFor(victim.teamId)
          const source = recentDrive ? 'drive' : oreb ? 'putback' : roll ? 'roll' : distanceBetween(victim.position, basket) <= 3 ? 'nearRimOther' : 'jumpShot'
          bump(counts[side].shootingFoulsBySource, source)
          for (const d of drives.values()) if (d.driverId === String(victim.playerId) && d.act === null) finishAct(d, 'shootingFoul')
          break
        }
        case 'turnover': {
          const side = sideOf(e.teamId)
          if (lastPass !== null && lastPass.side === side && lastPass.interior && e.t - lastPass.t <= 30) counts[side].interiorLost += 1
          for (const d of drives.values()) {
            if (d.possessionId !== e.possessionId) continue
            if (d.driverId === String(e.playerId) && d.act === null) finishAct(d, 'turnover')
            else if (d.firstReceiver !== null && d.after === null) finishAfter(d, 'turnover')
          }
          break
        }
        case 'possessionEnd': {
          if (e.possessionId === undefined) break
          const d0 = possessionDrive.get(e.possessionId)
          if (d0 !== undefined) counts[d0.side].possessionPointsAfterDrive += possessionPoints.get(e.possessionId) ?? 0
          for (const [id, d] of drives) {
            if (d.possessionId !== e.possessionId) continue
            if (d.act === null) finishAct(d, d.resolution === null ? 'possessionEndedDuringDrive' : 'noActBeforeEnd')
            if (d.firstReceiver !== null && d.after === null) finishAfter(d, String(e.endReason) === 'made' ? 'scoredLater' : String(e.endReason) === 'turnover' ? 'turnover' : 'endedOther')
            drives.delete(id)
          }
          possessionDrive.delete(e.possessionId)
          break
        }
        default: break
      }
    }
    // A first receiver who holds the ball 3.5 s with no shot or drive: the possession was reset after the drive.
    for (const d of drives.values()) {
      if (d.firstPassT !== null && d.after === null && s.t - d.firstPassT > 35) {
        const ownerId = s.ball.kind === 'HELD' ? String(s.ball.ownerPlayerId) : null
        finishAfter(d, ownerId === d.firstReceiver ? 'heldOrReset' : 'extraPass')
      }
    }
    void passes
  }
  return { counts, observe }
}

export function summarizeDrives(games: readonly Record<Side, DriveCounts>[], side: Side): Record<string, unknown> {
  const n = Math.max(1, games.length)
  const merge = (f: (c: DriveCounts) => Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const g of games) for (const [k, v] of Object.entries(f(g[side]))) bump(out, k, v)
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Number((v / n).toFixed(2))]))
  }
  const sum = (f: (c: DriveCounts) => number): number => games.reduce((a, g) => a + f(g[side]), 0)
  return {
    drivesPerGame: Number((sum((c) => c.drives) / n).toFixed(2)),
    resolution: merge((c) => c.resolution), helped: merge((c) => c.helped), nextAct: merge((c) => c.nextAct), resolutionToAct: merge((c) => c.resolutionToAct),
    afterFirstPass: merge((c) => c.afterFirstPass),
    pppPossessionsWithDrive: Number((sum((c) => c.possessionPointsAfterDrive) / Math.max(1, sum((c) => c.possessionsWithDrive))).toFixed(3)),
    secondaryAdvantagePerGame: Number((sum((c) => c.secondaryAdvantage) / n).toFixed(2)),
    rimBySource: merge((c) => c.rimBySource), rimMadeBySource: merge((c) => c.rimMadeBySource), shootingFoulsBySource: merge((c) => c.shootingFoulsBySource),
    interiorPassesPerGame: Number((sum((c) => c.interiorPasses) / n).toFixed(2)), interiorLostShare: Number((sum((c) => c.interiorLost) / Math.max(1, sum((c) => c.interiorPasses))).toFixed(3)),
  }
}
