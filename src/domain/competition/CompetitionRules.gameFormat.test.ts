import { describe, expect, it } from 'vitest'

import { competitionIdFromString, ecosystemIdFromString, teamIdFromString } from '@/domain/ids'
import { createSportsEcosystem } from '@/domain/ecosystem'
import { createCompetition, createCompetitionRules, defaultLeagueCompetitionRules, FIBA_GAME_FORMAT, NBA_GAME_FORMAT, NCAA_MEN_GAME_FORMAT, NCAA_WOMEN_GAME_FORMAT, WNBA_GAME_FORMAT } from './index'

/**
 * Issue #9 "CRITICAL RULES CORRECTION": women's basketball is not universally the same format as
 * men's, and game-clock rules must be resolved from the actual competition's CompetitionRules, not
 * inferred from an ecosystem/brand/gender label. These tests prove distinct real-world formats
 * resolve correctly, and that competitions inside the same ecosystem can carry different formats.
 */
describe('CompetitionRules.gameFormat', () => {
  const teamA = teamIdFromString('team-format-a')
  const teamB = teamIdFromString('team-format-b')

  it('an NCAA men\'s-style competition resolves 2x20-minute halves', () => {
    const competition = createCompetition({ id: competitionIdFromString('ncaa-men'), name: 'NCAA Men', gender: 'male', participantTeamIds: [teamA, teamB], rules: { ...defaultLeagueCompetitionRules, gameFormat: NCAA_MEN_GAME_FORMAT } })
    expect(competition.rules.gameFormat).toMatchObject(NCAA_MEN_GAME_FORMAT)
  })

  it('an NCAA women\'s-style competition resolves 4x10-minute quarters', () => {
    const competition = createCompetition({ id: competitionIdFromString('ncaa-women'), name: 'NCAA Women', gender: 'female', participantTeamIds: [teamA, teamB], rules: { ...defaultLeagueCompetitionRules, gameFormat: NCAA_WOMEN_GAME_FORMAT } })
    expect(competition.rules.gameFormat).toMatchObject(NCAA_WOMEN_GAME_FORMAT)
  })

  it('an NBA-style competition resolves 4x12-minute quarters', () => {
    const competition = createCompetition({ id: competitionIdFromString('nba'), name: 'NBA', gender: 'male', participantTeamIds: [teamA, teamB], rules: { ...defaultLeagueCompetitionRules, gameFormat: NBA_GAME_FORMAT } })
    expect(competition.rules.gameFormat).toMatchObject(NBA_GAME_FORMAT)
  })

  it('a WNBA-style competition resolves 4x10-minute quarters', () => {
    const competition = createCompetition({ id: competitionIdFromString('wnba'), name: 'WNBA', gender: 'female', participantTeamIds: [teamA, teamB], rules: { ...defaultLeagueCompetitionRules, gameFormat: WNBA_GAME_FORMAT } })
    expect(competition.rules.gameFormat).toMatchObject(WNBA_GAME_FORMAT)
  })

  it('a FIBA-style competition resolves 4x10-minute quarters and is the schema default', () => {
    expect(defaultLeagueCompetitionRules.gameFormat).toEqual(FIBA_GAME_FORMAT)
    const competition = createCompetition({ id: competitionIdFromString('fiba'), name: 'FIBA League', gender: 'male', participantTeamIds: [teamA, teamB] })
    expect(competition.rules.gameFormat).toMatchObject(FIBA_GAME_FORMAT)
  })

  it('the same broader NCAA-like ecosystem may contain competitions with different timing rules, with no UI/engine branching required', () => {
    const ecosystem = createSportsEcosystem({ id: ecosystemIdFromString('ncaa-like-ecosystem'), name: 'Collegiate Basketball', kind: 'ncaaLike' })
    const men = createCompetition({ id: competitionIdFromString('ncaa-men-2'), name: 'NCAA Men 2', gender: 'male', participantTeamIds: [teamA, teamB], ecosystemId: ecosystem.id, rules: { ...defaultLeagueCompetitionRules, gameFormat: NCAA_MEN_GAME_FORMAT } })
    const women = createCompetition({ id: competitionIdFromString('ncaa-women-2'), name: 'NCAA Women 2', gender: 'female', participantTeamIds: [teamA, teamB], ecosystemId: ecosystem.id, rules: { ...defaultLeagueCompetitionRules, gameFormat: NCAA_WOMEN_GAME_FORMAT } })

    expect(men.ecosystemId).toBe(women.ecosystemId)
    expect(men.rules.gameFormat).not.toEqual(women.rules.gameFormat)
    expect(men.rules.gameFormat).toMatchObject(NCAA_MEN_GAME_FORMAT)
    expect(women.rules.gameFormat).toMatchObject(NCAA_WOMEN_GAME_FORMAT)
  })

  it('keeps made-basket clock stops and substitution windows independently configurable', () => {
    const competition = createCompetition({
      id: competitionIdFromString('independent-clock-rules'), name: 'Independent Clock Rules', gender: 'male', participantTeamIds: [teamA, teamB],
      rules: { ...defaultLeagueCompetitionRules, gameFormat: { ...FIBA_GAME_FORMAT, madeBasketClockStopUnderSecondsInFinalPeriod: null, madeBasketSubstitutionUnderSecondsInFinalPeriod: 30 } },
    })
    expect(competition.rules.gameFormat.madeBasketClockStopUnderSecondsInFinalPeriod).toBeNull()
    expect(competition.rules.gameFormat.madeBasketSubstitutionUnderSecondsInFinalPeriod).toBe(30)
  })

  it('rejects a non-positive period count, period length, or overtime length', () => {
    expect(() => createCompetitionRules({ ...defaultLeagueCompetitionRules, gameFormat: { periodCount: 0, periodMinutes: 10, overtimeMinutes: 5 } })).toThrow(RangeError)
    expect(() => createCompetitionRules({ ...defaultLeagueCompetitionRules, gameFormat: { periodCount: 4, periodMinutes: 0, overtimeMinutes: 5 } })).toThrow(RangeError)
    expect(() => createCompetitionRules({ ...defaultLeagueCompetitionRules, gameFormat: { periodCount: 4, periodMinutes: 10, overtimeMinutes: 0 } })).toThrow(RangeError)
  })
})
