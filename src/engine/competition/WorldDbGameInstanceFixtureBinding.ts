export interface WorldDbGameInstanceFixtureBindingV1 {
  readonly gameId: string
  readonly competitionSeasonId: string
  readonly instanceFixtureId: string
}

export interface WorldDbGameInstanceFixtureBindingIndexV1 {
  readonly bindingsByGameId: Readonly<Record<string, readonly WorldDbGameInstanceFixtureBindingV1[]>>
  readonly gameIdsByInstanceFixtureKey: Readonly<Record<string, readonly string[]>>
}

/**
 * Runtime/save realization relation between physical B12-style Games and save-owned competition
 * instance fixtures. It is intentionally N:M. One Game may count in multiple competitions and one
 * instance fixture may have multiple physical realizations such as replay/continuation semantics.
 */
export function createWorldDbGameInstanceFixtureBindingIndexV1(
  bindings: readonly WorldDbGameInstanceFixtureBindingV1[],
): WorldDbGameInstanceFixtureBindingIndexV1 {
  const bindingsByGameId: Record<string, WorldDbGameInstanceFixtureBindingV1[]> = {}
  const gameIdsByInstanceFixtureKey: Record<string, string[]> = {}
  const triples = new Set<string>()

  for (const value of bindings) {
    const binding = Object.freeze({
      gameId: requireText(value.gameId, 'Game instance fixture binding gameId'),
      competitionSeasonId: requireText(value.competitionSeasonId, 'Game instance fixture binding competitionSeasonId'),
      instanceFixtureId: requireText(value.instanceFixtureId, 'Game instance fixture binding instanceFixtureId'),
    })
    const triple = `${binding.gameId}\u0000${binding.competitionSeasonId}\u0000${binding.instanceFixtureId}`
    if (triples.has(triple)) {
      throw new Error(`Duplicate game instance fixture binding: ${binding.gameId} -> ${binding.competitionSeasonId}/${binding.instanceFixtureId}`)
    }
    triples.add(triple)
    ;(bindingsByGameId[binding.gameId] ??= []).push(binding)
    ;(gameIdsByInstanceFixtureKey[worldDbInstanceFixtureRealizationKeyV1(binding.competitionSeasonId, binding.instanceFixtureId)] ??= []).push(binding.gameId)
  }

  return Object.freeze({
    bindingsByGameId: freezeGrouped(bindingsByGameId),
    gameIdsByInstanceFixtureKey: freezeGrouped(gameIdsByInstanceFixtureKey),
  })
}

export function worldDbInstanceFixtureRealizationKeyV1(competitionSeasonId: string, instanceFixtureId: string): string {
  return `${requireText(competitionSeasonId, 'Competition season id')}\u0000${requireText(instanceFixtureId, 'Instance fixture id')}`
}

function freezeGrouped<T>(value: Record<string, T[]>): Readonly<Record<string, readonly T[]>> {
  for (const values of Object.values(value)) Object.freeze(values)
  return Object.freeze(value)
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`)
  return value
}
