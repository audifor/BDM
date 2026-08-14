import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'
import { calculateCoachLearningReduction, hasCoachCapability, purchaseCoachPerk, purchaseCoachSkillRank, reconcileProfessionalTraits, recordProfessionalTraitEvidence } from '@/engine/coach'

const savedAt='2032-10-01T12:00:00.000Z'
function loaded(world: ReturnType<typeof createNewGame>) { return deserializeGameWorldV1(serializeGameWorldV1(world,savedAt)) }
function withRpg(world:ReturnType<typeof createNewGame>, patch:Record<string,unknown>) { const id=world.userCoachId; return { ...world, coachRpgProfilesByCoachId:{...world.coachRpgProfilesByCoachId,[id]:{...world.coachRpgProfilesByCoachId[id]!,...patch}} } as ReturnType<typeof createNewGame> }

describe('Coach RPG persistence acceptance',()=>{
  it('round-trips non-trivial professional, experience, skill, trait, evidence and perk state',()=>{
    const base=createNewGame(); const id=base.userCoachId
    const world=withRpg(base,{development:{globalProgress:37.5,developmentPoints:12},skills:{gamePreparation:{skillId:'gamePreparation',rank:2},opponentStudy:{skillId:'opponentStudy',rank:2}},professionalTraits:['youthDeveloper'],professionalTraitEvidence:{youthDevelopment:100},perks:{filmRoomSpecialist:{perkId:'filmRoomSpecialist',rank:1}}})
    const after=loaded(world).coachRpgProfilesByCoachId[id]!
    expect(after).toEqual(world.coachRpgProfilesByCoachId[id]); expect(hasCoachCapability(after,'advancedOpponentInsights')).toBe(true)
  })
  it('reconstructs learning efficiency from persisted skills without persisting the modifier',()=>{
    const base=createNewGame(); const world=withRpg(base,{skills:{opponentStudy:{skillId:'opponentStudy',rank:3},performanceReview:{skillId:'performanceReview',rank:3}}})
    expect(calculateCoachLearningReduction(loaded(world).coachRpgProfilesByCoachId[world.userCoachId]!,'analysis')).toBe(.12)
  })
  it('preserves a trait and its evidence idempotently after load',()=>{
    const base=createNewGame(); const id=base.userCoachId; const configured=withRpg(base,{skills:{individualDevelopmentPlanning:{skillId:'individualDevelopmentPlanning',rank:1}}})
    const evidence=recordProfessionalTraitEvidence(configured,id,'youthDevelopment',100); expect(evidence.ok).toBe(true); if(!evidence.ok)return
    const traits=reconcileProfessionalTraits(evidence.world,id); expect(traits.ok).toBe(true);if(!traits.ok)return
    const again=reconcileProfessionalTraits(loaded(traits.world as ReturnType<typeof createNewGame>),id); expect(again.ok).toBe(true);if(again.ok){expect(again.world.coachRpgProfilesByCoachId[id]!.professionalTraits).toEqual(['youthDeveloper']);expect(again.world.coachRpgProfilesByCoachId[id]!.professionalTraitEvidence.youthDevelopment).toBe(100)}
  })
  it('migrates legacy saves to neutral, idempotent coach RPG profiles',()=>{
    const original=serializeGameWorldV1(createNewGame(),savedAt);const payload={...original.payload};delete (payload as {coachProfessionalProfilesByCoachId?:unknown}).coachProfessionalProfilesByCoachId;delete (payload as {coachRpgProfilesByCoachId?:unknown}).coachRpgProfilesByCoachId
    const first=deserializeGameWorldV1({...original,payload});const second=loaded(first as ReturnType<typeof createNewGame>);const id=first.userCoachId
    expect(first.coachRpgProfilesByCoachId[id]!.skills).toEqual({});expect(first.coachRpgProfilesByCoachId[id]!.perks).toEqual({});expect(second.coachRpgProfilesByCoachId).toEqual(first.coachRpgProfilesByCoachId)
  })
  it('retains an acquired perk and rejects duplicate purchase after load',()=>{
    const base=createNewGame();const id=base.userCoachId;const rpgWorld=withRpg(base,{development:{globalProgress:0,developmentPoints:9},skills:{opponentStudy:{skillId:'opponentStudy',rank:2}}});const world={...rpgWorld,coachProfessionalProfilesByCoachId:{...rpgWorld.coachProfessionalProfilesByCoachId,[id]:{attributes:{...rpgWorld.coachProfessionalProfilesByCoachId[id]!.attributes,analysis:60}}}} as ReturnType<typeof createNewGame>;const perk=purchaseCoachPerk(world,id,'filmRoomSpecialist' as never);expect(perk.ok).toBe(true);if(!perk.ok)return
    const duplicate=purchaseCoachPerk(loaded(perk.world as ReturnType<typeof createNewGame>),id,'filmRoomSpecialist' as never);expect(duplicate).toMatchObject({ok:false,reason:'alreadyOwned'})
  })
})
