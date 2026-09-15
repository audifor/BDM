import type { WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'
import type { WorldDbGameFixtureBindingV1 } from './WorldDbGameFixtureBinding'

const ACTIVE_STATUS = new Set(['AUTHORITATIVE', 'PROVISIONAL'])
const INACTIVE_STATUS = new Set(['SUPERSEDED', 'VOIDED'])

/**
 * Projects the B12 realizations that still own physical identity for planning.
 *
 * AUTHORITATIVE replaces PROVISIONAL for the same fixture. SUPERSEDED and VOIDED realizations are
 * removed. A fixture with only PROVISIONAL realizations keeps those physical identities, but those
 * Games are not authoritative for result-driven B04 progression.
 */
export function projectWorldDbPlanningRealizationsV1(
  bundle: WorldDbMatchRealizationBundleV1,
): WorldDbMatchRealizationBundleV1 {
  const realizationsByFixtureId = groupRealizationsByFixture(bundle)
  const selectedRealizationIds = new Set<string>()

  for (const realizations of Object.values(realizationsByFixtureId)) {
    const authoritative = realizations.filter((row) => row.status === 'AUTHORITATIVE')
    const selected = authoritative.length > 0
      ? authoritative
      : realizations.filter((row) => row.status === 'PROVISIONAL')
    for (const row of selected) selectedRealizationIds.add(row.gameFixtureRealizationId)
  }

  const realizations = bundle.realizations.filter((row) => selectedRealizationIds.has(row.gameFixtureRealizationId))
  const selectedMatchIds = new Set(realizations.map((row) => row.matchId))
  const matches = bundle.matches.filter((match) => selectedMatchIds.has(match.matchId))

  return Object.freeze({
    schemaVersion: 1 as const,
    competitionSeasonId: bundle.competitionSeasonId,
    matches: Object.freeze(matches),
    realizations: Object.freeze(realizations),
  })
}

/**
 * Returns only Game↔Fixture bindings allowed to drive B04 outcomes for one competition context.
 *
 * Fixtures with no B12 realization are runtime/B04-owned and keep their normal bindings. Fixtures
 * with B12 rows require an AUTHORITATIVE realization. PROVISIONAL physical Games can exist but must
 * not advance a bracket or standings-derived progression.
 */
export function selectWorldDbAuthoritativeOutcomeBindingsV1(
  databaseId: string,
  competitionFixtureIds: readonly string[],
  matchRealizations: WorldDbMatchRealizationBundleV1 | undefined,
  bindings: readonly WorldDbGameFixtureBindingV1[],
): readonly WorldDbGameFixtureBindingV1[] {
  const fixtureIds = new Set(competitionFixtureIds)
  if (matchRealizations === undefined) {
    return Object.freeze(bindings.filter((binding) => fixtureIds.has(binding.competitionFixtureId)))
  }

  const realizationsByFixtureId = groupRealizationsByFixture(matchRealizations)
  const authoritativeGameIdsByFixtureId: Record<string, ReadonlySet<string>> = {}
  for (const fixtureId of fixtureIds) {
    const rows = realizationsByFixtureId[fixtureId]
    if (rows === undefined || rows.length === 0) continue
    authoritativeGameIdsByFixtureId[fixtureId] = new Set(
      rows
        .filter((row) => row.status === 'AUTHORITATIVE')
        .map((row) => `worlddb:${databaseId}:match:${row.matchId}`),
    )
  }

  return Object.freeze(bindings.filter((binding) => {
    if (!fixtureIds.has(binding.competitionFixtureId)) return false
    const authoritativeGameIds = authoritativeGameIdsByFixtureId[binding.competitionFixtureId]
    if (authoritativeGameIds === undefined) return true
    return authoritativeGameIds.has(binding.gameId)
  }))
}

function groupRealizationsByFixture(
  bundle: WorldDbMatchRealizationBundleV1,
): Readonly<Record<string, readonly WorldDbMatchRealizationBundleV1['realizations'][number][]>> {
  const result: Record<string, WorldDbMatchRealizationBundleV1['realizations'][number][]> = {}
  for (const row of bundle.realizations) {
    validateStatus(row.status, row.gameFixtureRealizationId)
    ;(result[row.competitionFixtureId] ??= []).push(row)
  }
  return result
}

function validateStatus(status: string, realizationId: string): void {
  if (!ACTIVE_STATUS.has(status) && !INACTIVE_STATUS.has(status)) {
    throw new Error(`Unsupported World DB fixture realization status ${status}: ${realizationId}`)
  }
}
