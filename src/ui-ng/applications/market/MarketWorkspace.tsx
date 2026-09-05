import { useMemo, useState } from 'react'

import { getFreeAgentMarketTerms } from '@/app/market'
import { organizationIdForTeam, type PlayerId } from '@/domain/ids'
import { formatRatingEvaluation, getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { getPlayerAge, type Player } from '@/domain/player'
import { canTeamAffordAdditionalSalary, getFreeAgents, getPlayerKnowledge, getTeamFinancialSnapshot } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'

type PositionFilter = 'ALL' | Player['basketball']['primaryPosition']

export function MarketWorkspace() {
  const world = useGameStore((state) => state.world)
  const signFreeAgent = useGameStore((state) => state.signFreeAgent)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PositionFilter>('ALL')
  const [selectedId, setSelectedId] = useState<PlayerId | undefined>()
  const team = world === null ? undefined : getUserTeam(world)

  const agents = useMemo(() => {
    if (world === null) return []
    return getFreeAgents(world).filter(
      (player) =>
        (position === 'ALL' || player.basketball.primaryPosition === position) &&
        `${player.firstName} ${player.lastName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
  }, [position, query, world])

  if (world === null || team === undefined) {
    return <NgHoloShell appLabel="Market" empty region="market-workspace" />
  }

  const finances = getTeamFinancialSnapshot(world, team.id)
  const selected = agents.find((player) => player.id === selectedId)
  const evaluate = (player: Player, dimension: string) =>
    formatRatingEvaluation(
      getOrganizationRatingEvaluation({
        organizationId: organizationIdForTeam(team.id),
        playerId: player.id,
        dimension,
        knowledge: world.organizationKnowledge,
        currentDate: world.currentDate,
        publicPosition: player.basketball.primaryPosition,
      }),
    )

  return (
    <NgHoloShell
      appLabel="Market"
      meta={`${agents.length} available · ${formatMoney(finances.remainingPlayerSalaryBudget)} remaining`}
      region="market-workspace"
      teamId={team.id}
      title="Free agents"
    >
      <div className="ng-canon__toolbar">
        <input aria-label="Search free agents" onChange={(event) => setQuery(event.target.value)} placeholder="Search players" value={query} />
        <select aria-label="Filter market by position" onChange={(event) => setPosition(event.target.value as PositionFilter)} value={position}>
          {(['ALL', 'PG', 'SG', 'SF', 'PF', 'C'] as const).map((value) => (
            <option key={value} value={value}>
              {value === 'ALL' ? 'All positions' : value}
            </option>
          ))}
        </select>
      </div>
      <div className="ng-canon__split">
        <div className="ng-canon__panel ng-holo-panel">
          {agents.length === 0 ? (
            <p className="ng-canon__empty">No available players.</p>
          ) : (
            <NgPrecisionTable
              className="ng-canon__table"
              columns={[
                ngCol('player', 'Player', (player) => (
                  <button
                    className="ng-canon__link"
                    onClick={(event) => {
                      event.stopPropagation()
                      navigateToPlayer(player.id)
                    }}
                    type="button"
                  >
                    {player.firstName} {player.lastName}
                  </button>
                ), { value: (player) => `${player.firstName} ${player.lastName}` }),
                ngCol('pos', 'Pos', (player) => <PlayPositionMark position={player.basketball.primaryPosition} />, {
                  value: (player) => player.basketball.primaryPosition,
                }),
                ngCol('age', 'Age', (player) => getPlayerAge(world, player.id), {
                  numeric: true,
                  value: (player) => getPlayerAge(world, player.id) ?? 0,
                }),
                ngCol('asking', 'Asking', (player) => formatMoney(getFreeAgentMarketTerms(world, player.id).annualSalary), {
                  numeric: true,
                  value: (player) => getFreeAgentMarketTerms(world, player.id).annualSalary,
                }),
              ]}
              gridId="ng-market-free-agents"
              onSelectionChange={(ids) => setSelectedId(ids[0] as PlayerId | undefined)}
              rows={agents}
              selectedId={selectedId}
            />
          )}
        </div>
        <aside className="ng-canon__inspector ng-holo-panel">
          {selected === undefined ? (
            <p className="ng-canon__empty">Select a free agent to inspect known information and the real contract ask.</p>
          ) : (
            <>
              <p className="ng-canon__eyebrow">Player inspector</p>
              <h3 className="ng-canon__title">
                {selected.firstName} {selected.lastName}
              </h3>
              <dl className="ng-canon__metrics">
                <NgMetric label="Position" value={<PlayPositionMark position={selected.basketball.primaryPosition} />} />
                <NgMetric label="Age" value={getPlayerAge(world, selected.id)} />
                <NgMetric label="Asking" value={formatMoney(getFreeAgentMarketTerms(world, selected.id).annualSalary)} />
                <NgMetric label="Term" value={`${getFreeAgentMarketTerms(world, selected.id).contractYears} years`} />
                <NgMetric label="Knowledge" value={getPlayerKnowledge(world, team.id, selected.id) === undefined ? 'Unknown' : 'Scouted'} />
                <NgMetric label="Finishing" value={evaluate(selected, 'finishing')} />
                <NgMetric label="Shooting" value={evaluate(selected, 'shooting')} />
                <NgMetric label="Creation" value={evaluate(selected, 'creation')} />
              </dl>
              <button
                className="ng-canon__action"
                disabled={!canTeamAffordAdditionalSalary(world, team.id, getFreeAgentMarketTerms(world, selected.id).annualSalary)}
                onClick={() => signFreeAgent(team.id, selected.id)}
                type="button"
              >
                {canTeamAffordAdditionalSalary(world, team.id, getFreeAgentMarketTerms(world, selected.id).annualSalary)
                  ? 'Sign player'
                  : 'Insufficient salary budget'}
              </button>
            </>
          )}
        </aside>
      </div>
    </NgHoloShell>
  )
}
