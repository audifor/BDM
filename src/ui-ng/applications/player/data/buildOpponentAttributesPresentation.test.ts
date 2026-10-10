import { describe, expect, it } from 'vitest'

import type { PlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import {
  buildOpponentFamilyKnowledge, buildScoutedFamilyProfiles, hasScoutedRadarProfile,
  opponentKnowledgeSummary, scoutingConfidenceLabel,
} from './buildOpponentAttributesPresentation'

type OpponentAccess = Extract<PlayerKnowledgeAccess, { kind: 'scouted' | 'unknown' }>

function accessWithEvaluations(): OpponentAccess {
  return {
    kind: 'scouted',
    organizationId: null,
    viewingTeamId: null,
    knownDimensions: [],
    knownPotential: [],
    ratingEvaluations: [
      {
        id: 'rating:FREE_THROW', key: 'FREE_THROW', label: 'Free Throw',
        family: 'shooting', displayLabel: '30-44', coveragePercent: 65,
        evaluation: {
          mode: 'RANGE', estimate: 37, uncertainty: 7,
          confidence: 68, freshness: .8, disagreement: 'MODERATE',
        },
      },
      {
        id: 'rating:THREE_POINT_STATIC', key: 'THREE_POINT_STATIC',
        label: 'Three Point Static', family: 'shooting',
        displayLabel: 'Not scouted', coveragePercent: 0, evaluation: null,
      },
    ],
  }
}

describe('Opponent Attributes FOW projection', () => {
  it('renders eight families from authorized evaluations only and hides unknown rows', () => {
    const access = accessWithEvaluations()
    const result = buildOpponentFamilyKnowledge(access)
    expect(result).toHaveLength(8)
    const shooting = result.find((row) => row.id === 'shooting')
    expect(shooting).toBeDefined()
    expect(shooting!.total).toBe(2)
    expect(shooting!.evaluated).toBe(1)
    expect(shooting!.ratings.filter((row) => row.evaluation !== null).map((row) => row.displayLabel)).toEqual(['30-44'])
    expect(opponentKnowledgeSummary(access)).toEqual({
      knownRatings: 1, totalRatings: 2, knownDimensions: 0, complete: false,
    })
  })

  it('never claims a complete spider profile when evaluations are absent', () => {
    const unknown: OpponentAccess = {
      kind: 'unknown', organizationId: null, viewingTeamId: null,
      knownDimensions: [], knownPotential: [], ratingEvaluations: [],
    }
    expect(opponentKnowledgeSummary(unknown)).toEqual({
      knownRatings: 0, totalRatings: 0, knownDimensions: 0, complete: false,
    })
    expect(buildOpponentFamilyKnowledge(unknown).every((entry) => entry.evaluated === 0)).toBe(true)
  })

  it('derives estimated eight-family radar only from complete authorized per-rating scouting reports', () => {
    const full: OpponentAccess = {
      ...accessWithEvaluations(),
      ratingEvaluations: [
        ...(['shooting', 'finishing', 'ballHandling', 'playmaking', 'offBall', 'defense', 'physical', 'mental'] as const)
          .map((family, index) => ({
            id: 'rating:FREE_THROW' as const, key: 'FREE_THROW' as const, label: family,
            family, displayLabel: '57-73', coveragePercent: 79,
            evaluation: {
              mode: 'RANGE' as const, estimate: 65 + index, uncertainty: 8,
              confidence: 86, freshness: 0.8, disagreement: 'MODERATE' as const,
            },
          })),
      ],
    }
    const families = buildScoutedFamilyProfiles(full)
    expect(families.map((row) => row.estimate)).toEqual([65, 66, 67, 68, 69, 70, 71, 72])
    expect(families[0]).toMatchObject({
      observed: 1, total: 1, estimate: 65, low: 57, high: 73,
      coverage: 79, confidence: 86, isComplete: true,
    })
    expect(hasScoutedRadarProfile(families)).toBe(true)
    const withoutMental = { ...full, ratingEvaluations: full.ratingEvaluations.slice(0, -1) }
    expect(hasScoutedRadarProfile(buildScoutedFamilyProfiles(withoutMental))).toBe(false)
  })

  it('never plots unknown prior estimates or averages undisclosed ability', () => {
    const partial = accessWithEvaluations()
    const family = buildScoutedFamilyProfiles(partial).find((row) => row.id === 'shooting')!
    expect(family).toMatchObject({
      observed: 1, total: 2, estimate: 37, low: 30, high: 44,
      coverage: 65, confidence: 68, isComplete: false,
    })
    expect(hasScoutedRadarProfile(buildScoutedFamilyProfiles(partial))).toBe(false)
  })

  it('keeps real confidence percentages and never makes 68% into 100%', () => {
    expect(scoutingConfidenceLabel(68)).toBe('68% de confianza')
    expect(scoutingConfidenceLabel(0)).toBe('0% de confianza')
    expect(scoutingConfidenceLabel(100)).toBe('100% de confianza')
    expect(scoutingConfidenceLabel(undefined)).toBe('Sin confianza registrada')
  })
})
