import { useMemo, useState } from 'react'
import { compareGameDates } from '@/domain/date'
import { getContractYearCompensation, getPlayerContractStatus } from '@/domain/contract'
import { getContractFinancialScheduleAmounts } from '@/domain/finance'
import { getUserTeam } from '@/engine/calendar'
import { assessContractRelease } from '@/app/market/ContractReleaseService'
import { assessContractReviewOutlook } from '@/engine/clubNeeds'
import { useGameStore } from '@/stores/gameStore'
import { RetentionPanel } from '@/ui-ng/applications/analysis/ClubStrategyScreen'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'expiring', label: 'Expiring' },
  { id: 'negotiations', label: 'Negotiations' },
  { id: 'future', label: 'Signed future' },
  { id: 'release', label: 'Release / risk' },
  { id: 'history', label: 'History' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

function playerName(world: NonNullable<ReturnType<typeof useGameStore.getState>['world']>, playerId: string) {
  const player = world.players[playerId as keyof typeof world.players]
  return player === undefined ? 'Unknown player' : `${player.firstName} ${player.lastName}`
}

export function ContractsWorkspace() {
  const world = useGameStore((state) => state.world)
  const decideReview = useGameStore((state) => state.decideContractReview)
  const openRetention = useGameStore((state) => state.openContractRetention)
  const submitOffer = useGameStore((state) => state.submitContractRetentionOffer)
  const acceptCounter = useGameStore((state) => state.acceptContractRetentionCounter)
  const withdraw = useGameStore((state) => state.withdrawContractRetention)
  const requestSigning = useGameStore((state) => state.requestRetentionSigning)
  const recordSigningDecision = useGameStore((state) => state.recordFreeAgentSigningDecision)
  const releasePlayer = useGameStore((state) => state.releasePlayer)
  const [section, setSection] = useState<SectionId>('overview')
  const [releasePlayerId, setReleasePlayerId] = useState<string | null>(null)

  const team = world === null ? undefined : getUserTeam(world)
  const contracts = useMemo(() => world === null || team === undefined ? [] : Object.values(world.contractsById)
    .filter((contract) => contract.teamId === team.id)
    .sort((a, b) => a.term.expiresOn.localeCompare(b.term.expiresOn) || a.playerId.localeCompare(b.playerId)), [team?.id, world])
  const reviews = world === null || team === undefined ? [] : assessContractReviewOutlook(world, team.id).reviews
  const currentContracts = contracts.filter((contract) => world !== null && getPlayerContractStatus(contract, world.currentDate) === 'active')
  const futureContracts = contracts.filter((contract) => world !== null && getPlayerContractStatus(contract, world.currentDate) === 'scheduled')
  const seasonEnd = world?.seasons[world.currentSeasonId]?.endDate
  const expiringContracts = currentContracts.filter((contract) => seasonEnd !== undefined && compareGameDates(contract.term.expiresOn, world!.currentDate) > 0 && compareGameDates(contract.term.expiresOn, seasonEnd) <= 0)

  if (world === null || team === undefined) return <NgHoloShell appLabel="Contracts / Planning" empty emptyMessage="No user club is available." region="contracts-workspace" />

  const renderContractRows = (items: typeof contracts) => items.length === 0
    ? <p className="ng-canon__empty">{section === 'expiring' ? 'No expiring contracts this season.' : 'No contracts to show.'}</p>
    : <div className="ng-canon__panel" style={{ overflowX: 'auto' }}><table><thead><tr><th>Player</th><th>Contract</th><th>Compensation</th><th>Lineage / approval</th><th>Planning</th></tr></thead><tbody>{items.map((contract) => {
      const player = world.players[contract.playerId]
      const compensation = getContractYearCompensation(contract, world.currentDate)
      const successor = Object.values(world.contractsById).find((item) => item.predecessorContractId === contract.id)
      const predecessor = contract.predecessorContractId === undefined ? undefined : world.contractsById[contract.predecessorContractId]
      const retentionExecution = Object.values(world.retentionNegotiationsById).find((item) => item.execution?.contractId === contract.id)?.execution
      const signedTransaction = Object.values(world.playerTransactionsById).find((item) => item.contractId === contract.id && item.kind === 'signedFreeAgent')
      const review = reviews.find((item) => item.contractId === contract.id)
      const rolePromise = Object.values(world.rolePromisesById).find((item) => item.playerId === contract.playerId && item.teamOrganizationId === team.organizationId && item.status === 'ACTIVE')
      const negotiation = Object.values(world.retentionNegotiationsById).find((item) => item.predecessorContractId === contract.id && !['REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(item.status))
      const status = getPlayerContractStatus(contract, world.currentDate)
      const capRules = world.salaryRulesBySeasonId[world.currentSeasonId]
      const cappedSalary = capRules !== undefined && capRules.capAccounting !== 'NOT_APPLICABLE' && compensation.capTreatment?.policy !== 'NOT_APPLICABLE'
      const contractStatus = status === 'active' && seasonEnd !== undefined && compareGameDates(contract.term.expiresOn, seasonEnd) <= 0 ? 'Expiring' : status === 'active' ? 'Active' : status === 'scheduled' ? 'Signed for future' : status
      const signedOn = retentionExecution?.signedOn ?? signedTransaction?.occurredOn
      return <tr key={contract.id}>
        <td><button type="button" onClick={() => navigateToPlayer(contract.playerId)}>{player?.firstName ?? 'Unknown'} {player?.lastName ?? ''}</button><div>{player?.basketball.primaryPosition ?? '?'}</div></td>
        <td>{contractStatus}<div>Through {contract.term.expiresOn}</div></td>
        <td>{compensation.cashSalary.toLocaleString()} contract units{cappedSalary ? ` ? cap ${compensation.capHit.toLocaleString()}` : ''}<div>{compensation.guaranteedAmount.toLocaleString()} guaranteed</div></td>
        <td>{successor !== undefined ? `Future successor starts ${successor.term.startsOn}` : predecessor !== undefined ? `Successor of contract ending ${predecessor.term.expiresOn}` : 'No successor'}<div>{signedOn === undefined ? 'No recorded signing date' : `Signed ${signedOn}`}</div>{retentionExecution?.governanceDecisionId !== undefined && <div>Governance: {retentionExecution.governanceDecisionId}</div>}</td>
        <td>{review?.decision?.replaceAll('_', ' ') ?? 'No intent'}{rolePromise !== undefined && <div>Role promise active</div>}{negotiation !== undefined && <div>Negotiating</div>}{team.coachId === world.userCoachId && <div><select aria-label={`Planning intent for ${playerName(world, contract.playerId)}`} value={review?.decision ?? ''} onChange={(event) => { if (event.target.value) decideReview(team.id, contract.id, event.target.value as 'PURSUE_EXTENSION' | 'ALLOW_EXPIRY' | 'REVIEW_RELEASE' | 'DEFER') }}><option value="">Set intent</option><option value="PURSUE_EXTENSION">Pursue extension</option><option value="ALLOW_EXPIRY">Allow expiry</option><option value="REVIEW_RELEASE">Review release</option><option value="DEFER">Defer</option></select></div>}</td>
      </tr>
    })}</tbody></table></div>

  const futureObligations = futureContracts.flatMap((contract) => getContractFinancialScheduleAmounts(world, { contractId: contract.id, includeConditional: false }).map((entry) => ({ contract, entry })))
  const guaranteedExposure = contracts.flatMap((contract) => getContractFinancialScheduleAmounts(world, { contractId: contract.id, includeConditional: false })
    .filter((entry) => compareGameDates(entry.effectiveOn, world.currentDate) >= 0).map((entry) => ({ contract, entry })))
  const releaseAssessment = releasePlayerId === null ? undefined : assessContractRelease(world, team.id, releasePlayerId as never)
  const historyContracts = contracts.filter((contract) => contract.termination !== undefined || contract.predecessorContractId !== undefined || getPlayerContractStatus(contract, world.currentDate) === 'expired')

  return <NgHoloShell appLabel="Contracts / Planning" title={team.name} meta={`${currentContracts.length} current · ${expiringContracts.length} expiring`} region="contracts-workspace" teamId={team.id} tabs={SECTIONS} activeTabId={section} onTabSelect={(id) => setSection(id as SectionId)}>
    {section === 'overview' && <section aria-label="Current contracts"><h2>Current roster contracts</h2>{renderContractRows(currentContracts)}<h3>Guaranteed Finance exposure</h3>{guaranteedExposure.length === 0 ? <p>No guaranteed payroll is scheduled.</p> : <ul>{guaranteedExposure.map(({ contract, entry }) => <li key={`${contract.id}:${entry.effectiveOn}`}>{playerName(world, contract.playerId)} · {entry.effectiveOn} · {entry.amountMinorUnits.toLocaleString()} contract units guaranteed</li>)}</ul>}</section>}
    {section === 'expiring' && <section aria-label="Expiring contracts"><h2>Expiring and planning</h2>{renderContractRows(expiringContracts)}</section>}
    {section === 'negotiations' && <section aria-label="Contract negotiations"><h2>Negotiations</h2>{Object.values(world.retentionNegotiationsById).filter((item) => item.teamId === team.id && !['REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(item.status)).length === 0 && <p>No open negotiations.</p>}<RetentionPanel world={world} teamId={team.id} isUserTeam={team.coachId === world.userCoachId} onOpen={openRetention} onSubmitOffer={submitOffer} onAcceptCounter={acceptCounter} onWithdraw={withdraw} onRequestSigning={requestSigning} onRecordSigningDecision={recordSigningDecision} /></section>}
    {section === 'future' && <section aria-label="Signed future contracts"><h2>Signed for future</h2>{futureContracts.length === 0 ? <p className="ng-canon__empty">No future contracts.</p> : <>{renderContractRows(futureContracts)}<h3>Future guaranteed exposure</h3>{futureObligations.length === 0 ? <p>No future guarantees scheduled.</p> : <ul>{futureObligations.map(({ contract, entry }) => <li key={`${contract.id}:${entry.effectiveOn}`}>{playerName(world, contract.playerId)} · {entry.effectiveOn} · {entry.amountMinorUnits.toLocaleString()} contract units guaranteed · successor of {contract.predecessorContractId ?? 'none'}</li>)}</ul>}</>}</section>}
    {section === 'release' && <section aria-label="Release and risk"><h2>Release / risk</h2><p>Capped release economics remain blocked where no canonical release treatment exists.</p><label>Player <select value={releasePlayerId ?? ''} onChange={(event) => setReleasePlayerId(event.target.value || null)}><option value="">Choose a roster player</option>{team.rosterPlayerIds.map((id) => <option key={id} value={id}>{playerName(world, id)}</option>)}</select></label>{releaseAssessment !== undefined && <div className="ng-canon__panel"><h3>{releaseAssessment.status === 'READY' ? 'Release preview' : `Release blocked · ${releaseAssessment.status.replaceAll('_', ' ').toLowerCase()}`}</h3><p>Contracts affected: {releaseAssessment.contractIds.length ? releaseAssessment.contractIds.join(', ') : 'none'}</p>{releaseAssessment.status === 'READY' || releaseAssessment.status === 'ALREADY_TERMINATED' ? <><p>{releaseAssessment.status === 'READY' ? 'Player leaves the roster; linked scheduled successors terminate.' : 'Release is already recorded.'}</p><p>Guaranteed Finance schedule: {releaseAssessment.financeConsequences.length === 0 ? 'none scheduled' : releaseAssessment.financeConsequences.map((item) => `${item.effectiveOn} ${item.amount.toLocaleString()} ${item.currencyCode ?? 'contract units'}`).join(' · ')}</p>{releaseAssessment.status === 'READY' && <button type="button" onClick={() => { if (window.confirm(`Release ${playerName(world, releasePlayerId!)}?`)) releasePlayer(team.id, releasePlayerId as never) }}>Execute release</button>}</> : <p>{releaseAssessment.reason}</p>}</div>}</section>}
    {section === 'history' && <section aria-label="Contract history"><h2>Contract lineage and history</h2>{historyContracts.length === 0 ? <p className="ng-canon__empty">No linked or completed contracts.</p> : historyContracts.map((contract) => {
      const transactions = Object.values(world.playerTransactionsById).filter((item) => item.contractId === contract.id || (item.playerId === contract.playerId && item.fromTeamId === team.id))
      return <article className="ng-canon__panel" key={contract.id}><h3>{playerName(world, contract.playerId)} · {contract.term.startsOn}–{contract.term.expiresOn}</h3><p>{contract.termination === undefined ? getPlayerContractStatus(contract, world.currentDate) === 'scheduled' ? 'Signed for future' : getPlayerContractStatus(contract, world.currentDate) : `Released ${contract.termination.terminatedOn}`}{contract.predecessorContractId === undefined ? '' : ` · predecessor ${contract.predecessorContractId}`}</p>{transactions.map((item) => <p key={item.id}>{item.kind.replaceAll(/([A-Z])/g, ' $1').toLowerCase()} · {item.occurredOn}</p>)}</article>
    })}</section>}
  </NgHoloShell>
}
