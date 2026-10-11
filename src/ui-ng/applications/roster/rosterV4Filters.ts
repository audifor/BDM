import { getPlayerAge, type Player } from '@/domain/player'
import type { TeamId } from '@/domain/ids'
import { isPlayerInClubRoster } from './rosterClubPresence'
import { getCareerFatigueForPlayer, getCurrentPlayerContract, getCurrentPlayerInjury, type GameWorld } from '@/domain/world'

/** Courtside Roster filters are display-only; canonical Player/Contract/Injury data remains the authority. */
export type RosterFilterField = 'position' | 'age' | 'nationality' | 'fatigue' | 'height' | 'contract'
export type RosterFilterOperator = 'equals' | 'gte' | 'lte'
export interface RosterFilterCondition {
  readonly id: string
  readonly field: RosterFilterField
  readonly operator: RosterFilterOperator
  readonly value: string
}
export interface RosterFilterGroup {
  readonly id: string
  readonly operator: 'AND' | 'OR'
  readonly conditions: readonly RosterFilterCondition[]
}
export interface RosterV4Filters {
  readonly availability: 'all' | 'without-injury' | 'injured'
  readonly club?: 'all' | 'in' | 'out'
  readonly ageMax: number | null
  readonly contract: 'all' | 'expiring' | 'active' | 'none'
  readonly groups: readonly RosterFilterGroup[]
  readonly groupOperator: 'AND' | 'OR'
}

export const EMPTY_ROSTER_V4_FILTERS: RosterV4Filters = {
  availability: 'all', club:'all', ageMax: null, contract: 'all', groups: [], groupOperator: 'AND',
}
export const ROSTER_FILTER_FIELDS: readonly { id: RosterFilterField; label: string; numeric: boolean }[] = [
  {id: 'position', label: 'Posición principal', numeric: false},
  {id: 'age', label: 'Edad', numeric: true},
  {id: 'nationality', label: 'Nacionalidad', numeric: false},
  {id: 'fatigue', label: 'Fatiga', numeric: true},
  {id: 'height', label: 'Altura (cm)', numeric: true},
  {id: 'contract', label: 'Contrato (activo / expira / ninguno)', numeric: false},
]

export function rosterContractStatus(world: GameWorld, player: Player): 'active' | 'expiring' | 'none' {
  const contract = getCurrentPlayerContract(world, player.id)
  if (contract === undefined) return 'none'
  const endOfSeason = world.seasons[world.currentSeasonId]?.endDate
  return endOfSeason !== undefined && contract.term.expiresOn <= endOfSeason ? 'expiring' : 'active'
}

function fieldValue(world: GameWorld, player: Player, field: RosterFilterField): string | number {
  switch (field) {
    case 'position': return player.basketball.primaryPosition
    case 'age': return getPlayerAge(world, player.id)
    case 'nationality': return String(player.nationalityId)
    case 'fatigue': return getCareerFatigueForPlayer(world, player.id)
    case 'height': return player.bio.heightCm
    case 'contract': return rosterContractStatus(world, player)
  }
}

function matchesCondition(world: GameWorld, player: Player, condition: RosterFilterCondition): boolean {
  const current = fieldValue(world, player, condition.field)
  if (condition.operator === 'equals') {
    return String(current).toLowerCase() === condition.value.trim().toLowerCase()
  }
  const target = Number(condition.value)
  if (condition.value.trim() === '' || !Number.isFinite(target) || typeof current !== 'number') return false
  return condition.operator === 'gte' ? current >= target : current <= target
}

export function matchesRosterV4Filters(world: GameWorld, player: Player, filters: RosterV4Filters, teamId?:TeamId): boolean {
  if (filters.club !== undefined && filters.club !== 'all' && teamId !== undefined) {
    const present=isPlayerInClubRoster(world,teamId,player)
    if(filters.club==='in' && !present) return false
    if(filters.club==='out' && present) return false
  }
  const injured = getCurrentPlayerInjury(world, player.id) !== undefined
  if (filters.availability === 'without-injury' && injured) return false
  if (filters.availability === 'injured' && !injured) return false
  if (filters.ageMax !== null && getPlayerAge(world, player.id) > filters.ageMax) return false
  if (filters.contract !== 'all' && rosterContractStatus(world, player) !== filters.contract) return false
  const nonemptyGroups = filters.groups.filter(group => group.conditions.length > 0)
  if (nonemptyGroups.length === 0) return true
  const groupMatches = nonemptyGroups.map(group => group.operator === 'AND'
    ? group.conditions.every(condition => matchesCondition(world, player, condition))
    : group.conditions.some(condition => matchesCondition(world, player, condition)))
  return filters.groupOperator === 'AND' ? groupMatches.every(Boolean) : groupMatches.some(Boolean)
}
