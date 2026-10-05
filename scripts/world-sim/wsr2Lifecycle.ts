/**
 * WSR2 daily lifecycle harness: advances the world-scale fixture (K namespaced prototype copies, every competition in season, the first
 * day packed with independent Games) for D days through the production day advance, and records per-phase time and the canonical
 * world after every day as per-domain hashes (key-sorted), for exact comparison between commits.
 *   node <bundle> <copies> <days> <out.json> [inline|pool:<workerFile>:<size>]
 * Match resolution uses the WSR1 MINIMAL detail (the user's Game exact, everything else BACKGROUND) so lifecycle cost is isolated.
 * WSR2_SCOUT=<n>: before day 0, every team requests n scouting missions (production `requestScouting`, its own regional scouts, players
 * of other teams), so the Scouting phases run under load. The seeding is deterministic and identical between commits.
 */
import { Worker } from 'node:worker_threads'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { advanceGameDayWithResult, advanceGameDayWithResultAsync, type WorldDayAdvanceResult } from '@/app/game/advanceGameDay'
import { createWorkerPoolRunner, type MatchSimulationReply } from '@/app/matchNext/MatchSimulationRunner'
import { DEFAULT_SIMULATION_DETAIL } from '@/app/worldSim/SimulationResolutionPolicy'
import { withSingleWorldValidation, type GameWorld } from '@/domain/world'
import { requestScouting } from '@/engine/scouting'
import { getScheduledGamesToday } from '@/engine/calendar'
import { canonicalJson } from '../next/melock12Corpus'
import { createWorldScaleFixture } from './wsr1WorldFixture'

const [copiesArg = '1', daysArg = '3', out = 'lifecycle.json', runnerArg = 'inline'] = process.argv.slice(2)
const copies = Number(copiesArg)
const days = Number(daysArg)
// WSR2_DETAIL=STANDARD: the user's competition and 12 more Games a day exact (FAST), the rest BACKGROUND (mixed result batches).
const settings = process.env.WSR2_DETAIL === 'STANDARD' ? { ...DEFAULT_SIMULATION_DETAIL, exactBudgetPerDay: 12 } : { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' as const }
const hash = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 16)

export function worldCensus(world: GameWorld): Record<string, number> {
  return {
    teams: Object.keys(world.teams).length, players: Object.keys(world.players).length, staff: Object.keys(world.staffPeopleById).length,
    contracts: Object.keys(world.contractsById).length, scoutingAssignments: Object.values(world.scoutingAssignmentsById).filter((a) => a.status === 'ACTIVE' || a.status === 'QUEUED').length,
    injuries: Object.keys(world.injuriesById).length, gamesToday: getScheduledGamesToday(world).length,
  }
}

function seedScouting(start: GameWorld, perTeam: number): GameWorld {
  if (perTeam <= 0) return start
  const missions = ['QUICK_LOOK', 'FULL_REPORT', 'SKILL_EVALUATION', 'POTENTIAL_EVALUATION'] as const
  const teams = Object.values(start.teams).sort((a, b) => a.id.localeCompare(b.id))
  return withSingleWorldValidation(start, (initial) => teams.reduce((world, team, index) => {
    const scouts = Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === team.id && item.role === 'regionalScout').map((item) => item.staffPersonId).sort()
    let next = world
    for (let i = 0; i < perTeam && scouts.length > 0; i += 1) {
      const other = teams[(index + 1 + i) % teams.length]!
      const playerId = other.rosterPlayerIds[i % other.rosterPlayerIds.length]!
      next = requestScouting(next, { organizationId: team.organizationId, playerId, missionType: missions[i % missions.length]!, evaluatorStaffId: scouts[i % scouts.length]!, priority: i % 3 === 0 ? 'HIGH' : 'NORMAL' })
    }
    return next
  }, initial))
}

const runner = runnerArg.startsWith('pool:') ? (() => {
  const [, file, size] = runnerArg.split(':')
  return createWorkerPoolRunner(() => {
    const worker = new Worker(file!)
    return { post: (job) => worker.postMessage(job), onReply: (listener) => worker.on('message', (reply: MatchSimulationReply) => listener(reply)), onFailure: (listener) => worker.on('error', (error) => listener(String(error))), terminate: () => { void worker.terminate() } }
  }, Number(size))
})() : null

const t0 = performance.now()
let world = seedScouting(createWorldScaleFixture(copies).world, Number(process.env.WSR2_SCOUT ?? '0'))
const fixtureMs = performance.now() - t0
const census = worldCensus(world)
const record: { copies: number; census: Record<string, number>; fixtureMs: number; days: unknown[] } = { copies, census, fixtureMs: Math.round(fixtureMs), days: [] }
let seed = 31_000
for (let day = 0; day < days; day += 1) {
  const games = getScheduledGamesToday(world).length
  const start = performance.now()
  const result: WorldDayAdvanceResult = runner === null
    ? advanceGameDayWithResult(world, () => seed++, ['userGame'], { simulationDetail: settings })
    : await advanceGameDayWithResultAsync(world, runner, () => seed++, ['userGame'], { simulationDetail: settings })
  const totalMs = performance.now() - start
  if (result.status === 'FAILED' || result.status === 'BREAKPOINT_PREVENTED') throw new Error(`day ${day}: ${result.status} ${result.failure?.message ?? ''}`)
  world = result.world
  const phases = Object.fromEntries(result.phases.filter((phase) => phase.elapsedMs !== undefined).map((phase) => [phase.phaseId, Math.round(phase.elapsedMs! * 10) / 10]))
  const domains = Object.fromEntries(Object.keys(world).sort().map((key) => [key, hash((world as unknown as Record<string, unknown>)[key])]))
  const match = (phases.MATCH_RESOLUTION as number | undefined) ?? 0
  record.days.push({ day, date: world.currentDate, games, status: result.status, totalMs: Math.round(totalMs), matchMs: Math.round(match), lifecycleMs: Math.round(totalMs - match), phases, world: hash(world), domains })
  console.error(`copies ${copies} day ${day} games ${games} total ${Math.round(totalMs)} ms (matches ${Math.round(match)}) ${result.status}`)
}
Object.assign(record, { endCensus: worldCensus(world), endTotals: { evaluatorReports: Object.keys(world.evaluatorReportsById).length, injuries: Object.keys(world.injuriesById).length, matchStatLogs: Object.keys(world.matchStatLogsByGameId).length, staffConflicts: Object.keys(world.staffConflictsById).length, staffCareerRequests: Object.keys(world.staffCareerRequestsById).length } })
writeFileSync(out, JSON.stringify(record))
console.log(JSON.stringify({ copies, census, days: record.days.map((d) => { const x = d as { totalMs: number; lifecycleMs: number; games: number }; return { games: x.games, totalMs: x.totalMs, lifecycleMs: x.lifecycleMs } }) }))
process.exit(0)
