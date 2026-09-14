export interface WorldDbGameFixtureBindingV1 {
  readonly gameId: string
  readonly competitionFixtureId: string
}

export interface WorldDbGameFixtureBindingIndexV1 {
  readonly fixtureIdsByGameId: Readonly<Record<string, readonly string[]>>
  readonly gameIdsByFixtureId: Readonly<Record<string, readonly string[]>>
}

/**
 * Mirrors B04/B12 game_fixture_realization semantics inside the save runtime.
 * A physical game may realize multiple competition fixtures and a fixture may have multiple
 * physical realizations such as a replay or continuation.
 */
export function createWorldDbGameFixtureBindingIndexV1(
  bindings: readonly WorldDbGameFixtureBindingV1[],
): WorldDbGameFixtureBindingIndexV1 {
  const fixtureIdsByGameId: Record<string, string[]> = {}
  const gameIdsByFixtureId: Record<string, string[]> = {}
  const pairs = new Set<string>()

  for (const binding of bindings) {
    requireText(binding.gameId, 'Game fixture binding gameId')
    requireText(binding.competitionFixtureId, 'Game fixture binding competitionFixtureId')
    const pair = `${binding.gameId}\u0000${binding.competitionFixtureId}`
    if (pairs.has(pair)) throw new Error(`Duplicate game fixture binding: ${binding.gameId} -> ${binding.competitionFixtureId}`)
    pairs.add(pair)
    ;(fixtureIdsByGameId[binding.gameId] ??= []).push(binding.competitionFixtureId)
    ;(gameIdsByFixtureId[binding.competitionFixtureId] ??= []).push(binding.gameId)
  }

  return Object.freeze({
    fixtureIdsByGameId: freezeGrouped(fixtureIdsByGameId),
    gameIdsByFixtureId: freezeGrouped(gameIdsByFixtureId),
  })
}

function freezeGrouped(value: Record<string, string[]>): Readonly<Record<string, readonly string[]>> {
  for (const values of Object.values(value)) Object.freeze(values)
  return Object.freeze(value)
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`)
}
