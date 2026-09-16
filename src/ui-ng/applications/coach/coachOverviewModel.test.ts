// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import {
  getCoachFinancialPosition,
  getCoachMonthlyExpenses,
  getCoachMonthlyExternalIncome,
} from '@/domain/coachFinances'
import { getRelationshipBandForPeople, getRelationshipsForPerson } from '@/domain/world'
import { formatMoney } from '@/ui/formatters'
import { buildCoachCareerModel } from '@/ui-ng/applications/coach/CoachCareerScreen'
import { buildCoachLegacyModel } from '@/ui-ng/applications/coach/CoachLegacyScreen'
import { COACH_OVERVIEW_MOCK } from '@/ui-ng/applications/coach/coachOverviewMock'
import { buildCoachOverviewModel } from '@/ui-ng/applications/coach/coachOverviewModel'

/** Mirrors the builder's money rendering so real values can be asserted verbatim. */
function money(value: number): string {
  return `$${formatMoney(value).replace(/\.?0+M$/, 'M')}`
}

/**
 * The Overview builder must project real world state and keep the mock strictly for the fields the
 * domain does not model. These tests pin that boundary in both directions.
 */
describe('buildCoachOverviewModel', () => {
  const world = createNewGame()
  const coachId = world.userCoachId
  const coach = world.coaches[coachId]!
  const employment = world.coachEmploymentByCoachId[coachId]!
  const teamId = employment.teamId!
  const rpg = world.coachRpgProfilesByCoachId[coachId]!
  const finances = world.coachFinancesByCoachId[coachId]!
  const team = world.teams[teamId]!
  const board = world.boardStatesByTeamId[teamId]!
  const developmentPoints = rpg.development.developmentPoints
  const model = buildCoachOverviewModel(world)

  it('reads identity from the employed coach and their club', () => {
    expect(model.identity.name).toBe(`${coach.firstName} ${coach.lastName}`)
    expect(model.identity.club).toBe(team.name)
    expect(model.identity.role).toBe('Head Coach')
    expect(model.identity.developmentPoints).toBe(developmentPoints)
  })

  it('keeps level, career XP, archetype, attributes and personality on the mock', () => {
    expect(model.identity.level).toBe(COACH_OVERVIEW_MOCK.identity.level)
    expect(model.identity.careerXp).toEqual(COACH_OVERVIEW_MOCK.identity.careerXp)
    expect(model.identity.rows).toEqual(COACH_OVERVIEW_MOCK.identity.rows)
    expect(model.attributes).toEqual(COACH_OVERVIEW_MOCK.attributes)
    expect(model.personality).toEqual(COACH_OVERVIEW_MOCK.personality)
  })

  it('reports the real personal finances', () => {
    const position = getCoachFinancialPosition(finances)
    const byId = new Map(model.finances.map((row) => [row.id, row]))

    expect(byId.get('salary')?.value).toBe(money(finances.annualSalary))
    expect(byId.get('netWorth')?.value).toBe(money(position.netWorth))
    expect(byId.get('expenses')?.value).toBe(money(getCoachMonthlyExpenses(finances)))
    expect(byId.get('externalIncome')?.value).toBe(money(getCoachMonthlyExternalIncome(finances)))

    // Hidden funds and the influence budget have no domain source: they stay mock, and say so.
    expect(byId.get('hidden')?.label).toContain('MOCK')
    expect(byId.get('influence')?.label).toContain('MOCK')

    const gross =
      finances.cash +
      finances.investments.filter((item) => item.status === 'active').reduce((sum, item) => sum + item.value, 0) +
      finances.assets.filter((item) => item.status === 'active').reduce((sum, item) => sum + item.marketValue, 0)
    expect(model.allocation.total).toBe(money(gross))
    expect(model.allocation.slices.every((slice) => slice.share >= 0 && slice.share <= 100)).toBe(true)
  })

  it('derives job security and the development alert from real state', () => {
    const statusById = new Map(model.status.map((row) => [row.id, row]))

    expect(statusById.get('career')?.detail).toContain(`Board confidence ${board.confidence}/100`)
    expect(statusById.get('career')?.tooltip).toContain(`board patience (${board.profile.patience})`)
    expect(statusById.get('development')?.detail).toBe(
      developmentPoints === 0
        ? 'No unspent development points.'
        : `${developmentPoints} unspent development point${developmentPoints === 1 ? '' : 's'}.`,
    )
    // Every status row navigates, so the ids must be real tab ids.
    for (const row of model.status) {
      expect(['career', 'development', 'reputation', 'opportunities', 'legacy']).toContain(row.id)
    }
  })

  it('replaces the relationships summary with the real relationship graph', () => {
    const relationships = getRelationshipsForPerson(world, coachId).slice(0, 4)
    const summary = model.summaries.find((entry) => entry.id === 'relationships')
    if (relationships.length === 0) {
      expect(summary?.metrics).toEqual(COACH_OVERVIEW_MOCK.summaries[2]?.metrics)
      return
    }
    expect(summary?.metrics).toHaveLength(relationships.length)
    for (const relationship of relationships) {
      const otherId = relationship.sourceId === coachId ? relationship.targetId : relationship.sourceId
      const band = getRelationshipBandForPeople(world, coachId, otherId)
      expect(summary?.metrics.some((metric) => metric.tooltip?.includes(band))).toBe(true)
    }
  })

  it('reuses the Career and Legacy derivations instead of inventing career figures', () => {
    const career = buildCoachCareerModel(world)
    const legacy = buildCoachLegacyModel(world)
    const wins = legacy?.figures.find((figure) => figure.id === 'wins')

    expect(wins?.value).toBe(career.wins)
    expect(wins?.mock).toBe(false)
    // Finals and playoff appearances have no domain source: they stay mock, explicitly.
    expect(legacy?.figures.find((figure) => figure.id === 'finals')?.mock).toBe(true)
    expect(legacy?.figures.find((figure) => figure.id === 'playoffs')?.mock).toBe(true)

    const careerSummary = model.summaries.find((entry) => entry.id === 'career')
    expect(careerSummary?.metrics.find((metric) => metric.id === 'winpct')?.value).toBe(
      career.trajectory.find((series) => series.id === 'winPct')?.endLabel,
    )
  })

  it('projects the real legacy timeline events, never flagged as mock', () => {
    const realEvents = (buildCoachLegacyModel(world)?.timeline ?? []).filter((event) => !event.mock)
    expect(realEvents.length).toBeGreaterThan(0)
    expect(model.timeline).toEqual(
      [...realEvents].reverse().map((event) => ({
        id: event.id,
        date: event.dateLabel,
        icon: event.icon,
        title: event.title,
        highlight: event.highlight,
        detail: event.detail,
        tone: event.tone,
        mock: false,
      })),
    )
    expect(model.timeline.every((event) => event.mock === false)).toBe(true)
  })

  it('flags the filler timeline as mock when the world has no real legacy event', () => {
    const noHistory = {
      ...world,
      coachCareerHistoryByCoachId: { ...world.coachCareerHistoryByCoachId, [coachId]: [] },
    }
    expect((buildCoachLegacyModel(noHistory)?.timeline ?? []).filter((event) => !event.mock)).toHaveLength(0)

    const fallback = buildCoachOverviewModel(noHistory)
    // Filler stays (density was asked for) but every entry is labelled, deriving from the mock rail.
    expect(fallback.timeline).toEqual(
      COACH_OVERVIEW_MOCK.timeline.map((event) => ({ ...event, mock: true })),
    )
    expect(fallback.timeline.every((event) => event.mock === true)).toBe(true)
    // The confrontable assertion is gone: no filler entry may claim a measured career figure.
    expect(fallback.timeline.some((event) => event.highlight === '100 Career Wins')).toBe(false)
  })

  it('keeps the fields with no canonical source from the mock, isolated', () => {
    expect(model.risks).toEqual(COACH_OVERVIEW_MOCK.risks)
    expect(model.favors).toEqual(COACH_OVERVIEW_MOCK.favors)
    expect(model.network).toEqual(COACH_OVERVIEW_MOCK.network)
    expect(model.power).toEqual(COACH_OVERVIEW_MOCK.power)
  })

  it('falls back to the mock when the world has no user coach', () => {
    const empty = { ...world, coaches: {} } as typeof world
    expect(buildCoachOverviewModel(empty)).toBe(COACH_OVERVIEW_MOCK)
  })
})
