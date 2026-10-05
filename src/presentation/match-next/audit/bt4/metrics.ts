import type { MatchNextEvent, MatchSetup } from '@/engine/match-next'
import { shotRows } from './ecology'

/**
 * What the HOME team does and what it allows in a game, from the event stream only (shared by the identity cohorts and the roster
 * experiments). Everything is a per-game count or a rate.
 */
export function measure(setup: MatchSetup, events: readonly MatchNextEvent[]): Record<string, number> {
  const home = setup.homeTeamId
  const rows = shotRows(events)
  const teamOf = new Map<string, string>()
  for (const e of events) if (e.type === 'shotReleased' && e.shooterPlayerId !== undefined && e.teamId !== undefined) teamOf.set(String(e.shooterPlayerId), String(e.teamId))
  const mine = rows.filter((row) => teamOf.get(row.shooter) === String(home))
  const theirs = rows.filter((row) => teamOf.get(row.shooter) !== String(home))
  const count = (list: readonly { zone: string; creation: string; points: number; made: boolean; fouled: boolean; blocked: boolean }[], test: (row: (typeof list)[number]) => boolean): number => list.filter(test).length
  const rate = (a: number, b: number): number => (b === 0 ? 0 : Number((a / b).toFixed(3)))
  const isRim = (row: { zone: string }): boolean => row.zone === 'RESTRICTED' || row.zone === 'RIM'
  const ofTeam = (type: MatchNextEvent['type'], team: 'home' | 'away', extra: (e: MatchNextEvent) => boolean = () => true): number => events.filter((e) => e.type === type && ((String(e.teamId) === String(home)) === (team === 'home')) && extra(e)).length
  const rebounds = events.filter((e) => e.type === 'reboundSecured')
  const oreb = rebounds.filter((e) => e.reboundType === 'offensive' && String(e.teamId) === String(home)).length
  const dreb = rebounds.filter((e) => e.reboundType === 'defensive' && String(e.teamId) === String(home)).length
  const awayOreb = rebounds.filter((e) => e.reboundType === 'offensive' && String(e.teamId) !== String(home)).length
  const awayDreb = rebounds.filter((e) => e.reboundType === 'defensive' && String(e.teamId) !== String(home)).length
  const passes = ofTeam('passReleased', 'home')
  const pps = (list: typeof mine): number => Number((list.reduce((a, r) => a + (r.made ? r.points : 0) + r.freeThrowPoints, 0) / Math.max(1, list.length)).toFixed(3))
  const contest = (list: typeof mine): number => Number((list.reduce((a, r) => a + r.contest, 0) / Math.max(1, list.length)).toFixed(3))
  return {
    fga: mine.length, threeShare: rate(count(mine, (r) => r.points === 3), mine.length), catchShootShare: rate(count(mine, (r) => r.creation === 'CATCH_AND_SHOOT'), mine.length),
    pullUpShare: rate(count(mine, (r) => r.creation === 'PULL_UP' || r.creation === 'FLOATER'), mine.length), driveShare: rate(count(mine, (r) => r.creation === 'DRIVE_FINISH'), mine.length),
    rimShare: rate(count(mine, isRim), mine.length), midShare: rate(count(mine, (r) => r.zone === 'MIDRANGE' || r.zone === 'LONG_MIDRANGE'), mine.length),
    fgPct: rate(count(mine, (r) => r.made), mine.length), threePct: rate(count(mine, (r) => r.points === 3 && r.made), count(mine, (r) => r.points === 3)),
    rimFgPct: rate(count(mine, (r) => isRim(r) && r.made), count(mine, isRim)), rimFouledPct: rate(count(mine, (r) => isRim(r) && r.fouled), count(mine, isRim)), rimBlockedPct: rate(count(mine, (r) => isRim(r) && r.blocked), count(mine, isRim)),
    meanContest: contest(mine), pps: pps(mine),
    fta: events.filter((e) => (e.type === 'freeThrowMade' || e.type === 'freeThrowMissed') && String(e.teamId) === String(home)).length,
    drives: ofTeam('actionStarted', 'home', (e) => e.actionKind === 'DRIVE'), screens: ofTeam('screenSet', 'home'), passes, assists: ofTeam('assist', 'home'),
    turnovers: ofTeam('turnover', 'home'), lostDribbles: ofTeam('turnover', 'home', (e) => e.turnoverType === 'LOST_DRIBBLE'), badPasses: ofTeam('turnover', 'home', (e) => e.turnoverType === 'BAD_PASS'), interceptedPasses: ofTeam('turnover', 'home', (e) => e.turnoverType === 'INTERCEPTION'),
    badPassRate: rate(ofTeam('turnover', 'home', (e) => e.turnoverType === 'BAD_PASS' || e.turnoverType === 'INTERCEPTION'), passes),
    // as defenders
    oppFga: theirs.length, oppRimAttempts: count(theirs, isRim), oppRimShare: rate(count(theirs, isRim), theirs.length), oppRimFgPct: rate(count(theirs, (r) => isRim(r) && r.made), count(theirs, isRim)), oppFgPct: rate(count(theirs, (r) => r.made), theirs.length),
    oppPps: pps(theirs), oppMeanContest: contest(theirs),
    blocks: ofTeam('shotBlocked', 'home'), steals: ofTeam('steal', 'home'), foulsCommitted: ofTeam('foul', 'home'),
    oreb, dreb, orebShare: rate(oreb, oreb + awayDreb), drebShare: rate(dreb, dreb + awayOreb),
  }
}
