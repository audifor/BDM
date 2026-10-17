// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { applyRelationshipEventToWorld, updateGameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { CoachWorkspace } from './CoachWorkspace'

afterEach(() => {
  cleanup()
  useGameStore.setState({ world: null })
})

describe('CoachWorkspace', () => {
  it('renders the canonical Staff-backed Coach profile', () => {
    const world = updateGameWorld(createNewGame(), {
      coachRpgProfilesByCoachId: {},
      coachReputationProfilesByCoachId: {},
    })
    const coach = world.coaches[world.userCoachId]!
    const staff = world.staffPeopleById[coach.staffProfileId]!
    useGameStore.setState({ world })

    render(<CoachWorkspace />)

    expect(screen.queryByText('Coach profile unavailable.')).not.toBeInTheDocument()
    expect(screen.getAllByText(`${staff.identity.firstName} ${staff.identity.lastName}`).length).toBeGreaterThan(0)
  })

  it('explains when development data is unavailable instead of leaving the tab blank', () => {
    const world = updateGameWorld(createNewGame(), { coachRpgProfilesByCoachId: {} })
    useGameStore.setState({ world })

    render(<CoachWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Development' }))

    expect(screen.getByText('Coach development data is not available for this career.')).toBeInTheDocument()
  })

  it('uses Courtside on every active Coach tab and preserves seven NG workspaces', () => {
    useGameStore.setState({ world: createNewGame() })
    const { container } = render(<CoachWorkspace />)
    expect(container.querySelector('.coach-courtside-ng')).toBeInTheDocument()
    const tabs = within(screen.getByRole('navigation', { name: 'Workspace tabs' }))
    for (const name of ['Overview', 'Opportunities', 'Career', 'Reputation', 'Relationships', 'Development', 'Legacy']) {
      fireEvent.click(tabs.getByRole('button', { name: new RegExp('^' + name + '$') }))
      expect(tabs.getByRole('button', { name: new RegExp('^' + name + '$') })).toHaveClass('is-active')
    }
  })

  it('shows a searchable, typed relationships table backed by canonical links', () => {
    const world = createNewGame()
    const player = Object.values(world.players)[0]!
    const linked = applyRelationshipEventToWorld(world, world.userCoachId, player.id, {
      id: 'relationship:coach-courtside-test',
      gameDate: world.currentDate, source: 'professionalInteraction', delta: 25,
      context: { kind: 'meeting' },
    })
    useGameStore.setState({ world: linked })
    render(<CoachWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: /^Relationships$/ }))
    expect(screen.getByText(player.firstName + ' ' + player.lastName)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search coach relationships' }), { target: { value: 'no-matching-person-zz' } })
    expect(screen.getByText('No matching relationships.')).toBeInTheDocument()
  })

})
