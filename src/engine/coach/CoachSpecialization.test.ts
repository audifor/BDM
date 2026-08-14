import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@/domain/world'
import { generateWorld } from '@/engine/world'
import { COACH_PERK_CATALOG, COACH_SKILL_CATALOG, COACH_TRAIT_CATALOG, calculateCoachLearningReduction, hasCoachCapability, purchaseCoachPerk, purchaseCoachSkillRank, reconcileProfessionalTraits, recordProfessionalTraitEvidence } from './CoachSpecialization'

describe('Coach specialization', () => {
  it('defines the approved catalogs', () => {
    expect(COACH_SKILL_CATALOG).toHaveLength(10); expect(new Set(COACH_SKILL_CATALOG.map(x => x.id)).size).toBe(10); expect(COACH_SKILL_CATALOG.every(x => x.maxRank === 3)).toBe(true)
    expect(COACH_TRAIT_CATALOG).toHaveLength(6)
    expect(COACH_PERK_CATALOG).toHaveLength(8); expect(COACH_PERK_CATALOG.filter(x => x.type === 'specialization')).toHaveLength(4); expect(COACH_PERK_CATALOG.filter(x => x.type === 'careerFocus')).toHaveLength(4)
  })
  it('purchases sequential skill ranks atomically and applies their learning reduction', () => {
    const { world, coachId } = preparedWorld(6, 60)
    const skill = COACH_SKILL_CATALOG.find(x => x.id === 'gamePreparation')!
    const rank1 = purchaseCoachSkillRank(world, coachId, skill.id); expect(rank1.ok).toBe(true)
    if (!rank1.ok) return
    expect(rank1.world.coachRpgProfilesByCoachId[coachId]!.development.developmentPoints).toBe(5)
    expect(calculateCoachLearningReduction(rank1.world.coachRpgProfilesByCoachId[coachId]!, skill.primaryAttribute)).toBe(.02)
    const rank2 = purchaseCoachSkillRank(rank1.world, coachId, skill.id); expect(rank2.ok).toBe(true)
    const low = preparedWorld(6, 44); const failed = purchaseCoachSkillRank(low.world, low.coachId, skill.id); if (!failed.ok) { const second = purchaseCoachSkillRank(failed.world, low.coachId, skill.id); expect(second.ok).toBe(false); expect(second.world).toBe(failed.world) }
  })
  it('acquires traits from evidence and perks only after prerequisites', () => {
    const { world, coachId } = preparedWorld(20, 60)
    const rpg = world.coachRpgProfilesByCoachId[coachId]!
    const withSkill = { ...world, coachRpgProfilesByCoachId: { ...world.coachRpgProfilesByCoachId, [coachId]: { ...rpg, skills: { ...rpg.skills, individualDevelopmentPlanning: { skillId: 'individualDevelopmentPlanning' as never, rank: 1 }, opponentStudy: { skillId: 'opponentStudy' as never, rank: 2 } } } } }
    const evidence = recordProfessionalTraitEvidence(withSkill, coachId, 'youthDevelopment', 100); expect(evidence.ok).toBe(true); if (!evidence.ok) return
    const traits = reconcileProfessionalTraits(evidence.world, coachId); expect(traits.ok).toBe(true); if (!traits.ok) return
    expect(traits.world.coachRpgProfilesByCoachId[coachId]!.professionalTraits).toContain('youthDeveloper')
    const perk = purchaseCoachPerk(traits.world, coachId, 'filmRoomSpecialist' as never); expect(perk.ok).toBe(true); if (perk.ok) expect(hasCoachCapability(perk.world.coachRpgProfilesByCoachId[coachId]!, 'advancedOpponentInsights')).toBe(true)
  })
})
function preparedWorld(points:number, attribute:number) {
  const source=generateWorld({seed:701,gender:'female'}); const coachId=source.userCoachId
  const attributes=Object.fromEntries(Object.keys(source.coachProfessionalProfilesByCoachId[coachId]!.attributes).map(key=>[key,attribute])) as never
  const world=createGameWorld({currentDate:source.currentDate,currentSeasonId:source.currentSeasonId,userCoachId:coachId,countries:Object.values(source.countries),coaches:Object.values(source.coaches),players:Object.values(source.players),teams:Object.values(source.teams),competitions:Object.values(source.competitions),seasons:Object.values(source.seasons),games:Object.values(source.games),coachProfessionalProfilesByCoachId:{...source.coachProfessionalProfilesByCoachId,[coachId]:{attributes}},coachRpgProfilesByCoachId:{...source.coachRpgProfilesByCoachId,[coachId]:{...source.coachRpgProfilesByCoachId[coachId]!,development:{globalProgress:0,developmentPoints:points}}}})
  return {world,coachId}
}
