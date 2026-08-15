import { EntityActionRegistry } from './EntityActionRegistry'
import { PLAYER_ACTION_CATALOG } from './playerActions'
import { STAFF_ACTION_CATALOG } from './staffActions'
import { TEAM_ACTION_CATALOG } from './teamActions'

/** Assembled once outside React; runtime consumers receive a frozen registry. */
export const productionEntityActionRegistry = new EntityActionRegistry([PLAYER_ACTION_CATALOG, STAFF_ACTION_CATALOG, TEAM_ACTION_CATALOG]).freeze()
