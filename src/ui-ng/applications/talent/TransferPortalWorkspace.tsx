import { useMemo, useState } from 'react'
import { getUserTeam } from '@/engine/calendar'
import type { BasketballPosition } from '@/domain/primitives'
import { canRecruitTransferPlayer } from '@/engine/eligibility'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { useGameStore } from '@/stores/gameStore'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { navigateToPlayer, navigateToRecruitingPlayer } from '@/ui-ng/workspace/workspaceApps'
import { TalentOperationsNav } from './TalentOperationsNav'
import { buildTalentPortalPlayerViewModels } from './TalentPortalViewModel'
import { toUserFacingTalentBlockedReason } from './TalentBlockedReasonAdapter'

function eligibilityReasonLabel(reason: string): string {
  const labels: Readonly<Record<string, string>> = {
    NOT_ENROLLED: 'No active enrollment is recorded',
    ACADEMIC_REQUIREMENT_NOT_MET: 'Academic requirements are not met',
    PARTICIPATION_LIMIT_REACHED: 'Participation limit reached',
    ACTIVE_ELIGIBILITY_RESTRICTION: 'An active eligibility restriction applies',
    ELIGIBILITY_CLOCK_EXPIRED: 'Eligibility clock expired',
    TRANSITION_POLICY_UNDETERMINED: 'Transfer transition policy is unknown',
    UNDERGRADUATE_MIDYEAR_TRANSFER_DELAY: 'Transfer waiting period applies',
  }
  return labels[reason] ?? toUserFacingTalentBlockedReason(reason)
}

function portalActionMessage(reason: string | null): string {
  if (reason === null) return 'Portal action completed.'
  const labels: Readonly<Record<string, string>> = {
    TRANSFER_PORTAL_AUTHORIZATION_REQUIRED: 'This Player is not authorized for recruitment by your program.',
    RECRUITING_NOT_OPEN: 'There is no open Recruiting cycle for this Portal entry.',
    TRANSFER_DESTINATION_UNAVAILABLE: 'Your program is not an available destination for this transfer.',
    PORTAL_REQUIREMENTS_INCOMPLETE: 'Complete the required education module before processing this notice.',
    PROCESSING_DEADLINE_EXCEEDED: 'The institution processing deadline has passed.',
    PORTAL_NOTICE_NOT_PENDING: 'This Portal notice is no longer pending.',
    PORTAL_ENTRY_NOT_ACTIVE: 'This Portal entry is no longer active.',
    NO_CONTROLLED_PROGRAM: 'You do not control the source program for this Portal action.',
  }
  return labels[reason] ?? toUserFacingTalentBlockedReason(reason)
}

export function TransferPortalWorkspace() {
  const world = useGameStore((state) => state.world)
  const addTransferRecruitToCycle = useGameStore((state) => state.addTransferRecruitToCycle)
  const completeTransferEducationModule = useGameStore((state) => state.completeTransferEducationModule)
  const processTransferPortalEntry = useGameStore((state) => state.processTransferPortalEntry)
  const withdrawTransferPortalEntry = useGameStore((state) => state.withdrawTransferPortalEntry)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [positionFilter, setPositionFilter] = useState('ALL')
  const [eligibilityFilter, setEligibilityFilter] = useState('ALL')
  const [levelFilter, setLevelFilter] = useState('ALL')
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [roleFitFilter, setRoleFitFilter] = useState('ALL')
  const [compensationFilter, setCompensationFilter] = useState('ALL')
  const [focusPlayerId, setFocusPlayerId] = useState(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('focusPlayerId'))
  const model = useMemo(() => {
    if (world === null) return null
    const team = getUserTeam(world)
    const competition = team === undefined ? undefined : Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id) && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
    const cycle = Object.values(world.recruitingCyclesById).find((item) => item.sourceSeasonId === world.currentSeasonId && item.ecosystemId === competition?.ecosystemId && item.status === 'open')
    const eligibilityByPlayer = new Map<string, typeof world.collegeEligibilityAssessmentsById[string]>()
    if (team !== undefined) {
      for (const assessment of Object.values(world.collegeEligibilityAssessmentsById).filter((item) => item.teamId === team.id).sort((a, b) => a.assessedOn.localeCompare(b.assessedOn))) eligibilityByPlayer.set(assessment.playerId, assessment)
    }
    const knowledgeByPlayer = new Map<string, { readonly domains: number; readonly lastAssessedAt?: string }>()
    if (team !== undefined) {
      for (const knowledge of world.organizationKnowledge.filter((item) => item.organizationId === team.organizationId)) {
        const dimensions = Object.values(knowledge.dimensions)
        knowledgeByPlayer.set(knowledge.subjectPlayerId, {
          domains: dimensions.length,
          ...(dimensions.length > 0 ? { lastAssessedAt: dimensions.map((item) => item.assessedAt).sort().at(-1) } : {}),
        })
      }
    }
    const entries = Object.values(world.transferPortalEntriesById)
      .filter((entry) => entry.ecosystemId === competition?.ecosystemId && (entry.status === 'authorized' || (entry.sourceTeamId === team?.id && entry.status === 'noticePending')))
      .sort((a, b) => b.notifiedOn.localeCompare(a.notifiedOn) || a.id.localeCompare(b.id))
    const players = new Map(buildTalentPortalPlayerViewModels(world).map((item) => [item.playerId, item]))
    return { team, competition, cycle, entries, eligibilityByPlayer, knowledgeByPlayer, players }
  }, [world])

  if (world === null || model === null) return <NgHoloShell appLabel="Transfer Portal" empty emptyMessage="No career loaded." region="transfer-portal-workspace" />
  if (!resolveGameCapabilities(world).isNcaa || model.competition === undefined) return <NgHoloShell appLabel="Transfer Portal" empty emptyMessage="The Transfer Portal applies to college pathways in this career." region="transfer-portal-workspace" />

  const positions = [...new Set(model.entries.map((entry) => world.players[entry.playerId]?.basketball.primaryPosition).filter((position): position is BasketballPosition => position !== undefined))].sort()
  const levels = [...new Set([...model.players.values()].map((item) => item.level))].sort()
  const regions = [...new Set([...model.players.values()].map((item) => item.region).filter((item): item is string => item !== null))].sort()
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleEntries = model.entries.filter((entry) => {
    const player = world.players[entry.playerId]
    const source = world.teams[entry.sourceTeamId]
    const view = model.players.get(entry.playerId)
    const text = `${player?.firstName ?? ''} ${player?.lastName ?? ''} ${source?.name ?? ''}`.toLocaleLowerCase()
    const compensationContext = view?.retention && (view.retention.athleticsAidMinorUnits > 0 || view.retention.institutionalBenefitsMinorUnits > 0 || view.retention.activeNilDeals > 0)
    return (normalizedQuery === '' || text.includes(normalizedQuery)) && (positionFilter === 'ALL' || player?.basketball.primaryPosition === positionFilter)
      && (eligibilityFilter === 'ALL' || view?.eligibility === eligibilityFilter)
      && (levelFilter === 'ALL' || view?.level === levelFilter)
      && (regionFilter === 'ALL' || view?.region === regionFilter)
      && (roleFitFilter === 'ALL' || view?.roleFit === roleFitFilter)
      && (compensationFilter === 'ALL' || (compensationFilter === 'KNOWN' ? Boolean(compensationContext) : Boolean(view?.retention && !compensationContext)))
      && (focusPlayerId === null || focusPlayerId === entry.playerId)
  })

  return (
    <NgHoloShell appLabel="Transfer Portal" meta={`${model.entries.length} visible entries`} region="transfer-portal-workspace" title="Authorized transfer activity">
      <TalentOperationsNav current="portal" />
      {feedback ? <p aria-live="polite" className="ng-canon__note">{feedback}</p> : null}
      <section aria-label="Transfer Portal entries" className="ng-canon__panel ng-holo-panel">
        <p className="ng-canon__note">This list uses authorized Portal records in your college ecosystem. Source program recruiting relationships and private motivations are not shown.</p>
        {focusPlayerId ? <p className="ng-canon__note">Focused on {world.players[focusPlayerId as keyof typeof world.players]?.firstName ?? 'selected'} {world.players[focusPlayerId as keyof typeof world.players]?.lastName ?? 'Player'}. <button className="ng-canon__link" onClick={() => { const url = new URL(window.location.href); url.searchParams.delete('focusPlayerId'); window.history.replaceState(window.history.state, '', url); setFocusPlayerId(null) }} type="button">Show full list</button></p> : null}
        <div className="talent-portal-filters">
          <label>Search Players or institution<input aria-label="Search Portal Players" onChange={(event) => setQuery(event.target.value)} value={query} /></label>
          <label>Position<select aria-label="Filter Portal position" onChange={(event) => setPositionFilter(event.target.value)} value={positionFilter}><option value="ALL">All positions</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
          <label>Eligibility<select aria-label="Filter Portal eligibility" onChange={(event) => setEligibilityFilter(event.target.value)} value={eligibilityFilter}><option value="ALL">Any eligibility</option>{['Unknown', 'Eligible', 'Blocked'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Level<select aria-label="Filter Portal level" onChange={(event) => setLevelFilter(event.target.value)} value={levelFilter}><option value="ALL">Any pathway</option>{levels.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Region<select aria-label="Filter Portal region" onChange={(event) => setRegionFilter(event.target.value)} value={regionFilter}><option value="ALL">Any region</option>{regions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Position need<select aria-label="Filter Portal role fit" onChange={(event) => setRoleFitFilter(event.target.value)} value={roleFitFilter}><option value="ALL">Any position need</option>{['High position need', 'Moderate position need', 'Low position need', 'Unknown'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Compensation context<select aria-label="Filter Portal compensation context" onChange={(event) => setCompensationFilter(event.target.value)} value={compensationFilter}><option value="ALL">Any context</option><option value="KNOWN">Known aid, benefits or NIL</option><option value="NONE">No current agreement</option></select></label>
          <span>{visibleEntries.length} / {model.entries.length} entries</span>
        </div>
        {visibleEntries.length === 0 ? <p className="ng-canon__empty">{model.entries.length === 0 ? "No authorized transfer Players currently match your program's ecosystem." : 'No authorized transfer Players match these filters.'}</p> : (
          <div className="ng-canon__table-wrap"><table className="ng-canon__table"><thead><tr><th>Player</th><th>Source institution</th><th>Portal status</th><th>Entered</th><th>Exception</th><th>Program knowledge</th><th>Eligibility</th><th>Production (GP / MIN / PTS / REB / AST)</th><th>Rules source</th><th>Retention / action</th></tr></thead><tbody>
            {visibleEntries.map((entry) => {
              const player = world.players[entry.playerId]
              const source = world.teams[entry.sourceTeamId]
              const assessment = model.eligibilityByPlayer.get(entry.playerId)
              const knowledge = model.knowledgeByPlayer.get(entry.playerId)
              const view = model.players.get(entry.playerId)
              const rules = world.transferPortalRulesetsById[entry.rulesetId]
              const profile = Object.values(world.recruitProfilesById).find((item) => item.transferPortalEntryId === entry.id)
              const isOwnPlayer = entry.sourceTeamId === model.team?.id
              const canRecruit = !isOwnPlayer && model.team !== undefined && canRecruitTransferPlayer(world, entry.playerId, model.team.id)
              return <tr key={entry.id}>
                <td>{player ? `${player.firstName} ${player.lastName}` : 'Player record unavailable'}{isOwnPlayer ? <span className="ng-canon__note"> · Your roster</span> : null}</td>
                <td>{source?.name ?? 'Institution unavailable'}</td>
                <td>{entry.status === 'authorized' ? 'Authorized' : 'Notice pending'}</td>
                <td>{entry.notifiedOn}</td>
                <td>{entry.exception?.replaceAll('_', ' ') ?? 'Standard notice'}</td>
                <td>{knowledge === undefined || knowledge.domains === 0 ? 'No scouting knowledge recorded' : `${knowledge.domains} known areas${knowledge.lastAssessedAt ? ` · updated ${knowledge.lastAssessedAt}` : ''}`}</td>
                <td>{assessment === undefined ? 'Unknown · no program assessment' : <>{assessment.eligible ? 'Eligible' : `Blocked · ${assessment.reasons.filter((reason) => reason !== 'ELIGIBLE').map(eligibilityReasonLabel).join('; ')}`} · assessed {assessment.assessedOn}</>}</td>
                <td>{view ? `${view.production.games} / ${view.production.minutes} / ${view.production.points} / ${view.production.rebounds} / ${view.production.assists}` : 'No production recorded'}</td>
                <td>{rules?.provenance === 'OFFICIAL_SOURCE' ? 'Official source' : rules?.provenance === 'SIMULATED_CARRY_FORWARD' ? `Simulated carry-forward${rules.basedOnRulesetId ? ` · based on ${rules.basedOnRulesetId}` : ''}` : 'Unknown rules provenance'}</td>
                <td>{isOwnPlayer ? <>
                  {view?.retention ? <details open><summary>Retention · {view.retention.tone}</summary><p>Stay reasons: {view.retention.stayReasons.join(' ') || 'None recorded.'}</p><p>Leave reasons: {view.retention.leaveReasons.join(' ') || 'None recorded.'}</p><p>Unresolved: {view.retention.unresolvedConcerns.join(' ') || 'None.'}</p><p>Role: {view.retention.gamesStarted}/{view.retention.gamesPlayed} starts · {view.retention.minutesPerGame.toFixed(1)} MIN · Head Coach {view.retention.headCoach} · Recruiting relationship trust {view.retention.relationshipTrust ?? 'Unknown'}</p><p>Promise fulfillment: {view.retention.promises.map((promise) => `${promise.topic}: ${promise.fulfillment}`).join('; ') || 'No measurable promise recorded.'}</p><p>Athletics Aid: {view.retention.athleticsAidMinorUnits.toLocaleString()} · Institutional Benefits: {view.retention.institutionalBenefitsMinorUnits.toLocaleString()} · Third-party NIL deals: {view.retention.activeNilDeals}</p><p>Portal: {view.retention.portalStatus}{view.retention.portalDeadline ? ` · processing due ${view.retention.portalDeadline}` : ''}</p></details> : null}
                  {entry.status === 'noticePending' ? <>
                    {!entry.educationalModuleCompletedOn ? <button className="ng-canon__action" onClick={() => { const result = completeTransferEducationModule(entry.id); setFeedback(result === null ? `Education module complete; institutional processing due ${world.transferPortalEntriesById[entry.id]?.processingDueOn ?? 'date unavailable'}.` : portalActionMessage(result)) }} type="button">Complete education module</button> : <span>Module complete · processing due {entry.processingDueOn ?? 'not set'} </span>}
                    {entry.educationalModuleCompletedOn && entry.processingDueOn && world.currentDate <= entry.processingDueOn ? <button className="ng-canon__action" onClick={() => { const result = processTransferPortalEntry(entry.id); setFeedback(result === null ? 'Portal notice processed; the entry is authorized.' : portalActionMessage(result)) }} type="button">Process notice</button> : null}
                    {entry.educationalModuleCompletedOn && entry.processingDueOn && world.currentDate > entry.processingDueOn ? <span role="status">{toUserFacingTalentBlockedReason('PROCESSING_DEADLINE_EXCEEDED')}</span> : null}
                  </> : null}
                  {entry.status === 'authorized' ? <><p className="ng-canon__note">Withdrawing cancels the current transfer entry and closes any active transfer Recruiting profile.</p><button className="ng-canon__action" onClick={() => { const result = withdrawTransferPortalEntry(entry.id); setFeedback(result === null ? 'Portal entry withdrawn; the Player remains with the program.' : portalActionMessage(result)) }} type="button">Withdraw Portal entry</button></> : null}
                  <button className="ng-canon__action" onClick={() => player && navigateToPlayer(entry.playerId)} type="button">Open Player pathway</button>
                </> : profile !== undefined ? <button className="ng-canon__action" onClick={() => navigateToRecruitingPlayer(entry.playerId)} type="button">Open Recruiting</button> : entry.status === 'authorized' && model.cycle !== undefined && canRecruit ? <button className="ng-canon__action" onClick={() => { const result = addTransferRecruitToCycle(entry.id); setFeedback(result === null ? 'Player added to the current recruiting cycle.' : portalActionMessage(result)); if (result === null) navigateToRecruitingPlayer(entry.playerId) }} type="button">Add to Recruiting</button> : <span>{entry.status !== 'authorized' ? 'Awaiting authorization' : model.cycle === undefined ? 'No open recruiting cycle' : 'Transfer destination requirements are not met.'}</span>}</td>
              </tr>
            })}
          </tbody></table></div>
        )}
      </section>
    </NgHoloShell>
  )
}
