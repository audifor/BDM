/**
 * BT5 team identity fingerprint. One pass per game over the canonical events and the state; nothing here changes a game.
 * Every number is per TEAM (the offense it runs and the defense it plays), so two teams in the same game can be compared.
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEvent, MatchSetup, MatchState } from '@/engine/match-next'
import { preparedSetup } from '../bt2/economy'

export type Side = 'home' | 'away'

export interface TeamCounts {
  possessions: number; liveSeconds: number; points: number; fga: number; fgm: number; threes: number; rim: number; mid: number; paint: number
  creation: Record<string, number>; passes: number; assists: number; drives: number; screens: number; screensUsed: number; cuts: number; drifts: number
  turnovers: number; steals: number; blocks: number; oreb: number; dreb: number; oppMisses: number; ownMisses: number; fta: number
  transitionPossessions: number; earlyShots: number
  initiations: Record<string, number>; shotsBy: Record<string, number>; assistsBy: Record<string, number>
  coverageFaced: Record<string, number>; coverageUsed: Record<string, number>; switches: number; helps: number; drivesFaced: number
  rollOrPop: Record<string, number>; playFamilies: Record<string, number>; playLocations: Record<string, number>; spacing: Record<string, number>
  adaptations: number; secondsToFirstShot: number[]; passesPerPossession: number[]; offBallScreens: number; fouls: number
}

export interface FingerprintGame { readonly seed: number; readonly complete: boolean; readonly teams: Record<Side, TeamCounts>; readonly score: Record<Side, number>; readonly intents: readonly IntentSample[]; readonly adjustments: readonly { t: number; side: Side; reason: string }[]; readonly familyOutcomes: Record<Side, Record<string, { n: number; points: number }>> }
export interface IntentSample { readonly t: number; readonly side: Side; readonly kind: string; readonly detail: unknown }

function empty(): TeamCounts {
  return {
    possessions: 0, liveSeconds: 0, points: 0, fga: 0, fgm: 0, threes: 0, rim: 0, mid: 0, paint: 0, creation: {}, passes: 0, assists: 0, drives: 0, screens: 0, screensUsed: 0, cuts: 0, drifts: 0,
    turnovers: 0, steals: 0, blocks: 0, oreb: 0, dreb: 0, oppMisses: 0, ownMisses: 0, fta: 0, transitionPossessions: 0, earlyShots: 0,
    initiations: {}, shotsBy: {}, assistsBy: {}, coverageFaced: {}, coverageUsed: {}, switches: 0, helps: 0, drivesFaced: 0, rollOrPop: {}, playFamilies: {}, playLocations: {}, spacing: {},
    adaptations: 0, secondsToFirstShot: [], passesPerPossession: [], offBallScreens: 0, fouls: 0,
  }
}

const bump = (record: Record<string, number>, key: string, by = 1): void => { record[key] = (record[key] ?? 0) + by }

/** Runs one full game with an optional setup transform and returns both teams' counts. `sample` may record per-tick intent snapshots. */
export function runFingerprintGame(seed: number, transform?: (setup: MatchSetup) => MatchSetup, options: { maxTicks?: number; sample?: (state: MatchState) => IntentSample | undefined; prepare?: (state: MatchState) => MatchState; observe?: (state: MatchState, events: readonly MatchNextEvent[], setup: MatchSetup) => void } = {}): FingerprintGame {
  const base = preparedSetup(seed)
  const setup = transform === undefined ? base : transform(base)
  const live = createMatchEnginePort('match-next').createLiveSession(setup)
  // Audit-only: a context experiment starts from a prepared state (e.g. a score already on the board). The controller keeps it private.
  if (options.prepare !== undefined) (live as unknown as { state: MatchState }).state = options.prepare(live.matchState)
  const sideOf = (teamId: unknown): Side => (teamId === setup.homeTeamId ? 'home' : 'away')
  const teams: Record<Side, TeamCounts> = { home: empty(), away: empty() }
  const intents: IntentSample[] = []
  const adjustments: { t: number; side: Side; reason: string }[] = []
  const open = new Map<string, { side: Side; startT: number; firstDecision: boolean; firstShotT: number | null; passes: number; transition: boolean }>()
  let lastScreenId: string | null = null
  let lastSwitched = false
  let processed = 0
  const maxTicks = options.maxTicks ?? 60000
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceOneStep()
    const s = live.matchState
    if (s.clock.gameRunning && s.activePossessionId !== null) {
      const possession = s.possessions.find((p) => p.id === s.activePossessionId)
      if (possession !== undefined) teams[sideOf(possession.teamId)].liveSeconds += 0.1
    }
    if (s.screen !== null) {
      const offense = sideOf(s.screen.teamId)
      const defense: Side = offense === 'home' ? 'away' : 'home'
      if (s.screen.id !== lastScreenId) {
        lastScreenId = s.screen.id
        lastSwitched = false
        bump(teams[offense].coverageFaced, s.screen.coverage)
        bump(teams[defense].coverageUsed, s.screen.coverage)
        bump(teams[offense].rollOrPop, s.screen.exit)

      }
      if (s.screen.switched && !lastSwitched) { lastSwitched = true; teams[defense].switches += 1 }
    }
    if (options.sample !== undefined) { const sample = options.sample(s); if (sample !== undefined) intents.push(sample) }
    const events: readonly MatchNextEvent[] = s.events.slice(processed)
    processed = s.events.length
    if (options.observe !== undefined) options.observe(s, events, setup)
    for (const e of events) {
      const pid = e.possessionId ?? s.activePossessionId ?? undefined
      switch (e.type) {
        case 'possessionStart': {
          const side = sideOf(e.teamId)
          teams[side].possessions += 1
          if (e.possessionId !== undefined) open.set(e.possessionId, { side, startT: e.t, firstDecision: false, firstShotT: null, passes: 0, transition: false })
          break
        }
        case 'possessionEnd': {
          const row = e.possessionId === undefined ? undefined : open.get(e.possessionId)
          if (row !== undefined) {
            if (row.firstShotT !== null) teams[row.side].secondsToFirstShot.push((row.firstShotT - row.startT) / 10)
            teams[row.side].passesPerPossession.push(row.passes)
            if (row.transition) teams[row.side].transitionPossessions += 1
            open.delete(e.possessionId!)
          }
          break
        }
        case 'decisionSelected': {
          const row = [...open.values()].find((item) => item.side === sideOf(e.teamId))
          if (row !== undefined && !row.firstDecision && e.playerId !== undefined) { row.firstDecision = true; bump(teams[row.side].initiations, String(e.playerId)) }
          break
        }
        case 'actionStarted':
          if (e.actionKind === 'PASS' || e.actionKind === 'KICK_OUT') {
            const side = sideOf(e.teamId)
            teams[side].passes += 1
            const row = [...open.values()].find((item) => item.side === side)
            if (row !== undefined) row.passes += 1
          }
          if (e.actionKind === 'DRIVE') {
            const side = sideOf(e.teamId)
            teams[side].drives += 1
            teams[side === 'home' ? 'away' : 'home'].drivesFaced += 1
          }
          break
        case 'screenSet': teams[sideOf(e.teamId)].screens += 1; break
        case 'screenUsed': teams[sideOf(e.teamId)].screensUsed += 1; break
        case 'offBallMove':
          if (e.ballReason === 'BASKET_CUT' || e.ballReason === 'BACKDOOR_CUT') teams[sideOf(e.teamId)].cuts += 1
          else if (e.ballReason === 'DRIFT') teams[sideOf(e.teamId)].drifts += 1
          else if (e.ballReason === 'COME_OFF') teams[sideOf(e.teamId)].offBallScreens += 1
          else bump(teams[sideOf(e.teamId)].creation, `move:${e.ballReason}`)
          break
        case 'shotReleased': {
          const side = sideOf(e.teamId)
          const team = teams[side]
          team.fga += 1
          if (e.points === 3) team.threes += 1
          const zone = e.shotZone ?? ''
          if (zone === 'RESTRICTED' || zone === 'RIM') team.rim += 1
          else if (zone === 'SHORT_PAINT' || zone === 'FLOATER_RANGE') team.paint += 1
          else if (zone === 'MIDRANGE' || zone === 'LONG_MIDRANGE') team.mid += 1
          bump(team.creation, e.shotCreation ?? '?')
          if (e.shotCreation === 'TRANSITION') team.earlyShots += 1
          if (e.shooterPlayerId !== undefined) bump(team.shotsBy, String(e.shooterPlayerId))
          const row = pid === undefined ? undefined : open.get(pid)
          if (row !== undefined && row.firstShotT === null) { row.firstShotT = e.t; if (e.shotCreation === 'TRANSITION') row.transition = true }
          break
        }
        case 'shotMade': teams[sideOf(e.shootingTeamId ?? e.teamId)].fgm += 1; teams[sideOf(e.shootingTeamId ?? e.teamId)].points += e.points ?? 0; break
        case 'shotMissed': teams[sideOf(e.shootingTeamId ?? e.teamId)].ownMisses += 1; break
        case 'freeThrowMade': teams[sideOf(e.teamId)].points += 1; teams[sideOf(e.teamId)].fta += 1; break
        case 'freeThrowMissed': teams[sideOf(e.teamId)].fta += 1; break
        case 'assist': teams[sideOf(e.teamId)].assists += 1; if (e.assistPlayerId !== undefined) bump(teams[sideOf(e.teamId)].assistsBy, String(e.assistPlayerId)); break
        case 'turnover': teams[sideOf(e.teamId)].turnovers += 1; break
        case 'foul': if (e.playerId !== undefined) teams[sideOf(s.players.find((p) => p.playerId === e.playerId)?.teamId)].fouls += 1; break
        case 'steal': teams[sideOf(e.teamId)].steals += 1; break
        case 'shotBlocked': teams[sideOf(e.teamId)].blocks += 1; break
        case 'reboundSecured':
          if (e.reboundType === 'offensive') teams[sideOf(e.teamId)].oreb += 1
          else if (e.reboundType === 'defensive') teams[sideOf(e.teamId)].dreb += 1
          break
        case 'defensiveResponsibilityChanged':
          if (e.responsibilityKind === 'HELP' || e.responsibilityKind === 'LOW_MAN') teams[sideOf(e.teamId)].helps += 1
          if (e.responsibilityKind === 'TAG' || e.responsibilityKind === 'DIG') bump(teams[sideOf(e.teamId)].creation, `help:${e.responsibilityKind}`)
          break
        case 'tacticalAdjustment': teams[sideOf(e.teamId)].adaptations += 1; adjustments.push({ t: e.t, side: sideOf(e.teamId), reason: e.tacticalReason ?? '' }); break
        case 'playCalled':
          if (e.playFamily !== undefined) bump(teams[sideOf(e.teamId)].playFamilies, e.playFamily)
          if (e.playFamily !== undefined && e.playLocation !== undefined) bump(teams[sideOf(e.teamId)].playLocations, `${e.playFamily}@${e.playLocation}`)
          if (e.spacing !== undefined && e.playFamily !== 'EARLY_OFFENSE') bump(teams[sideOf(e.teamId)].spacing, e.spacing)
          break
        default:
          break
      }
    }
  }
  const memory = live.matchState.tactics
  return { seed, complete: live.matchState.isComplete, teams, score: { home: live.matchState.score.home, away: live.matchState.score.away }, intents, adjustments, familyOutcomes: { home: { ...(memory?.home.offense ?? {}) }, away: { ...(memory?.away.offense ?? {}) } } }
}

/** The derived fingerprint of one team over several games: rates, not counts, so different paces compare. */
export interface Fingerprint {
  readonly games: number; readonly possessions: number; readonly ppp: number; readonly secondsPerPossession: number; readonly transitionShare: number
  readonly passesPerPossession: number; readonly assistsPerFgm: number; readonly drivesPerPossession: number; readonly screensPerPossession: number; readonly cutsPerPossession: number
  readonly rimShare: number; readonly paintShare: number; readonly midShare: number; readonly threeShare: number; readonly catchShootShare: number; readonly pullUpShare: number; readonly prShare: number; readonly cutShare: number
  readonly orebRate: number; readonly tovPerPossession: number; readonly stealsPerOppPossession: number; readonly blocksPerOppFga: number; readonly ftaPerFga: number
  readonly coverageUsed: Record<string, number>; readonly switchesPerScreenFaced: number; readonly helpsPerDriveFaced: number
  readonly topInitiatorShare: number; readonly topShooterShare: number; readonly rollShare: number
  readonly playFamilies: Record<string, number>; readonly playLocations: Record<string, number>; readonly spacing: Record<string, number>; readonly adaptations: number
  readonly offBallScreensPerPossession: number; readonly helpKinds: Record<string, number>
  readonly firstShotSecondsP50: number; readonly passesPerPossessionP90: number
}

function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}

const r3 = (value: number): number => Number(value.toFixed(3))
const share = (record: Record<string, number>): Record<string, number> => {
  const total = Object.values(record).reduce((a, b) => a + b, 0)
  return Object.fromEntries(Object.entries(record).sort().map(([k, v]) => [k, r3(v / Math.max(1, total))]))
}

export function fingerprint(games: readonly FingerprintGame[], side: Side): Fingerprint {
  const other: Side = side === 'home' ? 'away' : 'home'
  const sum = (f: (t: TeamCounts) => number, s: Side = side): number => games.reduce((a, g) => a + f(g.teams[s]), 0)
  const merge = (f: (t: TeamCounts) => Record<string, number>, s: Side = side): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const g of games) for (const [k, v] of Object.entries(f(g.teams[s]))) bump(out, k, v)
    return out
  }
  const possessions = sum((t) => t.possessions)
  const fga = Math.max(1, sum((t) => t.fga))
  const creation = merge((t) => t.creation)
  const topShare = (record: (t: TeamCounts) => Record<string, number>): number => {
    // Mean over games of the share of the most used player (per game: lineups and minutes differ).
    let total = 0
    for (const g of games) { const values = Object.values(record(g.teams[side])); const all = values.reduce((a, b) => a + b, 0); total += all === 0 ? 0 : Math.max(...values) / all }
    return r3(total / Math.max(1, games.length))
  }
  const rollPop = merge((t) => t.rollOrPop)
  return {
    games: games.length,
    possessions: r3(possessions / games.length),
    ppp: r3(sum((t) => t.points) / Math.max(1, possessions)),
    secondsPerPossession: r3(sum((t) => t.liveSeconds) / Math.max(1, possessions)),
    transitionShare: r3(sum((t) => t.transitionPossessions) / Math.max(1, possessions)),
    passesPerPossession: r3(sum((t) => t.passes) / Math.max(1, possessions)),
    assistsPerFgm: r3(sum((t) => t.assists) / Math.max(1, sum((t) => t.fgm))),
    drivesPerPossession: r3(sum((t) => t.drives) / Math.max(1, possessions)),
    screensPerPossession: r3(sum((t) => t.screens) / Math.max(1, possessions)),
    cutsPerPossession: r3(sum((t) => t.cuts) / Math.max(1, possessions)),
    rimShare: r3(sum((t) => t.rim) / fga), paintShare: r3(sum((t) => t.paint) / fga), midShare: r3(sum((t) => t.mid) / fga), threeShare: r3(sum((t) => t.threes) / fga),
    catchShootShare: r3(((creation.CATCH_AND_SHOOT ?? 0) + (creation.KICK_OUT ?? 0)) / fga),
    pullUpShare: r3(((creation.PULL_UP ?? 0) + (creation.FLOATER ?? 0)) / fga),
    prShare: r3(((creation.PR_HANDLER ?? 0) + (creation.PR_ROLLER ?? 0)) / fga),
    cutShare: r3((creation.CUT_FINISH ?? 0) / fga),
    orebRate: r3(sum((t) => t.oreb) / Math.max(1, sum((t) => t.oreb) + sum((t) => t.dreb, other))),
    tovPerPossession: r3(sum((t) => t.turnovers) / Math.max(1, possessions)),
    stealsPerOppPossession: r3(sum((t) => t.steals) / Math.max(1, sum((t) => t.possessions, other))),
    blocksPerOppFga: r3(sum((t) => t.blocks) / Math.max(1, sum((t) => t.fga, other))),
    ftaPerFga: r3(sum((t) => t.fta) / fga),
    coverageUsed: share(merge((t) => t.coverageUsed)),
    switchesPerScreenFaced: r3(sum((t) => t.switches) / Math.max(1, sum((t) => t.screens, other))),
    helpsPerDriveFaced: r3(sum((t) => t.helps) / Math.max(1, sum((t) => t.drivesFaced))),
    topInitiatorShare: topShare((t) => t.initiations),
    topShooterShare: topShare((t) => t.shotsBy),
    rollShare: r3((rollPop.ROLL ?? 0) / Math.max(1, (rollPop.ROLL ?? 0) + (rollPop.POP ?? 0))),
    playFamilies: share(merge((t) => t.playFamilies)),
    playLocations: share(merge((t) => t.playLocations)),
    spacing: share(merge((t) => t.spacing)),
    adaptations: r3(sum((t) => t.adaptations) / games.length),
    offBallScreensPerPossession: r3(sum((t) => t.offBallScreens) / Math.max(1, possessions)),
    helpKinds: Object.fromEntries(Object.entries(merge((t) => t.creation)).filter(([k]) => k.startsWith('help:')).map(([k, v]) => [k, r3(v / games.length)])),
    firstShotSecondsP50: r3(quantile(games.flatMap((g) => g.teams[side].secondsToFirstShot), 0.5)),
    passesPerPossessionP90: r3(quantile(games.flatMap((g) => g.teams[side].passesPerPossession), 0.9)),
  }
}

/**
 * BT5.31 identity distance: the mean absolute standardized difference over the style dimensions (not the efficiency ones), each scaled
 * by a typical spread so a 0.05 change in three-point share and a 0.5 change in passes per possession weigh alike. 0 = same style.
 */
export const STYLE_SCALES: Readonly<Record<string, number>> = {
  secondsPerPossession: 1.5, transitionShare: 0.05, passesPerPossession: 0.5, drivesPerPossession: 0.12, screensPerPossession: 0.12, cutsPerPossession: 0.05,
  rimShare: 0.05, midShare: 0.04, threeShare: 0.05, catchShootShare: 0.05, pullUpShare: 0.03, prShare: 0.04, orebRate: 0.04, tovPerPossession: 0.02,
}

export function identityDistance(a: Fingerprint, b: Fingerprint): { readonly distance: number; readonly byDimension: Record<string, number> } {
  const byDimension: Record<string, number> = {}
  let total = 0
  for (const [key, scale] of Object.entries(STYLE_SCALES)) {
    const d = Math.abs((a as unknown as Record<string, number>)[key]! - (b as unknown as Record<string, number>)[key]!) / scale
    byDimension[key] = r3(d)
    total += d
  }
  return { distance: r3(total / Object.keys(STYLE_SCALES).length), byDimension }
}
