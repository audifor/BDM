import type { GameWorld } from '@/domain/world'

/**
 * MX0.3 — test-only projection of the PERSISTENT SEMANTIC TRUTH of a world, used to compare "the world before the
 * save" with "the world after the load" without asserting arbitrary object shape. This is a diagnostic helper, never
 * a second persistence format.
 *
 * Everything a save must reproduce is kept. Only the two V4 runtime projections are excluded, and only because
 * absence is normalized to an explicit empty value on load: the in-memory world may leave them `undefined` while a
 * loaded world always carries their EMPTY form, and both mean exactly "no runtime attached". They are derived
 * projections attached to the world, not part of the saved playable universe.
 */
export const NORMALIZED_RUNTIME_PROJECTIONS = ['worldDbCompetitionRuntime', 'worldAnnualDevelopmentCycle'] as const

/**
 * The persistent semantic truth of `world`: a JSON-normalized copy with only the normalized runtime projections
 * removed. JSON normalization also drops `undefined`-valued properties, which `toEqual` already treats as absent, so
 * the projection is stable across a save/load that materializes an optional field as explicit `undefined`.
 */
export function projectPersistentWorldTruth(world: GameWorld): Record<string, unknown> {
  const projected = JSON.parse(JSON.stringify(world)) as Record<string, unknown>
  for (const key of NORMALIZED_RUNTIME_PROJECTIONS) delete projected[key]
  return projected
}
