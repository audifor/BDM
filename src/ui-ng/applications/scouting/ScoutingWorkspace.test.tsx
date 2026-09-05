// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { ScoutingWorkspace } from '@/ui-ng/applications/scouting/ScoutingWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=scouting')
  useGameStore.getState().resetGame()
})

function mountScoutingWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <ScoutingWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

describe('ScoutingWorkspace', () => {
  it('shows an empty state when no world is loaded', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <ScoutingWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Scouting' })).toBeInTheDocument()
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('renders organization knowledge from the live world without leaking hidden ratings', () => {
    const { team, world } = mountScoutingWorkspace()
    const player = world.players[team.rosterPlayerIds[0]!]!

    expect(screen.getByText((_, element) => element?.classList.contains('scouting-workspace-header__team') === true && element.textContent === team.name)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${player.firstName} ${player.lastName}` })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(JSON.stringify(player.basketball.ratings))
  })

  it('queues a quick-look assignment from the knowledge board', () => {
    mountScoutingWorkspace()
    fireEvent.click(screen.getAllByRole('button', { name: 'Quick look' })[0]!)

    const assignments = Object.values(useGameStore.getState().world!.scoutingAssignmentsById)
    expect(assignments).toHaveLength(1)
    expect(assignments[0]?.missionType).toBe('QUICK_LOOK')
    expect(assignments[0]?.status).toBe('QUEUED')
    expect(assignments[0]?.requestedBy).toBe('HEAD_COACH')
    expect(screen.getByRole('button', { name: 'Queued' })).toBeDisabled()
  })
})
