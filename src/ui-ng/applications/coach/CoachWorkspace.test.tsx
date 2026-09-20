// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { CoachWorkspace } from './CoachWorkspace'

afterEach(() => {
  cleanup()
  useGameStore.setState({ world: null })
})

describe('CoachWorkspace', () => {
  it('renders the Staff-backed profile without legacy Coach profile maps', () => {
    const world = updateGameWorld(createNewGame(), {
      coachProfessionalProfilesByCoachId: {},
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
})
