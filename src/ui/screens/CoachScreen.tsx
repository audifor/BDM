import { COACH_REPUTATION_DIMENSIONS, getCoachReputationBand, getRecentCoachReputationEvents } from '@/domain/coachReputation'
import type { CoachPerkId, CoachSkillId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { COACH_PERK_CATALOG, COACH_SKILL_CATALOG } from '@/engine/coach'
import { coachReputationBandLabel, coachReputationEventLabel, coachReputationSourceLabel, formatCoachReputationDelta } from '@/ui/coachReputationPresentation'
import { formatPrototypeDate } from '@/ui/formatters'
import { STAFF_PROFESSIONAL_ATTRIBUTE_LABELS } from '@/ui/staffPresentation'

const REPUTATION_DIMENSION_LABELS = { competitive: 'Competitive', development: 'Development', professional: 'Professional', publicStanding: 'Public Standing' } as const

export function CoachScreen({ world, onSkill, onPerk }: { readonly world: GameWorld; readonly onSkill: (id: CoachSkillId) => void; readonly onPerk: (id: CoachPerkId) => void }) {
  const coach=world.coaches[world.userCoachId], professional=world.coachProfessionalProfilesByCoachId[world.userCoachId], rpg=world.coachRpgProfilesByCoachId[world.userCoachId], reputation=world.coachReputationProfilesByCoachId[world.userCoachId]
  if (!coach || !professional || !rpg || !reputation) return <section className="screen"><p className="content-panel">COACH PROFILE UNAVAILABLE</p></section>
  const focus=COACH_PERK_CATALOG.filter(x=>x.type==='careerFocus'&&rpg.perks[x.id]).length
  const recentEvents=getRecentCoachReputationEvents(reputation,5)
  return <section className="screen"><div className="page-heading"><div><p className="eyebrow">COACH</p><h1>{coach.firstName} {coach.lastName}</h1></div><span>{rpg.development.developmentPoints} DEVELOPMENT POINTS</span></div>
    <section className="content-panel"><p>GLOBAL PROGRESS {rpg.development.globalProgress} / 100 · CAREER FOCUS {focus} / 2</p><h2>PROFESSIONAL ATTRIBUTES</h2><dl className="staff-attributes">{Object.entries(professional.attributes).map(([key,value])=><div key={key}><dt>{STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key as keyof typeof STAFF_PROFESSIONAL_ATTRIBUTE_LABELS]}</dt><dd>{value}</dd></div>)}</dl></section>
    <section className="content-panel"><h2>REPUTATION</h2><div className="reputation-dimensions">{COACH_REPUTATION_DIMENSIONS.map((dimension)=>{const value=reputation.values[dimension],band=getCoachReputationBand(value);return <article className="reputation-dimension" key={dimension}><div><strong>{REPUTATION_DIMENSION_LABELS[dimension]}</strong><span>{coachReputationBandLabel(band)}</span></div><progress value={value} max={1000} aria-label={`${REPUTATION_DIMENSION_LABELS[dimension]} reputation: ${value} of 1000, ${coachReputationBandLabel(band)}`} /><p>{value} / 1000</p></article>})}</div></section>
    <section className="content-panel"><h2>RECENT REPUTATION CHANGES</h2>{recentEvents.length===0?<p>No reputation changes yet.</p>:<div className="reputation-events">{recentEvents.map(event=><article key={event.id} className="reputation-event"><time>{formatPrototypeDate(event.gameDate as import('@/domain/date').GameDate)}</time><div><strong>{coachReputationEventLabel(world,event)}</strong><span>{coachReputationSourceLabel(event.source)}</span></div><p>{Object.entries(event.deltas).map(([dimension,delta])=><span className={delta!>0?'reputation-positive':delta!<0?'reputation-negative':''} key={dimension}>{REPUTATION_DIMENSION_LABELS[dimension as keyof typeof REPUTATION_DIMENSION_LABELS]} {formatCoachReputationDelta(delta!)}</span>)}</p></article>)}</div>}</section>
    <section className="content-panel"><h2>SKILLS</h2>{COACH_SKILL_CATALOG.map(s=>{const rank=rpg.skills[s.id]?.rank??0;return <p key={s.id}>{s.id} · Rank {rank} · {s.primaryAttribute} <button type="button" disabled={rank===3} onClick={()=>onSkill(s.id)}>DEVELOP</button></p>})}</section>
    <section className="content-panel"><h2>PROFESSIONAL TRAITS</h2><p>{rpg.professionalTraits.length?rpg.professionalTraits.join(', '):'No traits acquired'}</p></section>
    <section className="content-panel"><h2>PERKS</h2>{COACH_PERK_CATALOG.map(p=><p key={p.id}>{p.id} · {p.type} · {p.cost} DP {rpg.perks[p.id]?'OWNED':<button type="button" onClick={()=>onPerk(p.id)}>PURCHASE</button>}</p>)}</section>
  </section>
}
