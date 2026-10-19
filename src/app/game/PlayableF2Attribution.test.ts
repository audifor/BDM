import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { GameId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { createMatchEnginePort } from '@/app/matchNext'
import { automaticPolicy, managedPolicy, type ManagedOptions } from './testSupport/PlayableF2Policies'
import { createF2Day0, runF2Window, type F2RunResult } from './testSupport/PlayableF2Support'

/**
 * F2 · atribución. Qué decisión de B mueve el rendimiento del equipo, medido contra la variación aleatoria: el mismo estado inicial y las
 * mismas semillas, un brazo por familia de decisiones (sólo entrenamiento, sólo quinteto guardado, y una mala decisión de rotación:
 * rellenar todo el banquillo). El resultado no se prejuzga: la gestión mala también puede perjudicar.
 */
const SALT = 7
const WINDOW_DAYS = 17 // covers the games of 3 and 10 October
const SEEDS = Array.from({ length: 10 }, (_, index) => 1000 + index)
const port = createMatchEnginePort('match-next')
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

let teamId: TeamId
let baseline: F2RunResult
const arms: Record<string, ManagedOptions> = {
  entrenamiento: { training: true, delegation: true, lineup: false },
  quinteto: { training: false, delegation: false, lineup: true },
  quintetoDebil: { training: false, delegation: false, lineup: true, weakLineup: true },
}
const runs: Record<string, F2RunResult> = {}

beforeAll(async () => {
  const day0 = await createF2Day0()
  teamId = getUserTeam(day0)!.id
  baseline = runF2Window(day0, automaticPolicy, SALT, WINDOW_DAYS)
  for (const [name, options] of Object.entries(arms)) runs[name] = runF2Window(day0, managedPolicy(options), SALT, WINDOW_DAYS)
}, 1_500_000)

const marginOf = (world: GameWorld, gameId: GameId, seed: number): number => {
  const game = world.games[gameId]!
  const result = port.simulate(port.prepare(world, game, seed), 'FAST')
  return game.homeTeamId === teamId ? result.score.home - result.score.away : result.score.away - result.score.home
}

describe('F2 · atribución de las diferencias a familias de decisiones', () => {
  it('13. cada familia de decisiones se mide con las mismas 10 semillas sobre los estados previos a los dos primeros partidos', { timeout: 1_500_000 }, () => {
    const baseMargins = baseline.games.map((line) => SEEDS.map((seed) => marginOf(line.preMatchWorld, line.gameId, seed)))
    const summary: Record<string, unknown> = {}
    for (const name of Object.keys(arms)) {
      const run = runs[name]!
      expect(run.games.map((game) => game.gameId)).toEqual(baseline.games.map((game) => game.gameId))
      const diffs = run.games.flatMap((line, index) => SEEDS.map((seed, seedIndex) => marginOf(line.preMatchWorld, line.gameId, seed) - baseMargins[index]![seedIndex]!))
      const sd = Math.sqrt(diffs.reduce((sum, d) => sum + (d - mean(diffs)) ** 2, 0) / (diffs.length - 1))
      const se = sd / Math.sqrt(diffs.length)
      summary[name] = {
        decisions: run.decisions.length,
        sessionsCompleted: Object.values(run.world.scheduledTrainingSessionsById).filter((s) => s.teamId === teamId && s.status === 'completed').length,
        playersWithTenMinutesPerGame: round(mean(run.games.map((g) => Object.values(g.minutes).filter((m) => m >= 10).length))),
        pairedMeanMarginDifferenceVersusAutomatic: round(mean(diffs)), standardError: round(se), interval95: [round(mean(diffs) - 1.96 * se), round(mean(diffs) + 1.96 * se)], pairs: diffs.length,
      }
    }
    summary['automatica'] = { playersWithTenMinutesPerGame: round(mean(baseline.games.map((g) => Object.values(g.minutes).filter((m) => m >= 10).length))), meanMargin: round(mean(baseMargins.flat())) }
    console.log(`F2 attribution ${JSON.stringify(summary)}`)
    const evidenceDir = process.env.F2_EVIDENCE_DIR
    if (evidenceDir !== undefined) { mkdirSync(evidenceDir, { recursive: true }); writeFileSync(join(evidenceDir, 'attribution.json'), JSON.stringify({ seeds: SEEDS, salt: SALT, arms: summary }, null, 2)) }
    // Saving the lineup the coach would pick anyway is not an advantage: the games are identical to the automatic ones (no hidden bonus for intervening).
    expect((summary['quinteto'] as { pairedMeanMarginDifferenceVersusAutomatic: number }).pairedMeanMarginDifferenceVersusAutomatic).toBe(0)
    // A bad rotation decision does reach the engine and hurts, which only holds if decisions are executed rather than decorative.
    expect((summary['quintetoDebil'] as { pairedMeanMarginDifferenceVersusAutomatic: number }).pairedMeanMarginDifferenceVersusAutomatic).toBeLessThan(0)
    expect(Object.values(runs['entrenamiento']!.world.scheduledTrainingSessionsById).filter((s) => s.teamId === teamId && s.status === 'completed').length).toBeGreaterThan(8)
  })
})
