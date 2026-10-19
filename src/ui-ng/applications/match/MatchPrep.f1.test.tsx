// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { getUserMatchReadiness } from '@/app/game/UserMatchReadiness'
import { addDays } from '@/domain/date'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { getTeamRoster, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { calculateStandings } from '@/engine/competition/standings'
import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { MatchWorkspace } from '@/ui-ng/applications/match/MatchWorkspace'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)
beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=match')
  useGameStore.getState().resetGame()
  useMatchViewerStore.getState().clear()
})

const mount = () => render(<NgWorkspaceNavigationProvider><MatchWorkspace /></NgWorkspaceNavigationProvider>)

describe('F1 · pantalla de partido de Courtside', () => {
  it('presenta el encuentro con el quinteto, la rotación y el plan que usará el motor', () => {
    const world = createNewGame()
    useGameStore.getState().replaceWorld(world)
    const readiness = getUserMatchReadiness(world)!
    mount()

    expect(screen.getByLabelText('Presentación del encuentro')).toHaveTextContent(world.teams[readiness.opponentTeamId]!.name)
    const starters = screen.getByLabelText('Quinteto inicial')
    expect(within(starters).getAllByRole('listitem')).toHaveLength(5)
    for (const playerId of readiness.starters) {
      const player = world.players[playerId]!
      expect(within(starters).getByRole('button', { name: `${player.firstName} ${player.lastName}` })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Plan táctico')).toHaveTextContent('Equilibrado')
    expect(screen.getByLabelText('Rotación prevista')).toHaveTextContent('no admite sustituciones manuales en directo')
    for (const label of ['Jugar partido', 'Simulación rápida']) expect(screen.getByRole('button', { name: label })).toBeEnabled()
    // No acta before there is a result.
    expect(screen.queryByLabelText('Acta del partido')).not.toBeInTheDocument()
  })

  it('lista a los lesionados como no disponibles con su motivo y no los pone en el quinteto', () => {
    let world = createNewGame()
    const team = getUserTeam(world)!
    const hurt = getTeamRoster(world, team.id)[0]!
    world = updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), createInjury({ id: injuryIdFromString('f1-ui'), playerId: hurt.id, kind: 'ankleSprain', severity: 'minor', injuredOn: world.currentDate, expectedReturnDate: addDays(world.currentDate, 12) })] })
    useGameStore.getState().replaceWorld(world)
    mount()

    const unavailable = screen.getByLabelText('No disponibles')
    expect(unavailable).toHaveTextContent(`${hurt.firstName} ${hurt.lastName}`)
    expect(unavailable).toHaveTextContent('Lesionado')
    expect(within(screen.getByLabelText('Quinteto inicial')).queryByRole('button', { name: `${hurt.firstName} ${hurt.lastName}` })).not.toBeInTheDocument()
  })

  it('tras el partido muestra el acta con marcador y estadísticas del GameWorld y la clasificación coincide', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    useGameStore.getState().instantResult()
    const world = useGameStore.getState().world!
    const gameId = Object.values(world.games).find((game) => game.status === 'completed' && world.matchStatLogsByGameId[game.id] !== undefined)!.id
    const log = world.matchStatLogsByGameId[gameId]!
    mount()

    const report = screen.getByLabelText('Acta del partido')
    expect(report).toHaveAttribute('data-game-id', gameId)
    expect(screen.getByLabelText(new RegExp(`Resultado final .* ${log.finalScore.home}, .* ${log.finalScore.away}`))).toBeInTheDocument()
    for (const teamId of [log.homeTeamId, log.awayTeamId]) {
      const table = within(report).getByLabelText(`Estadísticas ${world.teams[teamId]!.name}`)
      const points = log.playerLines.filter((line) => line.teamId === teamId).reduce((sum, line) => sum + line.stats.points, 0)
      expect(within(table).getByRole('row', { name: /^Equipo/ })).toHaveTextContent(String(points))
    }
    const standings = calculateStandings(world, world.games[gameId]!.seasonId)
    expect(standings.reduce((sum, row) => sum + row.played, 0)).toBe(2)
  })
})
