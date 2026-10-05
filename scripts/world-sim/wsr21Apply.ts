/**
 * WSR2.1 result-application benchmark: on the world-scale fixture (K namespaced copies), prepares and simulates every Game of the day
 * except the user's (all BACKGROUND), then times only their application (`applyDayOutcomes`), the day's result batch.
 *   node <bundle> <copies> [repeats]
 * Prints matches, application time, ms per result and, where the build has the WSR2.1 counter, whole-record copies of the shared maps.
 */
import { applyDayOutcomes, prepareDayGames, simulateDayOutcomesInline } from '@/app/game/matchResolution'
import { DEFAULT_SIMULATION_DETAIL } from '@/app/worldSim/SimulationResolutionPolicy'
import * as worldModule from '@/domain/world'
import { getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { createWorldScaleFixture } from './wsr1WorldFixture'

const [copiesArg = '11', repeatsArg = '3'] = process.argv.slice(2)
const copies = Number(copiesArg)
const { world } = createWorldScaleFixture(copies)
const user = getUserTeam(world)!
const games = getScheduledGamesToday(world).filter((game) => game.homeTeamId !== user.id && game.awayTeamId !== user.id)
let seed = 1
const prepared = prepareDayGames(world, games, () => seed++, undefined, { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' })
const outcomes = simulateDayOutcomesInline(prepared)
const copyCount = (worldModule as unknown as { resultRecordCopyCount?: () => number }).resultRecordCopyCount
const runs: { applyMs: number; recordCopies: number | null }[] = []
for (let repeat = 0; repeat < Number(repeatsArg); repeat += 1) {
  const copiesBefore = copyCount?.() ?? 0
  const t0 = performance.now()
  applyDayOutcomes(world, prepared, outcomes)
  runs.push({ applyMs: Math.round(performance.now() - t0), recordCopies: copyCount === undefined ? null : copyCount() - copiesBefore })
}
const best = Math.min(...runs.map((run) => run.applyMs))
console.log(JSON.stringify({
  copies, teams: Object.keys(world.teams).length, players: Object.keys(world.players).length, matches: prepared.length,
  applyMs: best, msPerResult: +(best / prepared.length).toFixed(2), recordCopiesPerDay: runs[0]!.recordCopies, runs: runs.map((run) => run.applyMs),
}))
process.exit(0)
