import { useState } from 'react'
import './SquadScreen.css'
import { BASKETBALL_RATING_KEYS, getPlayerAge, type BasketballRatingKey, type Player } from '@/domain/player'
import { formatRatingEvaluation, getOrganizationRatingEvaluation, intelligenceSortValue } from '@/domain/intelligence'
import { organizationIdForTeam } from '@/domain/ids'
import { getCareerFatigueForPlayer, getCurrentPlayerContract, getCurrentPlayerInjury, getTeamRoster } from '@/domain/world'
import { formatInjuryKind } from '@/domain/injury'
import { getUserTeam } from '@/engine/calendar'
import { ATTRIBUTE_LABELS } from '@/ui/attributeLabels'
import { AppFrame } from '@/ui/desktop/AppFramework'
import type { DataGridColumn, DataGridView } from '@/ui/dataGrid'
import type { TeamId } from '@/domain/ids'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import { RosterSquadTable } from './RosterSquadTable'

type PositionFilter = 'ALL' | Player['basketball']['primaryPosition']
type SortKey = 'name' | 'position' | 'age' | 'fatigue' | BasketballRatingKey
type SortDirection = 'ascending' | 'descending'
const labels: Record<BasketballRatingKey, [string, string]> = { finishing: ['FIN', ATTRIBUTE_LABELS.finishing], shooting: ['SHO', ATTRIBUTE_LABELS.shooting], playmaking: ['PMK', ATTRIBUTE_LABELS.playmaking], perimeterDefense: ['PDE', ATTRIBUTE_LABELS.perimeterDefense], interiorDefense: ['IDE', ATTRIBUTE_LABELS.interiorDefense], rebounding: ['REB', ATTRIBUTE_LABELS.rebounding], athleticism: ['ATH', ATTRIBUTE_LABELS.athleticism] }
export const ROSTER_COLUMN_SIZING = { status: { width: 84 }, name: { width: 186, minWidth: 150, maxWidth: 300 }, position: { width: 46 }, age: { width: 42 }, body: { width: 58 }, rating: { width: 48 }, fatigue: { width: 52 }, salary: { width: 78 }, expiry: { width: 76 } } as const

export function filterAndSortRoster(world: Parameters<typeof getUserTeam>[0], players: readonly Player[], query: string, position: PositionFilter, sortKey: SortKey, direction: SortDirection) { const search = query.trim().toLocaleLowerCase(); const multiplier = direction === 'ascending' ? 1 : -1; return players.filter((player) => (position === 'ALL' || player.basketball.primaryPosition === position) && `${player.firstName} ${player.lastName}`.toLocaleLowerCase().includes(search)).slice().sort((left, right) => { const a = value(world, left, sortKey); const b = value(world, right, sortKey); return (typeof a === 'string' ? a.localeCompare(b as string) : a - (b as number)) * multiplier || left.id.localeCompare(right.id) }) }

export function SquadScreen({ world, teamId, onOpenEntity, onOpenSection, selectedPlayerId: initialSelected }: { readonly world: Parameters<typeof getUserTeam>[0]; readonly teamId?: TeamId; readonly onOpenEntity?: (destination: EntityDestination) => void; readonly onOpenSection?: (appId: 'squad' | 'training' | 'tactics' | 'coach') => void; readonly selectedPlayerId?: Player['id'] }) {
  const team = teamId === undefined ? getUserTeam(world) : world.teams[teamId]
  const [position, setPosition] = useState<PositionFilter>('ALL')
  const roster = team === undefined ? [] : getTeamRoster(world, team.id)
  const [selectedId, setSelectedId] = useState<Player['id'] | undefined>(() => initialSelected ?? roster[0]?.id)
  if (!team) return <section className="squad-app squad-app--empty">No team assigned to the user coach.</section>
  const columns: readonly DataGridColumn<Player>[] = [
    { id: 'status', label: 'STATUS', shortLabel: 'STATUS', sortable: true, searchable: true, ...ROSTER_COLUMN_SIZING.status, render: (player) => <PlayerStatus injury={getCurrentPlayerInjury(world, player.id)} />, value: (player) => getCurrentPlayerInjury(world, player.id)?.kind ?? 'ready' },
    { id: 'name', label: 'PLAYER', shortLabel: 'PLAYER', sortable: true, searchable: true, ...ROSTER_COLUMN_SIZING.name, render: (player) => <button className="squad-app__player-link" onClick={() => onOpenEntity?.({ type: 'player', playerId: player.id, section: 'overview' })} type="button">{player.firstName[0]}. {player.lastName}</button>, value: (player) => `${player.firstName} ${player.lastName}`, sortValue: (player) => `${player.lastName} ${player.firstName}` },
    { id: 'position', label: 'POSITION', shortLabel: 'POS', sortable: true, searchable: true, ...ROSTER_COLUMN_SIZING.position, render: (player) => player.basketball.primaryPosition, value: (player) => player.basketball.primaryPosition },
    { id: 'age', label: 'AGE', shortLabel: 'AGE', numeric: true, sortable: true, ...ROSTER_COLUMN_SIZING.age, render: (player) => getPlayerAge(world, player.id), value: (player) => getPlayerAge(world, player.id) },
    { id: 'height', label: 'HEIGHT', shortLabel: 'HT', numeric: true, sortable: true, ...ROSTER_COLUMN_SIZING.body, render: (player) => `${player.bio.heightCm} cm`, value: (player) => player.bio.heightCm },
    { id: 'weight', label: 'WEIGHT', shortLabel: 'WT', numeric: true, sortable: true, ...ROSTER_COLUMN_SIZING.body, render: (player) => `${player.bio.weightKg} kg`, value: (player) => player.bio.weightKg },
    ...BASKETBALL_RATING_KEYS.map((key) => ({ id: key, label: labels[key][1], shortLabel: labels[key][0], numeric: true, sortable: true, ...ROSTER_COLUMN_SIZING.rating, render: (player: Player) => { const evaluation=getOrganizationRatingEvaluation({organizationId:organizationIdForTeam(team.id),playerId:player.id,dimension:key==='playmaking'?'creation':key==='athleticism'?'physical':key,knowledge:world.organizationKnowledge,currentDate:world.currentDate,publicPosition:player.basketball.primaryPosition});return <span className="rating" title={labels[key][1]}>{formatRatingEvaluation(evaluation)}</span> }, value: (player: Player) => intelligenceSort(world, team.id, player, key) })),
    { id: 'fatigue', label: 'FATIGUE', shortLabel: 'FAT', numeric: true, sortable: true, ...ROSTER_COLUMN_SIZING.fatigue, render: (player) => getCareerFatigueForPlayer(world, player.id), value: (player) => getCareerFatigueForPlayer(world, player.id) },
    { id: 'salary', label: 'SALARY', shortLabel: 'SAL', numeric: true, sortable: true, ...ROSTER_COLUMN_SIZING.salary, render: (player) => { const contract = getCurrentPlayerContract(world, player.id); return contract === undefined ? '—' : compactMoney(contract.compensation.annualSalary) }, value: (player) => getCurrentPlayerContract(world, player.id)?.compensation.annualSalary ?? 0 },
    { id: 'expiry', label: 'CONTRACT EXPIRES', shortLabel: 'EXP', sortable: true, ...ROSTER_COLUMN_SIZING.expiry, render: (player) => getCurrentPlayerContract(world, player.id)?.term.expiresOn ?? '—', value: (player) => getCurrentPlayerContract(world, player.id)?.term.expiresOn ?? '' }
  ]
  const views: readonly DataGridView[] = [
    { id: 'overview', name: 'Overview', columnIds: ['status', 'name', 'position', 'age', 'height', 'finishing', 'shooting', 'playmaking', 'fatigue', 'salary'] },
    { id: 'ratings', name: 'Ratings', columnIds: ['status', 'name', 'position', 'age', ...BASKETBALL_RATING_KEYS, 'fatigue'] },
    { id: 'physical', name: 'Physical', columnIds: ['status', 'name', 'position', 'age', 'height', 'weight', 'athleticism', 'rebounding', 'fatigue'] },
    { id: 'contracts', name: 'Contracts', columnIds: ['status', 'name', 'position', 'age', 'salary', 'expiry'] }
  ]
  return <AppFrame><RosterSquadTable columns={columns} onOpenPlayer={(player) => onOpenEntity?.({ type: 'player', playerId: player.id, section: 'overview' })} onOpenSection={onOpenSection} onPositionChange={setPosition} onSelectedIdChange={setSelectedId} position={position} rows={roster} selectedId={selectedId} title={team.name} views={views} /></AppFrame>
}
function value(world: Parameters<typeof getUserTeam>[0], player: Player, key: SortKey): string | number { if (key === 'name') return `${player.lastName} ${player.firstName}`; if (key === 'position') return player.basketball.primaryPosition; if (key === 'age') return getPlayerAge(world, player.id); if (key === 'fatigue') return getCareerFatigueForPlayer(world, player.id); const team=getUserTeam(world);return team===undefined?101:intelligenceSort(world,team.id,player,key) }
function intelligenceSort(world: Parameters<typeof getUserTeam>[0], teamId: TeamId, player: Player, key: BasketballRatingKey): number { const evaluation=getOrganizationRatingEvaluation({organizationId:organizationIdForTeam(teamId),playerId:player.id,dimension:key==='playmaking'?'creation':key==='athleticism'?'physical':key,knowledge:world.organizationKnowledge,currentDate:world.currentDate,publicPosition:player.basketball.primaryPosition});return intelligenceSortValue(evaluation)??101 }
function compactMoney(value: number) { return value >= 1_000_000 ? `$${Math.round(value / 1_000_000)}M` : `$${Math.round(value / 1_000)}K` }
function PlayerStatus({ injury }: { readonly injury: ReturnType<typeof getCurrentPlayerInjury> }) { return injury === undefined ? <span className="squad-app__status squad-app__status--ready">Ready</span> : <span className="squad-app__status squad-app__status--injured" title={`${formatInjuryKind(injury.kind)} · expected return ${injury.expectedReturnDate}`}>Out · {injury.expectedReturnDate}</span> }
