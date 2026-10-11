// @vitest-environment jsdom
/*
 * BS17E-A FINAL — the production Facilities screen drives the whole maintenance circuit on a NEW game (production
 * entry `createConfiguredGame`), with no hand-built facility, institution, budget, price or cash.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { buildFacilityMaintenanceNeedRows } from '@/app/facilityMaintenance'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

import { FacilitiesWorkspace } from './FacilitiesWorkspace'

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })
afterEach(cleanup)

function advance(world: GameWorld, days: number): GameWorld {
  let current = world
  for (let i = 0; i < days; i += 1) current = advanceDayWithTrace(current).world
  return current
}

describe('BS17E-A FINAL: production Facilities UI on a new game', () => {
  it('walks need -> offers -> approval -> contract -> work -> acceptance -> payment through real buttons', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=facilities')
    let world = createConfiguredGame({ universeId: 'prototype' })
    const team = getUserTeam(world)!
    let needId: string | undefined
    for (let day = 0; day < 150 && needId === undefined; day += 1) {
      world = advance(world, 1)
      needId = buildFacilityMaintenanceNeedRows(world, team.id).find((row) => row.needStatus === 'OPEN' && row.active === null)?.needId
    }
    expect(needId).toBeDefined()
    useGameStore.getState().replaceWorld(world)
    render(<NgWorkspaceNavigationProvider><FacilitiesWorkspace /></NgWorkspaceNavigationProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Condition & maintenance' }))
    const need = () => document.querySelector(`[data-need-id="${needId}"]`) as HTMLElement
    const click = (name: RegExp | string) => fireEvent.click(within(need()).getByRole('button', { name }))
    const pass = (days: number) => {
      // Time passes through the Calendar; the UI re-reads the same store world.
      useGameStore.getState().replaceWorld(advance(useGameStore.getState().world!, days))
      cleanup()
      render(<NgWorkspaceNavigationProvider><FacilitiesWorkspace /></NgWorkspaceNavigationProvider>)
      fireEvent.click(screen.getByRole('button', { name: 'Condition & maintenance' }))
    }

    click('Open maintenance proposal')
    expect(within(need()).getByText(/Cost: Unknown/)).toBeInTheDocument()
    click('Request offers from providers')
    const offerRows = need().querySelectorAll('[data-offer-id]')
    expect(offerRows.length).toBeGreaterThanOrEqual(3)
    expect(need().textContent).toMatch(/simulated/i)
    fireEvent.click(within(offerRows[0] as HTMLElement).getByRole('button', { name: /^Select offer / }))
    expect(within(need()).getByText(/evidence, not committed/)).toBeInTheDocument()
    click('Request institutional approval')
    expect(within(need()).getByText(/awaiting the institution's decision/)).toBeInTheDocument()
    expect(within(need()).getByRole('button', { name: 'Reserve funds and accept contract' })).toBeDisabled()

    pass(1)
    expect(within(need()).getByText(/Governance: Approved/)).toBeInTheDocument()
    click('Reserve funds and accept contract')
    expect(within(need()).getByText(/Funding: Reserved/)).toBeInTheDocument()
    click('Start work')
    expect(within(need()).getByText(/Physical work: In progress/)).toBeInTheDocument()
    expect(within(need()).getByText(/unavailable to Training and Medical/)).toBeInTheDocument()
    expect(within(need()).getByRole('button', { name: 'Accept completed work (contract milestone)' })).toBeDisabled()

    pass(8)
    click('Accept completed work (contract milestone)')
    expect(within(need()).getByText(/Physical work: Completed/)).toBeInTheDocument()
    pass(1)
    expect(within(need()).getByText(/Finance: Payable/)).toBeInTheDocument()
    pass(31)
    expect(within(need()).getByText(/Finance: Settled/)).toBeInTheDocument()
  })
})
