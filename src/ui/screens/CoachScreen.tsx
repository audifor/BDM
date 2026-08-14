import type { CoachPerkId, CoachSkillId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { COACH_PERK_CATALOG, COACH_SKILL_CATALOG } from '@/engine/coach'
import { STAFF_PROFESSIONAL_ATTRIBUTE_LABELS } from '@/ui/staffPresentation'

export function CoachScreen({ world, onSkill, onPerk }: { readonly world: GameWorld; readonly onSkill: (id: CoachSkillId) => void; readonly onPerk: (id: CoachPerkId) => void }) {
  const coach=world.coaches[world.userCoachId], professional=world.coachProfessionalProfilesByCoachId[world.userCoachId], rpg=world.coachRpgProfilesByCoachId[world.userCoachId]
  if (!coach || !professional || !rpg) return <section className="screen"><p className="content-panel">COACH RPG PROFILE UNAVAILABLE</p></section>
  const focus=COACH_PERK_CATALOG.filter(x=>x.type==='careerFocus'&&rpg.perks[x.id]).length
  return <section className="screen"><div className="page-heading"><div><p className="eyebrow">COACH</p><h1>{coach.firstName} {coach.lastName}</h1></div><span>{rpg.development.developmentPoints} DEVELOPMENT POINTS</span></div>
    <section className="content-panel"><p>GLOBAL PROGRESS {rpg.development.globalProgress} / 100 · CAREER FOCUS {focus} / 2</p><h2>PROFESSIONAL ATTRIBUTES</h2><dl className="staff-attributes">{Object.entries(professional.attributes).map(([key,value])=><div key={key}><dt>{STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key as keyof typeof STAFF_PROFESSIONAL_ATTRIBUTE_LABELS]}</dt><dd>{value}</dd></div>)}</dl></section>
    <section className="content-panel"><h2>SKILLS</h2>{COACH_SKILL_CATALOG.map(s=>{const rank=rpg.skills[s.id]?.rank??0;return <p key={s.id}>{s.id} · Rank {rank} · {s.primaryAttribute} <button type="button" disabled={rank===3} onClick={()=>onSkill(s.id)}>DEVELOP</button></p>})}</section>
    <section className="content-panel"><h2>PROFESSIONAL TRAITS</h2><p>{rpg.professionalTraits.length?rpg.professionalTraits.join(', '):'No traits acquired'}</p></section>
    <section className="content-panel"><h2>PERKS</h2>{COACH_PERK_CATALOG.map(p=><p key={p.id}>{p.id} · {p.type} · {p.cost} DP {rpg.perks[p.id]?'OWNED':<button type="button" onClick={()=>onPerk(p.id)}>PURCHASE</button>}</p>)}</section>
  </section>
}
