import { useEffect, useState } from 'react'
import { getContractYearCompensation, getPlayerContractStatus } from '@/domain/contract'
import type { GameWorld } from '@/domain/world'
import type { ContractId, TeamId } from '@/domain/ids'
import type { ContractReviewIntent } from '@/domain/contract/ContractReviewDecision'
import type { ContractClauseProposal, ContractIncentiveProposal, ContractOptionProposal, RetentionTermSet } from '@/domain/contract/ContractRetentionNegotiation'
import { assessRetentionEligibility, derivedRetentionStatus } from '@/engine/contractRetention/ContractRetentionEngine'
import type { NegotiationResponsibleActor } from '@/domain/market'
import { assessClubStrategy } from '@/engine/clubStrategy/ClubStrategyEngine'
import type { ClubNeedKind } from '@/engine/clubNeeds'
import { assessGMDecisionContext, type GMResponseOptionKind } from '@/engine/gmDecisionContext'
import { assessContractReviewOutlook } from '@/engine/clubNeeds'
import { inspectGMPlanWorkflows } from '@/app/gmPlanning'
import { assessRoutedAcquisitionProposalIntelligence, assessRoutedFreeAgentOfferIntelligence, assessRoutedMarketCandidateFeasibility } from '@/app/marketIntelligence'
import { navigateToContracts } from '@/ui-ng/workspace/workspaceApps'
import { resolveGovernanceDecisionRights } from '@/domain/governance'
import { assessRetentionBindingTerms } from '@/app/contractRetention/RetentionSigningService'

const REASON_LABELS: Readonly<Record<string, string>> = {
  FINANCIAL_STRESS: 'Financial pressure',
  TITLE_WINDOW: 'Strong competitive window',
  AGING_CORE: 'Veteran roster core',
  YOUNG_CORE: 'Young roster core',
  OWNER_PRESSURE: 'Ownership direction',
  BOARD_PRESSURE: 'Board pressure',
  GOVERNANCE_PRESSURE: 'Institutional objectives',
  UNDERPERFORMING: 'Below-positioned results',
  OVERPERFORMING: 'Above-positioned results',
  CONTRACT_EXPIRY_CLUSTER: 'Cluster of expiring contracts',
  STRONG_FUTURE_POSITION: 'Stable future position',
  ROSTER_DEPTH_RISK: 'Limited roster depth',
}

export function RetentionPanel({ world, teamId, isUserTeam, onOpen, onSubmitOffer, onAcceptCounter, onWithdraw, onRequestSigning, onRecordSigningDecision }: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly isUserTeam: boolean
  readonly onOpen?: (teamId: TeamId, contractId: ContractId, actionId: string) => void
  readonly onSubmitOffer?: (teamId: TeamId, negotiationId: string, expectedRound: number, actionId: string, terms: RetentionTermSet) => void
  readonly onAcceptCounter?: (teamId: TeamId, negotiationId: string, expectedRound: number, actionId: string) => void
  readonly onWithdraw?: (teamId: TeamId, negotiationId: string, actionId: string) => void
  readonly onRequestSigning?: (teamId: TeamId, negotiationId: string, proposerBodyId?: string) => void
  readonly onRecordSigningDecision?: (decisionId: string, kind: 'APPROVED', bodyId: string) => void
}) {
  const relevant = Object.values(world.contractsById).filter((contract) => contract.teamId === teamId && (
    getPlayerContractStatus(contract, world.currentDate) === 'active'
    || Object.values(world.retentionNegotiationsById).some((negotiation) => negotiation.teamId === teamId && negotiation.predecessorContractId === contract.id)
  )).sort((a, b) => a.term.expiresOn.localeCompare(b.term.expiresOn) || a.id.localeCompare(b.id))
  return <section aria-label="Contract retention negotiations">
    <h3>Retention negotiations</h3>
    <p>Agreements here are nonbinding. No successor contract, roster place, Finance obligation, or Governance approval is created.</p>
    {relevant.length === 0 ? <p>No active or previously negotiated predecessor contracts.</p> : relevant.map((contract) => {
      const player = world.players[contract.playerId]
      const salary = getContractYearCompensation(contract, world.currentDate).cashSalary || contract.compensation.annualSalary
      const eligibility = assessRetentionEligibility(world, teamId, contract.id)
      const negotiation = Object.values(world.retentionNegotiationsById).filter((item) => item.teamId === teamId && item.predecessorContractId === contract.id).sort((a, b) => b.openedOn.localeCompare(a.openedOn) || b.id.localeCompare(a.id))[0]
      return <RetentionContractCard key={contract.id} world={world} teamId={teamId} contractId={contract.id} playerName={`${player?.firstName ?? 'Unknown'} ${player?.lastName ?? ''}`} expiresOn={contract.term.expiresOn} salary={salary} eligibilityReasons={eligibility.reasons} retentionWindowDays={eligibility.retentionWindowDays} isUserTeam={isUserTeam} negotiation={negotiation} onOpen={onOpen} onSubmitOffer={onSubmitOffer} onAcceptCounter={onAcceptCounter} onWithdraw={onWithdraw} onRequestSigning={onRequestSigning} onRecordSigningDecision={onRecordSigningDecision} />
    })}
  </section>
}

function RetentionContractCard({ world, teamId, contractId, playerName, expiresOn, salary, eligibilityReasons, retentionWindowDays, isUserTeam, negotiation, onOpen, onSubmitOffer, onAcceptCounter, onWithdraw, onRequestSigning, onRecordSigningDecision }: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly contractId: ContractId
  readonly playerName: string
  readonly expiresOn: string
  readonly salary: number
  readonly eligibilityReasons: readonly string[]
  readonly retentionWindowDays?: number
  readonly isUserTeam: boolean
  readonly negotiation?: GameWorld['retentionNegotiationsById'][string]
  readonly onOpen?: (teamId: TeamId, contractId: ContractId, actionId: string) => void
  readonly onSubmitOffer?: (teamId: TeamId, negotiationId: string, expectedRound: number, actionId: string, terms: RetentionTermSet) => void
  readonly onAcceptCounter?: (teamId: TeamId, negotiationId: string, expectedRound: number, actionId: string) => void
  readonly onWithdraw?: (teamId: TeamId, negotiationId: string, actionId: string) => void
  readonly onRequestSigning?: (teamId: TeamId, negotiationId: string, proposerBodyId?: string) => void
  readonly onRecordSigningDecision?: (decisionId: string, kind: 'APPROVED', bodyId: string) => void
}) {
  const [offerSalary, setOfferSalary] = useState(String(salary))
  const [years, setYears] = useState('1')
  const [agentFee, setAgentFee] = useState('')
  const [role, setRole] = useState('')
  const [optionTypesByYear, setOptionTypesByYear] = useState<Record<number, ContractOptionProposal['type'] | ''>>({})
  const [guaranteeAmountsByYear, setGuaranteeAmountsByYear] = useState<Record<number, string>>({})
  const [incentives, setIncentives] = useState<ContractIncentiveProposal[]>([])
  const [playerTradeConsent, setPlayerTradeConsent] = useState(false)
  useEffect(() => {
    if (negotiation?.currentTerms === undefined) return
    setOfferSalary(String(negotiation.currentTerms.salary))
    setYears(String(negotiation.currentTerms.years))
    setAgentFee(negotiation.currentTerms.agentFee === undefined ? '' : String(negotiation.currentTerms.agentFee))
    setRole(negotiation.currentTerms.role ?? '')
    setOptionTypesByYear(Object.fromEntries((negotiation.currentTerms.options ?? []).map((option) => [option.year, option.type])))
    setGuaranteeAmountsByYear(Object.fromEntries((negotiation.currentTerms.guarantees ?? []).map((guarantee) => [guarantee.year, String(guarantee.guaranteedAmount)])))
    setIncentives((negotiation.currentTerms.incentives ?? []).map((incentive) => ({ ...incentive })))
    setPlayerTradeConsent(negotiation.currentTerms.clauses?.some((clause) => clause.type === 'TRADE_CONSENT_REQUIRED') ?? false)
  }, [negotiation?.id, negotiation?.currentTerms])
  const liveStatus = negotiation === undefined ? undefined : derivedRetentionStatus(world, negotiation)
  const terminal = liveStatus?.status === 'ACCEPTED' || liveStatus?.status === 'REJECTED' || liveStatus?.status === 'WITHDRAWN' || liveStatus?.status === 'EXPIRED'
  const mayOpen = negotiation === undefined || (negotiation.status === 'REJECTED' || negotiation.status === 'WITHDRAWN')
  const canAct = isUserTeam && (onOpen !== undefined || onSubmitOffer !== undefined || onAcceptCounter !== undefined || onWithdraw !== undefined)
  const currentRound = negotiation?.rounds.length ?? 0
  const retentionSigningDecision = negotiation === undefined ? undefined : Object.values(world.governanceDecisionsById).find((decision) => decision.decisionType === 'PLAYER_CONTRACT_SIGNING'
    && decision.subject.kind === 'GENERIC' && decision.subject.referenceId === `retention:${negotiation.id}`)
  const retentionSigningEvents = retentionSigningDecision === undefined ? [] : Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === retentionSigningDecision.id)
  const retentionSigningDenied = retentionSigningEvents.some((event) => event.kind === 'REJECTED' || event.kind === 'VETOED' || event.kind === 'WITHDRAWN')
  const retentionSigningApproved = retentionSigningEvents.some((event) => event.kind === 'APPROVED')
  const institution = Object.values(world.governanceInstitutionsById).find((item) => item.teamIds.includes(teamId))
  const signingRights = institution === undefined ? undefined : resolveGovernanceDecisionRights({ decisionType: 'PLAYER_CONTRACT_SIGNING', institutionId: institution.id, asOfDate: world.currentDate, bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById) })
  const appointments = Object.values(world.governanceAppointmentsById).filter((appointment) => appointment.actor.kind === 'COACH' && appointment.actor.id === world.userCoachId && appointment.startedOn <= world.currentDate && (appointment.endedOn === undefined || appointment.endedOn >= world.currentDate))
  const proposerBodies = signingRights?.proposerBodyIds.filter((bodyId) => appointments.some((appointment) => appointment.bodyId === bodyId)) ?? []
  const approverBodies = signingRights?.approverBodyIds.filter((bodyId) => appointments.some((appointment) => appointment.bodyId === bodyId)) ?? []
  const approvedBodies = new Set(retentionSigningEvents.filter((event) => event.kind === 'APPROVED').map((event) => event.bodyId))
  const bindingTerms = negotiation?.acceptedTerms === undefined ? undefined : assessRetentionBindingTerms(negotiation.acceptedTerms)
  const numericSalary = Number(offerSalary)
  const numericYears = Number(years)
  const numericFee = agentFee === '' ? undefined : Number(agentFee)
  const contractOptions = Object.entries(optionTypesByYear).flatMap(([year, type]) => type === '' ? [] : [{ year: Number(year), type, decisionAuthority: type === 'TEAM' ? 'TEAM' as const : type === 'PLAYER' ? 'PLAYER' as const : 'BOTH' as const }])
  const guaranteeTerms = Object.entries(guaranteeAmountsByYear).flatMap(([year, amount]) => amount === '' ? [] : [{ year: Number(year), guaranteedAmount: Number(amount) }])
  const validYearCount = Number.isSafeInteger(numericYears) && numericYears >= 1 && numericYears <= 20 ? numericYears : 0
  const retainedTermYear = Math.max(0, ...Object.keys(optionTypesByYear).map(Number), ...Object.keys(guaranteeAmountsByYear).map(Number))
  const editorYearCount = Math.max(validYearCount, retainedTermYear)
  const clauses: ContractClauseProposal[] = playerTradeConsent ? [{ type: 'TRADE_CONSENT_REQUIRED', decisionAuthority: 'PLAYER' }] : []
  const proposedTerms: RetentionTermSet = { salary: numericSalary, years: numericYears, ...(role === '' ? {} : { role: role as RetentionTermSet['role'] }), ...(numericFee === undefined ? {} : { agentFee: numericFee, agentFeePayer: 'CLUB' }), ...(contractOptions.length === 0 ? {} : { options: contractOptions }), ...(guaranteeTerms.length === 0 ? {} : { guarantees: guaranteeTerms }), ...(incentives.length === 0 ? {} : { incentives }), ...(clauses.length === 0 ? {} : { clauses }) }
  const termBlockers = assessRetentionEligibility(world, teamId, contractId, proposedTerms).reasons.filter((reason) => reason !== 'OPEN_NEGOTIATION_EXISTS')
  const submit = () => {
    if (negotiation === undefined || onSubmitOffer === undefined) return
    const salaryValue = Number(offerSalary)
    const yearsValue = Number(years)
    const feeValue = agentFee === '' ? undefined : Number(agentFee)
    if (!Number.isSafeInteger(salaryValue) || !Number.isSafeInteger(yearsValue) || (feeValue !== undefined && !Number.isSafeInteger(feeValue)) || guaranteeTerms.some((item) => !Number.isSafeInteger(item.guaranteedAmount)) || incentives.some((item) => !Number.isSafeInteger(item.amount) || !Number.isSafeInteger(item.contractYear) || !Number.isSafeInteger(item.minimumGamesPlayed))) return
    const terms: RetentionTermSet = { salary: salaryValue, years: yearsValue, ...(role === '' ? {} : { role: role as RetentionTermSet['role'] }), ...(feeValue === undefined ? {} : { agentFee: feeValue, agentFeePayer: 'CLUB' }), ...(contractOptions.length === 0 ? {} : { options: contractOptions }), ...(guaranteeTerms.length === 0 ? {} : { guarantees: guaranteeTerms }), ...(incentives.length === 0 ? {} : { incentives }), ...(clauses.length === 0 ? {} : { clauses }) }
    const clauseKey = encodeURIComponent(JSON.stringify({ options: contractOptions, guarantees: guaranteeTerms, incentives, clauses }))
    onSubmitOffer(teamId, negotiation.id, currentRound, `retention-offer:${negotiation.id}:${currentRound}:${world.currentDate}:${salaryValue}:${yearsValue}:${role}:${feeValue ?? 0}:${clauseKey}`, terms)
  }
  const counterTerms = negotiation?.status === 'PLAYER_COUNTERED' ? negotiation.currentTerms : undefined
  const termLabel = (terms: RetentionTermSet | undefined) => terms === undefined ? 'None' : `${terms.salary.toLocaleString()} per year · ${terms.years} year(s)${terms.role ? ` · proposed ${terms.role.toLowerCase()} role promise` : ''}${terms.agentFee === undefined ? '' : ` · club agent fee ${terms.agentFee.toLocaleString()}`}${(terms.options ?? []).map((option) => ` · Year ${option.year} ${option.type} OPTION`).join('')}${(terms.guarantees ?? []).map((guarantee) => ` · Year ${guarantee.year}: ${Math.round(guarantee.guaranteedAmount / terms.salary * 100)}% guaranteed`).join('')}${(terms.incentives ?? []).map((incentive) => ` · Year ${incentive.contractYear}: ${incentive.minimumGamesPlayed}+ games played in ${world.competitions[incentive.competitionId]?.name ?? 'selected competition'}: ${incentive.amount.toLocaleString()} contingent`).join('')}${(terms.clauses ?? []).map((clause) => clause.type === 'TRADE_CONSENT_REQUIRED' ? ' · Proposed trade consent: player approval required before a future trade' : '').join('')}`
  return <article style={{ borderTop: '1px solid rgba(255,255,255,.12)', padding: '12px 0' }} aria-label={`${playerName} retention`}>
    <strong>{playerName}</strong>
    <div>Contract fact · expires {expiresOn} (exclusive) · current annual salary {salary.toLocaleString()}</div>
    <div>Retention window: {retentionWindowDays === undefined ? 'unavailable' : `${retentionWindowDays} days before expiry`} · {negotiation !== undefined && !terminal ? 'negotiation active' : eligibilityReasons.length === 0 ? 'eligible' : `not eligible: ${eligibilityReasons.join(', ').toLowerCase().replaceAll('_', ' ')}`}</div>
    {negotiation === undefined ? <div>Status: no negotiation</div> : <>
      <div>Status: {liveStatus?.status.replaceAll('_', ' ').toLowerCase()}{liveStatus?.terminalReason ? ` · ${liveStatus.terminalReason.toLowerCase().replaceAll('_', ' ')}` : ''}</div>
      <div>Latest club offer: {termLabel(negotiation.rounds.at(-1)?.offer)}</div>
      <div>Latest player/agent response: {negotiation.rounds.at(-1)?.playerResponse.outcome ?? 'no response'}{negotiation.rounds.at(-1)?.playerResponse.reasonCodes.length ? ` · ${negotiation.rounds.at(-1)!.playerResponse.reasonCodes.slice(0, 3).map((code) => code.toLowerCase().replaceAll('_', ' ')).join(', ')}` : ''}</div>
      {negotiation.status === 'ACCEPTED' && <div>Accepted in principle terms: {termLabel(negotiation.acceptedTerms)}</div>}
      {negotiation.status === 'PLAYER_COUNTERED' && <div>Counter terms: {termLabel(counterTerms)}</div>}
      {negotiation.status === 'ACCEPTED' && negotiation.execution?.status === 'SIGNED' && <div><strong>SIGNED: accepted terms {termLabel(negotiation.acceptedTerms)} created successor contract {negotiation.execution.contractId} on {negotiation.execution.signedOn}.</strong></div>}
      {negotiation.status === 'ACCEPTED' && negotiation.execution === undefined && retentionSigningDenied && <div><strong>SIGNING BLOCKED: PLAYER_CONTRACT_SIGNING Governance denied or withdrew the decision. Agreement remains unsigned.</strong></div>}
      {negotiation.status === 'ACCEPTED' && negotiation.execution === undefined && retentionSigningDecision !== undefined && !retentionSigningDenied && <div><strong>SIGNING PENDING: Governance {retentionSigningApproved ? 'approval is recorded; execution is pending' : 'approval is required'}. Agreement remains unsigned.</strong></div>}
      {negotiation.status === 'ACCEPTED' && negotiation.execution === undefined && retentionSigningDecision === undefined && bindingTerms?.supported !== false && <div><strong>SIGNING BLOCKED: accepted terms have not produced an authorized signing decision. Agreement remains unsigned.</strong></div>}
      {negotiation.status === 'ACCEPTED' && bindingTerms?.supported === false && <p>Signing blocked: accepted terms include options, incentives, clauses, or fee treatment that cannot currently be represented in a binding contract ({bindingTerms.reason}).</p>}
      {negotiation.status === 'ACCEPTED' && negotiation.execution === undefined && retentionSigningDecision === undefined && canAct && onRequestSigning !== undefined && bindingTerms?.supported !== false && proposerBodies.map((bodyId) => <button key={bodyId} type="button" onClick={() => onRequestSigning(teamId, negotiation.id, bodyId)}>Request signing approval ({world.governanceBodiesById[bodyId]?.name ?? bodyId})</button>)}
      {negotiation.status === 'ACCEPTED' && retentionSigningDecision !== undefined && canAct && onRecordSigningDecision !== undefined && approverBodies.filter((bodyId) => !approvedBodies.has(bodyId)).map((bodyId) => <button key={bodyId} type="button" onClick={() => onRecordSigningDecision(retentionSigningDecision.id, 'APPROVED', bodyId)}>Approve signing ({world.governanceBodiesById[bodyId]?.name ?? bodyId})</button>)}
      {(negotiation.status === 'REJECTED' || negotiation.status === 'WITHDRAWN') && negotiation.reopenOn !== undefined && <div>Cooldown until {negotiation.reopenOn}</div>}
      {negotiation.rounds.map((round) => <div key={round.actionId}>Round {round.round}: {round.playerResponse.outcome.toLowerCase()} · {round.playerResponse.reasonCodes.join(', ') || 'no additional explanation'}</div>)}
    </>}
    {canAct && isUserTeam && mayOpen && eligibilityReasons.length === 0 && onOpen && <button type="button" onClick={() => onOpen(teamId, contractId, `retention-open:${teamId}:${contractId}:${world.currentDate}`)}>Open negotiation</button>}
    {canAct && negotiation !== undefined && !terminal && <div>
      <label>Annual salary <input aria-label={`${playerName} retention annual salary`} type="number" min="1" value={offerSalary} onChange={(event) => setOfferSalary(event.target.value)} /></label>
      <label>Years <input aria-label={`${playerName} retention years`} type="number" min="1" max="20" value={years} onChange={(event) => setYears(event.target.value)} /></label>
      <label>Role promise proposal <select aria-label={`${playerName} retention role promise`} value={role} onChange={(event) => setRole(event.target.value)}><option value="">No role promise</option>{['STAR', 'STARTER', 'ROTATION', 'DEPTH'].map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}</select></label>
      <label>Optional agent fee paid by club <input aria-label={`${playerName} retention agent fee`} type="number" min="0" value={agentFee} onChange={(event) => setAgentFee(event.target.value)} /></label>
      <details>
        <summary>Options and guarantees by contract year</summary>
        <p>Annual salary is the same in each proposed year. A blank guarantee is unspecified; 0 means non-guaranteed.</p>
        {editorYearCount > 0 && Array.from({ length: editorYearCount }, (_, index) => index + 1).map((year) => <div key={year} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>Year {year}{year > validYearCount ? ' (outside proposed term)' : ''}</strong>
          <label>Option <select aria-label={`${playerName} year ${year} option`} value={optionTypesByYear[year] ?? ''} onChange={(event) => setOptionTypesByYear((current) => ({ ...current, [year]: event.target.value as ContractOptionProposal['type'] | '' }))}><option value="">None</option><option value="TEAM">Team option</option><option value="PLAYER">Player option</option><option value="MUTUAL">Mutual option</option></select></label>
          <label>Guaranteed amount <input aria-label={`${playerName} year ${year} guaranteed amount`} type="number" min="0" max={numericSalary} value={guaranteeAmountsByYear[year] ?? ''} onChange={(event) => setGuaranteeAmountsByYear((current) => ({ ...current, [year]: event.target.value }))} /></label>
        </div>)}
      </details>
      <details>
        <summary>Performance incentives</summary>
        <p>Games played counts canonical MatchStatLog appearances in one selected competition and contract year. Incentives remain contingent; no earning or payment is evaluated here.</p>
        {incentives.map((incentive, index) => <div key={`${index}:${incentive.competitionId}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>Games played</strong>
          <label>Competition <select aria-label={`${playerName} incentive ${index + 1} competition`} value={incentive.competitionId} onChange={(event) => setIncentives((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, competitionId: event.target.value as ContractIncentiveProposal['competitionId'] } : item))}>{Object.values(world.competitions).filter((competition) => competition.participantTeamIds.includes(teamId)).map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}</select></label>
          <label>Contract year <input aria-label={`${playerName} incentive ${index + 1} contract year`} type="number" min="1" max={numericYears} value={incentive.contractYear} onChange={(event) => setIncentives((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, contractYear: Number(event.target.value) } : item))} /></label>
          <label>Games played <input aria-label={`${playerName} incentive ${index + 1} games threshold`} type="number" min="1" max="200" value={incentive.minimumGamesPlayed} onChange={(event) => setIncentives((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, minimumGamesPlayed: Number(event.target.value) } : item))} /></label>
          <label>Bonus amount <input aria-label={`${playerName} incentive ${index + 1} amount`} type="number" min="1" value={incentive.amount} onChange={(event) => setIncentives((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value) } : item))} /></label>
          <button type="button" aria-label={`Remove incentive ${index + 1}`} onClick={() => setIncentives((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
        </div>)}
        <button type="button" disabled={Object.values(world.competitions).every((competition) => !competition.participantTeamIds.includes(teamId))} onClick={() => { const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(teamId)); if (competition) setIncentives((current) => [...current, { type: 'GAMES_PLAYED', competitionId: competition.id, contractYear: 1, minimumGamesPlayed: 1, amount: 1 }]) }}>Add games-played incentive</button>
      </details>
      <details>
        <summary>Contract clauses</summary>
        <p>These are proposed terms only. A proposed trade-consent right is not active and does not represent consent to any current trade.</p>
        <label><input type="checkbox" checked={playerTradeConsent} onChange={(event) => setPlayerTradeConsent(event.target.checked)} /> Player approval required before a future trade</label>
      </details>
      {(negotiation.status === 'OPEN' || negotiation.status === 'PLAYER_COUNTERED') && <><button type="button" disabled={termBlockers.length > 0} onClick={submit}>{negotiation.status === 'OPEN' ? 'Submit offer' : 'Revise offer'}</button>{termBlockers.length > 0 && <div role="status">Offer unavailable: {termBlockers.join(', ').toLowerCase().replaceAll('_', ' ')}</div>}</>}
      {negotiation.status === 'PLAYER_COUNTERED' && onAcceptCounter && <button type="button" onClick={() => onAcceptCounter(teamId, negotiation.id, currentRound, `retention-accept:${negotiation.id}:${currentRound}:${world.currentDate}`)}>Respond to counter · accept</button>}
      {onWithdraw && <button type="button" onClick={() => onWithdraw(teamId, negotiation.id, `retention-withdraw:${negotiation.id}:${world.currentDate}`)}>Withdraw</button>}
    </div>}
  </article>
}

const NEED_LABELS: Readonly<Record<ClubNeedKind, string>> = {
  ROSTER_SIZE: 'Playable roster size',
  POSITIONAL_DEPTH: 'Positional depth',
  STARTER_QUALITY_GAP: 'Starter quality gap',
  BENCH_QUALITY_GAP: 'Bench quality gap',
  ROLE_GAP: 'Basketball function gap',
  CONTRACT_CONTINUITY: 'Key player contract continuity',
  CONTRACT_CLUSTER: 'Contract expiry cluster',
  AGING_CORE: 'Aging core timeline',
  DEVELOPMENT_OPPORTUNITY: 'Development opportunity',
  POSITION_SURPLUS: 'Positional surplus',
  TEMPORARY_COVER: 'Temporary injury cover',
  ELIGIBILITY_GAP: 'Competition eligibility gap',
  FINANCIAL_PRESSURE: 'Financial pressure',
}

const OPTION_LABELS: Readonly<Record<GMResponseOptionKind, string>> = {
  INTERNAL_ROLE_REALLOCATION: 'Internal role redistribution',
  INTERNAL_DEVELOPMENT: 'Internal development',
  EXTERNAL_ACQUISITION: 'External acquisition',
  SHORT_TERM_COVER: 'Short-term cover',
  CONTRACT_RETENTION_REVIEW: 'Contract continuity review',
  SUCCESSION_PLANNING: 'Succession planning',
  OUTGOING_MARKET_REVIEW: 'Outgoing market review',
  FINANCIAL_CONTAINMENT: 'Financial containment',
  SCOUTING_EXPANSION: 'Scouting expansion',
  WAIT_AND_MONITOR: 'Wait and monitor',
}

const WORKFLOW_LABELS: Readonly<Record<string, string>> = {
  NONE: 'Needs review',
  NO_ACTION: 'No action; monitor',
  MARKET_INTELLIGENCE_REQUIRED: 'Market intelligence required',
  ROUTE_TO_SCOUTING: 'Scouting review',
  ROUTE_TO_CONTRACT_REVIEW: 'Contract review',
  ROUTE_TO_FINANCE: 'Finance review',
  APPROVAL_PATH_UNRESOLVED: 'Approval path unresolved',
  NO_SUPPORTED_WORKFLOW: 'Not yet supported',
}

const WORKFLOW_STATUS_LABELS: Readonly<Record<string, string>> = {
  READY_TO_ROUTE: 'Ready for subsystem review',
  WAITING_APPROVAL: 'Waiting for approval context',
  WAITING_INFORMATION: 'Waiting for information',
  BLOCKED: 'Blocked',
  UNSUPPORTED: 'Not yet supported',
  NO_ACTION: 'No action required',
  REVIEW_REQUIRED: 'Review required',
}

const SYSTEM_LABELS: Readonly<Record<string, string>> = {
  GM_PLANNING: 'Club planning',
  BS10_MARKET_INTELLIGENCE: 'Market intelligence',
  SCOUTING: 'Scouting',
  BASKETBALL_OPERATIONS_ADVISORY: 'Basketball Operations advisory',
  FINANCE_AI: 'FinanceAI',
  UNRESOLVED: 'Unresolved',
}

const SELECTION_REASON_LABELS: Readonly<Record<string, string>> = {
  INITIAL_SELECTION: 'Initially selected',
  PLAN_STILL_VALID: 'Kept after review',
  SOURCE_NEED_RESOLVED: 'Source need resolved',
  OPTION_NO_LONGER_AVAILABLE: 'Option no longer available',
  OPTION_BECAME_BLOCKED: 'Option became blocked',
  STRATEGY_CHANGED: 'Strategy changed',
  CONTEXT_MATERIALLY_CHANGED: 'Context materially changed',
  NO_SELECTABLE_OPTION: 'No selectable option',
}

function formatEvidenceValue(value: string | number | boolean | readonly (string | number | boolean)[] | readonly Readonly<Record<string, string | number | boolean>>[]): string {
  return Array.isArray(value) ? value.map((item) => typeof item === 'object' ? Object.entries(item).filter(([key]) => !/ids?$/i.test(key)).map(([key, entry]) => `${key}: ${entry}`).join(', ') : String(item)).join(', ') : String(value)
}

function formatEvidenceEntries(values: Readonly<Record<string, unknown>>): string {
  return Object.entries(values).filter(([key]) => !/ids?$/i.test(key)).map(([key, value]) => `${key}=${formatEvidenceValue(value as Parameters<typeof formatEvidenceValue>[0])}`).join(' · ')
}

const CONTRACT_INTENTS: readonly { readonly value: ContractReviewIntent; readonly label: string }[] = [
  { value: 'PURSUE_EXTENSION', label: 'Pursue extension' },
  { value: 'ALLOW_EXPIRY', label: 'Allow expiry' },
  { value: 'REVIEW_RELEASE', label: 'Review release' },
  { value: 'DEFER', label: 'Defer to next season checkpoint' },
]

export function ClubStrategyScreen({ world, onDecideContractReview }: {
  readonly world: GameWorld
  readonly onDecideContractReview?: (teamId: TeamId, contractId: ContractId, intent: ContractReviewIntent) => void
}) {
  const clubs = Object.values(world.teams)
    .filter((team) => team.coachId !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name))

  return <section className="screen" aria-label="Club strategy and needs">
    <header className="page-heading"><div><p className="eyebrow">Club intelligence</p><h1>Club strategy and needs</h1><p>Current direction, basketball-management needs, and the structured evidence behind them.</p></div></header>
    <div className="content-panel" style={{ display: 'grid', gap: 16 }}>
      {clubs.map((team) => {
        const assessment = assessClubStrategy(world, team.id)
        const decisionContext = assessGMDecisionContext(world, team.id)
        const workflowReview = inspectGMPlanWorkflows(world, team.id)
        const marketCandidateReviews = assessRoutedMarketCandidateFeasibility(world, team.id)
        const acquisitionProposals = assessRoutedAcquisitionProposalIntelligence(world, team.id)
        const freeAgentOffers = assessRoutedFreeAgentOfferIntelligence(world, team.id)
        const needsAssessment = decisionContext.needsAssessment
        const contractReviews = assessContractReviewOutlook(world, team.id).reviews
        const state = world.clubStrategicStatesByTeamId[team.id]
        const isUserTeam = team.coachId === world.userCoachId
        return <article key={team.id} aria-label={`${team.name} ${team.gender} strategy`} style={{ borderBottom: '1px solid rgba(255,255,255,.12)', paddingBottom: 16 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>{team.name} <small>{team.gender}{isUserTeam ? ' · Your club, advisory' : ''}</small></h2>
            <strong>{state?.mode ?? assessment.candidateMode}</strong>
          </header>
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div><dt>Horizon</dt><dd>{state?.horizon ?? 'Pending review'}</dd></div>
            <div><dt>Financial posture</dt><dd>{state?.financialPosture ?? assessment.financialPressure}</dd></div>
            <div><dt>Risk tolerance</dt><dd>{state?.riskTolerance ?? 'Pending review'}</dd></div>
            <div><dt>Development emphasis</dt><dd>{state ? `${state.developmentEmphasis}%` : 'Pending review'}</dd></div>
            <div><dt>Competitive pressure</dt><dd>{assessment.competitivePressure}</dd></div>
            <div><dt>Board pressure</dt><dd>{assessment.boardPressure}</dd></div>
            <div><dt>Governance pressure</dt><dd>{assessment.governancePressure}</dd></div>
            <div><dt>Candidate mode</dt><dd>{assessment.candidateMode}</dd></div>
            <div><dt>Last review</dt><dd>{state?.lastReviewedOn ?? 'Not reviewed'}</dd></div>
          </dl>
          <div><strong>Assessment reasons</strong><ul>{assessment.reasons.map((reason) => <li key={reason}>{REASON_LABELS[reason] ?? reason}</li>)}</ul></div>
          <section aria-label={`${team.name} ${team.gender} top needs`}>
            <h3>Top needs</h3>
            {needsAssessment.needs.length === 0 ? <p>No current needs identified.</p> : <ol>{needsAssessment.needs.slice(0, 3).map((need) => <li key={need.id}>
              <strong>{NEED_LABELS[need.kind]}{need.targetPosition ? ` · ${need.targetPosition}` : ''}{need.targetRole ? ` · ${need.targetRole.replaceAll('_', ' ').toLowerCase()}` : ''}</strong>
              <div>Severity: {need.severity} · Urgency: {need.urgency} · Strategic fit: {need.strategicFit} · Confidence: {need.confidence}</div>
              <div>Scope: {need.temporalScope} · Finance context: {need.financialContext}{need.deadline ? ` · Deadline: ${need.deadline}` : ''}</div>
              {need.relatedPlayerIds.length > 0 && <div>Related roster players: {need.relatedPlayerIds.map((id) => `${world.players[id]?.firstName ?? 'Unknown'} ${world.players[id]?.lastName ?? ''}`).join(', ')}</div>}
              {need.evidence.map((evidence) => <div key={evidence.code}><small>{evidence.code}: {formatEvidenceEntries(evidence.values)}</small></div>)}
            </li>)}</ol>}
          </section>
          <section aria-label={`${team.name} ${team.gender} contract outlook`}>
            <h3>Contract outlook</h3>
            <p>Current roster: {needsAssessment.contractRosterPlanning.currentRosterCount} · roster maximum: not configured. This is a read-only view of existing contracts.</p>
            {needsAssessment.contractRosterPlanning.horizons.map((horizon) => <div key={horizon.id}>
              <strong>{horizon.kind.replaceAll('_', ' ')} · {horizon.date}</strong>
              <div>Contractually retained: {horizon.contractuallyRetainedPlayerIds.length} · scheduled arrivals: {horizon.scheduledArrivalPlayerIds.length} · unresolved expiries: {horizon.unresolvedExpiries.length}</div>
              {horizon.unresolvedExpiries.length > 0 && <ul>{horizon.unresolvedExpiries.map((expiry) => <li key={expiry.contractId}>
                {world.players[expiry.playerId]?.firstName} {world.players[expiry.playerId]?.lastName} · {expiry.currentRole.toLowerCase()} {expiry.position} · expires {expiry.expiresOn}
              </li>)}</ul>}
              {horizon.positionalContinuityRisks.length > 0 && <div>Continuity risks: {horizon.positionalContinuityRisks.map((risk) => risk.position).join(', ')}</div>}
              {horizon.seasonId && horizon.guaranteedPlayerPayroll === null && <div>Player payroll context: unavailable</div>}
            </div>)}
          </section>
          <section aria-label={`${team.name} ${team.gender} contract review`}>
            <h3>Contract review</h3>
            <p>Intent is planning only. It creates no salary terms, negotiation, successor contract, release, or Governance decision.</p>
            {contractReviews.length === 0 ? <p>No current or recorded contract reviews.</p> : <ul>{contractReviews.map((review) => {
              const player = world.players[review.playerId]
              const live = !review.status.startsWith('RESOLVED') && review.status !== 'STALE'
              const statusLabel = review.status === 'REVIEW_REQUIRED' && review.decision === 'DEFER' ? 'Review due again'
                : review.status === 'REVIEW_REQUIRED' ? 'Review required'
                  : review.status === 'DEFERRED' ? `Deferred until ${review.reviewAgainOn}`
                    : review.status.startsWith('RESOLVED') ? review.status.replace('RESOLVED_', 'Resolved: ').replaceAll('_', ' ').toLowerCase()
                      : review.status === 'STALE' ? 'Stale review' : `Intent: ${review.status.replaceAll('_', ' ').toLowerCase()}`
              return <li key={review.id}>
                <strong>{player?.firstName ?? 'Unknown'} {player?.lastName ?? ''}</strong>
                <div>Expires: {review.expiresOn}{review.expiryContext ? ` · ${review.expiryContext.currentRole.toLowerCase()} ${review.expiryContext.position}` : ''} · {statusLabel}</div>
                {review.decision === 'DEFER' && review.status === 'REVIEW_REQUIRED' && <div>Previously deferred on {review.decidedOn}; the season checkpoint reopened this review.</div>}
                {live && !isUserTeam && <div>AI intent unavailable: no contract-retention decision owner is configured. This is derived review evidence only.</div>}
                {live && isUserTeam && onDecideContractReview && <div aria-label={`Contract review choices for ${player?.firstName ?? 'player'} ${player?.lastName ?? ''}`}>
                  {CONTRACT_INTENTS.map((intent) => <button key={intent.value} type="button" onClick={() => onDecideContractReview(team.id, review.contractId, intent.value)}>{intent.label}</button>)}
                </div>}
              </li>
            })}</ul>}
          </section>
          {isUserTeam && <p><button type="button" onClick={() => navigateToContracts(team.id)}>Manage negotiations in Contracts / Planning</button></p>}
          <section aria-label={`${team.name} ${team.gender} GM plan and current workflow`}>
            <h3>{isUserTeam ? 'Recommended plan' : 'Selected plan'}</h3>
            <p>{isUserTeam ? 'Advisory only; no plan is saved for your club.' : 'Current AI club planning intent.'}</p>
            {workflowReview.decisions.length === 0 ? <p>No selected response plans for current needs.</p> : <ol>{workflowReview.decisions.map((decision) => {
              const need = needsAssessment.needs.find((item) => item.id === decision.needId)
              return <li key={`${decision.planId}:${decision.currentValidity}`}>
                <strong>{need ? NEED_LABELS[need.kind] : 'Previous club need'}: {OPTION_LABELS[decision.responseFamily]}</strong>
                <div>Selected: {decision.selectedOn} · {SELECTION_REASON_LABELS[decision.selectionReason] ?? decision.selectionReason.replaceAll('_', ' ').toLowerCase()}</div>
                <div><strong>{isUserTeam ? 'Recommended next workflow' : 'Planned next workflow'}:</strong> {WORKFLOW_LABELS[decision.route] ?? decision.route}</div>
                <div>Status: {WORKFLOW_STATUS_LABELS[decision.status] ?? decision.status} · Current authority: {decision.currentExecutionReadiness?.replaceAll('_', ' ').toLowerCase() ?? 'Unknown'}</div>
                <div>Responsible system: {SYSTEM_LABELS[decision.responsibleSystem] ?? decision.responsibleSystem}</div>
              </li>
            })}</ol>}
          </section>
          {marketCandidateReviews.map((review) => {
            const need = needsAssessment.needs.find((item) => item.id === review.need.id)
            return <section key={review.planId} aria-label={`${team.name} ${team.gender} known market candidates for ${review.need.id}`}>
              <h3>{isUserTeam ? 'Recommended market candidates' : 'Known market candidates'}</h3>
              <p>{need ? NEED_LABELS[need.kind] : 'External acquisition'} · {review.perspective === 'USER_ANALYTICS' ? 'User analytics perspective; player knowledge remains club-scoped.' : 'AI perspective uses organization knowledge and public market facts.'}</p>
              {review.knowledgeStatus === 'MARKET_KNOWLEDGE_INSUFFICIENT' && <p>Market knowledge insufficient to distinguish candidates confidently.</p>}
              {review.candidates.length === 0 ? <p>No discoverable candidates for this need.</p> : <ol>{review.candidates.slice(0, 5).map((candidate) => <li key={candidate.playerId}>
                <strong>{candidate.name}</strong>
                <div>Position fit: {candidate.positionFit} · Role fit: {candidate.roleFit} · Knowledge: {candidate.knowledgeConfidence}</div>
                <div>Strategy fit: {candidate.strategyFit} · Timeline fit: {candidate.timelineFit} · Availability: {candidate.availabilityStatus.replaceAll('_', ' ').toLowerCase()}</div>
                <div>Approachability: {candidate.feasibility.approachability} · Route: {candidate.feasibility.route.replaceAll('_', ' ').toLowerCase()} ({candidate.feasibility.routeSupport.toLowerCase()}) · Affordability: {candidate.feasibility.affordability.replaceAll('_', ' ').toLowerCase()}</div>
                <div>Market availability signal: {candidate.feasibility.marketAvailability?.replaceAll('_', ' ').toLowerCase() ?? 'unknown'} · Expected salary: {candidate.feasibility.expectedSalary === undefined ? 'unknown' : `${candidate.feasibility.expectedSalary.value.toLocaleString()} · ${candidate.feasibility.expectedSalary.source.toLowerCase()} · confidence ${candidate.feasibility.expectedSalary.confidence}% · ${candidate.feasibility.expectedSalary.assessedAt}`} · Perceived economic value: unknown</div>
                {candidate.feasibility.currentContractAnnualSalary !== undefined && <div>Current contract annual salary: {candidate.feasibility.currentContractAnnualSalary.toLocaleString()} · trade package legality not assessed</div>}
                <div>Player interest: {candidate.feasibility.playerInterest === undefined ? 'unknown' : `${candidate.feasibility.playerInterest.value} · ${candidate.feasibility.playerInterest.source.toLowerCase()} · confidence ${candidate.feasibility.playerInterest.confidence}% · ${candidate.feasibility.playerInterest.assessedAt}`}</div>
                <div>Seller willingness: {candidate.feasibility.sellerWillingness === undefined ? 'unknown' : `${candidate.feasibility.sellerWillingness.value} · ${candidate.feasibility.sellerWillingness.source.toLowerCase()} · confidence ${candidate.feasibility.sellerWillingness.confidence}% · ${candidate.feasibility.sellerWillingness.assessedAt}`}</div>
                <div>Finance V2 context: {candidate.feasibility.financeV2Context.replaceAll('_', ' ').toLowerCase()} · assessed separately from payroll affordability</div>
                {candidate.feasibility.routeReason !== undefined && <div>Route note: {candidate.feasibility.routeReason.replaceAll('_', ' ').toLowerCase()}</div>}
                {candidate.feasibility.blockers.length > 0 && <div>Feasibility blockers: {candidate.feasibility.blockers.map((item) => item.replaceAll('_', ' ').toLowerCase()).join(', ')}</div>}
                {candidate.currentTeam !== undefined && <div>Current team: {candidate.currentTeam.name} · Acquisition context: {candidate.acquisitionContext.replaceAll('_', ' ').toLowerCase()}</div>}
                {candidate.availabilitySignal !== undefined && <div>Market signal: {candidate.availabilitySignal.source.replaceAll('_', ' ').toLowerCase()} · confidence {candidate.availabilitySignal.confidence}% · {candidate.availabilitySignal.assessedAt}</div>}
                {Object.keys(candidate.knownDimensions).length > 0 && <div>Known evidence: {Object.keys(candidate.knownDimensions).join(', ')}</div>}
                {candidate.missingKnowledge.length > 0 && <div>Missing: {candidate.missingKnowledge.join(', ')}</div>}
                {candidate.reasons.length > 0 && <div>Why listed: {candidate.reasons.map((reason) => reason.replaceAll('_', ' ').toLowerCase()).join(', ')}</div>}
                {candidate.contractStatus === 'UNDER_CONTRACT' && candidate.availabilityStatus === 'UNKNOWN' && <div>Contracted; no availability signal is known.</div>}
              </li>)}</ol>}
              {review.candidates.length > 5 && <p>{review.candidates.length - 5} more known candidates.</p>}
            </section>
          })}
          <section aria-label={`${team.name} ${team.gender} acquisition proposal intelligence`}>
            <h3>{isUserTeam ? 'Recommended approach (advisory)' : 'Preferred acquisition proposal'}</h3>
            {acquisitionProposals.map((proposal) => <article key={proposal.id} aria-label={`${proposal.proposalType.replaceAll('_', ' ').toLowerCase()} ${proposal.needId ?? 'no active plan'}`}>
              {proposal.preferredCandidate === undefined
                ? <strong>No actionable proposal: {proposal.noProposalReason?.replaceAll('_', ' ').toLowerCase() ?? 'unknown reason'}</strong>
                : <><strong>{proposal.proposalType === 'NO_ACTIONABLE_PROPOSAL' ? 'Candidate needs route information' : proposal.proposalType.replaceAll('_', ' ')}: {proposal.preferredCandidate.name}</strong>
                  <div>Need fit: {proposal.preferredCandidate.needFit} · Approachability: {proposal.preferredCandidate.feasibility.approachability} · Route: {proposal.route?.replaceAll('_', ' ').toLowerCase() ?? 'unknown'}</div>
                  <div>Readiness: {proposal.proposalReadiness.replaceAll('_', ' ').toLowerCase()} · Transaction authority: {proposal.governanceReadiness.replaceAll('_', ' ').toLowerCase()}</div>
                  {proposal.knownExpectedSalary !== undefined && <div>Known expected salary: {proposal.knownExpectedSalary.value.toLocaleString()} · {proposal.knownExpectedSalary.source.toLowerCase()} · confidence {proposal.knownExpectedSalary.confidence}% · {proposal.knownExpectedSalary.assessedAt}</div>}
                  {proposal.proposalType === 'FREE_AGENT_APPROACH' && <div>Affordability: {proposal.affordability.replaceAll('_', ' ').toLowerCase()} · Expected term: {proposal.expectedTermYears === undefined ? 'unknown' : `${proposal.expectedTermYears.value} years · ${proposal.expectedTermYears.source.toLowerCase()} · confidence ${proposal.expectedTermYears.confidence}%`} · Proposed contract term: not selected</div>}
                  {proposal.proposalType === 'TRADE_ENQUIRY' && <div>Seller willingness: {proposal.preferredCandidate.feasibility.sellerWillingness === undefined ? 'unknown' : `${proposal.preferredCandidate.feasibility.sellerWillingness.value} · confidence ${proposal.preferredCandidate.feasibility.sellerWillingness.confidence}%`} · Package: not constructed · Perceived value: unknown</div>}
                </>}
              {proposal.proposalType === 'FREE_AGENT_APPROACH' && <div>Player interest: {proposal.knownPlayerInterest?.value ?? 'unknown'}</div>}
              <div>Responsible system: {proposal.responsibleSystem.replaceAll('_', ' ').toLowerCase()} · Responsible role: unknown</div>
              {proposal.alternatives.length > 0 && <div>Alternatives: {proposal.alternatives.map((alternative) => alternative.name).join(', ')}</div>}
              {proposal.missingInformation.length > 0 && <div>Missing: {proposal.missingInformation.map((item) => item.replaceAll('_', ' ').toLowerCase()).join(', ')}</div>}
              {proposal.blockers.length > 0 && <div>Blockers: {proposal.blockers.map((item) => item.replaceAll('_', ' ').toLowerCase()).join(', ')}</div>}
            </article>)}
          </section>
          <section aria-label={`${team.name} ${team.gender} free-agent offer preparation`}>
            <h3>{isUserTeam ? 'Recommended offer preparation (advisory)' : 'Free-agent offer readiness'}</h3>
            {freeAgentOffers.map((offer) => <article key={offer.id} aria-label={`${offer.outcome.replaceAll('_', ' ').toLowerCase()} ${offer.playerName ?? 'no preferred player'}`}>
              {offer.outcome === 'FREE_AGENT_OFFER' && <>
                <strong>Preferred player: {offer.playerName}</strong>
                <div>Contact readiness: {offer.contactReadiness.replaceAll('_', ' ').toLowerCase()} · contact authority: {offer.contactAuthority.authorityStatus.replaceAll('_', ' ').toLowerCase()}</div>
                <div>Contact owner: {offer.contactAuthority.authorityStatus === 'USER_CONTROLLED' ? 'you' : offer.contactAuthority.responsibleStaffId === undefined ? 'none resolved' : `${offer.contactAuthority.responsibleRole ?? 'staff'} (${offer.contactAuthority.responsibleStaffId})`} · Governance for contact: not required</div>
                <div>Prepared salary: {offer.preparedSalary === undefined ? 'unknown' : `${offer.preparedSalary.value.toLocaleString()} · expected market signal · ${offer.preparedSalary.source.toLowerCase()} · confidence ${offer.preparedSalary.confidence}%`}</div>
                <div>Term: {offer.expectedTermYears === undefined ? 'unknown' : `expected ${offer.expectedTermYears.value} years`} · selected offer term: unknown</div>
                <div>Role: unknown · Agent fee: unknown</div>
                <div>Player interest: {offer.playerInterest === undefined ? 'unknown' : `${offer.playerInterest.value} · ${offer.playerInterest.source.toLowerCase()} · confidence ${offer.playerInterest.confidence}%`}</div>
                <div>Current payroll affordability: {offer.payrollAffordability.toLowerCase()} · BS10B affordability: {offer.bs10bAffordability?.replaceAll('_', ' ').toLowerCase() ?? 'unknown'} · Finance V2: {offer.financeV2Context?.replaceAll('_', ' ').toLowerCase() ?? 'unknown'}</div>
                <div>Transaction responsibility: {offer.transactionResponsibility.status.replaceAll('_', ' ').toLowerCase()}{offer.transactionResponsibility.mode === undefined ? '' : ` · ${offer.transactionResponsibility.mode}`}{offer.transactionResponsibility.holder === undefined ? '' : ` · ${offer.transactionResponsibility.holder.name} (${offer.transactionResponsibility.holder.role})`}</div>
                <div>Signing Governance: {offer.governanceAuthority.toLowerCase()} · Formal offer readiness: {offer.readiness.replaceAll('_', ' ').toLowerCase()}</div>
              </>}
              {offer.outcome !== 'FREE_AGENT_OFFER' && <strong>{offer.outcome === 'TRADE_ENQUIRY_ONLY' ? 'Trade enquiry remains read-only' : 'No free-agent offer preparation'}: {offer.blockers.join(', ').replaceAll('_', ' ').toLowerCase()}</strong>}
              {offer.existingNegotiation?.status === 'CONTACTED' && <div>Contacted: {offer.existingNegotiation.startedOn ?? 'date unavailable'} · Actor: {contactActorLabel(world, offer.existingNegotiation.responsibleActor)} · Attempt: {offer.existingNegotiation.sourcePlanId === offer.sourcePlanId && offer.existingNegotiation.sourceProposalId === offer.sourceProposalId ? 'current' : 'active'} · Formal offer: not submitted</div>}
              {offer.existingNegotiation !== undefined && offer.existingNegotiation.status !== 'CONTACTED' && <div>Existing lifecycle record: {offer.existingNegotiation.status.toLowerCase()} · {offer.existingNegotiation.kind === 'ACTIVE' ? 'active team/player attempt blocks another' : 'same attempt is idempotently recognized'} · Formal offer submitted</div>}
              {offer.missingInformation.length > 0 && <div>Missing: {offer.missingInformation.map((item) => item.replaceAll('_', ' ').toLowerCase()).join(', ')}</div>}
              {offer.blockers.length > 0 && offer.outcome === 'FREE_AGENT_OFFER' && <div>Blockers: {offer.blockers.map((item) => item.replaceAll('_', ' ').toLowerCase()).join(', ')}</div>}
            </article>)}
          </section>
          <section aria-label={`${team.name} ${team.gender} response options`}>
            <h3>Management response options</h3>
            <p>{decisionContext.decisionMakerStatus === 'ASSIGNED'
              ? `Decision participants: ${decisionContext.decisionParticipants.map((person) => `${person.role.replaceAll(/([A-Z])/g, ' $1')} ${person.firstName} ${person.lastName}`).join('; ')}`
              : 'Decision context: organizational fallback; no valid basketball operations responsibility holder is assigned.'}</p>
            {decisionContext.options.length === 0 ? <p>No high priority needs currently require response options.</p> : <ol>{decisionContext.options.map((option) => {
              const need = needsAssessment.needs.find((item) => item.id === option.needId)
              return <li key={option.id}>
                <strong>{need ? NEED_LABELS[need.kind] : 'Club need'}: {OPTION_LABELS[option.kind]}</strong>
                <div>Strategic alignment: {option.strategicAlignment} · Staff style: {option.staffStyleAlignment} · Feasibility: {option.feasibility} · Knowledge: {option.knowledgeReadiness}</div>
                {option.reasons.length > 0 && <div>Why: {option.reasons.map((reason) => reason.replaceAll('_', ' ').toLowerCase()).join('; ')}</div>}
                {option.blockers.length > 0 && <div>Approval context: {option.blockers.map((blocker) => blocker.replaceAll('_', ' ').toLowerCase()).join('; ')}</div>}
              </li>
            })}</ol>}
          </section>
        </article>
      })}
      {clubs.length === 0 && <p>No coached clubs are currently available for inspection.</p>}
    </div>
  </section>
}

function contactActorLabel(world: GameWorld, actor: NegotiationResponsibleActor | undefined): string {
  if (actor === undefined) return 'unknown'
  if (actor.kind === 'USER') return 'User'
  if (actor.kind === 'ORGANIZATION') return 'Organization'
  const person = world.staffPeopleById[actor.staffPersonId]
  return person === undefined ? `Staff ${actor.staffPersonId}` : `${person.identity.firstName} ${person.identity.lastName}`
}
