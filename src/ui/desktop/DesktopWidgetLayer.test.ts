// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { continueGame, createNewGame, simulateUntilDate } from '@/app/game'
import { useDesktopPreferencesStore } from '@/stores/desktopPreferencesStore'
import { formatPrototypeDate } from '@/ui/formatters'
import { DesktopWidgetLayer } from './DesktopWidgetLayer'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('DesktopWidgetLayer runtime wiring', () => {
  it('renders the real club and continue controls without the visual QA fixture', () => {
    const world = createNewGame()
    useDesktopPreferencesStore.setState({ visualQaFixture: false })

    const markup = renderToStaticMarkup(createElement(DesktopWidgetLayer, {
      world,
      onAdvanceDay: () => undefined,
      onContinue: () => continueGame(world),
      onInstantResult: () => undefined,
      onOpenApp: () => undefined,
      onOpenPendingGame: () => undefined,
      onPlayGame: () => undefined,
      onStartNextSeason: () => undefined,
      onSimulateUntilDate: (date) => simulateUntilDate(world, date),
    }))

    expect(markup).toContain('Club identity')
    expect(markup).toContain('Career time controls')
    expect(markup).toContain(formatPrototypeDate(world.currentDate))
  })

  it('places the simulate-until trigger in the visible, interactive career time block', () => {
    const world = createNewGame()
    useDesktopPreferencesStore.setState({ visualQaFixture: false })
    vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
    render(createElement(DesktopWidgetLayer, { world, onAdvanceDay: () => undefined, onContinue: () => continueGame(world), onInstantResult: () => undefined, onOpenApp: () => undefined, onOpenPendingGame: () => undefined, onPlayGame: () => undefined, onStartNextSeason: () => undefined, onSimulateUntilDate: (date) => simulateUntilDate(world, date) }))
    const timeControls = screen.getByRole('region', { name: 'Career time controls' })
    const trigger = within(timeControls).getByRole('button', { name: 'Simular hasta fecha' })
    expect(trigger).toBeVisible()
    expect(timeControls).toHaveClass('desktop-continue-control')
    expect(trigger.closest('[aria-label="Career time controls"]')).toBe(timeControls)
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Simular hasta fecha' })
    expect(within(dialog).getByLabelText('Día')).toBeVisible()
    expect(within(dialog).getByLabelText('Mes')).toBeVisible()
    expect(within(dialog).getByLabelText('Año')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'SIMULAR HASTA' })).toBeVisible()
  })
})
