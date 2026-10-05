// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { createRetentionNegotiation, retentionNegotiationIdFor } from '@/domain/contract/ContractRetentionNegotiation'
import { continueGame, createAcbTestGame as createFullAcbTestGame, createNewGame as createFullNewGame, simulateUntilDate } from '@/app/game'
import { useGameStore } from '@/stores/gameStore'
import { SystemBar } from '@/ui-ng/system/SystemBar'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { withShortGameFormat } from '@/app/game/testFixtures'

// ME-LOCK1: a lifecycle test (calendar/season/staff), not a basketball one: its Games still resolve through Match Next FAST, with a short game format.
const createNewGame = (...args: Parameters<typeof createFullNewGame>): ReturnType<typeof createFullNewGame> => withShortGameFormat(createFullNewGame(...args))
const createAcbTestGame = (...args: Parameters<typeof createFullAcbTestGame>): ReturnType<typeof createFullAcbTestGame> => withShortGameFormat(createFullAcbTestGame(...args))

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

  it('surfaces contract breakpoint attention and routes it to the Contracts Hub', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const playerId = team.rosterPlayerIds[0]!
    const contract = Object.values(base.contractsById).find((item) => item.teamId === team.id && item.playerId === playerId)!
    const negotiationId = retentionNegotiationIdFor(team.id, playerId, contract.id, 'system-bar-contract-attention')
    const negotiation = createRetentionNegotiation({ id: negotiationId, openingActionId: 'system-bar-contract-attention', teamId: team.id, organizationId: team.organizationId, playerId, predecessorContractId: contract.id, openedOn: base.currentDate, openedByCoachId: team.coachId!, status: 'ACCEPTED', acceptedTerms: { salary: contract.compensation.annualSalary, years: 1 }, rounds: [] })
    useGameStore.getState().replaceWorld(updateGameWorld(base, { retentionNegotiations: [negotiation] }))
    mountBar()

    fireEvent.click(screen.getByRole('button', { name: 'Open contracts requiring attention' }))
    expect(new URL(window.location.href).searchParams.get('app')).toBe('contracts')
  })

  it('routes a breakpoint to the app named by its canonical route', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const playerId = team.rosterPlayerIds[0]!
    // Move today's user Game aside so the due Return-to-Play review is the highest-priority stop.
    const moved = updateGameWorld(base, { games: Object.values(base.games).map((game) => game.date === base.currentDate && (game.homeTeamId === team.id || game.awayTeamId === team.id) ? { ...game, date: addDays(base.currentDate, 3) } : game) })
    const injury = createInjury({ id: injuryIdFromString('system-bar-rtp'), playerId, kind: 'ankleSprain', severity: 'moderate', injuredOn: addDays(base.currentDate, -10), expectedReturnDate: base.currentDate })
    useGameStore.getState().replaceWorld(updateGameWorld(moved, { injuries: [injury] }))
    mountBar()

    fireEvent.click(screen.getByRole('button', { name: 'Medical' }))
    expect(new URL(window.location.href).searchParams.get('app')).toBe('medical')
  })

  it('advances the canonical calendar until the next interruption', { timeout: 15_000 }, async () => {
    const world = createAcbTestGame()
    const preview = continueGame(world)
    expect(preview.daysAdvanced).toBeGreaterThan(0)
    useGameStore.getState().replaceWorld(world)
    mountBar()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    // ME-LOCK1.1: Continue runs the day's matches on the match runner (workers in the app), so the world arrives asynchronously.
    await waitFor(() => expect(useGameStore.getState().world?.currentDate).toBe(preview.finalDate), { timeout: 14_000 })
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
