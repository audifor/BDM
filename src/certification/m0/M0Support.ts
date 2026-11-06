import { createHash } from 'node:crypto'
import { createGameDate } from '@/domain/date'
import type { Game } from '@/domain/game'
import { updateGameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { hashStringToSeed } from '@/engine/random'
import { generateWorld } from '@/engine/world'

export const ROOT_SEED = 20261106
export const configuration = { seed: ROOT_SEED, gender: 'male', startDate: createGameDate(2032, 10, 1) } as const

export function bootstrap(starterVacancyTeamIndexes?: readonly number[]) {
  const world = generateWorld({ ...configuration, ...(starterVacancyTeamIndexes === undefined ? {} : { starterVacancyTeamIndexes }) })
  return updateGameWorld(world, { games: generateRoundRobinSchedule({ world, seasonId: world.currentSeasonId }) })
}

// Entire canonical JSON state; object keys sorted, array order preserved.
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item !== null && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    : item)
}

export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

export function seedFor(game: Game, rootSeed = ROOT_SEED): number {
  return hashStringToSeed(`m0-match-v1:${rootSeed}:${game.seasonId}:${game.competitionId}:${game.id}:${game.date}`)
}
