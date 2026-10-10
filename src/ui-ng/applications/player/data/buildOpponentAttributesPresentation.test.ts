import { describe, expect, it } from 'vitest'

import type { PlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import {
  buildOpponentFamilyKnowledge, opponentKnowledgeSummary, scoutingConfidenceLabel,
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

  it('keeps real confidence percentages and never makes 68% into 100%', () => {
    expect(scoutingConfidenceLabel(68)).toBe('68% de confianza')
    expect(scoutingConfidenceLabel(0)).toBe('0% de confianza')
    expect(scoutingConfidenceLabel(100)).toBe('100% de confianza')
    expect(scoutingConfidenceLabel(undefined)).toBe('Sin confianza registrada')
  })
})
