import { describe, expect, it } from 'vitest'

import { createCoachRpgProfile, createInitialCoachRpgProfile } from '@/domain/coachRpg'
import { coachPerkIdFromString, coachSkillIdFromString } from '@/domain/ids'
import {
  buildCoachDevelopmentSummary,
  buildCoachPerkRows,
  buildCoachSkillRows,
  coachPerkRarity,
  coachRpgReasonLabel,
  type CoachPerkRarity,
} from '@/ui-ng/applications/coach/coachDevelopmentModel'

const perk = (id: string) => coachPerkIdFromString(id)
const skill = (id: string) => coachSkillIdFromString(id)

function profileWithSkillRank(id: string, rank: number) {
  const base = createInitialCoachRpgProfile()
  return createCoachRpgProfile({ ...base, skills: { [skill(id)]: { skillId: skill(id), rank } } })
}

describe('coachDevelopmentModel · skills', () => {
  it('projects every canonical skill with derived display metadata', () => {
    const rows = buildCoachSkillRows(createInitialCoachRpgProfile())

    expect(rows).toHaveLength(10)
    expect(rows[0]).toMatchObject({
      id: 'gamePreparation',
      name: 'Game Preparation',
      category: 'TACTICAL',
      attribute: 'Tactical Knowledge',
      rank: 0,
      maxRank: 3,
      nextRankCost: 1,
      maxed: false,
      progress: 0,
    })
    expect(rows.map((row) => row.name)).toContain('Individual Development Planning')
    expect(rows.map((row) => row.name)).toContain('Staff Coordination')
  })

  it('reports maxed skills without a next rank cost', () => {
    const rows = buildCoachSkillRows(profileWithSkillRank('gamePreparation', 3))
    const maxed = rows.find((row) => row.id === 'gamePreparation')

    expect(maxed).toMatchObject({ rank: 3, maxed: true, progress: 1, nextRankCost: undefined })
  })

  it('reads the next rank cost from the canonical cost table', () => {
    const rows = buildCoachSkillRows(profileWithSkillRank('practiceDesign', 1))
    expect(rows.find((row) => row.id === 'practiceDesign')?.nextRankCost).toBe(2)
  })
})

describe('coachDevelopmentModel · perk rarity', () => {
  it('classifies perks from canonical type and catalog order without persisting a tier', () => {
    const rows = buildCoachPerkRows(createInitialCoachRpgProfile())

    expect(rows).toHaveLength(8)
    expect(rows.every((row) => row.owned === false)).toBe(true)
    expect(rows.map((row) => row.rarity)).toEqual([
      'common',
      'common',
      'rare',
      'rare',
      'epic',
      'epic',
      'legendary',
      'legendary',
    ])
    expect(coachPerkRarity(perk('organizationBuilder'))).toBe('legendary')
    expect(coachPerkRarity(perk('filmRoomSpecialist'))).toBe('common')
    expect(new Set<CoachPerkRarity>(rows.map((row) => row.rarity)).size).toBe(4)
  })

  it('describes requirements from the canonical perk catalog', () => {
    const rows = buildCoachPerkRows(createInitialCoachRpgProfile())
    const filmRoom = rows.find((row) => row.id === 'filmRoomSpecialist')
    const delegated = rows.find((row) => row.id === 'delegatedDevelopment')

    expect(filmRoom).toMatchObject({
      name: 'Film Room Specialist',
      typeLabel: 'SPECIALIZATION',
      rarityLabel: 'COMMON',
      cost: 2,
    })
    expect(filmRoom?.requirements).toBe('Requires Opponent Study rank 2 · Analysis 50')
    expect(delegated?.requirements).toBe('Requires Delegation rank 2 · Staff Coordination rank 1')
    expect(rows.find((row) => row.id === 'cultureBuilder')?.typeLabel).toBe('CAREER FOCUS')
  })

  it('marks owned perks from canonical state', () => {
    const base = createInitialCoachRpgProfile()
    const profile = createCoachRpgProfile({
      ...base,
      perks: { [perk('filmRoomSpecialist')]: { perkId: perk('filmRoomSpecialist'), rank: 1 } },
    })
    const rows = buildCoachPerkRows(profile)

    expect(rows.find((row) => row.id === 'filmRoomSpecialist')?.owned).toBe(true)
    expect(rows.filter((row) => row.owned)).toHaveLength(1)
  })
})

describe('coachDevelopmentModel · summary', () => {
  it('summarises progress, points and career focus headroom', () => {
    const summary = buildCoachDevelopmentSummary(createInitialCoachRpgProfile())

    expect(summary).toEqual({
      skillCount: 10,
      averageSkillRank: 0,
      totalSkillRanks: 0,
      skillRankCapacity: 30,
      developmentPoints: 0,
      globalProgress: 0,
      perkCount: 8,
      unlockedPerkCount: 0,
      careerFocusUsed: 0,
      careerFocusLimit: 2,
    })
  })

  it('averages the ranks of every canonical skill', () => {
    const base = createInitialCoachRpgProfile()
    const profile = createCoachRpgProfile({
      ...base,
      development: { globalProgress: 42, developmentPoints: 7 },
      skills: {
        [skill('gamePreparation')]: { skillId: skill('gamePreparation'), rank: 3 },
        [skill('inGameAdjustment')]: { skillId: skill('inGameAdjustment'), rank: 2 },
      },
    })
    const summary = buildCoachDevelopmentSummary(profile)

    expect(summary.averageSkillRank).toBe(0.5)
    expect(summary.totalSkillRanks).toBe(5)
    expect(summary.developmentPoints).toBe(7)
    expect(summary.globalProgress).toBe(42)
  })
})

describe('coachDevelopmentModel · failure reasons', () => {
  it('translates canonical engine reasons and falls back safely', () => {
    expect(coachRpgReasonLabel('insufficientDevelopmentPoints')).toBe('Not enough development points.')
    expect(coachRpgReasonLabel('careerFocusLimitReached')).toBe('Career focus limit reached (maximum 2).')
    expect(coachRpgReasonLabel('somethingUnknown')).toBe('Operation not available.')
  })
})
