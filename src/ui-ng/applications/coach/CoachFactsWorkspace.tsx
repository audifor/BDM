import { useState, type ReactNode } from 'react'
import { getEligibleCoachJobs } from '@/app/coachCareer'
import { COACH_REPUTATION_DIMENSIONS, getCoachReputationBand, getRecentCoachReputationEvents } from '@/domain/coachReputation'
import { getRelationshipsForPerson, type GameWorld } from '@/domain/world'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { COACH_PERK_CATALOG, COACH_SKILL_CATALOG } from '@/engine/coach'
import { coachReputationEventLabel, coachReputationSourceLabel } from '@/ui/coachReputationPresentation'
import { formatPrototypeDate } from '@/ui/formatters'

export type CoachFactsTab = 'overview' | 'opportunities' | 'career' | 'reputation' | 'legacy'
type Navigate = (tab: string) => void
const DIMENSIONS = {
  competitive: 'Competitive', development: 'Development',
  professional: 'Professional', publicStanding: 'Public standing',
} as const
const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const money = (amount: number) => CURRENCY.format(amount)
const date = (value: string) => formatPrototypeDate(value as never)

function Panel({ title, hint, action, children, className = '' }: {
  readonly title: string; readonly hint?: string; readonly action?: ReactNode;
  readonly children: ReactNode; readonly className?: string
}) {
  return <section className={'coach-truth__panel ' + className}>
    <header className="coach-truth__panel-head"><div><h2>{title}</h2>{hint && <small>{hint}</small>}</div>{action}</header>
    <div className="coach-truth__content">{children}</div>
  </section>
}
function Nav({ tab, children, onNavigate }: { readonly tab: string; readonly children: ReactNode; readonly onNavigate: Navigate }) {
  return <button className="coach-truth__link" type="button" onClick={() => onNavigate(tab)}>{children} ↗</button>
}
function Progress({ value, max = 100 }: { readonly value: number; readonly max?: number }) {
  return <span className="coach-truth__bar" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span style={{ width: Math.max(0, Math.min(100, (value / max) * 100)) + '%' }} />
  </span>
}
function Metric({ label, value, muted }: { readonly label: string; readonly value: ReactNode; readonly muted?: boolean }) {
  return <div className="coach-truth__metric"><small>{label}</small><strong className={muted ? 'is-muted' : ''}>{value}</strong></div>
}
function Empty({ children }: { readonly children: ReactNode }) {
  return <p className="coach-truth__empty">{children}</p>
}
function coachTeam(world: GameWorld) {
  const employment = world.coachEmploymentByCoachId[world.userCoachId]
  return employment?.teamId ? world.teams[employment.teamId] : undefined
}
function completedRecord(world: GameWorld, teamId?: string) {
  if (!teamId) return { played: 0, won: 0, lost: 0 }
  const games = Object.values(world.games).filter((game) =>
    game.status === 'completed' && game.result !== null && (game.homeTeamId === teamId || game.awayTeamId === teamId))
  const won = games.filter((game) => game.homeTeamId === teamId
    ? game.result!.homeScore > game.result!.awayScore : game.result!.awayScore > game.result!.homeScore).length
  return { played: games.length, won, lost: games.length - won }
}

export function CoachFactsWorkspace({ world, tab, onNavigate, onApply, onAcceptOffer, onDeclineOffer }: {
  readonly world: GameWorld; readonly tab: CoachFactsTab; readonly onNavigate: Navigate;
  readonly onApply: (jobId: string) => void; readonly onAcceptOffer: (offerId: string) => void;
  readonly onDeclineOffer: (offerId: string) => void
}) {
  if (tab === 'overview') return <Overview world={world} onNavigate={onNavigate} />
  if (tab === 'opportunities') return <Opportunities world={world} onApply={onApply} onAcceptOffer={onAcceptOffer} onDeclineOffer={onDeclineOffer} />
  if (tab === 'career') return <Career world={world} onNavigate={onNavigate} />
  if (tab === 'reputation') return <Reputation world={world} onNavigate={onNavigate} />
  return <Legacy world={world} onNavigate={onNavigate} />
}

function Overview({ world, onNavigate }: { readonly world: GameWorld; readonly onNavigate: Navigate }) {
  const coach = world.coaches[world.userCoachId]!
  const team = coachTeam(world)
  const rpg = world.coachRpgProfilesByCoachId[coach.id]
  const reputation = world.coachReputationProfilesByCoachId[coach.id]
  const professional = world.staffPeopleById[coach.staffProfileId]?.professional
  const employment = world.coachEmploymentByCoachId[coach.id]
  const finance = world.coachFinancesByCoachId[coach.id]
  const legacy = world.coachLegacyByCoachId[coach.id]
  const matches = completedRecord(world, team?.id)
  const relationships = getRelationshipsForPerson(world, coach.id)
  const offers = Object.values(world.coachJobOffersById).filter((offer) => offer.coachId === coach.id && offer.status === 'pending')
  const activeJobs = getEligibleCoachJobs(world, coach.id).filter((job) => job.eligibility.eligible).length
  const skillRanks = rpg ? Object.values(rpg.skills).reduce((sum, item) => sum + item.rank, 0) : 0
  const earnedPerks = rpg ? Object.values(rpg.perks).filter((item) => item.rank > 0).length : 0
  const topAttributes = professional === undefined ? [] : STAFF_PROFESSIONAL_ATTRIBUTE_KEYS
    .map((key) => ({ key, value: professional.attributes[key] })).sort((a, b) => b.value - a.value).slice(0, 5)
  return <div className="coach-truth" data-coach-truth="overview">
    <div className="coach-truth__overview-top">
      <Panel title="COACH IDENTITY" hint="Canonical professional profile">
        <div className="coach-truth__identity">
          <div className="coach-truth__avatar">{coach.firstName[0]}{coach.lastName[0]}</div>
          <div><h3>{coach.firstName} {coach.lastName}</h3>
            <p>{team?.name ?? 'Unemployed'} · {team ? 'Head coach' : 'Available for work'}</p>
            <small>{employment?.startedOn ? 'Appointed ' + date(employment.startedOn) : 'Career profile'}</small></div>
        </div>
        <div className="coach-truth__stats">
          <Metric label="Competitive record" value={matches.played ? matches.won + 'W / ' + matches.lost + 'L' : 'No completed games'} />
          <Metric label="Annual salary" value={finance ? money(finance.annualSalary) : 'Not recorded'} />
          <Metric label="Career legacy" value={legacy?.status ?? 'Not established'} />
        </div>
      </Panel>
      <Panel title="YOUR COACH BUILD" hint="Real skills and perks" action={<Nav tab="development" onNavigate={onNavigate}>Develop</Nav>}>
        <div className="coach-truth__stats">
          <Metric label="Development points" value={rpg?.development.developmentPoints ?? 'Unavailable'} />
          <Metric label="Skill ranks" value={skillRanks} />
          <Metric label="Unlocked perks" value={earnedPerks} />
        </div>
        {rpg && <><small className="coach-truth__subheading">Global development progress</small>
          <Progress value={rpg.development.globalProgress} />
          <small className="coach-truth__muted">{rpg.development.globalProgress.toFixed(1)} progress units recorded</small></>}
        {topAttributes.length > 0 && <div className="coach-truth__attributes">{topAttributes.map(({ key, value }) =>
          <div key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><Progress value={value} /><strong>{value}</strong></div>)}</div>}
      </Panel>
      <Panel title="ACTIVE DECISIONS" hint="Based on the present career">
        <div className="coach-truth__action-list">
          {rpg && rpg.development.developmentPoints > 0 && <button onClick={() => onNavigate('development')}>Spend {rpg.development.developmentPoints} development points <span>↗</span></button>}
          {offers.length > 0 && <button onClick={() => onNavigate('opportunities')}>Review {offers.length} pending job offer(s)<span>↗</span></button>}
          {activeJobs > 0 && <button onClick={() => onNavigate('opportunities')}>Explore {activeJobs} eligible job openings<span>↗</span></button>}
          <button onClick={() => onNavigate('relationships')}>Review {relationships.length} recorded relationships<span>↗</span></button>
          <button onClick={() => onNavigate('career')}>Review career record<span>↗</span></button>
        </div>
      </Panel>
    </div>
    <div className="coach-truth__overview-bottom">
      <Panel title="REPUTATION" hint="Four stored dimensions, 0–1000" action={<Nav tab="reputation" onNavigate={onNavigate}>Details</Nav>}>
        {reputation ? <div className="coach-truth__bars">{COACH_REPUTATION_DIMENSIONS.map((key) =>
          <div key={key}><span>{DIMENSIONS[key]}</span><Progress value={reputation.values[key]} max={1000} /><strong>{reputation.values[key]}</strong></div>)}</div> : <Empty>Not recorded.</Empty>}
      </Panel>
      <Panel title="RELATIONSHIPS" hint="Only materialized connections" action={<Nav tab="relationships" onNavigate={onNavigate}>Network</Nav>}>
        <div className="coach-truth__stats"><Metric label="Recorded relationships" value={relationships.length} /></div>
        {relationships.length === 0 ? <Empty>Interactions will appear here when they are recorded by the simulation.</Empty> : <div className="coach-truth__compact-list">
          {relationships.slice(0, 4).map((item) => <div key={item.sourceId + item.targetId}><span>{item.sourceId === coach.id ? item.targetId : item.sourceId}</span><strong>{item.value > 0 ? '+' : ''}{item.value}</strong></div>)}</div>}
      </Panel>
      <Panel title="CAREER MARKET" hint="Openings and decisions" action={<Nav tab="opportunities" onNavigate={onNavigate}>Market</Nav>}>
        <div className="coach-truth__stats">
          <Metric label="Open jobs" value={getEligibleCoachJobs(world, coach.id).length} />
          <Metric label="Eligible" value={activeJobs} />
          <Metric label="Pending offers" value={offers.length} />
        </div>
      </Panel>
      <Panel title="LEGACY" hint="Recorded achievements only" action={<Nav tab="legacy" onNavigate={onNavigate}>History</Nav>}>
        <div className="coach-truth__stats">
          <Metric label="Legacy score" value={legacy?.legacyValue ?? 0} />
          <Metric label="Hall status" value={legacy?.hallStatus ?? 'Not eligible'} />
          <Metric label="Achievements" value={Object.values(world.coachAchievementsById).filter((item) => item.coachId === coach.id).length} />
        </div>
      </Panel>
    </div>
  </div>
}

function Opportunities({ world, onApply, onAcceptOffer, onDeclineOffer }: {
  readonly world: GameWorld; readonly onApply: (id: string) => void;
  readonly onAcceptOffer: (id: string) => void; readonly onDeclineOffer: (id: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'eligible' | 'ineligible'>('all')
  const coachId = world.userCoachId
  const openings = getEligibleCoachJobs(world, coachId)
  const offers = Object.values(world.coachJobOffersById).filter((item) => item.coachId === coachId)
  const candidacies = Object.values(world.coachJobCandidaciesById).filter((item) => item.coachId === coachId)
  const visible = openings.filter((item) => filter === 'all' || item.eligibility.eligible === (filter === 'eligible'))
  return <div className="coach-truth" data-coach-truth="opportunities">
    <div className="coach-truth__stats coach-truth__stats--full">
      <Metric label="Open positions" value={openings.length} /><Metric label="Eligible positions" value={openings.filter((i) => i.eligibility.eligible).length} />
      <Metric label="Active candidacies" value={candidacies.filter((i) => i.status !== 'hired' && i.status !== 'withdrawn' && i.status !== 'rejected').length} />
      <Metric label="Pending offers" value={offers.filter((item) => item.status === 'pending').length} />
    </div>
    <Panel title="JOB OFFERS" hint="Real proposals awaiting your decision">
      {offers.length === 0 ? <Empty>No offers recorded.</Empty> : <div className="coach-truth__table-wrap"><table><thead><tr><th>Club</th><th>Annual salary</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>{offers.map((item) =>
        <tr key={item.id}><td>{world.teams[item.teamId]?.name ?? item.teamId}</td><td>{item.annualSalary === undefined ? 'Not specified' : money(item.annualSalary)}</td><td>{date(item.createdOn)}</td><td>{item.status}</td>
          <td>{item.status === 'pending' && <div className="coach-truth__button-row"><button onClick={() => onAcceptOffer(item.id)}>Accept</button><button className="is-secondary" onClick={() => onDeclineOffer(item.id)}>Decline</button></div>}</td></tr>)}</tbody></table></div>}
    </Panel>
    <Panel title="OPEN POSITIONS" hint="Actual vacancies and canonical eligibility" action={<div className="coach-truth__filter">
      {(['all','eligible','ineligible'] as const).map((item) => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}
    </div>}>
      {visible.length === 0 ? <Empty>{openings.length === 0 ? 'No vacancies have been generated by the career simulation.' : 'No vacancies match this filter.'}</Empty> :
        <div className="coach-truth__table-wrap"><table><thead><tr><th>Club</th><th>Created</th><th>Requirements</th><th>Eligibility</th><th>Decision</th></tr></thead><tbody>{visible.map(({ opening, eligibility }) =>
          <tr key={opening.id}><td><strong>{world.teams[opening.teamId]?.name ?? opening.teamId}</strong></td><td>{date(opening.createdOn)}</td>
            <td>{opening.reputationRequirement?.minimum ? Object.entries(opening.reputationRequirement.minimum).map(([key,value]) => DIMENSIONS[key as keyof typeof DIMENSIONS] + ' ' + value).join(' · ') || 'None' : 'None'}</td>
            <td>{eligibility.eligible ? 'Eligible' : 'Reputation below requirements'}</td>
            <td><button disabled={!eligibility.eligible || candidacies.some((item) => item.jobOpeningId === opening.id && ['identified','interviewing','offered'].includes(item.status))}
              onClick={() => onApply(opening.id)}>{candidacies.some((item) => item.jobOpeningId === opening.id && ['identified','interviewing','offered'].includes(item.status)) ? 'In process' : 'Apply'}</button></td></tr>)}</tbody></table></div>}
    </Panel>
    <Panel title="APPLICATION HISTORY" hint="Only materialized candidacies">
      {candidacies.length === 0 ? <Empty>No applications recorded.</Empty> :
        <div className="coach-truth__compact-list">{candidacies.map((item) =>
          <div key={item.id}><span>{world.teams[world.coachJobOpeningsById[item.jobOpeningId]?.teamId!]?.name ?? item.jobOpeningId}</span><strong>{item.status}</strong><small>{date(item.createdOn)}</small></div>)}</div>}
    </Panel>
  </div>
}

function Career({ world, onNavigate }: { readonly world: GameWorld; readonly onNavigate: Navigate }) {
  const coachId = world.userCoachId
  const team = coachTeam(world)
  const employment = world.coachEmploymentByCoachId[coachId]
  const history = world.coachCareerHistoryByCoachId[coachId] ?? []
  const tenures = Object.values(world.coachTenuresById).filter((item) => item.coachId === coachId).sort((a,b) => b.startedOn.localeCompare(a.startedOn))
  const record = completedRecord(world, team?.id)
  return <div className="coach-truth" data-coach-truth="career">
    <div className="coach-truth__stats coach-truth__stats--full">
      <Metric label="Current club" value={team?.name ?? 'Unemployed'} />
      <Metric label="Appointed" value={employment?.startedOn ? date(employment.startedOn) : 'Not employed'} />
      <Metric label="Current match record" value={record.won + '–' + record.lost} />
      <Metric label="Completed games" value={record.played} />
    </div>
    <Panel title="CAREER TRAJECTORY" hint="Real results from completed matches">
      {record.played === 0 ? <Empty>Season in progress. No completed matches yet. The win rate will appear after the first result.</Empty> :
        <div className="coach-truth__record"><strong>{Math.round(record.won / record.played * 100)}%</strong><div><small>Current club win percentage</small><Progress value={record.won / record.played * 100} /></div><span>{record.won} wins · {record.lost} losses</span></div>}
    </Panel>
    <div className="coach-truth__columns">
      <Panel title="CAREER EVENTS" hint="Appointments and departures" action={<Nav tab="opportunities" onNavigate={onNavigate}>Opportunities</Nav>}>
        {history.length === 0 ? <Empty>No employment transitions recorded yet.</Empty> :
          <div className="coach-truth__compact-list">{[...history].reverse().map((item, index) =>
            <div key={item.date + item.teamId + index}><span><b>{date(item.date)}</b> · {world.teams[item.teamId]?.name ?? item.teamId}</span><strong>{item.reason}</strong></div>)}</div>}
      </Panel>
      <Panel title="TENURES" hint="Persisted coaching appointments">
        {tenures.length === 0 ? <Empty>Your first tenure is underway. A completed spell will appear when recorded by the game.</Empty> :
          <div className="coach-truth__compact-list">{tenures.map((item) =>
            <div key={item.id}><span>{world.teams[item.teamId]?.name ?? item.teamId} · {date(item.startedOn)}</span><strong>{item.seasonsManaged ?? 0} seasons</strong><small>{item.endedOn ? date(item.endedOn) : 'Active'}</small></div>)}</div>}
      </Panel>
    </div>
  </div>
}

function Reputation({ world, onNavigate }: { readonly world: GameWorld; readonly onNavigate: Navigate }) {
  const reputation = world.coachReputationProfilesByCoachId[world.userCoachId]
  if (!reputation) return <Empty>Reputation is not available for this coach.</Empty>
  const events = getRecentCoachReputationEvents(reputation, 30)
  return <div className="coach-truth" data-coach-truth="reputation">
    <Panel title="REPUTATION PROFILE" hint="The four canonical dimensions, not invented audiences">
      <div className="coach-truth__reputation">{COACH_REPUTATION_DIMENSIONS.map((key) =>
        <div key={key}><div><span>{DIMENSIONS[key]}</span><strong>{reputation.values[key]} <small>/1000</small></strong></div>
          <Progress max={1000} value={reputation.values[key]} /><small>{getCoachReputationBand(reputation.values[key])}</small></div>)}</div>
    </Panel>
    <Panel title="CAUSES & CHANGES" hint="Real reputation events from the simulation" action={<Nav tab="career" onNavigate={onNavigate}>Career</Nav>}>
      {events.length === 0 ? <Empty>No reputation events recorded. Match results, season achievements and professional actions will generate changes.</Empty> :
        <div className="coach-truth__table-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Source</th><th>Impact</th></tr></thead><tbody>{events.map((event) =>
          <tr key={event.id}><td>{date(event.gameDate)}</td><td>{coachReputationEventLabel(world,event)}</td><td>{coachReputationSourceLabel(event.source)}</td>
            <td>{Object.entries(event.deltas).filter(([,v])=>v!==0).map(([k,v])=>DIMENSIONS[k as keyof typeof DIMENSIONS] + ' ' + (v!>0?'+':'')+v).join(' · ') || '0'}</td></tr>)}</tbody></table></div>}
    </Panel>
  </div>
}

function Legacy({ world, onNavigate }: { readonly world: GameWorld; readonly onNavigate: Navigate }) {
  const coachId = world.userCoachId
  const state = world.coachLegacyByCoachId[coachId]
  const achievements = Object.values(world.coachAchievementsById).filter((item) => item.coachId === coachId).sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn))
  const clubs = Object.values(world.coachTeamLegacyByKey).filter((item) => item.coachId === coachId)
  return <div className="coach-truth" data-coach-truth="legacy">
    <div className="coach-truth__stats coach-truth__stats--full">
      <Metric label="Historical status" value={state?.status ?? 'Unproven'} />
      <Metric label="Legacy value" value={state?.legacyValue ?? 0} />
      <Metric label="Hall of fame status" value={state?.hallStatus ?? 'Not eligible'} />
      <Metric label="Recorded achievements" value={achievements.length} />
    </div>
    <div className="coach-truth__columns">
      <Panel title="HONOURS & ACHIEVEMENTS" hint="Verified career achievements only" action={<Nav tab="career" onNavigate={onNavigate}>Career</Nav>}>
        {achievements.length === 0 ? <Empty>No achievements yet. They will appear after qualifying competitive events.</Empty> :
          <div className="coach-truth__compact-list">{achievements.map((item) =>
            <div key={item.id}><span>{date(item.occurredOn)} · {world.teams[item.teamId!]?.name ?? 'Career'}</span>
              <strong>{item.type}</strong><small>+{item.legacyValue}</small></div>)}</div>}
      </Panel>
      <Panel title="IMPACT BY CLUB" hint="Persisted club legacy only">
        {clubs.length === 0 ? <Empty>No club legacy calculated yet.</Empty> :
          <div className="coach-truth__compact-list">{clubs.map((item) =>
            <div key={item.teamId}><span>{world.teams[item.teamId]?.name ?? item.teamId}</span><strong>{item.status}</strong><small>{item.legacyValue} points</small></div>)}</div>}
      </Panel>
    </div>
  </div>
}
