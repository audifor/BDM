import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { getCoachProfessionalProfile, getCoachProfessionalProficiency, getCoachRpgProfile, getUserCoachProfessionalProfile } from '@/domain/world'
import { calculateHeadCoachProfessionalProficiency, HEAD_COACH_PROFESSIONAL_ATTRIBUTE_WEIGHTS } from '@/domain/coachRpg'
import { advanceDay } from '@/engine/calendar'
import { applyMatchResult } from '@/engine/match'

import { generateAiCoachProfessionalProfile } from './CoachProfessionalProfileGenerator'

describe('Coach RPG world setup', () => {
  it('uses the shared framework for head-coach proficiency', () => {
    expect(Object.values(HEAD_COACH_PROFESSIONAL_ATTRIBUTE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(1)
    const profile = getUserCoachProfessionalProfile(createNewGame())!
    expect(calculateHeadCoachProfessionalProficiency(profile)).toBeGreaterThanOrEqual(0)
    expect(calculateHeadCoachProfessionalProficiency(profile)).toBeLessThanOrEqual(100)
  })

  it('initializes a deterministic professional and RPG profile for every Coach', () => {
    const world = createNewGame()
    expect(Object.keys(world.coachProfessionalProfilesByCoachId)).toHaveLength(Object.keys(world.coaches).length)
    expect(Object.keys(world.coachRpgProfilesByCoachId)).toHaveLength(Object.keys(world.coaches).length)
    for (const coach of Object.values(world.coaches)) {
      const professional = getCoachProfessionalProfile(world, coach.id)!
      const rpg = getCoachRpgProfile(world, coach.id)!
      expect(Object.keys(professional.attributes)).toEqual(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS)
      expect(Object.values(professional.attributes).every((value) => Number.isInteger(value) && value >= 0 && value <= 100)).toBe(true)
      expect(rpg.development).toEqual({ globalProgress: 0, developmentPoints: 0 })
      expect(rpg.skills).toEqual({}); expect(rpg.professionalTraits).toEqual([]); expect(rpg.perks).toEqual({})
    }
    const aiCoach = Object.values(world.coaches).find((coach) => coach.id !== world.userCoachId)!
    expect(generateAiCoachProfessionalProfile(aiCoach.id)).toEqual(getCoachProfessionalProfile(world, aiCoach.id))
  })

  it('applies presets only to the user Coach and preserves profiles through ordinary transforms', () => {
    const blank = createNewGame()
    const tactician = createNewGame({ coachRpgPreset: 'tactician' })
    expect(tactician.coachProfessionalProfilesByCoachId[blank.userCoachId]).not.toEqual(blank.coachProfessionalProfilesByCoachId[blank.userCoachId])
    for (const coach of Object.values(blank.coaches).filter((coach) => coach.id !== blank.userCoachId)) expect(tactician.coachProfessionalProfilesByCoachId[coach.id]).toEqual(blank.coachProfessionalProfilesByCoachId[coach.id])
    expect(tactician.coachRpgProfilesByCoachId).toEqual(blank.coachRpgProfilesByCoachId)
    expect(tactician.players).toEqual(blank.players); expect(tactician.staffPeopleById).toEqual(blank.staffPeopleById); expect(tactician.games).toEqual(blank.games)
    expect(advanceDay(blank).coachProfessionalProfilesByCoachId).toEqual(blank.coachProfessionalProfilesByCoachId)
    const game = Object.values(blank.games)[0]!
    const result = applyMatchResult(blank, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 80, awayScore: 70 })
    const homeCoachId = blank.teams[game.homeTeamId]!.coachId!
    const awayCoachId = blank.teams[game.awayTeamId]!.coachId!
    expect(result.coachRpgProfilesByCoachId[homeCoachId]!.professionalExperience.byAttribute.coaching).toBeGreaterThan(0)
    expect(result.coachRpgProfilesByCoachId[awayCoachId]!.professionalExperience.byAttribute.coaching).toBeGreaterThan(0)
    expect(getCoachProfessionalProficiency(blank, blank.userCoachId)).toBe(calculateHeadCoachProfessionalProficiency(getUserCoachProfessionalProfile(blank)!))
  })
})
