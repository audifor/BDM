// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createNewGame, type ContinueResult, type SimulateUntilResult, type SimulationBreakpoint, type SimulationBreakpointResult, type WorldDayAdvanceResult } from '@/app/game'
import type { GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { ContinueControl } from './ContinueControl'

afterEach(cleanup)

const breakpoint = (over: Partial<SimulationBreakpoint> = {}): SimulationBreakpoint => ({
  level: 'ACTION_REQUIRED', reason: 'returnToPlayReview', sourceKind: 'USER_RTP_REVIEW', sourceId: 'injury-1',
  ownership: { kind: 'USER_TEAM' }, route: 'medical', diagnostic: 'Return-to-Play review for injury injury-1 is due.',
  orderingKey: '1|2032-10-01|9999-12-31|USER_RTP_REVIEW|injury-1', ...over,
})

const breakpointBefore = (breakpointResult?: SimulationBreakpoint): SimulationBreakpointResult => breakpointResult === undefined
  ? { mayAdvance: true, level: 'BACKGROUND', candidates: [] }
  : { mayAdvance: false, level: breakpointResult.level, breakpoint: breakpointResult, candidates: [breakpointResult] }

const dayAdvance = (world: GameWorld, status: WorldDayAdvanceResult['status'], over: Partial<WorldDayAdvanceResult> = {}): WorldDayAdvanceResult => ({
  status, world, phases: [], diagnostics: [], breakpointBefore: breakpointBefore(), repairReports: [], seasonPointerChanged: false, ...over,
})

function renderControl(world: GameWorld, overrides: Partial<{ readonly onAdvanceDay: () => WorldDayAdvanceResult | void; readonly onContinue: () => ContinueResult; readonly onOpenPendingGame: (gameId: string) => void; readonly onStartNextSeason: () => void; readonly onSimulateUntilDate: (date: GameDate) => SimulateUntilResult }> = {}) {
  return render(<ContinueControl
    world={world}
    onAdvanceDay={overrides.onAdvanceDay ?? (() => undefined)}
    onContinue={overrides.onContinue ?? (() => ({ world, daysAdvanced: 0, finalDate: world.currentDate, stopReason: { type: 'safetyLimit' } }))}
    onOpenPendingGame={overrides.onOpenPendingGame ?? (() => undefined)}
    onStartNextSeason={overrides.onStartNextSeason ?? (() => undefined)}
    onSimulateUntilDate={overrides.onSimulateUntilDate ?? (() => ({ world, daysAdvanced: 0, finalDate: world.currentDate, stopReason: { type: 'arrived' }, seasonTransitions: [] }))}
  />)
}

const worldWithoutGames = (): GameWorld => ({ ...createNewGame(), games: {} })

describe('ContinueControl career-loop feedback', () => {
  it('opens the pending user game and shows the canonical match-day diagnostic', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const pendingGame = Object.values(world.games).find((game) => game.date === world.currentDate && (game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id))!
    const onOpenPendingGame = vi.fn()
    renderControl(world, { onOpenPendingGame })

    fireEvent.click(screen.getByRole('button', { name: /PARTIDO/ }))

    expect(onOpenPendingGame).toHaveBeenCalledWith(pendingGame.id)
    expect(screen.getByText('PARTIDO PENDIENTE')).toBeVisible()
    expect(screen.getByText(/needs an explicit match action/)).toBeVisible()
    expect(screen.getByText(/Ruta disponible · match/)).toBeVisible()
  })

  it('manifests a Continue that stopped without advancing the date instead of doing nothing', () => {
    const world = worldWithoutGames()
    renderControl(world, { onContinue: () => ({ world, daysAdvanced: 0, finalDate: world.currentDate, stopReason: { type: 'breakpoint', breakpoint: breakpoint() } }) })

    fireEvent.click(screen.getByRole('button', { name: /CONTINUAR/ }))

    expect(screen.getByText('SE REQUIERE TU ATENCIÓN')).toBeVisible()
    expect(screen.getByText(/No se avanzó la fecha/)).toBeVisible()
    expect(screen.getByText(/Return-to-Play review for injury injury-1 is due/)).toBeVisible()
    expect(screen.getByText(/Ruta disponible · medical/)).toBeVisible()
  })

  it('shows a failed one-day advance with its canonical diagnostic', () => {
    const world = worldWithoutGames()
    renderControl(world, { onAdvanceDay: () => dayAdvance(world, 'FAILED', { diagnostics: [{ code: 'INVARIANT_VIOLATION', message: 'Scheduled Game g-1 is in the past after the day transition' }], failure: { kind: 'INVARIANT_VIOLATION', phaseId: 'SCHEDULE_INTEGRITY', message: 'Scheduled Game g-1 is in the past after the day transition' } }) })

    fireEvent.click(screen.getByRole('button', { name: /Avanzar 1 día/ }))

    expect(screen.getByText('NO SE PUDO AVANZAR')).toBeVisible()
    expect(screen.getByText(/SCHEDULE_INTEGRITY: Scheduled Game g-1 is in the past/)).toBeVisible()
  })

  it('shows a prevented one-day advance with its blocking breakpoint route', () => {
    const world = worldWithoutGames()
    const blocking = breakpoint({ level: 'BLOCKING', reason: 'scheduledGameInPast', route: 'schedule', diagnostic: 'Scheduled game g-2 is already in the past and prevents a safe day transition.' })
    renderControl(world, { onAdvanceDay: () => dayAdvance(world, 'BREAKPOINT_PREVENTED', { breakpointBefore: breakpointBefore(blocking) }) })

    fireEvent.click(screen.getByRole('button', { name: /Avanzar 1 día/ }))

    expect(screen.getByText('NO SE PUDO AVANZAR')).toBeVisible()
    expect(screen.getByText(/Scheduled game g-2 is already in the past/)).toBeVisible()
    expect(screen.getByText(/Ruta disponible · schedule/)).toBeVisible()
  })
})
