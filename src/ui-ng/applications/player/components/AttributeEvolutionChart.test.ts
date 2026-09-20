import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { GameDate } from '@/domain/date'
import type {
  AttributeTrainingOptionModel,
  RatingEvolutionModel,
} from '@/ui-ng/applications/player/data/playerWorkspaceModel'

import { AttributeEvolutionChart } from './AttributeEvolutionChart'
import { AttributeTrainingOptions } from './AttributeTrainingOptions'

function trainingOption(
  overrides: Partial<AttributeTrainingOptionModel> = {},
): AttributeTrainingOptionModel {
  return {
    id: 'threePoint',
    definitionId: 'threePoint',
    name: 'Three-Point Shooting',
    categoryLabel: 'Shooting',
    scopeLabel: 'Team or individual',
    defaultIntensity: 'normal',
    developmentWeight: 1,
    fatigueMultiplier: 0.6,
    durationMinutes: 60,
    isUserModule: false,
    individualAssignable: true,
    ...overrides,
  }
}

function evolutionWith(overrides: Partial<RatingEvolutionModel> = {}): RatingEvolutionModel {
  return {
    ratingId: 'THREE_POINT_STATIC',
    current: 76,
    points: [
      { id: 'season-1', label: '2032/33', value: 70, delta: 0, isCurrent: false },
      { id: 'season-2', label: '2033/34', value: 73, delta: 3, isCurrent: false },
      { id: 'season-3', label: '2034/35', value: 76, delta: 3, isCurrent: true },
    ],
    changeSinceFirst: 6,
    hasRecordedHistory: true,
    note: 'One movement per offseason transition; past values are reconstructed from it.',
    accumulatedStimulus: 0,
    assignment: {
      status: 'available',
      reason: null,
      date: '2032-10-02' as GameDate,
      startTime: '09:00',
      sessionId: 'session:individual:player-1:2032-10-02',
      nextSession: null,
    },
    league: {
      status: 'available',
      mean: 64.4,
      sampleSize: 95,
      scopeLabel: 'Virelia Horizon League',
      note: 'Mean of this rating across every rostered rival in the competition.',
    },
    standing: {
      status: 'available',
      percentile: 82,
      positionMean: 71.4,
      positionLabel: 'PG',
      positionSampleSize: 24,
      note: 'Percentile is the share of rivalling rosters this value beats; the player never counts in their own sample.',
    },
    trainings: [],
    ...overrides,
  }
}

function render(element: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(element)
}

/** The `__points` overlay wrapper also starts with `__point`, so plain and current dots are counted separately. */
function dotCount(markup: string): number {
  return (markup.match(/class="po-attr-evolution__point"/g) ?? []).length +
    (markup.match(/class="po-attr-evolution__point is-current"/g) ?? []).length
}

describe('AttributeEvolutionChart', () => {
  it('draws one point per season and a league reference line', () => {
    const markup = render(
      createElement(AttributeEvolutionChart, {
        evolution: evolutionWith(),
        label: 'Three-Point Shooting',
      }),
    )

    expect(dotCount(markup)).toBe(3)
    expect(markup.match(/class="po-attr-evolution__point is-current"/g)).toHaveLength(1)
    expect(markup).toContain('po-attr-evolution__league')
    expect(markup).toContain('po-attr-evolution__line')
    // Season labels are plotted for every recorded season.
    expect(markup).toContain('2032/33')
    expect(markup).toContain('2034/35')
  })

  it('plots a single point without a series line when nothing has been recorded', () => {
    const markup = render(
      createElement(AttributeEvolutionChart, {
        evolution: evolutionWith({
          points: [{ id: 'season-1', label: '2032/33', value: 76, delta: 0, isCurrent: true }],
          changeSinceFirst: 0,
          hasRecordedHistory: false,
          note: 'No progression recorded yet: the curve starts at the first offseason transition.',
        }),
        label: 'Three-Point Shooting',
      }),
    )

    expect(dotCount(markup)).toBe(1)
    expect(markup).not.toContain('po-attr-evolution__line')
    expect(markup).toContain('No progression recorded yet')
  })

  it('keeps the legend honest when the competition baseline is unavailable', () => {
    const markup = render(
      createElement(AttributeEvolutionChart, {
        evolution: evolutionWith({
          league: {
            status: 'unavailable',
            mean: null,
            sampleSize: 0,
            scopeLabel: null,
            note: 'No rivalling roster available for this competition.',
          },
        }),
        label: 'Three-Point Shooting',
      }),
    )

    expect(markup).not.toContain('po-attr-evolution__league"')
    expect(markup).toContain('League mean <b class="ng-type-numeric">—</b>')
  })
})

describe('AttributeTrainingOptions', () => {
  it('lists every option that can develop the attribute', () => {
    const markup = render(
      createElement(AttributeTrainingOptions, {
        evolution: evolutionWith({ accumulatedStimulus: 4, trainings: [trainingOption()] }),
        label: 'Three-Point Shooting',
      }),
    )

    expect(markup).toContain('Three-Point Shooting')
    expect(markup).toContain('Shooting · Team or individual · normal · 60 min')
    expect(markup).toContain('×1 development')
    expect(markup).toContain('×0.6 fatigue')
    // The accumulated stimulus belongs to the attribute, so it is stated once for the section.
    expect(markup.match(/4\.0 stimulus accumulated this season/g)).toHaveLength(1)
  })

  it('states the gap instead of inventing a training when none targets the attribute', () => {
    const markup = render(
      createElement(AttributeTrainingOptions, {
        evolution: evolutionWith({ trainings: [] }),
        label: 'Dunking',
      }),
    )

    expect(markup).toContain('No catalog training targets this attribute')
    expect(markup).not.toContain('po-attr-training__option')
  })

  it('offers a one-click assignment for options that can run as individual training', () => {
    const markup = render(
      createElement(AttributeTrainingOptions, {
        evolution: evolutionWith({
          trainings: [
            trainingOption({ id: 'threePointCustom', name: 'Triples de Kevin', isUserModule: true }),
            trainingOption({
              id: 'offensiveSystem',
              name: 'Offensive System',
              scopeLabel: 'Team session',
              individualAssignable: false,
            }),
          ],
        }),
        label: 'Three-Point Shooting',
        onAssign: () => undefined,
      }),
    )

    // The user-created module is offered exactly like a built-in definition, and marked as custom.
    expect(markup).toContain('Triples de Kevin')
    expect(markup).toContain('po-attr-training__tag')
    expect(markup.match(/po-attr-training__assign/g)).toHaveLength(1)
    // A team-only module develops the attribute but cannot be booked as an individual session.
    expect(markup).toContain('Team session only')
    expect(markup).toContain('2032-10-02 · 09:00')
  })

  it('does not offer assignment when the player cannot be scheduled from here', () => {
    const markup = render(
      createElement(AttributeTrainingOptions, {
        evolution: evolutionWith({
          trainings: [trainingOption()],
          assignment: {
            status: 'unavailable',
            reason: 'Only players on your own roster can be scheduled from here.',
            date: null,
            startTime: null,
            sessionId: null,
            nextSession: null,
          },
        }),
        label: 'Three-Point Shooting',
        onAssign: () => undefined,
      }),
    )

    expect(markup).not.toContain('po-attr-training__assign')
    expect(markup).toContain('Only players on your own roster can be scheduled from here.')
  })

  it('reports the pending session and offers to replace it', () => {
    const markup = render(
      createElement(AttributeTrainingOptions, {
        evolution: evolutionWith({
          trainings: [trainingOption()],
          assignment: {
            status: 'available',
            reason: null,
            date: '2032-10-02' as GameDate,
            startTime: '09:00',
            sessionId: 'session:individual:player-1:2032-10-02',
            nextSession: {
              sessionId: 'session:individual:player-1:2032-10-02',
              definitionId: 'threePoint',
              moduleId: null,
              label: 'Three-Point Shooting',
              date: '2032-10-02' as GameDate,
              startTime: '09:00',
              intensity: 'normal',
            },
          },
        }),
        label: 'Three-Point Shooting',
        onAssign: () => undefined,
      }),
    )

    expect(markup).toContain('Next training:')
    expect(markup).toContain('<b>Three-Point Shooting</b>')
    // Nothing else can be booked in its place while it is the only option and already active.
    expect(markup).toContain('class="po-attr-training__assign is-active"')
    expect(markup).toContain('disabled=""')
  })

  it('disables the booked training and leaves the rest assignable', () => {
    const booked = {
      sessionId: 'session:individual:player-1:2032-10-02',
      definitionId: 'threePoint',
      moduleId: 'module:custom-three',
      label: 'Triples de Kevin',
      date: '2032-10-02' as GameDate,
      startTime: '09:00',
      intensity: 'high' as const,
    }
    const markup = render(
      createElement(AttributeTrainingOptions, {
        evolution: evolutionWith({
          trainings: [
            trainingOption({ id: 'module:custom-three', name: 'Triples de Kevin', isUserModule: true }),
            trainingOption({ id: 'threePoint' }),
            trainingOption({ id: 'catchAndShoot', name: 'Catch and Shoot' }),
          ],
          assignment: {
            status: 'available',
            reason: null,
            date: '2032-10-02' as GameDate,
            startTime: '09:00',
            sessionId: booked.sessionId,
            nextSession: booked,
          },
        }),
        label: 'Three-Point Shooting',
        onAssign: () => undefined,
      }),
    )

    // The booked module is the active training: its button is disabled and says so.
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('Next training')
    // The session records the module, so a definition sharing that module stays enabled.
    expect(markup.match(/Make it next training/g)).toHaveLength(2)
    expect(markup).toContain('Next training: <b>Triples de Kevin</b>')
  })
})
