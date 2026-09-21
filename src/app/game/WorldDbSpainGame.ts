import type { GameWorld } from '@/domain/world'
import type { WorldDbSelectionCatalogV1, WorldDbSelectionTeamMembershipV1 } from '@/domain/worldDb/SelectionCatalog'
import { tauriWorldDatabaseRepository, type WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { WORLD_DB_SPAIN_UNIVERSE_ID } from './NewGameUniverseCatalog'
import { WorldDbSessionV1, type WorldDbSessionAccessV1 } from './WorldDbSession'
import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'
import { worldDbDatabasePath, worldDbRuntimeBundlePath } from './WorldDbRuntimeConfig'
import { spainAcbCalendarForStartYear } from '@/data/worldCompetitionCalendars'
import { attachWorldDbSpainCup } from './WorldDbSpainCupBootstrap'

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
    return attachWorldDbSpainCup(world, session.getCompetitionFormat(SPAIN_COPA_COMPETITION_SEASON_ID))
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
