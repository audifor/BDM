import { useState } from 'react'
import { getFreeAgentMarketTerms } from '@/app/market'
import { getPlayerAge, type Player } from '@/domain/player'
import { formatRatingEvaluation, getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { organizationIdForTeam } from '@/domain/ids'
import { canTeamAffordAdditionalSalary, getFreeAgents, getPlayerKnowledge, getTeamFinancialSnapshot, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import type { PlayerId } from '@/domain/ids'
import { formatMoney } from '@/ui/formatters'
import { AppFrame, AppHeader, DataTable, DetailGroup, SplitWorkspace, type DataColumn } from '@/ui/desktop/AppFramework'
import { BdmButton, Input, Select } from '@/ui/components/designSystem'

type PositionFilter = 'ALL' | Player['basketball']['primaryPosition']
export function MarketScreen({ world, onSign }: { readonly world: GameWorld; readonly onSign: (playerId: PlayerId) => void }) {
  const team = getUserTeam(world); const [query, setQuery] = useState(''); const [position, setPosition] = useState<PositionFilter>('ALL'); const [selectedId, setSelectedId] = useState<PlayerId | undefined>()
  if (!team) return null
  const finances = getTeamFinancialSnapshot(world, team.id)
  const agents = getFreeAgents(world).filter((player) => (position === 'ALL' || player.basketball.primaryPosition === position) && `${player.firstName} ${player.lastName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const selected = agents.find((player) => player.id === selectedId)
  const columns: readonly DataColumn<Player>[] = [
    { id: 'player', label: 'PLAYER', minWidth: 150, flex: 2, render: (player) => `${player.firstName} ${player.lastName}` }, { id: 'position', label: 'POS', width: 48, render: (player) => player.basketball.primaryPosition }, { id: 'age', label: 'AGE', numeric: true, width: 46, render: (player) => getPlayerAge(world, player.id) }, { id: 'potential', label: 'POT', width: 52, render: (player) => formatRatingEvaluation(getOrganizationRatingEvaluation({organizationId:organizationIdForTeam(team.id),playerId:player.id,dimension:'potential:physical',knowledge:world.organizationKnowledge,currentDate:world.currentDate,publicPosition:player.basketball.primaryPosition})) },
    ...(['finishing', 'shooting', 'playmaking', 'perimeterDefense', 'interiorDefense', 'rebounding', 'athleticism'] as const).map((key) => ({ id: key, label: key.slice(0, 3).toUpperCase(), numeric: true, width: 48, render: (player: Player) => formatRatingEvaluation(getOrganizationRatingEvaluation({organizationId:organizationIdForTeam(team.id),playerId:player.id,dimension:key==='playmaking'?'creation':key==='athleticism'?'physical':key,knowledge:world.organizationKnowledge,currentDate:world.currentDate,publicPosition:player.basketball.primaryPosition})) })),
    { id: 'asking', label: 'ASKING', numeric: true, minWidth: 76, flex: 0.6, render: (player) => formatMoney(getFreeAgentMarketTerms(world, player.id).annualSalary) },
  ]
  return <AppFrame header={<AppHeader eyebrow="COACHING MARKET" meta={`${agents.length} available · ${formatMoney(finances.remainingPlayerSalaryBudget)} remaining`} title="Free agents" />} toolbar={<><Input aria-label="Search free agents" onChange={(event) => setQuery(event.target.value)} placeholder="Search players" type="search" value={query} /><Select ariaLabel="Filter market by position" onChange={(value) => setPosition(value as PositionFilter)} options={(['ALL', 'PG', 'SG', 'SF', 'PF', 'C'] as const).map((value) => ({ value, label: value === 'ALL' ? 'All positions' : value }))} value={position} /></>}><SplitWorkspace inspector={<MarketInspector onSign={onSign} player={selected} teamId={team.id} world={world} />}><DataTable columns={columns} emptyTitle="No available players" gridId="free-agents" multiSelect onRowClick={(player) => setSelectedId(player.id)} rows={agents} selectedId={selectedId} /></SplitWorkspace></AppFrame>
}

function MarketInspector({ onSign, player, teamId, world }: { readonly onSign: (playerId: PlayerId) => void; readonly player: Player | undefined; readonly teamId: string; readonly world: GameWorld }) {
  if (!player) return <aside className="market-inspector"><p className="eyebrow">PLAYER INSPECTOR</p><p>Select a free agent to review known information and the real contract ask.</p></aside>
  const terms = getFreeAgentMarketTerms(world, player.id); const knowledge = getPlayerKnowledge(world, teamId as never, player.id); const affordable = canTeamAffordAdditionalSalary(world, teamId as never, terms.annualSalary)
  return <aside className="market-inspector"><p className="eyebrow">PLAYER INSPECTOR</p><h2>{player.firstName} {player.lastName}</h2><p>{player.basketball.primaryPosition} · {getPlayerAge(world, player.id)} years</p><DetailGroup title="Market terms"><dl><div><dt>Asking</dt><dd>{formatMoney(terms.annualSalary)}</dd></div><div><dt>Term</dt><dd>{terms.contractYears} years</dd></div><div><dt>Knowledge</dt><dd>{knowledge === undefined ? 'Unknown' : 'Scouted'}</dd></div></dl></DetailGroup><BdmButton disabled={!affordable} onClick={() => onSign(player.id)} variant="primary">{affordable ? 'Sign player' : 'Insufficient salary budget'}</BdmButton></aside>
}
