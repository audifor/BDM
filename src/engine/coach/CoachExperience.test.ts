import { describe, expect, it } from 'vitest'

import { createInitialCoachRpgProfile } from '@/domain/coachRpg'
import { createStaffProfessionalProfile, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { createGameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { applyMatchResult } from '@/engine/match'
import { generateWorld } from '@/engine/world'

import {
  applyCoachExperienceGain,
  COACH_DEVELOPMENT_POINT_PROGRESS_COST,
  createCoachExperienceGain,
  deriveCoachMatchExperienceGain,
  getCoachAttributeExperienceCost,
} from './CoachExperience'

const professional = createStaffProfessionalProfile({ attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 30])) as Record<(typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS)[number], number> })

describe('Coach experience', () => {
  it('accepts decimal, zero and partial gains but rejects invalid values', () => {
    expect(createCoachExperienceGain({ byAttribute: { tacticalKnowledge: 1.25 }, globalDevelopmentProgress: 0 })).toEqual({ byAttribute: { tacticalKnowledge: 1.25 }, globalDevelopmentProgress: 0 })
    expect(() => createCoachExperienceGain({ byAttribute: { coaching: -1 }, globalDevelopmentProgress: 0 })).toThrow(RangeError)
    expect(() => createCoachExperienceGain({ byAttribute: {}, globalDevelopmentProgress: Number.NaN })).toThrow(RangeError)
    expect(() => createCoachExperienceGain({ byAttribute: {}, globalDevelopmentProgress: Number.POSITIVE_INFINITY })).toThrow(RangeError)
  })

  it('uses a deterministic, increasing attribute cost curve', () => {
    expect(getCoachAttributeExperienceCost(30)).toBeLessThan(getCoachAttributeExperienceCost(50))
    expect(getCoachAttributeExperienceCost(50)).toBeLessThan(getCoachAttributeExperienceCost(70))
    expect(getCoachAttributeExperienceCost(70)).toBeLessThan(getCoachAttributeExperienceCost(90))
    expect(getCoachAttributeExperienceCost(30)).toBe(getCoachAttributeExperienceCost(30))
  })

  it('consumes sufficient XP sequentially, preserves remainder and never mutates inputs', () => {
    const rpg = createInitialCoachRpgProfile()
    const before = JSON.stringify({ professional, rpg })
    const firstCost = getCoachAttributeExperienceCost(30)
    const secondCost = getCoachAttributeExperienceCost(31)
    const applied = applyCoachExperienceGain(professional, rpg, { byAttribute: { coaching: firstCost + secondCost + 2.5 }, globalDevelopmentProgress: 0 })

    expect(applied.professionalProfile.attributes.coaching).toBe(32)
    expect(applied.rpgProfile.professionalExperience.byAttribute.coaching).toBe(2.5)
    expect(applied.professionalProfile.attributes.analysis).toBe(30)
    expect(JSON.stringify({ professional, rpg })).toBe(before)
  })

  it('converts normalized global progress into development points without altering RPG unlock state', () => {
    const rpg = { ...createInitialCoachRpgProfile(), development: { globalProgress: 0, developmentPoints: 3 }, professionalTraits: ['coach-trait:test' as never] }
    const applied = applyCoachExperienceGain(professional, rpg, { byAttribute: {}, globalDevelopmentProgress: 250 })

    expect(COACH_DEVELOPMENT_POINT_PROGRESS_COST).toBe(100)
    expect(applied.rpgProfile.development).toEqual({ globalProgress: 50, developmentPoints: 5 })
    expect(applied.rpgProfile.professionalTraits).toEqual(rpg.professionalTraits)
    expect(applied.rpgProfile.skills).toEqual(rpg.skills)
    expect(applied.rpgProfile.perks).toEqual(rpg.perks)
  })

  it('derives deterministic match XP for both outcomes, with close hard games more formative', () => {
    const closeLoss = deriveCoachMatchExperienceGain({ ownStrength: 50, opponentStrength: 70, won: false, scoreMargin: 4 })
    const easyWin = deriveCoachMatchExperienceGain({ ownStrength: 70, opponentStrength: 50, won: true, scoreMargin: 25 })

    expect(closeLoss.byAttribute.coaching).toBeGreaterThan(0)
    expect(closeLoss.byAttribute.coaching).toBeGreaterThan(easyWin.byAttribute.coaching!)
    expect(closeLoss.byAttribute.adaptability).toBeGreaterThan(closeLoss.byAttribute.coaching! * 0.2)
    expect(closeLoss.byAttribute.medicalKnowledge).toBeUndefined()
    expect(closeLoss.byAttribute.playerDevelopment).toBeGreaterThan(0)
    expect(deriveCoachMatchExperienceGain({ ownStrength: 50, opponentStrength: 70, won: false, scoreMargin: 4 })).toEqual(closeLoss)
  })

  it('awards each involved coach once at result application and tolerates legacy worlds without profiles', () => {
    const generated = generateWorld({ seed: 40, gender: 'female' })
    const games = generateRoundRobinSchedule({ world: generated, seasonId: generated.currentSeasonId })
    const world = createGameWorld({ currentDate: generated.currentDate, currentSeasonId: generated.currentSeasonId, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games, coachProfessionalProfilesByCoachId: generated.coachProfessionalProfilesByCoachId, coachRpgProfilesByCoachId: generated.coachRpgProfilesByCoachId })
    const game = games[0]!
    const completed = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 81, awayScore: 78 })
    const homeCoach = world.teams[game.homeTeamId]!.coachId!
    const awayCoach = world.teams[game.awayTeamId]!.coachId!

    expect(completed.coachRpgProfilesByCoachId[homeCoach]!.professionalExperience.byAttribute.coaching).toBeGreaterThan(0)
    expect(completed.coachRpgProfilesByCoachId[awayCoach]!.professionalExperience.byAttribute.coaching).toBeGreaterThan(0)
    expect(() => applyMatchResult(completed, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 81, awayScore: 78 })).toThrow()

    const legacy = createGameWorld({ currentDate: generated.currentDate, currentSeasonId: generated.currentSeasonId, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games })
    expect(applyMatchResult(legacy, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 81, awayScore: 78 }).coachRpgProfilesByCoachId).toEqual({})
  })
})
