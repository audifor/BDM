import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { continueGame, createNewGame } from '@/app/game'
import { useDesktopPreferencesStore } from '@/stores/desktopPreferencesStore'
import { formatPrototypeDate } from '@/ui/formatters'
import { DesktopWidgetLayer } from './DesktopWidgetLayer'

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
    }))

    expect(markup).toContain('Club identity')
    expect(markup).toContain('Career time controls')
    expect(markup).toContain(formatPrototypeDate(world.currentDate))
  })
})
