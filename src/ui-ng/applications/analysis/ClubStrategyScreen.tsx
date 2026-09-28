import type { GameWorld } from '@/domain/world'
import { assessClubStrategy } from '@/engine/clubStrategy/ClubStrategyEngine'
import { assessClubNeeds, type ClubNeedKind } from '@/engine/clubNeeds'

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

function formatEvidenceValue(value: string | number | boolean | readonly (string | number | boolean)[] | readonly Readonly<Record<string, string | number | boolean>>[]): string {
  return Array.isArray(value) ? value.map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ') : String(value)
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
        const needsAssessment = assessClubNeeds(world, team.id)
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
              {need.relatedPlayerIds.length > 0 && <div>Related roster players: {need.relatedPlayerIds.map((id) => `${world.players[id]?.firstName ?? 'Unknown'} ${world.players[id]?.lastName ?? ''} (${id})`).join(', ')}</div>}
              {need.evidence.map((evidence) => <div key={evidence.code}><small>{evidence.code}: {Object.entries(evidence.values).map(([key, value]) => `${key}=${formatEvidenceValue(value)}`).join(' · ')}</small></div>)}
            </li>)}</ol>}
          </section>
        </article>
      })}
      {clubs.length === 0 && <p>No coached clubs are currently available for inspection.</p>}
    </div>
  </section>
}
