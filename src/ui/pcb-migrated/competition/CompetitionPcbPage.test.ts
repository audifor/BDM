// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { completeMatch, createNewGame, prepareUserMatch } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { calculateStandings } from '@/engine/competition/standings'
import { CompetitionPcbPage, selectCompetitionContext } from './CompetitionPcbPage'

afterEach(cleanup)

describe('CompetitionPcbPage', () => {
  it('renders pending canonical fixtures, then the completed score and updated standings', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const game = world.games[simulation.gameId]!
    const context = selectCompetitionContext(world)!
    expect(context.competitionId).toBe(game.competitionId)
    const { rerender } = render(createElement(CompetitionPcbPage, { world }))

    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0)
    const completed = completeMatch(world, simulation)
    rerender(createElement(CompetitionPcbPage, { world: completed }))
    expect(screen.getByText(`${simulation.finalScore.home} - ${simulation.finalScore.away}`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clasificación' }))
    const winner = simulation.finalScore.home > simulation.finalScore.away ? game.homeTeamId : game.awayTeamId
    expect(calculateStandings(completed, game.seasonId).find((entry) => entry.teamId === winner)).toMatchObject({ wins: 1, played: 1 })
    expect(screen.getByRole('button', { name: completed.teams[winner]!.name })).toBeInTheDocument()
  })

  it('defaults to a user-team competition and exposes other canonical competitions', () => {
    const world = createNewGame()
    const context = selectCompetitionContext(world)!
    expect(world.competitions[context.competitionId]!.participantTeamIds).toContain(getUserTeam(world)!.id)
    render(createElement(CompetitionPcbPage, { world }))
    expect(screen.getByRole('combobox', { name: 'Competición' }).querySelectorAll('option').length).toBeGreaterThan(1)
  })
})
