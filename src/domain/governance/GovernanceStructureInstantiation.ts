import { createGovernanceBody, type GovernanceBody, type GovernanceBodyKind } from './Governance'
import { deriveGovernanceInstitutionStructure } from './GovernanceInstitutionStructure'
import type { GovernanceUniverseProfile } from './GovernanceUniverseProfile'
export interface GovernanceStructureInstantiationPlan { readonly institutionId: string; readonly bodiesToCreate: readonly GovernanceBody[]; readonly satisfiedBodyKinds: readonly GovernanceBodyKind[]; readonly conflicts: readonly string[] }
/** Pure preview. IDs are caller-supplied so planning is deterministic and never fabricates people, appointments, or authority. */
export function planGovernanceStructureInstantiation(profile: GovernanceUniverseProfile, existing: readonly GovernanceBody[], ids: Readonly<Partial<Record<GovernanceBodyKind,string>>>, optional: readonly GovernanceBodyKind[] = []): GovernanceStructureInstantiationPlan {
 const local=existing.filter(b=>b.institutionId===profile.institutionId), kinds=new Set(local.map(b=>b.kind)), conflicts:string[]=[];const bodies:GovernanceBody[]=[]
 for(const slot of deriveGovernanceInstitutionStructure(profile).slots){if(kinds.has(slot.bodyKind))continue;if(slot.requirement==='OPTIONAL'&&!optional.includes(slot.bodyKind))continue;const id=ids[slot.bodyKind];if(id===undefined||!id.trim()) { if(slot.requirement==='REQUIRED') conflicts.push(`MISSING_ID:${slot.bodyKind}`); continue } if(existing.some(b=>b.id===id))conflicts.push(`DUPLICATE_ID:${id}`);else bodies.push(createGovernanceBody({id,institutionId:profile.institutionId,kind:slot.bodyKind,name:slot.bodyKind}))}
 return {institutionId:profile.institutionId,bodiesToCreate:bodies.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)),satisfiedBodyKinds:[...kinds].sort(),conflicts:conflicts.sort()}
}
/** Atomic immutable application: a conflicted plan leaves the canonical body collection unchanged. */
export const applyGovernanceStructureInstantiation=(existing:readonly GovernanceBody[],plan:GovernanceStructureInstantiationPlan):readonly GovernanceBody[]=>plan.conflicts.length===0?[...existing,...plan.bodiesToCreate]:existing
