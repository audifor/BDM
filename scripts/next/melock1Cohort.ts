/** ME-LOCK1 certification cohort: FULL (a MatchFrame every tick) vs FAST on the same setups, plus the per-game basketball line.
 *  node <bundle> <seeds csv> [gameIndex] -> JSON per seed { equal, fullMs, fastMs, line } */
import { createHash } from 'node:crypto'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { getScheduledGamesToday } from '@/engine/calendar'
const seeds = (process.argv[2] ?? '1,2').split(',').map(Number)
const gameIndex = Number(process.argv[3] ?? 0)
const world = createNewGame()
const game = getScheduledGamesToday(world)[gameIndex]!
const port = createMatchEnginePort('match-next')
const h = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)
const out: Record<string, unknown> = { game: game.id, competition: game.competitionId }
for (const seed of seeds) {
  const setup = port.prepare(world, game, seed)
  const a = performance.now(); const fast = port.simulate(setup, 'FAST'); const b = performance.now()
  const full = port.simulate(setup, 'FULL'); const c = performance.now()
  const s = fast.finalState
  const side = (key: 'home' | 'away') => { const t = fast.teamStats[key]; const teamId = key === 'home' ? s.homeTeamId : s.awayTeamId; const poss = s.possessions.filter((p) => p.teamId === teamId).length; return { pts: t.points, poss, ppp: +(t.points / poss).toFixed(3), tov: t.turnovers, stl: t.steals, ast: t.assists, fgm: t.fieldGoalsMade, fga: t.fieldGoalsAttempted, tpa: t.threePointAttempted, fta: t.freeThrowsAttempted, orb: t.offensiveRebounds, drb: t.defensiveRebounds, pf: t.foulsCommitted } }
  out[seed] = { equal: h(full) === h(fast), fastHash: h(fast), fullHash: h(full), fastMs: Math.round(b - a), fullMs: Math.round(c - b), home: side('home'), away: side('away'), subs: s.events.filter((e) => e.type === 'substitution').length }
}
console.log(JSON.stringify(out))
