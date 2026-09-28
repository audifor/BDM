// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { ClubStrategyScreen } from './ClubStrategyScreen'

afterEach(cleanup)

describe('ClubStrategyScreen', () => {
  it('shows AI club direction, evidence and review timing without adding action controls', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).filter((candidate) => candidate.coachId !== undefined && candidate.coachId !== world.userCoachId).sort((a, b) => a.name.localeCompare(b.name))[0]!
    render(<ClubStrategyScreen world={world} />)
    const card = screen.getByRole('article', { name: `${team.name} ${team.gender} strategy` })
    expect(within(card).getAllByText(world.clubStrategicStatesByTeamId[team.id]!.mode).length).toBeGreaterThan(0)
    expect(within(card).getByText(world.clubStrategicStatesByTeamId[team.id]!.lastReviewedOn)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
