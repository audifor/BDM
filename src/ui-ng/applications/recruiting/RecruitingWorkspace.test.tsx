// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { useGameStore } from '@/stores/gameStore'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { RecruitingWorkspace } from '@/ui-ng/applications/recruiting/RecruitingWorkspace'
import { WorkspaceHost } from '@/ui-ng/workspace/WorkspaceHost'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=recruiting')
  useGameStore.getState().resetGame()
})

describe('RecruitingWorkspace', () => {
  it('does not invent a college board for a non-NCAA career', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    render(
      <NgWorkspaceNavigationProvider>
        <RecruitingWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByText(UNAVAILABLE_SECTION_MESSAGE)).toBeInTheDocument()
  })

  it('shows the unavailable workspace screen when a FIBA career opens recruiting', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    render(
      <NgWorkspaceNavigationProvider>
        <WorkspaceHost />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByText(UNAVAILABLE_SECTION_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recruiting' })).toBeInTheDocument()
  })
})
