import { parseGameDate } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { ensureCanonicalFinanceFoundation, getOpeningEconomicStateReport, type OpeningEconomicStateSource, type OpeningEconomicStateStatus } from '@/domain/finance'
import { organizationIdFromString, teamIdFromString } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { ensureUserClubBoardState } from '@/engine/board'
import { WorldDbSessionV1 } from './WorldDbSession'
import { appointCreatedUserCoachToWorldDbClub } from './WorldDbUserCoachAppointment'
import type { UserCoachCreationInput } from './UserCoachCreator'

/**
 * A new BDM game from ANY competition of a generated universe (WorldDB generator): one competition
 * season, one club. It is an independent game: the World DB is only read, so two games, or a game
 * here and another in Basketball Tycoon World, never share state.
 */
export interface WorldDbUniverseGameInput {
  readonly repository: WorldDatabaseRepository
  readonly databasePath: string
  /** The `competition-runtime-bundle.json` that sits next to the universe SQLite. */
  readonly runtimeBundlePath: string
  readonly competitionSeasonId: string
  readonly teamId: string
  readonly userCoachCreation?: UserCoachCreationInput
}

export interface WorldDbUniverseImportReport {
  readonly competitionSeasonId: string
  readonly ecosystemId: string
  readonly teamId: string
  readonly counts: {
    readonly teams: number
    readonly organizations: number
    readonly players: number
    readonly staff: number
    readonly playerContracts: number
    readonly staffContracts: number
    readonly facilities: number
    readonly teamFacilityUsages: number
    readonly games: number
  }
  /** Status of each organization's opening cash posting (BDM ledger). */
  readonly openingEconomicState: Readonly<Partial<Record<OpeningEconomicStateStatus, number>>>
  /** Available in the World DB, not consumed by BDM: no runtime actor/domain for them yet. */
  readonly availableNotConsumed: {
    readonly unmappedStaffAssignments: readonly { readonly roleCode: string; readonly count: number }[]
    readonly executives: number
    readonly agentRepresentations: number
    readonly agents: number
    readonly officials: number
    readonly mediaPeople: number
  }
}

export interface WorldDbUniverseGame {
  readonly world: GameWorld
  readonly report: WorldDbUniverseImportReport
}

export interface WorldDbUniverseCompetitionOption {
  readonly competitionSeasonId: string
  readonly competitionId: string
  readonly name: string
  readonly ecosystemId: string
  /** Every ecosystem member; a club that was not generated is rejected when the game is created. */
  readonly teams: readonly { readonly teamId: string; readonly teamName: string }[]
}

/** Importable competitions with a runtime descriptor. PARTIAL formats retain their gameplay limitations. */
export async function listWorldDbUniverseCompetitions(access: { readonly repository: WorldDatabaseRepository; readonly databasePath: string; readonly runtimeBundlePath: string }): Promise<readonly WorldDbUniverseCompetitionOption[]> {
  const session = new WorldDbSessionV1(access)
  await session.open()
  try {
    const catalog = await session.discoverSelectionCatalog()
    const options: WorldDbUniverseCompetitionOption[] = []
    for (const season of catalog.competitionSeasons) {
      try { session.getCompetitionFormat(season.competitionSeasonId) } catch { continue }
      if (!session.snapshot().availableCompetitionSeasonIds.includes(season.competitionSeasonId)) continue
      const assignment = catalog.competitionAssignments.find((row) => row.competitionId === season.competitionId)
      if (assignment === undefined) continue
      options.push({
        competitionSeasonId: season.competitionSeasonId, competitionId: season.competitionId, name: season.competitionName, ecosystemId: assignment.ecosystemId,
        teams: catalog.teamMemberships.filter((row) => row.ecosystemId === assignment.ecosystemId && row.membershipStatus.toUpperCase() === 'ACTIVE').map((row) => ({ teamId: row.teamId, teamName: row.teamName })),
      })
    }
    return options.sort((left, right) => left.name.localeCompare(right.name) || left.competitionSeasonId.localeCompare(right.competitionSeasonId))
  } finally {
    session.close()
  }
}

export async function createWorldDbUniverseGame(input: WorldDbUniverseGameInput): Promise<WorldDbUniverseGame> {
  const session = new WorldDbSessionV1({ repository: input.repository, databasePath: input.databasePath, runtimeBundlePath: input.runtimeBundlePath })
  await session.open()
  try {
    const catalog = await session.discoverSelectionCatalog()
    const season = catalog.competitionSeasons.find((row) => row.competitionSeasonId === input.competitionSeasonId)
    if (season === undefined) throw new Error(`The universe has no competition season ${input.competitionSeasonId}`)
    const assignment = catalog.competitionAssignments.find((row) => row.competitionId === season.competitionId)
    if (assignment === undefined) throw new Error(`Competition ${season.competitionId} belongs to no ecosystem of this universe`)
    session.selectCompetitionSeasons([input.competitionSeasonId])
    const { world: bootstrapped, slice } = await session.bootstrapGameWorldWithSlice({
      source: catalog.source, ecosystemId: assignment.ecosystemId, competitionId: season.competitionId,
      competitionSeasonId: input.competitionSeasonId, teamId: input.teamId,
    }, undefined, '2026-07-01')
    const appointed = input.userCoachCreation === undefined ? bootstrapped : appointCreatedUserCoachToWorldDbClub(bootstrapped, teamIdFromString(input.teamId), input.userCoachCreation)
    // WORLDGEN V1 starts the world on July 1; a competition start is a different date.
    const initial = updateGameWorld(appointed, { currentDate: parseGameDate('2026-07-01') })
    const prepared = input.userCoachCreation === undefined ? initial : ensureUserClubBoardState(initial)
    // The universe declares its own money: its currency per organization and the opening cash of each club.
    const explicitOrganizationCurrencies = (slice.finance ?? []).map((row) => ({ organizationId: row.organizationId, currencyCode: row.currencyCode }))
    const openingEconomicStates = openingSources(slice, String(prepared.currentDate))
    const world = ensureCanonicalFinanceFoundation(prepared, { explicitOrganizationCurrencies, ...(openingEconomicStates.length === 0 ? {} : { openingEconomicStates }) })
    return Object.freeze({ world: Object.freeze({ ...world, worldDbUniverseSource: slice }), report: buildReport(world, slice, input, assignment.ecosystemId) })
  } finally {
    session.close()
  }
}

function openingSources(slice: WorldDbGameBootstrapSliceV1, effectiveOn: string): readonly OpeningEconomicStateSource[] {
  return (slice.finance ?? [])
    .filter((row) => row.openingCashCents !== null && row.openingCashCents > 0)
    .map((row) => ({
      sourceAuthority: 'WORLD_DB' as const, sourceEntityId: `financial_account:${row.organizationId}:cash`, organizationId: row.organizationId, currencyCode: row.currencyCode,
      effectiveOn: row.openingOn === null ? effectiveOn : row.openingOn.slice(0, 10), cashMinorUnits: row.openingCashCents!, counterpartKind: 'RETAINED_NET_ASSETS' as const, counterpartId: null,
    }))
}

function buildReport(world: GameWorld, slice: WorldDbGameBootstrapSliceV1, input: WorldDbUniverseGameInput, ecosystemId: string): WorldDbUniverseImportReport {
  const opening: Partial<Record<OpeningEconomicStateStatus, number>> = {}
  for (const row of getOpeningEconomicStateReport(world, slice.organizations.map((organization) => organizationIdFromString(organization.organizationId)).filter((id) => Object.values(world.teams).some((team) => String(team.organizationId) === String(id))))) opening[row.status] = (opening[row.status] ?? 0) + 1
  const roles = new Map<string, number>()
  for (const row of slice.unmappedStaffAssignments ?? []) roles.set(row.roleCode, (roles.get(row.roleCode) ?? 0) + 1)
  const professionals = slice.professionals
  return Object.freeze({
    competitionSeasonId: input.competitionSeasonId, ecosystemId, teamId: input.teamId,
    counts: Object.freeze({
      teams: Object.keys(world.teams).length, organizations: Object.keys(world.organizationsById).length, players: Object.keys(world.players).length, staff: Object.keys(world.staffPeopleById).length,
      playerContracts: Object.keys(world.contractsById).length, staffContracts: Object.keys(world.staffContractsById).length,
      facilities: slice.physicalContent?.facilities.length ?? 0, teamFacilityUsages: slice.physicalContent?.teamUsages.length ?? 0, games: Object.keys(world.games).length,
    }),
    openingEconomicState: Object.freeze(opening),
    availableNotConsumed: Object.freeze({
      unmappedStaffAssignments: [...roles.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([roleCode, count]) => ({ roleCode, count })),
      executives: professionals?.executives.length ?? 0, agentRepresentations: professionals?.agentRepresentations.length ?? 0,
      agents: professionals?.agentCount ?? 0, officials: professionals?.officialCount ?? 0, mediaPeople: professionals?.mediaCount ?? 0,
    }),
  })
}
