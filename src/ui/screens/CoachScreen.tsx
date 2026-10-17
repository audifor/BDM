import { useState, type ReactNode } from 'react'
import { COACH_REPUTATION_DIMENSIONS, getCoachReputationBand, getRecentCoachReputationEvents } from '@/domain/coachReputation'
import type { CoachPerkId, CoachSkillId } from '@/domain/ids'
import { getRelationshipBandForPeople, getRelationshipsForPerson, type GameWorld } from '@/domain/world'
import { COACH_PERK_CATALOG, COACH_SKILL_CATALOG } from '@/engine/coach'
import { evaluateCoachJobEligibility } from '@/domain/coachCareer'
import { formatPrototypeDate } from '@/ui/formatters'
import { coachReputationEventLabel, coachReputationSourceLabel, formatCoachReputationDelta } from '@/ui/coachReputationPresentation'
import { BdmButton } from '@/ui/components/designSystem'
import { LegacyScreen } from './LegacyScreen'
import './CoachScreen.css'

type CoachTab = 'overview' | 'opportunities' | 'career' | 'reputation' | 'relationships' | 'development' | 'legacy'
type Employment = GameWorld['coachEmploymentByCoachId'][keyof GameWorld['coachEmploymentByCoachId']]
type Opening = GameWorld['coachJobOpeningsById'][keyof GameWorld['coachJobOpeningsById']]
type Offer = GameWorld['coachJobOffersById'][keyof GameWorld['coachJobOffersById']]
type Professional = GameWorld['staffPeopleById'][keyof GameWorld['staffPeopleById']]['professional']
type Reputation = GameWorld['coachReputationProfilesByCoachId'][keyof GameWorld['coachReputationProfilesByCoachId']]
type Rpg = GameWorld['coachRpgProfilesByCoachId'][keyof GameWorld['coachRpgProfilesByCoachId']]
type Relationships = ReturnType<typeof getRelationshipsForPerson>

const TABS: readonly { id: CoachTab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'opportunities', label: 'Opportunities' },
  { id: 'career', label: 'Career' }, { id: 'reputation', label: 'Reputation' },
  { id: 'relationships', label: 'Relationships' }, { id: 'development', label: 'Development' },
  { id: 'legacy', label: 'Legacy' },
]
const DIMENSIONS = { competitive: 'Competitive', development: 'Development', professional: 'Professional', publicStanding: 'Public Standing' } as const
const ATTRIBUTES: Readonly<Record<string, string>> = {
  coaching: 'Coaching', tacticalKnowledge: 'Tactical knowledge', playerDevelopment: 'Player development',
  talentEvaluation: 'Talent evaluation', potentialEvaluation: 'Potential evaluation',
  medicalKnowledge: 'Medical knowledge', rehabilitation: 'Rehabilitation', analysis: 'Analysis',
  leadership: 'Leadership', communication: 'Communication', motivation: 'Motivation',
  discipline: 'Discipline', adaptability: 'Adaptability',
}
const formatBand = (band: string) => band.slice(0, 1).toUpperCase() + band.slice(1)
const clamp = (number: number, max: number) => Math.min(100, Math.max(0, number / max * 100))

function Panel({ title, eyebrow, action, children, className = '' }: {
  readonly title: string; readonly eyebrow?: string; readonly action?: ReactNode
  readonly children: ReactNode; readonly className?: string
}) {
  return <section className={'coach-courtside__panel ' + className}>
    <header className="coach-courtside__panel-header"><div>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2></div>{action}</header>
    <div className="coach-courtside__panel-body">{children}</div>
  </section>
}
function Meter({ value, max = 100, tone = 'orange' }: { readonly value: number; readonly max?: number; readonly tone?: 'orange' | 'cyan' }) {
  return <span className={'coach-courtside__meter coach-courtside__meter--' + tone} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span style={{ width: clamp(value, max) + '%' }} />
  </span>
}
function Empty({ children }: { readonly children: ReactNode }) { return <p className="coach-courtside__empty">{children}</p> }
function personLabel(world: GameWorld, id: string) {
  const player = world.players[id as keyof typeof world.players]
  if (player) return { name: player.firstName + ' ' + player.lastName, kind: 'Player' }
  const coach = world.coaches[id as keyof typeof world.coaches]
  if (coach) return { name: coach.firstName + ' ' + coach.lastName, kind: 'Coach' }
  const staff = world.staffPeopleById[id as keyof typeof world.staffPeopleById]
  if (staff) return { name: staff.identity.firstName + ' ' + staff.identity.lastName, kind: 'Staff' }
  return { name: id, kind: 'Person' }
}

export function CoachScreen({ world, onSkill, onPerk, onApply = () => undefined, onAcceptOffer = () => undefined, onDeclineOffer = () => undefined }: {
  readonly world: GameWorld
  readonly onSkill: (id: CoachSkillId) => void
  readonly onPerk: (id: CoachPerkId) => void
  readonly onApply?: (id: string) => void
  readonly onAcceptOffer?: (id: string) => void
  readonly onDeclineOffer?: (id: string) => void
}) {
  const [tab, setTab] = useState<CoachTab>('overview')
  const coach = world.coaches[world.userCoachId]
  const reputation = world.coachReputationProfilesByCoachId[world.userCoachId]
  const rpg = world.coachRpgProfilesByCoachId[world.userCoachId]
  const professional = coach === undefined ? undefined : world.staffPeopleById[coach.staffProfileId]?.professional
  if (!coach || !reputation || !rpg || !professional) return <section className="coach-courtside"><Empty>Coach profile unavailable.</Empty></section>

  const employment = world.coachEmploymentByCoachId[world.userCoachId]
  const history = world.coachCareerHistoryByCoachId[world.userCoachId] ?? []
  const offers = Object.values(world.coachJobOffersById).filter((offer) => offer.coachId === coach.id)
  const openings = Object.values(world.coachJobOpeningsById).filter((opening) => opening.status === 'open')
  const relationships = getRelationshipsForPerson(world, coach.id)
  const teamName = employment?.status === 'employed' && employment.teamId
    ? world.teams[employment.teamId]?.name ?? employment.teamId : 'Unemployed'

  return <section className="coach-courtside" aria-label="Coach career">
    <header className="coach-courtside__masthead">
      <span className="coach-courtside__portrait" aria-label="Coach portrait unavailable">{coach.firstName.charAt(0)}{coach.lastName.charAt(0)}</span>
      <div className="coach-courtside__identity"><small>COACH / MY CAREER</small><h1>{coach.firstName} {coach.lastName}</h1><p>{teamName}</p></div>
      <div className="coach-courtside__status">
        <span><small>DEVELOPMENT POINTS</small><strong>{rpg.development.developmentPoints}</strong></span>
        <span><small>GLOBAL PROGRESS</small><strong>{rpg.development.globalProgress}<em>/100</em></strong></span>
      </div>
    </header>
    <nav className="coach-courtside__tabs" aria-label="Coach sections" role="tablist">
      {TABS.map((item) => <button key={item.id} type="button" role="tab" id={'coach-tab-' + item.id}
        aria-selected={tab === item.id} aria-controls="coach-active-panel"
        onClick={() => setTab(item.id)}>{item.label}{item.id === 'opportunities' && offers.filter((offer) => offer.status === 'pending').length > 0
          ? <span className="coach-courtside__tab-count">{offers.filter((offer) => offer.status === 'pending').length}</span> : null}</button>)}
    </nav>
    <div className="coach-courtside__body" id="coach-active-panel" role="tabpanel" aria-labelledby={'coach-tab-' + tab}>
      {tab === 'overview' && <Overview world={world} employment={employment} professional={professional} reputation={reputation} rpg={rpg} relationships={relationships} onTab={setTab} />}
      {tab === 'opportunities' && <Opportunities employment={employment} openings={openings} offers={offers} reputation={reputation} world={world} onAcceptOffer={onAcceptOffer} onApply={onApply} onDeclineOffer={onDeclineOffer} />}
      {tab === 'career' && <Career history={history} world={world} />}
      {tab === 'reputation' && <ReputationPanel reputation={reputation} world={world} />}
      {tab === 'relationships' && <RelationshipsPanel relationships={relationships} world={world} />}
      {tab === 'development' && <DevelopmentPanel rpg={rpg} onPerk={onPerk} onSkill={onSkill} />}
      {tab === 'legacy' && <LegacyScreen world={world} />}
    </div>
  </section>
}

function Overview({ world, employment, professional, reputation, rpg, relationships, onTab }: {
  readonly world: GameWorld; readonly employment: Employment | undefined; readonly professional: Professional
  readonly reputation: Reputation; readonly rpg: Rpg; readonly relationships: Relationships; readonly onTab: (tab: CoachTab) => void
}) {
  const recent = getRecentCoachReputationEvents(reputation, 5)
  return <div className="coach-courtside__overview">
    <div className="coach-courtside__stack">
      <Panel title="PROFESSIONAL ATTRIBUTES" eyebrow="Technical profile" action={<span className="coach-courtside__hint">0–100</span>}>
        <div className="coach-courtside__attributes">{Object.entries(professional.attributes).map(([key, value]) =>
          <div className="coach-courtside__attribute" key={key}><span>{ATTRIBUTES[key] ?? key}</span><Meter value={value} tone="cyan" /><strong>{value}</strong></div>)}</div>
      </Panel>
      <Panel title="REPUTATION" eyebrow="Four canonical dimensions" action={<button className="coach-courtside__text-link" onClick={() => onTab('reputation')} type="button">Details ↗</button>}>
        <div className="coach-courtside__dimensions">{COACH_REPUTATION_DIMENSIONS.map((dimension) => <div className="coach-courtside__dimension" key={dimension}>
          <div><span>{DIMENSIONS[dimension]}</span><b>{reputation.values[dimension]} / 1000</b></div>
          <Meter value={reputation.values[dimension]} max={1000} />
          <small>{formatBand(getCoachReputationBand(reputation.values[dimension]))}</small>
        </div>)}</div>
      </Panel>
    </div>
    <div className="coach-courtside__stack">
      <Panel title="CURRENT STATUS" eyebrow="Career snapshot" action={<button className="coach-courtside__text-link" onClick={() => onTab('career')} type="button">Career ↗</button>}>
        <div className="coach-courtside__facts"><div><span>Employment</span><strong>{employment?.status === 'employed' ? 'Employed' : 'Unemployed'}</strong></div>
          <div><span>Club</span><strong>{employment?.teamId ? world.teams[employment.teamId]?.name ?? employment.teamId : 'Free agent'}</strong></div>
          <div><span>Since</span><strong>{employment?.startedOn ? formatPrototypeDate(employment.startedOn) : 'Not applicable'}</strong></div>
          <div><span>Development points</span><strong>{rpg.development.developmentPoints}</strong></div>
          <div><span>Progress</span><strong>{rpg.development.globalProgress} / 100</strong></div></div>
        <Meter value={rpg.development.globalProgress} tone="cyan" />
      </Panel>
      <Panel title="RECENT REPUTATION CHANGES" action={<button className="coach-courtside__text-link" onClick={() => onTab('reputation')} type="button">All changes ↗</button>}>
        {recent.length === 0 ? <Empty>No reputation changes yet.</Empty> : <div className="coach-courtside__feed">{recent.map((event) => <div key={event.id}>
          <strong>{coachReputationEventLabel(world, event)}</strong><small>{coachReputationSourceLabel(event.source)}</small>
          <span>{Object.values(event.deltas).map((delta) => formatCoachReputationDelta(delta ?? 0)).join('  ')}</span>
        </div>)}</div>}
      </Panel>
      <Panel title="RELATIONSHIPS" action={<button className="coach-courtside__text-link" onClick={() => onTab('relationships')} type="button">All people ↗</button>}>
        {relationships.length === 0 ? <Empty>No materialized relationships.</Empty> : <div className="coach-courtside__feed">{relationships.slice(0, 4).map((item) => {
          const otherId = item.sourceId === world.userCoachId ? item.targetId : item.sourceId
          const person = personLabel(world, otherId)
          return <div key={item.sourceId + '-' + item.targetId}><strong>{person.name} <small>· {person.kind}</small></strong>
            <small>{getRelationshipBandForPeople(world, item.sourceId, item.targetId)}</small><span>{item.value}</span></div>
        })}</div>}
      </Panel>
    </div>
  </div>
}

function Opportunities({ employment, openings, offers, reputation, world, onAcceptOffer, onApply, onDeclineOffer }: {
  readonly employment: Employment | undefined; readonly openings: readonly Opening[]; readonly offers: readonly Offer[]
  readonly reputation: Reputation; readonly world: GameWorld; readonly onAcceptOffer: (id: string) => void
  readonly onApply: (id: string) => void; readonly onDeclineOffer: (id: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'offers' | 'openings'>('all')
  const rows = [
    ...offers.filter(() => filter !== 'openings').map((offer) => ({ id: 'offer-' + offer.id, kind: 'Offer' as const, teamId: offer.teamId, date: offer.createdOn, status: offer.status, source: offer })),
    ...openings.filter(() => filter !== 'offers').map((opening) => ({ id: 'opening-' + opening.id, kind: 'Opening' as const, teamId: opening.teamId, date: opening.createdOn, status: opening.status, source: opening })),
  ]
  return <Panel title="OPPORTUNITIES" eyebrow="Live job market" action={<div className="coach-courtside__filters" aria-label="Opportunity filters">{(['all', 'offers', 'openings'] as const).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>}>
    <div className="coach-courtside__summary"><div><span>Offers</span><strong>{offers.length}</strong></div><div><span>Pending decisions</span><strong>{offers.filter((item) => item.status === 'pending').length}</strong></div><div><span>Open positions</span><strong>{openings.length}</strong></div></div>
    {rows.length === 0 ? <Empty>No active career opportunities.</Empty> : <div className="coach-courtside__table-scroll"><table className="coach-courtside__table"><thead><tr><th>TYPE</th><th>TEAM</th><th>DATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{rows.map((row) => {
      const opening = row.kind === 'Opening' ? row.source : undefined
      const eligibility = opening === undefined || employment === undefined ? undefined : evaluateCoachJobEligibility(employment, reputation, opening)
      return <tr key={row.id}><td><span className="coach-courtside__pill">{row.kind}</span></td><td><strong>{world.teams[row.teamId]?.name ?? row.teamId}</strong></td><td>{formatPrototypeDate(row.date as never)}</td><td>{row.status}</td><td><div className="coach-courtside__actions">
        {row.kind === 'Offer' && row.source.status === 'pending'
          ? <><BdmButton size="compact" onClick={() => onAcceptOffer(row.source.id)}>Accept</BdmButton><BdmButton size="compact" variant="ghost" onClick={() => onDeclineOffer(row.source.id)}>Decline</BdmButton></>
          : row.kind === 'Opening' ? <BdmButton size="compact" variant="secondary" disabled={!eligibility?.eligible} title={eligibility?.reasons.map((reason) => reason.reason).join(', ') ?? 'Employment record unavailable'} onClick={() => onApply(row.source.id)}>Apply</BdmButton>
            : <span className="coach-courtside__hint">Decision recorded</span>}
      </div></td></tr>
    })}</tbody></table></div>}
    <p className="coach-courtside__footnote">Offers and vacancies are real career records. Eligibility and decisions use the existing career rules.</p>
  </Panel>
}

function Career({ history, world }: { readonly history: readonly { readonly teamId: string; readonly date: string; readonly reason: string }[]; readonly world: GameWorld }) {
  return <Panel title="CAREER HISTORY" eyebrow="Professional timeline" action={<span className="coach-courtside__pill">{history.length} events</span>}>
    {history.length === 0 ? <Empty>No prior career history.</Empty> : <div className="coach-courtside__table-scroll"><table className="coach-courtside__table"><thead><tr><th>DATE</th><th>CLUB</th><th>EVENT</th></tr></thead><tbody>{[...history].reverse().map((item, index) => <tr key={item.date + '-' + item.teamId + '-' + index}>
      <td>{formatPrototypeDate(item.date as never)}</td><td><strong>{world.teams[item.teamId as keyof typeof world.teams]?.name ?? item.teamId}</strong></td><td>{item.reason}</td>
    </tr>)}</tbody></table></div>}
  </Panel>
}

function ReputationPanel({ reputation, world }: { readonly reputation: Reputation; readonly world: GameWorld }) {
  const events = getRecentCoachReputationEvents(reputation, 25)
  return <div className="coach-courtside__stack">
    <div className="coach-courtside__reputation-grid">{COACH_REPUTATION_DIMENSIONS.map((dimension) => <Panel key={dimension} title={DIMENSIONS[dimension]}>
      <div className="coach-courtside__rep-score"><strong>{reputation.values[dimension]}</strong><span>/ 1000</span></div>
      <Meter value={reputation.values[dimension]} max={1000} /><p className="coach-courtside__hint">{formatBand(getCoachReputationBand(reputation.values[dimension]))}</p>
    </Panel>)}</div>
    <Panel title="REPUTATION EVENTS" eyebrow="Canonical history">
      {events.length === 0 ? <Empty>No reputation changes yet.</Empty> : <div className="coach-courtside__table-scroll"><table className="coach-courtside__table"><thead><tr><th>EVENT</th><th>SOURCE</th><th>DIMENSION CHANGES</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}>
        <td><strong>{coachReputationEventLabel(world, event)}</strong></td><td>{coachReputationSourceLabel(event.source)}</td>
        <td>{Object.entries(event.deltas).filter(([, value]) => value !== undefined && value !== 0).map(([key, value]) => (DIMENSIONS[key as keyof typeof DIMENSIONS] ?? key) + ' ' + formatCoachReputationDelta(value ?? 0)).join(' · ') || 'No change'}</td>
      </tr>)}</tbody></table></div>}
    </Panel>
  </div>
}

function RelationshipsPanel({ relationships, world }: { readonly relationships: Relationships; readonly world: GameWorld }) {
  const [search, setSearch] = useState('')
  const rows = relationships.map((item) => {
    const otherId = item.sourceId === world.userCoachId ? item.targetId : item.sourceId
    return { item, person: personLabel(world, otherId), id: item.sourceId + '-' + item.targetId }
  }).filter(({ person }) => (person.name + ' ' + person.kind).toLowerCase().includes(search.trim().toLowerCase()))
  return <Panel title="RELATIONSHIPS" eyebrow="People in your career" action={<input className="coach-courtside__search" aria-label="Search relationships" placeholder="Search people…" value={search} onChange={(event) => setSearch(event.target.value)} />}>
    {rows.length === 0 ? <Empty>{relationships.length === 0 ? 'No materialized relationships.' : 'No matching relationships.'}</Empty>
      : <div className="coach-courtside__table-scroll"><table className="coach-courtside__table"><thead><tr><th>PERSON</th><th>TYPE</th><th>RELATIONSHIP</th><th>VALUE</th></tr></thead><tbody>{rows.map(({ item, person, id }) => <tr key={id}>
        <td><strong>{person.name}</strong></td><td>{person.kind}</td><td>{getRelationshipBandForPeople(world, item.sourceId, item.targetId)}</td><td><div className="coach-courtside__relationship-value"><strong>{item.value}</strong></div></td>
      </tr>)}</tbody></table></div>}
  </Panel>
}

function DevelopmentPanel({ rpg, onSkill, onPerk }: { readonly rpg: Rpg; readonly onSkill: (id: CoachSkillId) => void; readonly onPerk: (id: CoachPerkId) => void }) {
  return <div className="coach-courtside__stack">
    <Panel title="DEVELOPMENT" eyebrow="Coach RPG"><div className="coach-courtside__development-summary">
      <div><small>AVAILABLE POINTS</small><strong>{rpg.development.developmentPoints}</strong></div>
      <div><small>GLOBAL PROGRESS</small><strong>{rpg.development.globalProgress}<em> / 100</em></strong><Meter value={rpg.development.globalProgress} tone="cyan" /></div>
    </div></Panel>
    <div className="coach-courtside__development-grid">
      <Panel title="SKILLS" eyebrow="Progress through three ranks"><div className="coach-courtside__list">
        {COACH_SKILL_CATALOG.map((skill) => { const rank = rpg.skills[skill.id]?.rank ?? 0; return <div className="coach-courtside__development-row" key={skill.id}>
          <div><strong>{skill.id}</strong><small>Rank {rank} / 3</small></div>
          <div className="coach-courtside__rank" aria-label={'Rank ' + rank + ' of 3'}>{[1, 2, 3].map((step) => <i key={step} className={step <= rank ? 'is-active' : ''} />)}</div>
          <BdmButton size="compact" variant="secondary" disabled={rank >= 3} onClick={() => onSkill(skill.id)}>Develop</BdmButton>
        </div> })}
      </div></Panel>
      <Panel title="PERKS" eyebrow="Career advantages"><div className="coach-courtside__list">
        {COACH_PERK_CATALOG.map((perk) => <div className="coach-courtside__development-row" key={perk.id}>
          <div><strong>{perk.id}</strong><small>{rpg.perks[perk.id] ? 'Unlocked' : 'Not owned'}</small></div>
          {rpg.perks[perk.id] ? <span className="coach-courtside__pill is-earned">Owned</span> : <BdmButton size="compact" variant="secondary" onClick={() => onPerk(perk.id)}>Purchase</BdmButton>}
        </div>)}
      </div></Panel>
    </div>
  </div>
}
