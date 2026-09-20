// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { createGame } from '@/domain/game'
import { parseGameDate } from '@/domain/date'
import { gameIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { ScheduleWorkspace } from './ScheduleWorkspace'

afterEach(cleanup)

beforeEach(() => {
  useGameStore.getState().resetGame()
})

describe('ScheduleWorkspace', () => {
  it('lists team games scheduled in the later months of the season', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const season = world.seasons[world.currentSeasonId]!
    const targetGame = Object.values(world.games).find((game) =>
      game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id,
    )!
    const laterGame = createGame({ ...targetGame, id: gameIdFromString('game:schedule-workspace:later'), date: parseGameDate(`${Number(season.startDate.slice(0, 4)) + 1}-03-01`) })
    const worldWithLaterGame = updateGameWorld(world, {
      games: [...Object.values(world.games).filter((game) => game.id !== targetGame.id), laterGame],
    })
    useGameStore.getState().replaceWorld(worldWithLaterGame)

    render(createElement(ScheduleWorkspace))

    expect(screen.getByText(formatGameDateLabel(laterGame.date))).toBeInTheDocument()
  })
})
