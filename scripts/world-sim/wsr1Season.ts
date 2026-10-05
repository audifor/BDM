/**
 * WSR1 season continuity and mode switching: plays the prototype world's game days through the production async day advance with a
 * per-day simulation-detail plan, and summarises the league from the canonical stat logs (by resolution and by segment).
 *   node <bundle> <plan> <days> <workerFile> <pool> <out.json>
 *   plan: FAST | BG | BG>FAST | FAST>BG   (">" switches at half the days; the user's own Games are always exact)
 */
import { Worker } from 'node:worker_threads'
import { writeFileSync } from 'node:fs'
import { createNewGame } from '@/app/game/createNewGame'
import { advanceGameDayWithResultAsync } from '@/app/game/advanceGameDay'
import { createWorkerPoolRunner, type MatchSimulationReply } from '@/app/matchNext/MatchSimulationRunner'
import { DEFAULT_SIMULATION_DETAIL, type SimulationDetailSettings } from '@/app/worldSim/SimulationResolutionPolicy'
import { calculateStandings } from '@/engine/competition/standings'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import type { GameWorld } from '@/domain/world'

const [plan = 'FAST', daysArg = '20', workerFile, poolArg = '6', out = 'season.json'] = process.argv.slice(2)
const days = Number(daysArg)
const runner = createWorkerPoolRunner(() => {
  const worker = new Worker(workerFile!)
  return { post: (job) => worker.postMessage(job), onReply: (listener) => worker.on('message', (reply: MatchSimulationReply) => listener(reply)), onFailure: (listener) => worker.on('error', (error) => listener(String(error))), terminate: () => { void worker.terminate() } }
}, Number(poolArg))
const fast: SimulationDetailSettings = { ...DEFAULT_SIMULATION_DETAIL, exactBudgetPerDay: 1000 }
const background: SimulationDetailSettings = { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' }
const settingsFor = (day: number): SimulationDetailSettings => {
  const [first, second] = plan.split('>') as ['FAST' | 'BG', ('FAST' | 'BG') | undefined]
  const mode = second !== undefined && day >= days / 2 ? second : first
  return mode === 'FAST' ? fast : background
}

let world: GameWorld = createNewGame()
let seed = 77_000
let gameDays = 0
const segmentOf = new Map<string, number>()
const t0 = performance.now()
while (gameDays < days) {
  const today = getScheduledGamesToday(world)
  if (today.length === 0) { world = advanceDay(world); continue }
  for (const game of today) segmentOf.set(game.id, gameDays < days / 2 ? 0 : 1)
  const result = await advanceGameDayWithResultAsync(world, runner, () => seed++, ['userGame'], { simulationDetail: settingsFor(gameDays) })
  // A breakpoint after processing (media, decisions for the user) still completes the day.
  if (result.status !== 'COMPLETED' && result.status !== 'BREAKPOINT_AFTER_PROCESSING') throw new Error(`day ${gameDays} ${result.status}: ${result.failure?.message ?? ''}`)
  world = result.world
  gameDays += 1
}
const logs = Object.values(world.matchStatLogsByGameId)
const teamGames = logs.flatMap((log) => [true, false].map((isHome) => {
  const lines = log.playerLines.filter((line) => line.isHome === isHome)
  const sum = (key: keyof (typeof lines)[number]['stats']) => lines.reduce((total, line) => total + (line.stats[key] as number), 0)
  const minutes = log.playerLines.filter((line) => line.isHome === isHome).reduce((total, line) => total + line.stats.secondsPlayed, 0) / 300
  const per40 = 40 / minutes
  const points = sum('points')
  return {
    gameId: log.gameId, resolution: log.resolution ?? 'UNKNOWN', segment: segmentOf.get(log.gameId) ?? -1, competitionId: log.competitionId, isHome,
    win: points > (isHome ? log.finalScore.away : log.finalScore.home) ? 1 : 0,
    pts: points * per40, fga: sum('fieldGoalsAttempted') * per40, threeShare: sum('threePointAttempted') / Math.max(1, sum('fieldGoalsAttempted')), fgPct: sum('fieldGoalsMade') / Math.max(1, sum('fieldGoalsAttempted')),
    fta: sum('freeThrowsAttempted') * per40, tov: sum('turnovers') * per40, ast: sum('assists') * per40, reb: sum('rebounds') * per40, stl: sum('steals') * per40, blk: sum('blocks') * per40, pf: sum('foulsCommitted') * per40,
    topScorerShare: Math.max(...lines.map((line) => line.stats.points)) / Math.max(1, points),
  }
}))
const standings = Object.fromEntries([...new Set(logs.map((log) => world.games[log.gameId]!.seasonId))].map((seasonId) => [seasonId, calculateStandings(world, seasonId).map((line) => ({ teamId: line.teamId, played: line.played, wins: line.wins }))]))
const players = new Map<string, { segment: number[]; points: number[]; minutes: number[] }>()
for (const log of logs) for (const line of log.playerLines) {
  const entry = players.get(line.playerId) ?? { segment: [], points: [], minutes: [] }
  entry.segment.push(segmentOf.get(log.gameId) ?? -1); entry.points.push(line.stats.points); entry.minutes.push(line.stats.secondsPlayed / 60)
  players.set(line.playerId, entry)
}
writeFileSync(out, JSON.stringify({ plan, days, games: logs.length, ms: Math.round(performance.now() - t0), teamGames, standings, players: Object.fromEntries(players) }))
console.log(JSON.stringify({ plan, days, games: logs.length, ms: Math.round(performance.now() - t0), resolutions: Object.fromEntries(['FAST', 'BACKGROUND'].map((r) => [r, logs.filter((log) => log.resolution === r).length])) }))
process.exit(0)
