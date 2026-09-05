import { getTeamStaffPresentation } from '@/ui/staffPresentation'
import { getBoardSummary } from '@/engine/board'
import { calculateTeamPayroll, calculateTeamSalaryStatus } from '@/engine/salary'
import { getContractYearCompensation, getPlayerContractStatus } from '@/domain/contract'
import { getUserTeam } from '@/engine/calendar'
import { resolveGameContext } from '@/ui/gameContext'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { navigateToTeamInNg, readNgWorkspaceNavigation, syncWorkspaceAppQuery, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

export function ClubWorkspace() {
  const world = useGameStore((state) => state.world)
  const navigation = useNgWorkspaceNavigation()
  const teamId = navigation.teamId ?? readNgWorkspaceNavigation().teamId
  if (world === null) {
    return <NgHoloShell appLabel="Club" empty emptyMessage="No career loaded." region="club-workspace" />
  }

  const userTeam = getUserTeam(world)
  const requested = teamId === null || teamId === undefined ? undefined : world.teams[teamId]
  const team = requested ?? userTeam
  if (team === undefined) {
    return <NgHoloShell appLabel="Club" empty region="club-workspace" />
  }

  const teamCompetition = Object.values(world.competitions).find((competition) =>
    competition.participantTeamIds.includes(team.id),
  )
  const context = resolveGameContext(world, teamCompetition?.id)
  const isOwnClub = userTeam?.id === team.id
  const staff = getTeamStaffPresentation(world, team.id)
  const board = getBoardSummary(world, team.id)
  const rules = world.salaryRulesBySeasonId[world.currentSeasonId]
  const contracts = Object.values(world.contractsById).filter(
    (contract) => contract.teamId === team.id && getPlayerContractStatus(contract, world.currentDate) === 'active',
  )
  const deadMoney = Object.values(world.deadMoneyChargesById)
    .filter((charge) => charge.teamId === team.id && charge.seasonId === world.currentSeasonId)
    .reduce((sum, charge) => sum + charge.amount, 0)
  const salary = rules === undefined ? undefined : calculateTeamSalaryStatus(rules, calculateTeamPayroll(contracts, world.currentDate, deadMoney))
  const links: readonly { readonly id: WorkspaceAppId; readonly label: string }[] = isOwnClub
    ? [
        { id: 'staff', label: 'Staff' },
        { id: 'board', label: 'Board' },
        { id: 'finances', label: 'Finances' },
        { id: 'enforcement', label: 'Compliance' },
      ]
    : []

  return (
    <NgHoloShell
      appLabel="Club"
      meta={`${context.competitionName ?? '—'} · ${context.seasonLabel ?? '—'}`}
      region="club-workspace"
      teamId={team.id}
      title={team.name}
    >
      <div className="ng-canon__overview">
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Identity</p>
          <h3 className="ng-canon__title">{team.name}</h3>
          <dl className="ng-canon__metrics">
            <NgMetric label="Ecosystem" value={context.ecosystemName ?? '—'} />
            <NgMetric label="Roster" value={team.rosterPlayerIds.length} />
            <NgMetric label="Staff" value={staff.length} />
          </dl>
        </section>
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Board</p>
          <h3 className="ng-canon__title">{board === undefined ? 'Pending' : board.jobSecurity}</h3>
          <dl className="ng-canon__metrics">
            <NgMetric label="Confidence" value={board?.state.confidence ?? '—'} />
            <NgMetric label="Expectation" value={board?.state.expectation.summary ?? 'Not initialized'} />
          </dl>
        </section>
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Payroll</p>
          <h3 className="ng-canon__title">{salary === undefined ? 'No cap rules' : formatMoney(salary.payroll.totalCapHit)}</h3>
          <dl className="ng-canon__metrics">
            <NgMetric label="Cap space" value={salary === undefined ? '—' : formatMoney(salary.capSpace)} />
            <NgMetric label="Active contracts" value={contracts.length} />
            <NgMetric
              label="Year cash"
              value={formatMoney(contracts.reduce((sum, contract) => sum + getContractYearCompensation(contract, world.currentDate).cashSalary, 0))}
            />
          </dl>
        </section>
      </div>
      <div className="ng-canon__actions" style={{ marginTop: 'var(--ng-spacing-12)' }}>
        <button
          className="ng-canon__action"
          onClick={() => navigateToTeamInNg({ type: 'team', teamId: team.id, section: 'squad' })}
          type="button"
        >
          Roster
        </button>
        {links.map((link) => (
          <button className="ng-canon__action" key={link.id} onClick={() => syncWorkspaceAppQuery(link.id)} type="button">
            {link.label}
          </button>
        ))}
      </div>
    </NgHoloShell>
  )
}
