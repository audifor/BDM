import type { GameWorld } from '@/domain/world'
import { assessClubStrategy } from '@/engine/clubStrategy/ClubStrategyEngine'

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

export function ClubStrategyScreen({ world }: { readonly world: GameWorld }) {
  const clubs = Object.values(world.teams)
    .filter((team) => team.coachId !== undefined && team.coachId !== world.userCoachId)
    .sort((a, b) => a.name.localeCompare(b.name))

  return <section className="screen" aria-label="AI club strategy">
    <header className="page-heading"><div><p className="eyebrow">Club intelligence</p><h1>AI club strategies</h1><p>Accepted direction and the structured evidence behind it.</p></div></header>
    <div className="content-panel" style={{ display: 'grid', gap: 16 }}>
      {clubs.map((team) => {
        const assessment = assessClubStrategy(world, team.id)
        const state = world.clubStrategicStatesByTeamId[team.id]
        return <article key={team.id} aria-label={`${team.name} ${team.gender} strategy`} style={{ borderBottom: '1px solid rgba(255,255,255,.12)', paddingBottom: 16 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>{team.name} <small>{team.gender}</small></h2>
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
        </article>
      })}
      {clubs.length === 0 && <p>No AI-controlled clubs are currently available for inspection.</p>}
    </div>
  </section>
}
