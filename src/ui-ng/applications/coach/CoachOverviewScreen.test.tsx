// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { CoachOverviewScreen } from '@/ui-ng/applications/coach/CoachOverviewScreen'
import {
  COACH_OVERVIEW_MOCK,
  type CoachOverviewModel,
} from '@/ui-ng/applications/coach/coachOverviewMock'

afterEach(cleanup)

/** The second row must keep this tab order; it mirrors the tab bar. */
const SUMMARY_TAB_ORDER = ['career', 'reputation', 'relationships', 'development', 'opportunities', 'legacy']

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Scopes queries to one macro-panel. Several labels legitimately repeat across panels (a
 * "Leadership" axis and a "Leadership" development track, "Salary" as a resource and as an
 * allocation slice), so the shared text must not be asserted page-wide.
 */
function panel(container: HTMLElement, heading: RegExp) {
  const section = within(container).getByRole('heading', { name: heading }).closest('section')
  if (section === null) throw new Error(`No <section> panel for heading ${String(heading)}`)
  return within(section)
}

function renderScreen(overrides: Partial<CoachOverviewModel> = {}) {
  const model: CoachOverviewModel = { ...COACH_OVERVIEW_MOCK, ...overrides }
  const onOpenHistory = vi.fn()
  const onOpenTab = vi.fn()
  const onSelectStatus = vi.fn()
  const view = render(
    <CoachOverviewScreen
      model={model}
      onOpenHistory={onOpenHistory}
      onOpenTab={onOpenTab}
      onSelectStatus={onSelectStatus}
    />,
  )
  return { ...view, model, onOpenHistory, onOpenTab, onSelectStatus }
}

describe('CoachOverviewScreen', () => {
  it('renders the character core: identity, attributes and personality', () => {
    const { container } = renderScreen()
    const core = panel(container, /Character core/)

    expect(core.getByText('Jora Dain')).toBeInTheDocument()
    expect(core.getByText('Lv 6')).toBeInTheDocument()
    expect(core.getByText(/Head Coach/)).toBeInTheDocument()
    expect(core.getByText('Tactical Builder')).toBeInTheDocument()
    expect(core.getByText('Power Broker')).toBeInTheDocument()
    expect(core.getByText('Ruthless Pragmatist')).toBeInTheDocument()

    expect(core.getByText('2,340')).toBeInTheDocument()
    expect(core.getByRole('img', { name: 'Career XP 2340 of 3000' })).toBeInTheDocument()

    // The development points are the one actionable number in the identity block.
    expect(core.getByText('Development points')).toBeInTheDocument()

    // The radar must describe every axis it plots, not just its own title.
    const axes = COACH_OVERVIEW_MOCK.attributes.map((attribute) => `${attribute.label} ${attribute.value}`)
    expect(core.getByRole('img', { name: `Character attributes: ${axes.join(', ')}` })).toBeInTheDocument()

    expect(core.getByText(COACH_OVERVIEW_MOCK.personality.motto)).toBeInTheDocument()
  })

  it('carries the semantic tone of each personality trait into the bar', () => {
    renderScreen()

    for (const trait of COACH_OVERVIEW_MOCK.personality.traits) {
      const row = screen.getByTitle(trait.tooltip as string)
      expect(row.querySelector('.co-valuebar__fill')).toHaveClass(`co-tone-bg--${trait.tone}`)
    }

    // Low integrity is the one red dimension on the sheet: it must never read as neutral.
    const integrity = COACH_OVERVIEW_MOCK.personality.traits.find((trait) => trait.id === 'integrity')
    expect(integrity?.tone).toBe('negative')
  })

  it('renders the six summary modules in tab order and routes each one to its own tab', () => {
    const { container, model, onOpenTab } = renderScreen()

    const cards = [...container.querySelectorAll<HTMLElement>('[data-summary]')]
    expect(cards.map((card) => card.dataset.summary)).toEqual(SUMMARY_TAB_ORDER)

    cards.forEach((card, index) => {
      onOpenTab.mockClear()
      fireEvent.click(within(card).getByRole('button'))
      expect(onOpenTab).toHaveBeenCalledWith(model.summaries[index]?.tabId)
    })
  })

  it('lets every status row report which concern was picked', () => {
    const { model, onSelectStatus } = renderScreen()

    for (const row of model.status) {
      const button = screen.getByRole('button', { name: new RegExp(escapeRegExp(row.title)) })
      expect(button).toHaveTextContent(row.detail)
      expect(button).toHaveTextContent(row.badge)

      onSelectStatus.mockClear()
      fireEvent.click(button)
      expect(onSelectStatus).toHaveBeenCalledWith(row.id)
    }
  })

  it('renders the risk monitor and the economy rows from the model', () => {
    const { container } = renderScreen()
    const economy = panel(container, /Personal economy/)

    for (const risk of COACH_OVERVIEW_MOCK.risks) {
      expect(screen.getByRole('img', { name: `${risk.label} ${risk.filled} of ${risk.total}` })).toBeInTheDocument()
    }

    for (const finance of COACH_OVERVIEW_MOCK.finances) {
      // Amounts are unique to the resource list; the labels also appear in the allocation legend.
      expect(economy.getAllByText(finance.label).length).toBeGreaterThan(0)
      expect(economy.getByText(finance.value)).toBeInTheDocument()
    }

    expect(economy.getByText(COACH_OVERVIEW_MOCK.allocation.total)).toBeInTheDocument()
    expect(economy.getByText(COACH_OVERVIEW_MOCK.allocation.caption)).toBeInTheDocument()
    expect(economy.getByText(COACH_OVERVIEW_MOCK.power.label)).toBeInTheDocument()

    const slices = COACH_OVERVIEW_MOCK.allocation.slices
      .map((slice) => `${slice.label} ${slice.share}%`)
      .join(', ')
    expect(
      screen.getByRole('img', {
        name: `Fund allocation: ${COACH_OVERVIEW_MOCK.allocation.total} ${COACH_OVERVIEW_MOCK.allocation.caption}. ${slices}`,
      }),
    ).toBeInTheDocument()
  })

  it('renders every timeline event and opens the full history from the rail', () => {
    const { model, onOpenHistory } = renderScreen()

    for (const event of model.timeline) {
      expect(screen.getByText(event.date)).toBeInTheDocument()
      expect(screen.getByText(event.title)).toBeInTheDocument()
      expect(screen.getByText(event.highlight)).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: /View full career history/ }))
    expect(onOpenHistory).toHaveBeenCalledTimes(1)
  })

  it('labels illustrative timeline entries so filler never reads as measured data', () => {
    const timeline = COACH_OVERVIEW_MOCK.timeline.map((event) => ({ ...event, mock: true }))
    const { container } = renderScreen({ timeline })
    const rail = panel(container, /Recent career timeline/)

    expect(rail.getAllByText('Mock')).toHaveLength(timeline.length)
    // The old filler claim must not survive anywhere in the rail.
    expect(rail.queryByText('100 Career Wins')).not.toBeInTheDocument()
  })

  it('leaves real timeline entries unlabelled', () => {
    const timeline = COACH_OVERVIEW_MOCK.timeline.map((event) => ({ ...event, mock: false }))
    const { container } = renderScreen({ timeline })
    const rail = panel(container, /Recent career timeline/)

    expect(rail.queryByText('Mock')).not.toBeInTheDocument()
  })

  it('reads every micro-chart with its own range instead of leaving the plots as decoration', () => {
    const { container } = renderScreen()

    const readings = COACH_OVERVIEW_MOCK.summaries.map((summary) => {
      const card = container.querySelector<HTMLElement>(`[data-summary="${summary.id}"]`)
      if (card === null) throw new Error(`No summary card for ${summary.id}`)
      const { chart } = summary
      // The contract: the line and the staircase state the span they plot, the bars state their
      // axis, and the meter/ring cards already carry their numbers.
      const expected =
        chart.kind === 'line' || chart.kind === 'steps'
          ? `${chart.points[0]} → ${chart.points[chart.points.length - 1]}`
          : chart.kind === 'bars'
            ? `0 – ${Math.max(...chart.columns.map((column) => column.value), 0)}`
            : null
      return { id: summary.id, expected, rendered: card.querySelector('.co-chart__scale')?.textContent ?? null }
    })

    for (const reading of readings) {
      expect(reading.rendered).toBe(reading.expected)
    }

    // Filler data betrays itself by drawing the same shape twice: no two plotted spans may repeat.
    const plotted = readings
      .map((reading) => reading.rendered)
      .filter((rendered): rendered is string => rendered !== null)
    expect(plotted.length).toBeGreaterThan(1)
    expect(new Set(plotted).size).toBe(plotted.length)
  })

  it('renders from the injected model instead of hardcoded values', () => {
    renderScreen({
      identity: { ...COACH_OVERVIEW_MOCK.identity, name: 'Marek Voln', level: 9 },
      personality: { ...COACH_OVERVIEW_MOCK.personality, motto: '“Nobody remembers second place.”' },
    })

    expect(screen.getByText('Marek Voln')).toBeInTheDocument()
    expect(screen.getByText('Lv 9')).toBeInTheDocument()
    expect(screen.getByText('“Nobody remembers second place.”')).toBeInTheDocument()
    expect(screen.queryByText('Jora Dain')).not.toBeInTheDocument()
    expect(screen.queryByText(COACH_OVERVIEW_MOCK.personality.motto)).not.toBeInTheDocument()
  })

  it('renders read-only when no callbacks are wired yet', () => {
    render(<CoachOverviewScreen />)

    expect(screen.getByText('Jora Dain')).toBeInTheDocument()
    // Discovery-phase screens are wired to tabs incrementally; none of these may throw.
    for (const button of screen.getAllByRole('button')) {
      fireEvent.click(button)
    }
  })
})
