// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { projectMatchNextPresentation } from './MatchNextPresentation'
import { MatchNextCenterPanel } from './MatchNextCenterPanel'

describe('Match Next Match Center', () => {
  it('shows lineup, bench and live boxscore columns and exposes player detail on selection', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const setup = createMatchEnginePort('match-next').prepare(world, game, 653113119)
    const frame = createMatchEnginePort('match-next').createLiveSession(setup).snapshot().frame
    const presentation = projectMatchNextPresentation(world, setup, frame)
    const selectedPlayer = presentation.home.players[0]!
    const onSelectPlayer = vi.fn()

    const { rerender } = render(<MatchNextCenterPanel onSelectPlayer={onSelectPlayer} presentation={presentation} selectedPlayerId={null} world={world} />)
    const homeRegion = screen.getByRole('region', { name: `Boxscore ${world.teams[setup.homeTeamId]!.name}` })
    expect(homeRegion).toBeTruthy()
    expect(screen.getAllByText('BANQUILLO').length).toBeGreaterThan(0)
    for (const column of ['MIN', 'PTS', 'TC', '2PT', '3PT', 'REB', 'ROB', 'FAT. PARTIDO']) expect(screen.getAllByText(column).length).toBeGreaterThan(0)
    fireEvent.click(within(homeRegion).getByRole('button', { name: new RegExp(`${world.players[selectedPlayer.playerId]!.firstName} ${world.players[selectedPlayer.playerId]!.lastName}`) }))
    expect(onSelectPlayer).toHaveBeenCalledWith(selectedPlayer.playerId)

    rerender(<MatchNextCenterPanel onSelectPlayer={onSelectPlayer} presentation={presentation} selectedPlayerId={selectedPlayer.playerId} world={world} />)
    expect(screen.getByLabelText(`Ficha de ${world.players[selectedPlayer.playerId]!.firstName} ${world.players[selectedPlayer.playerId]!.lastName}`)).toBeTruthy()
    expect(screen.getByText(/Fatiga del partido:/)).toBeTruthy()
  })
})
