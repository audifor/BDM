/**
 * WSR1 FAST reference collector: plays the given cases x seeds through Match Next FAST (the certification reference) and writes one JSON
 * line per match with team and player outcomes. Setups are written once per case so the fit can derive the same BACKGROUND features.
 *   node <bundle> <cal|cert> <seedsPerCase> <outDir> [--jobs N] [--shard i/n]
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEnginePort } from '@/app/matchNext/MatchNextEnginePort'
import type { MatchNextResult } from '@/app/matchNext'
import { matchEventFatigueIncrement } from '@/engine/match-next'
import { calibrationCases, caseSetup, certificationCases, strengthCalibrationCases } from './wsr1Cases'

export type Zone = 'rim' | 'mid' | 'three'
export interface ZoneCounts { rim: number; mid: number; three: number }
export interface TeamRecord {
  teamId: string; poss: number; pts: number; fga: ZoneCounts; fgm: ZoneCounts; fta: number; ftm: number; ftTrips: number; andOnes: number
  tov: number; offFouls: number; stl: number; oreb: number; dreb: number; ast: number; blk: number; pf: number
}
export interface PlayerRecord {
  id: string; team: string; started: boolean; secs: number; pts: number; fga: ZoneCounts; fgm: ZoneCounts; fta: number; ftm: number
  oreb: number; dreb: number; ast: number; stl: number; blk: number; tov: number; pf: number
  fatigueBefore: number; fatigueAfter: number; eventLoad: number
  counts: { drive: number; screen: number; passAction: number; shootAction: number; closeout: number; passReleased: number; defResp: number; intercept: number; looseRecovered: number; shot3: number; shot2: number }
}
export interface MatchRecord { caseId: string; seed: number; periods: number; score: { home: number; away: number }; home: TeamRecord; away: TeamRecord; players: PlayerRecord[] }

export function zoneOf(label: string | undefined, points: number | undefined): Zone {
  if (points === 3) return 'three'
  return label === 'RESTRICTED' || label === 'RIM' || label === 'SHORT_PAINT' ? 'rim' : 'mid'
}
const zeros = (): ZoneCounts => ({ rim: 0, mid: 0, three: 0 })

export function fastRecord(caseId: string, seed: number, result: MatchNextResult): MatchRecord {
  const teamOf = new Map(result.finalState.players.map((p) => [p.playerId as string, p.teamId as string]))
  const team = (teamId: string): TeamRecord => ({ teamId, poss: 0, pts: 0, fga: zeros(), fgm: zeros(), fta: 0, ftm: 0, ftTrips: 0, andOnes: 0, tov: 0, offFouls: 0, stl: 0, oreb: 0, dreb: 0, ast: 0, blk: 0, pf: 0 })
  const teams = new Map([[result.homeTeamId as string, team(result.homeTeamId)], [result.awayTeamId as string, team(result.awayTeamId)]])
  const players = new Map<string, PlayerRecord>(result.finalState.players.map((p) => [p.playerId as string, {
    id: p.playerId, team: p.teamId, started: p.started === true, secs: 0, pts: 0, fga: zeros(), fgm: zeros(), fta: 0, ftm: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    fatigueBefore: p.initialFatigue, fatigueAfter: p.fatigue, eventLoad: 0,
    counts: { drive: 0, screen: 0, passAction: 0, shootAction: 0, closeout: 0, passReleased: 0, defResp: 0, intercept: 0, looseRecovered: 0, shot3: 0, shot2: 0 },
  }]))
  for (const line of result.playerStats) {
    const p = players.get(line.playerId)!
    Object.assign(p, { secs: line.secondsPlayed, pts: line.points, fta: line.freeThrowsAttempted, ftm: line.freeThrowsMade, oreb: line.offensiveRebounds, dreb: line.defensiveRebounds, ast: line.assists, stl: line.steals, blk: line.blocks, tov: line.turnovers, pf: line.foulsCommitted })
  }
  const lastZone = new Map<string, Zone>()
  for (const event of result.events) {
    const pid = event.playerId ?? event.shooterPlayerId ?? event.passerPlayerId ?? event.receiverPlayerId
    if (pid !== undefined) { const load = matchEventFatigueIncrement(event); if (load > 0) players.get(pid)!.eventLoad += load }
    if (event.type === 'possessionStart' && event.teamId) teams.get(event.teamId)!.poss += 1
    if (event.type === 'shotReleased' && event.shooterPlayerId) {
      const zone = zoneOf(event.shotZone, event.points)
      lastZone.set(event.shooterPlayerId, zone)
      const p = players.get(event.shooterPlayerId)!
      p.fga[zone] += 1
      teams.get(p.team)!.fga[zone] += 1
      if (event.points === 3) p.counts.shot3 += 1; else p.counts.shot2 += 1
    }
    if (event.type === 'shotMade' && event.shooterPlayerId) {
      const zone = lastZone.get(event.shooterPlayerId) ?? zoneOf(event.shotZone, event.points)
      const p = players.get(event.shooterPlayerId)!
      p.fgm[zone] += 1
      teams.get(p.team)!.fgm[zone] += 1
    }
    if (event.type === 'freeThrowSequenceStarted' && event.teamId) teams.get(event.teamId)!.ftTrips += 1
    if (event.type === 'foul' && event.foulResolution === 'AND_ONE' && event.teamId) teams.get(teamOf.get(event.victimPlayerId ?? '') ?? '')!.andOnes += 1
    if (event.type === 'foul' && event.foulResolution === 'OFFENSIVE_TURNOVER' && event.teamId) teams.get(event.teamId)!.offFouls += 1
    if (event.type === 'actionStarted' && event.playerId) {
      const c = players.get(event.playerId)!.counts
      if (event.actionKind === 'DRIVE') c.drive += 1
      else if (event.actionKind === 'SCREEN') c.screen += 1
      else if (event.actionKind === 'PASS' || event.actionKind === 'KICK_OUT') c.passAction += 1
      else if (event.actionKind === 'SHOOT' || event.actionKind === 'CATCH_AND_SHOOT') c.shootAction += 1
      else if (event.actionKind === 'CLOSEOUT') c.closeout += 1
    }
    if (event.type === 'passReleased' && event.passerPlayerId) players.get(event.passerPlayerId)!.counts.passReleased += 1
    if (event.type === 'defensiveResponsibilityChanged' && event.playerId) players.get(event.playerId)!.counts.defResp += 1
    if (event.type === 'passIntercepted' && event.playerId) players.get(event.playerId)!.counts.intercept += 1
    if (event.type === 'looseBallRecovered' && event.playerId) players.get(event.playerId)!.counts.looseRecovered += 1
  }
  for (const p of players.values()) {
    const t = teams.get(p.team)!
    // A team record holds what its own players did (its defense's steals and blocks included).
    t.pts += p.pts; t.fta += p.fta; t.ftm += p.ftm; t.tov += p.tov; t.oreb += p.oreb; t.dreb += p.dreb; t.ast += p.ast; t.pf += p.pf; t.stl += p.stl; t.blk += p.blk
  }
  return { caseId, seed, periods: result.finalState.period, score: { ...result.score }, home: teams.get(result.homeTeamId)!, away: teams.get(result.awayTeamId)!, players: [...players.values()] }
}

function main(): void {
  const args = process.argv.slice(2)
  const [which = 'cal', seedsArg = '4', outDir = 'wsr1-data'] = args
  const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
  const jobs = Number(flag('--jobs') ?? 1)
  const shard = flag('--shard')
  const seeds = Number(seedsArg)
  const cases = which === 'cal' ? calibrationCases() : which === 'cal2' ? strengthCalibrationCases() : certificationCases()
  mkdirSync(outDir, { recursive: true })
  if (jobs > 1) {
    const runs = Array.from({ length: jobs }, (_, i) => new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, [process.argv[1]!, which, seedsArg, outDir, '--shard', `${i}/${jobs}`], { stdio: ['ignore', 'ignore', 'inherit'] })
      child.on('exit', (code) => code === 0 ? done() : fail(new Error(`shard ${i} exited ${code}`)))
    }))
    void Promise.all(runs).then(() => {
      const lines = Array.from({ length: jobs }, (_, i) => readFileSync(`${outDir}/${which}-shard${i}.jsonl`, 'utf8')).join('')
      writeFileSync(`${outDir}/${which}.jsonl`, lines)
      console.log(`${which}: ${lines.trim().split('\n').length} FAST matches`)
    })
    return
  }
  const [index, count] = (shard ?? '0/1').split('/').map(Number) as [number, number]
  const port = createMatchEnginePort('match-next') as MatchNextEnginePort
  const out: string[] = []
  const setups: Record<string, unknown> = {}
  cases.forEach((item, caseIndex) => {
    if (caseIndex % count !== index) return
    for (let s = 0; s < seeds; s += 1) {
      const seed = (which === 'cal' ? 100_000 : which === 'cal2' ? 300_000 : 900_000) + caseIndex * 101 + s
      const setup = caseSetup(item, seed)
      if (s === 0) setups[item.id] = setup
      out.push(JSON.stringify(fastRecord(item.id, seed, port.simulate(setup, 'FAST'))))
    }
    console.error(`${which} ${item.id}`)
  })
  writeFileSync(`${outDir}/${which}-shard${index}.jsonl`, out.length === 0 ? '' : `${out.join('\n')}\n`)
  const setupFile = `${outDir}/${which}-setups-shard${index}.json`
  writeFileSync(setupFile, JSON.stringify(setups))
  if (!existsSync(setupFile)) throw new Error('setups not written')
}

if (process.argv[1]?.includes('collect')) main()
