import type { GameWorld } from '@/domain/world'
import type { WorldDbSelectionCatalogV1, WorldDbSelectionTeamMembershipV1 } from '@/domain/worldDb/SelectionCatalog'
import { tauriWorldDatabaseRepository, type WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { WORLD_DB_SPAIN_UNIVERSE_ID } from './NewGameUniverseCatalog'
import { WorldDbSessionV1, type WorldDbSessionAccessV1 } from './WorldDbSession'
import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'
import { worldDbDatabasePath, worldDbRuntimeBundlePath } from './WorldDbRuntimeConfig'
import { spainAcbCalendarForStartYear } from '@/data/worldCompetitionCalendars'
import { attachWorldDbSpainCup } from './WorldDbSpainCupBootstrap'
import { ensureCanonicalFinanceFoundation, resolveOrganizationCurrency } from '@/domain/finance'
import { applyGameBalanceBootstrap, gameBalanceOpeningEconomicStates } from '@/app/gameBalance/GameBalanceBootstrap'
import type { BdmGameBalancePreset } from '@/app/gameBalance/BdmGameBalanceV1'
import { ensureUserClubBoardState } from '@/engine/board'
import { annualAuthorizationContinuityAuthorities } from './AnnualAuthorizationContinuityPolicy'
import { appointCreatedUserCoachToWorldDbClub } from './WorldDbUserCoachAppointment'
import type { UserCoachCreationInput } from './UserCoachCreator'
import { teamIdFromString } from '@/domain/ids'

export const SPAIN_ACB_ECOSYSTEM_ID = 'ecosystem:ESP:acb'
export const SPAIN_ACB_COMPETITION_ID = 'competition:ESP:liga-endesa'
export const SPAIN_ACB_COMPETITION_SEASON_ID = 'edition:ESP:liga-endesa:2025-26'
export const SPAIN_COPA_COMPETITION_SEASON_ID = 'edition:ESP:copa-del-rey:2025-26'
export const SPAIN_ACB_CODE = 'SPAIN_ACB'

export interface WorldDbSpainTeamOption {
  readonly key: string
  readonly name: string
  readonly code: string
}

export interface WorldDbSpainSelection {
  readonly source: WorldDbSelectionCatalogV1['source']
  readonly ecosystemId: string
  readonly competitionId: string
  readonly competitionSeasonId: string
  readonly teams: readonly WorldDbSpainTeamOption[]
}

export interface WorldDbSpainGameAccess {
  readonly databasePath: string
  readonly runtimeBundlePath: string
  readonly repository?: WorldDatabaseRepository
}

export function defaultWorldDbSpainAccess(): WorldDbSessionAccessV1 {
  return {
    repository: tauriWorldDatabaseRepository,
    databasePath: worldDbDatabasePath(),
    runtimeBundlePath: worldDbRuntimeBundlePath(),
  }
}

export async function discoverWorldDbSpainSelection(
  access: WorldDbSpainGameAccess = defaultWorldDbSpainAccess(),
): Promise<WorldDbSpainSelection> {
  const session = new WorldDbSessionV1({
    repository: access.repository ?? tauriWorldDatabaseRepository,
    databasePath: access.databasePath,
    runtimeBundlePath: access.runtimeBundlePath,
  })
  await session.open()
  try {
    const selection = await readWorldDbSpainSelection(session)
    session.close()
    return selection
  } catch (error) {
    session.close()
    throw error
  }
}

export async function createWorldDbSpainGame(
  teamId: string,
  access: WorldDbSpainGameAccess = defaultWorldDbSpainAccess(),
  gameBalance?: BdmGameBalancePreset,
  userCoachCreation?: UserCoachCreationInput,
): Promise<GameWorld> {
  if (typeof teamId !== 'string' || teamId.trim().length === 0) throw new Error('Select a Spain ACB team before starting the career.')
  const session = new WorldDbSessionV1({
    repository: access.repository ?? tauriWorldDatabaseRepository,
    databasePath: access.databasePath,
    runtimeBundlePath: access.runtimeBundlePath,
  })
  await session.open()
  try {
    const selection = await readWorldDbSpainSelection(session)
    const chosen = selection.teams.find((team) => team.key === teamId)
    if (chosen === undefined) throw new Error(`Selected Spain ACB team is not in the canonical World DB catalog: ${teamId}`)
    session.selectCompetitionSeasons([selection.competitionSeasonId, SPAIN_COPA_COMPETITION_SEASON_ID])
    const world = await session.bootstrapGameWorld({
      source: selection.source,
      ecosystemId: selection.ecosystemId,
      competitionId: selection.competitionId,
      competitionSeasonId: selection.competitionSeasonId,
      teamId: chosen.key,
    }, spainAcbCalendarForStartYear(2025))
    // MX0.6 closure: the canonical World DB bootstrap attaches the user coach to the selected club
    // but never created Board truth for it, so the Board surface showed its initialization
    // placeholder in an already-running career. Same canonical initializer the other universes use.
    // BDM Annual Authorization Continuity Policy V1 (see AnnualAuthorizationContinuityPolicy.ts): the shipped
    // Spain universe assigns the approved annual renewal policy to its clubs, explicitly and only here.
    const appointed = userCoachCreation === undefined ? world : appointCreatedUserCoachToWorldDbClub(world, teamIdFromString(chosen.key), userCoachCreation)
    const prepared = ensureUserClubBoardState(attachWorldDbSpainCup(appointed, session.getCompetitionFormat(SPAIN_COPA_COMPETITION_SEASON_ID)))
    // BDM_GAME_BALANCE_V1: World DB carries no opening balance (audited in FinanceOpeningState), so the preset supplies a
    // labeled-simulated opening treasury at activation and the generic simulated facility/governance bootstrap afterwards. It
    // never overwrites a documented fact: organizations with documented facilities or institutions are left untouched.
    const openingEconomicStates = gameBalance === undefined ? [] : gameBalanceOpeningEconomicStates(prepared, (organizationId) => {
      const resolution = resolveOrganizationCurrency(prepared, organizationId)
      return resolution.status === 'RESOLVED' ? String(resolution.currencyCode) : null
    })
    const financed = ensureCanonicalFinanceFoundation(prepared, { authorizationRenewalPolicies: annualAuthorizationContinuityAuthorities(prepared), ...(openingEconomicStates.length === 0 ? {} : { openingEconomicStates }) })
    return gameBalance === undefined ? financed : applyGameBalanceBootstrap(financed)
  } finally {
    session.close()
  }
}

async function readWorldDbSpainSelection(session: WorldDbSessionV1): Promise<WorldDbSpainSelection> {
  const catalog = await session.discoverSelectionCatalog()
  const ecosystem = catalog.ecosystems.find((row) => row.ecosystemId === SPAIN_ACB_ECOSYSTEM_ID && row.code === SPAIN_ACB_CODE)
  if (ecosystem === undefined) throw new Error('Canonical World DB ecosystem SPAIN_ACB is missing.')
  const competition = catalog.competitionAssignments.find((row) => row.ecosystemId === ecosystem.ecosystemId && row.competitionId === SPAIN_ACB_COMPETITION_ID)
  if (competition === undefined) throw new Error('Canonical World DB Spain ACB competition assignment is missing.')
  const season = catalog.competitionSeasons.find((row) => row.competitionSeasonId === SPAIN_ACB_COMPETITION_SEASON_ID && row.competitionId === competition.competitionId)
  if (season === undefined) throw new Error('Canonical World DB Spain ACB 2025-26 season is missing.')
  const memberships = catalog.teamMemberships
    .filter((row) => row.ecosystemId === ecosystem.ecosystemId && row.membershipStatus.toUpperCase() === 'ACTIVE')
    .sort((left, right) => left.teamName.localeCompare(right.teamName) || left.teamId.localeCompare(right.teamId))
  if (memberships.length !== 18) throw new Error(`Canonical World DB Spain ACB team catalog must contain 18 active teams; found ${memberships.length}.`)
  const teamIds = new Set<string>()
  for (const membership of memberships) {
    if (teamIds.has(membership.teamId)) throw new Error(`Canonical World DB Spain ACB catalog contains duplicate team ${membership.teamId}.`)
    teamIds.add(membership.teamId)
  }
  return {
    source: catalog.source,
    ecosystemId: ecosystem.ecosystemId,
    competitionId: competition.competitionId,
    competitionSeasonId: season.competitionSeasonId,
    teams: memberships.map(teamOption),
  }
}

function teamOption(membership: WorldDbSelectionTeamMembershipV1): WorldDbSpainTeamOption {
  return { key: membership.teamId, name: membership.teamName, code: membership.teamId }
}

export { WORLD_DB_SPAIN_UNIVERSE_ID }
