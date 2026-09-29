import type { GameWorld } from '@/domain/world'
import { assessClubStrategy } from '@/engine/clubStrategy/ClubStrategyEngine'
import type { ClubNeedKind } from '@/engine/clubNeeds'
import { assessGMDecisionContext, type GMResponseOptionKind } from '@/engine/gmDecisionContext'
import { inspectGMPlanWorkflows } from '@/app/gmPlanning'
import { assessRoutedMarketCandidates } from '@/app/marketIntelligence'

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

export function ClubStrategyScreen({ world }: { readonly world: GameWorld }) {
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
        const marketCandidateReviews = assessRoutedMarketCandidates(world, team.id)
        const needsAssessment = decisionContext.needsAssessment
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
