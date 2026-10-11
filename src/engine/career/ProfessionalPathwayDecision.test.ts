import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { advisePlayerCareerPathway, chooseCareerPathwayFromContext, estimatePlayerDraftOutlook } from './ProfessionalPathwayDecision'

describe('player professional pathway advice', () => {
  it('returns a qualitative, production-based outlook and an explainable college choice', () => {
    const world = createNewGame()
    const ncaa = Object.values(world.teams).find((team) => Object.values(world.competitions).some((competition) => competition.participantTeamIds.includes(team.id) && world.ecosystems[competition.ecosystemId]!.kind === 'ncaaLike'))!
    const playerId = ncaa.rosterPlayerIds[0]!
    const outlook = estimatePlayerDraftOutlook(world, playerId)
    const advice = advisePlayerCareerPathway(world, playerId, ncaa.id)
    expect(['lottery', 'firstRound', 'secondRound', 'borderline', 'likelyUndrafted']).toContain(outlook.band)
    expect(['stayCollege', 'enterPortal', 'testDraft']).toContain(advice.decision)
    expect(advice.reasons.length).toBeGreaterThan(0)
    expect('draftProbability' in advice).toBe(false)
  })

  it('can favor return for strong college support and remaining in the Draft for a poor role and pro ambition', () => {
    const outlook = 'secondRound' as const
    expect(chooseCareerPathwayFromContext({ stayPressure: 2, leavePressure: 1, role: 0.9, trust: 0.9, collegeSupport: 3, compensationImportance: 8, seasonsRemaining: 3, professionalImportance: 5, outlook, age: 19, seriouslyConsideringPortal: false, isDeclared: false, canWithdraw: true })).toBe('stayCollege')
    expect(chooseCareerPathwayFromContext({ stayPressure: 0, leavePressure: 0, role: 0.1, trust: 0.1, collegeSupport: 0, compensationImportance: 1, seasonsRemaining: 3, professionalImportance: 10, outlook, age: 19, seriouslyConsideringPortal: false, isDeclared: true, canWithdraw: true })).toBe('remainInDraft')
  })
})
