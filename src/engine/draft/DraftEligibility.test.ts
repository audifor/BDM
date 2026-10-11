import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { nbaDraftRulesForYear } from '@/domain/draft'
import { assessNbaDraftEligibility, classifyNbaInternational } from './DraftEligibility'

describe('NBA Draft eligibility evidence', () => {
  it('distinguishes qualifying CBA international, foreign national, and unknown evidence', () => {
    const world = createNewGame()
    const candidates = Object.values(world.players).filter((player) => !Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === player.id))
    const [qualifying, foreignNational, missing] = candidates.slice(0, 3)
    const profiles = [
      { id: 'eligibility:qualifying', playerId: qualifying!.id, cycleId: 'test', origin: 'international' as const, position: qualifying!.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'elite' as const, preferences: { opportunity: 1, development: 1, competing: 1, coach: 1 }, status: 'open' as const, education: { highSchoolGraduationYear: 2022, completedUsHighSchool: false, enrolledAtUsCollege: false, yearsResidentOutsideUsBeforeDraft: 4, yearsPlayingBasketballOutsideUsBeforeDraft: 4 } },
      { id: 'eligibility:foreign', playerId: foreignNational!.id, cycleId: 'test', origin: 'international' as const, position: foreignNational!.basketball.primaryPosition, publicRank: 2, positionRank: 2, tier: 'strong' as const, preferences: { opportunity: 1, development: 1, competing: 1, coach: 1 }, status: 'open' as const, education: { highSchoolGraduationYear: 2022, completedUsHighSchool: true, enrolledAtUsCollege: false, yearsResidentOutsideUsBeforeDraft: 8, yearsPlayingBasketballOutsideUsBeforeDraft: 8 } },
    ]
    const evidenced = updateGameWorld(world, { recruitProfiles: profiles })

    expect(classifyNbaInternational(evidenced, qualifying!.id)).toBe('QUALIFYING_INTERNATIONAL')
    expect(classifyNbaInternational(evidenced, foreignNational!.id)).toBe('NON_INTERNATIONAL')
    expect(classifyNbaInternational(evidenced, missing!.id)).toBe('UNKNOWN')
  })

  it('makes a qualifying 22-year-old international Player automatically eligible, without nationality inference', () => {
    const world = createNewGame()
    const player = Object.values(world.players).find((candidate) => !Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === candidate.id))!
    const updated = updateGameWorld(world, {
      players: Object.values(world.players).map((item) => item.id === player.id ? { ...item, bio: { ...item.bio, dateOfBirth: createGameDate(2023, 1, 1) } } : item),
      recruitProfiles: [{ id: 'eligibility:auto-intl', playerId: player.id, cycleId: 'test', origin: 'international', position: player.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'elite', preferences: { opportunity: 1, development: 1, competing: 1, coach: 1 }, status: 'open', education: { completedUsHighSchool: false, enrolledAtUsCollege: false, yearsResidentOutsideUsBeforeDraft: 4, yearsPlayingBasketballOutsideUsBeforeDraft: 4 } }],
    })
    const rules = nbaDraftRulesForYear(2045)
    const result = assessNbaDraftEligibility(updated, player.id, { scheduledOn: '2045-06-23', rules })
    expect(result).toMatchObject({ eligible: true, automatic: true, classification: 'QUALIFYING_INTERNATIONAL' })
  })

  it('admits an eligible non-international early entrant only after the recorded high-school year', () => {
    const world = createNewGame()
    const player = Object.values(world.players).find((candidate) => !Object.values(world.playerEnrollmentsById).some((enrollment) => enrollment.playerId === candidate.id))!
    const updated = updateGameWorld(world, {
      players: Object.values(world.players).map((item) => item.id === player.id ? { ...item, bio: { ...item.bio, dateOfBirth: createGameDate(2026, 1, 1) } } : item),
      recruitProfiles: [{ id: 'eligibility:non-intl-early', playerId: player.id, cycleId: 'test', origin: 'preCollege', position: player.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'elite', preferences: { opportunity: 1, development: 1, competing: 1, coach: 1 }, status: 'open', education: { highSchoolGraduationYear: 2044, completedUsHighSchool: true, enrolledAtUsCollege: false } }],
    })
    const result = assessNbaDraftEligibility(updated, player.id, { scheduledOn: '2045-06-23', rules: nbaDraftRulesForYear(2045) })
    expect(result).toMatchObject({ eligible: true, automatic: false, classification: 'NON_INTERNATIONAL' })
    expect(assessNbaDraftEligibility(updated, player.id, { scheduledOn: '2045-06-23', rules: { ...nbaDraftRulesForYear(2045), minimumAgeDuringDraftYear: 20 } }).eligible).toBe(false)
  })

  it('uses NCAA enrollment as conservative post-high-school evidence when no graduation year is recorded', () => {
    const world = createNewGame()
    const enrollment = Object.values(world.playerEnrollmentsById).find((item) => item.status === 'active' && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')!
    const player = world.players[enrollment.playerId]!
    const draftYear = Number(enrollment.startsOn.slice(0, 4)) + 1
    const updated = updateGameWorld(world, { players: Object.values(world.players).map((item) => item.id === player.id ? { ...item, bio: { ...item.bio, dateOfBirth: createGameDate(draftYear - 19, 1, 1) } } : item) })
    const result = assessNbaDraftEligibility(updated, player.id, { scheduledOn: createGameDate(draftYear, 6, 23), rules: nbaDraftRulesForYear(draftYear) })
    expect(result).toMatchObject({ eligible: true, automatic: false, classification: 'NON_INTERNATIONAL' })
    expect(result.reason).toContain('post-high-school')
  })
})
