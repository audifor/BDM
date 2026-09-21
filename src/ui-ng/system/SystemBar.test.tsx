// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { addDays } from '@/domain/date'
import { continueGame, createAcbTestGame, createNewGame, simulateUntilDate } from '@/app/game'
import { useGameStore } from '@/stores/gameStore'
import { SystemBar } from '@/ui-ng/system/SystemBar'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=home')
  useGameStore.getState().resetGame()
})

function mountBar() {
  return render(
    <NgWorkspaceNavigationProvider>
      <SystemBar />
    </NgWorkspaceNavigationProvider>,
  )
}

describe('SystemBar continue', () => {
  it('opens the match workspace when today is already a user match day', () => {
    useGameStore.getState().replaceWorld(createNewGame())
    mountBar()

    fireEvent.click(screen.getByRole('button', { name: 'Match' }))
    expect(new URL(window.location.href).searchParams.get('app')).toBe('match')
  })

  it('advances the canonical calendar until the next interruption', { timeout: 15_000 }, () => {
    const world = createAcbTestGame()
    const preview = continueGame(world)
    expect(preview.daysAdvanced).toBeGreaterThan(0)
    useGameStore.getState().replaceWorld(world)
    mountBar()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(useGameStore.getState().world?.currentDate).toBe(preview.finalDate)
    expect(screen.getByRole('button', { name: 'Match' })).toBeInTheDocument()
  })

  it('places an hourglass control that simulates every pending day through the chosen date', { timeout: 15_000 }, async () => {
    const world = createAcbTestGame()
    const target = addDays(world.currentDate, 3)
    const preview = simulateUntilDate(world, target)
    useGameStore.getState().replaceWorld(world)
    mountBar()

    fireEvent.click(screen.getByRole('button', { name: 'Simulate until date' }))
    expect(screen.queryByLabelText('Target date')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Choose ${target}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))

    expect(screen.getByRole('dialog', { name: 'Simulation progress' })).toBeInTheDocument()
    await waitFor(() => {
      expect(useGameStore.getState().world?.currentDate).toBe(preview.finalDate)
      expect(screen.queryByRole('dialog', { name: 'Simulation progress' })).not.toBeInTheDocument()
    }, { timeout: 14_000 })
    expect(new URL(window.location.href).searchParams.get('app')).toBe('home')
  })

  it('simulates a pending user match instead of opening the viewer when holidaying past today', { timeout: 15_000 }, async () => {
    const world = createNewGame()
    const target = addDays(world.currentDate, 1)
    useGameStore.getState().replaceWorld(world)
    mountBar()

    fireEvent.click(screen.getByRole('button', { name: 'Simulate until date' }))
    fireEvent.click(screen.getByRole('button', { name: `Choose ${target}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))

    expect(screen.getByRole('dialog', { name: 'Simulation progress' })).toBeInTheDocument()
    await waitFor(() => {
      expect(useGameStore.getState().world?.currentDate).toBe(target)
      expect(screen.queryByRole('dialog', { name: 'Simulation progress' })).not.toBeInTheDocument()
    }, { timeout: 14_000 })
    expect(Object.values(useGameStore.getState().world!.games).some((game) => game.date === world.currentDate && game.status === 'scheduled')).toBe(false)
    expect(new URL(window.location.href).searchParams.get('app')).toBe('home')
  })

  it('stops an active simulation when Escape is pressed', () => {
    const world = createAcbTestGame()
    const target = addDays(world.currentDate, 3)
    useGameStore.getState().replaceWorld(world)
    mountBar()

    fireEvent.click(screen.getByRole('button', { name: 'Simulate until date' }))
    fireEvent.click(screen.getByRole('button', { name: `Choose ${target}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }))
    expect(screen.getByRole('dialog', { name: 'Simulation progress' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Simulation progress' })).not.toBeInTheDocument()
  })

  it('keeps dates after the last scheduled fixture selectable', () => {
    const world = createAcbTestGame()
    const latestScheduledDate = Object.values(world.games)
      .filter((game) => game.status === 'scheduled')
      .map((game) => game.date)
      .sort()
      .at(-1)
    expect(latestScheduledDate).toBeDefined()
    const target = addDays(latestScheduledDate!, 1)
    const [currentYear, currentMonth] = world.currentDate.split('-').slice(0, 2).map(Number)
    const [targetYear, targetMonth] = target.split('-').slice(0, 2).map(Number)
    const monthsToAdvance = (targetYear! - currentYear!) * 12 + (targetMonth! - currentMonth!)

    useGameStore.getState().replaceWorld(world)
    mountBar()
    fireEvent.click(screen.getByRole('button', { name: 'Simulate until date' }))
    for (let index = 0; index < monthsToAdvance; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    }

    expect(screen.getByRole('button', { name: `Choose ${target}` })).toBeEnabled()
  })
})
