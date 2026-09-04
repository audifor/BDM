import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { organizationIdForTeam } from '@/domain/ids'
import { formatRatingEvaluation, type RatingEvaluation } from '@/domain/intelligence'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { exportGridCsv } from '@/ui/dataGrid/export'
import { sortRows } from '@/ui/dataGrid/sorting'
import {
  buildRosterRatingEvaluationLookup,
  CANONICAL_RATING_ORG_DIMENSION,
  evaluateRosterOrganizationRating,
  organizationDimensionForCanonicalRating,
  organizationDimensionForSummarySignal,
  rosterRatingExportValue,
  rosterRatingSortValue,
  ROSTER_UNKNOWN_RATING_SORT_VALUE,
  SUMMARY_SIGNAL_ORG_DIMENSION,
} from './rosterRatingPresentation'
import { scoutAwareRatingColumn, scoutAwareSummaryColumn } from './rosterScoutAwareColumns'

function injectKnowledge(
  world: ReturnType<typeof createNewGame>,
  playerId: string,
  dimension: string,
  finding: {
    estimate: number
    uncertainty: number
    provenance: 'scoutReport' | 'legacyBaseline' | 'inferred'
    confidence?: number
  },
) {
  const team = getUserTeam(world)!
  const organizationId = organizationIdForTeam(team.id)
  return updateGameWorld(world, {
    organizationKnowledge: [
      ...world.organizationKnowledge,
      {
        organizationId,
        subjectPlayerId: playerId as never,
        dimensions: {
          [dimension]: {
            coverage: 1,
            confidence: finding.confidence ?? 0.95,
            assessedAt: world.currentDate,
            provenance: finding.provenance,
            estimate: finding.estimate,
            uncertainty: finding.uncertainty,
          },
        },
      },
    ],
  })
}

describe('rosterRatingPresentation', () => {
  it('maps every canonical rating key to an organization dimension', () => {
    for (const key of Object.keys(CANONICAL_RATING_ORG_DIMENSION)) {
      expect(organizationDimensionForCanonicalRating(key as never)).toBeTruthy()
    }
    expect(SUMMARY_SIGNAL_ORG_DIMENSION.playmaking).toBe('creation')
    expect(organizationDimensionForSummarySignal('athleticism')).toBe('physical')
  })

  it('UNKNOWN mode displays ? and sorts last without hidden truth', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!
    const hiddenTruth = player.basketball.ratings.midRangeShooting
    const lookup = buildRosterRatingEvaluationLookup(world, team.id)
    const dimension = organizationDimensionForCanonicalRating('midRangeShooting')
    const evaluation = lookup(player, dimension)

    expect(evaluation.mode).toBe('UNKNOWN')
    expect(formatRatingEvaluation(evaluation)).toBe('?')
    expect(rosterRatingExportValue(evaluation)).toBe('?')
    expect(rosterRatingSortValue(evaluation)).toBe(ROSTER_UNKNOWN_RATING_SORT_VALUE)
    expect(String(hiddenTruth)).not.toBe('?')
  })

  it('EXACT mode displays and exports the evaluated value', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const player = getTeamRoster(base, team.id)[0]!
    const world = injectKnowledge(base, player.id, 'shooting', {
      estimate: 88,
      uncertainty: 1,
      provenance: 'scoutReport',
      confidence: 1,
    })
    const lookup = buildRosterRatingEvaluationLookup(world, team.id)
    const evaluation = lookup(player, 'shooting')

    expect(evaluation.mode).toBe('EXACT')
    expect(rosterRatingExportValue(evaluation)).toBe('88')
    expect(formatRatingEvaluation(evaluation)).toBe('88')
  })

  it('RANGE mode displays canonical range formatting and sorts by estimate', () => {
    const evaluation: RatingEvaluation = {
      mode: 'RANGE',
      estimate: 75,
      uncertainty: 8,
      confidence: 80,
      freshness: 1,
      disagreement: 'MODERATE',
    }
    expect(rosterRatingExportValue(evaluation)).toBe('67-83')
    expect(rosterRatingSortValue(evaluation)).toBe(75)
  })

  it('does not change when hidden player truth changes without knowledge', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const player = getTeamRoster(base, team.id)[0]!
    const before = evaluateRosterOrganizationRating(base, team.id, player, 'shooting')
    const altered = updateGameWorld(base, {
      players: Object.values(base.players).map((candidate) =>
        candidate.id === player.id
          ? {
              ...candidate,
              basketball: {
                ...candidate.basketball,
                ratings: { ...candidate.basketball.ratings, threePointShooting: 100 },
              },
            }
          : candidate,
      ),
    })
    const after = evaluateRosterOrganizationRating(altered, team.id, player, 'shooting')
    expect(after).toEqual(before)
    expect(formatRatingEvaluation(after)).toBe('?')
  })

  it('scout-aware columns export and sort using presentation values only', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const players = getTeamRoster(base, team.id).slice(0, 2)
    const [first, second] = players
    const world = injectKnowledge(base, first!.id, 'shooting', {
      estimate: 90,
      uncertainty: 1,
      provenance: 'scoutReport',
      confidence: 1,
    })
    const lookup = buildRosterRatingEvaluationLookup(world, team.id)
    const column = scoutAwareRatingColumn(lookup, 'midRangeShooting', 'TIRO MEDIO')

    expect(column.exportValue?.(first!)).toBe('90')
    expect(column.exportValue?.(second!)).toBe('?')
    expect(column.sortValue?.(first!)).toBe(90)
    expect(column.sortValue?.(second!)).toBe(ROSTER_UNKNOWN_RATING_SORT_VALUE)

    const csv = exportGridCsv([column], players)
    expect(csv).toContain('"90"')
    expect(csv).toContain('"?"')
    expect(csv).not.toContain(String(first!.basketball.ratings.midRangeShooting))

    const sorted = sortRows(players, [column], [{ id: column.id, direction: 'ascending' }])
    expect(sorted[0]!.id).toBe(first!.id)
    expect(sorted[1]!.id).toBe(second!.id)
  })

  it('summary columns use the same organization dimensions as SquadScreen', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const player = getTeamRoster(world, team.id)[0]!
    const lookup = buildRosterRatingEvaluationLookup(world, team.id)
    const summaryColumn = scoutAwareSummaryColumn(lookup, 'playmaking', 'PMK')
    const ratingColumn = scoutAwareRatingColumn(lookup, 'passing', 'PASE')

    expect(summaryColumn.exportValue?.(player)).toBe(ratingColumn.exportValue?.(player))
  })
})
