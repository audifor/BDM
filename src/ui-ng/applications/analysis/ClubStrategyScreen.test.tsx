// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { reviewClubManagementPlanning } from '@/app/gmPlanning'
import { updateGameWorld } from '@/domain/world'
import { ClubStrategyScreen } from './ClubStrategyScreen'

afterEach(cleanup)

function preparedAiWorld() {
  const initial = createNewGame()
  const team = Object.values(initial.teams).filter((candidate) => candidate.coachId !== undefined && candidate.coachId !== initial.userCoachId).sort((left, right) => left.id.localeCompare(right.id))[0]!
  const shortRoster = updateGameWorld(initial, { teams: Object.values(initial.teams).map((candidate) => candidate.id === team.id ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 4) } : candidate) })
  return { world: reviewClubManagementPlanning(shortRoster, team.id, 'MATERIAL_ROSTER_CHANGE').world, team }
}

describe('ClubStrategyScreen', () => {
  it('shows AI club direction, evidence and review timing without adding action controls', () => {
    const { world, team } = preparedAiWorld()
    render(<ClubStrategyScreen world={world} />)
    const card = screen.getByRole('article', { name: `${team.name} ${team.gender} strategy` })
    expect(within(card).getAllByText(world.clubStrategicStatesByTeamId[team.id]!.mode).length).toBeGreaterThan(0)
    expect(within(card).getByText(world.clubStrategicStatesByTeamId[team.id]!.lastReviewedOn)).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Selected plan' })).toBeInTheDocument()
    expect(within(card).getAllByText(/Planned next workflow/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows derived top needs for both AI clubs and the user club as advisory data', () => {
    const initial = createNewGame()
    const userTeam = Object.values(initial.teams).find((candidate) => candidate.coachId === initial.userCoachId)!
    const world = updateGameWorld(initial, { teams: Object.values(initial.teams).map((candidate) => candidate.id === userTeam.id ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 4) } : candidate) })
    render(<ClubStrategyScreen world={world} />)
    expect(screen.getByRole('heading', { name: 'Club strategy and needs' })).toBeInTheDocument()
    const userArticle = screen.getByRole('article', { name: `${userTeam.name} ${userTeam.gender} strategy` })
    expect(within(userArticle).getByRole('region', { name: `${userTeam.name} ${userTeam.gender} top needs` })).toBeInTheDocument()
    expect(within(userArticle).getByRole('heading', { name: 'Recommended plan' })).toBeInTheDocument()
    expect(within(userArticle).getAllByText(/Recommended next workflow/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Your club, advisory/)).toBeInTheDocument()
    expect(screen.queryByText(/generated-player-/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows selected plans with their current workflow rather than hiding unfinished routes', () => {
    const { world, team: aiTeam } = preparedAiWorld()
    render(<ClubStrategyScreen world={world} />)
    const card = screen.getByRole('article', { name: `${aiTeam.name} ${aiTeam.gender} strategy` })
    expect(within(card).getAllByText(/Selected:/).length).toBeGreaterThan(0)
    expect(within(card).getAllByText(/Planned next workflow:/).length).toBeGreaterThan(0)
  })
})
