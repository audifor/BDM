// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
    expect(screen.getAllByRole('button', { name: `${player.firstName} ${player.lastName}` }).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain(JSON.stringify(player.basketball.ratings))
  })

  it('renders the Courtside request structure and synchronizes mission, target, scout and priority', () => {
    mountScoutingWorkspace()
    fireEvent.click(screen.getAllByRole('button', { name: 'Request scouting' })[0]!)
    const dialog = screen.getByRole('dialog', { name: 'REQUEST SCOUTING' })
    expect(dialog).toHaveClass('scouting-modal--courtside-request')
    expect(within(dialog).getByRole('heading', { name: 'ASSIGNMENT SETUP' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'ASSIGNMENT SUMMARY' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'KNOWLEDGE STATUS' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /confirm assignment/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'CANCEL' })).toBeInTheDocument()

    const mission = dialog.querySelector('select')!
    fireEvent.change(mission, { target: { value: 'SKILL_EVALUATION' } })
    expect(within(dialog).getByText('Shooting family')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Skill evaluation').length).toBeGreaterThan(0)
    const selects = dialog.querySelectorAll('select')
    expect(selects).toHaveLength(4)
    fireEvent.change(selects[1]!, { target: { value: 'physical' } })
    expect(within(dialog).getByText('Physical family')).toBeInTheDocument()
    fireEvent.change(selects[3]!, { target: { value: 'URGENT' } })
    expect(within(dialog).getAllByText('Urgent').length).toBeGreaterThan(0)
  })

  it('queues a quick-look assignment from the knowledge board', () => {
    mountScoutingWorkspace()
    fireEvent.click(screen.getAllByRole('button', { name: 'Request scouting' })[0]!)
    expect(screen.getByRole('option', { name: 'Full report' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Skill evaluation' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Potential evaluation' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tactical fit' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Live game' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirm assignment/i }))

    const assignments = Object.values(useGameStore.getState().world!.scoutingAssignmentsById)
    expect(assignments).toHaveLength(1)
    expect(assignments[0]?.missionType).toBe('QUICK_LOOK')
    expect(assignments[0]?.status).toBe('QUEUED')
    expect(assignments[0]?.requestedBy).toBe('HEAD_COACH')
    expect(screen.getByRole('button', { name: /Quick look.*Queued/i })).toBeInTheDocument()
    expect(screen.getByText(/Scouting report requested/i)).toBeInTheDocument()
  })
})
