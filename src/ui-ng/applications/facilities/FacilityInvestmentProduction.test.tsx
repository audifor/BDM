// @vitest-environment jsdom
/*
 * BS17E-B — the production Facilities screen drives a whole capital renovation on a NEW game through real buttons.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createConfiguredGame } from '@/app/game/createConfiguredGame'
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

describe('BS17E-B: production Facilities UI invests in a renovation', () => {
  it('walks limitation -> offers -> Board -> contract -> works -> milestones -> payment through real buttons', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=facilities')
    const world = createConfiguredGame({ universeId: 'prototype' })
    const organizationId = String(getUserTeam(world)!.organizationId)
    const key = `RENOVATION:bdm-balance-v1:component:${organizationId}:court`
    useGameStore.getState().replaceWorld(world)
    const mount = () => {
      render(<NgWorkspaceNavigationProvider><FacilitiesWorkspace /></NgWorkspaceNavigationProvider>)
      fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    }
    const pass = (days: number) => { useGameStore.getState().replaceWorld(advance(useGameStore.getState().world!, days)); cleanup(); mount() }
    mount()
    const section = () => document.querySelector(`[data-investment-key="${key}"]`) as HTMLElement
    const click = (name: RegExp | string) => fireEvent.click(within(section()).getByRole('button', { name }))

    expect(within(section()).getByText(/Condition \d+ \(invests at or below 85\)/)).toBeInTheDocument()
    click('Open investment proposal')
    expect(within(section()).getByText(/Cost: Unknown/)).toBeInTheDocument()
    click('Request offers from providers')
    const offers = section().querySelectorAll('[data-offer-id]')
    expect(offers.length).toBe(3)
    expect(section().textContent).toMatch(/simulated/i)
    fireEvent.click(within(offers[2] as HTMLElement).getByRole('button', { name: /^Select investment offer / }))
    expect(within(section()).getByText(/evidence, not committed/)).toBeInTheDocument()
    click('Request Board approval')
    expect(within(section()).getByText(/awaiting the institution's decision/)).toBeInTheDocument()
    expect(within(section()).getByRole('button', { name: 'Reserve funds and sign contract' })).toBeDisabled()

    pass(1)
    expect(within(section()).getByText(/Governance: Approved/)).toBeInTheDocument()
    click('Reserve funds and sign contract')
    expect(within(section()).getByText(/reservations open 2, used 0/)).toBeInTheDocument()
    click('Start works (first milestone)')
    expect(within(section()).getByText(/Works: In progress/)).toBeInTheDocument()
    expect(within(section()).getByText(/unavailable to Training and Medical/)).toBeInTheDocument()
    expect(within(section()).getByText(/Mobilization \(30%.*\): Payable/)).toBeInTheDocument()
    expect(within(section()).getByRole('button', { name: 'Accept finished works (final milestone)' })).toBeDisabled()

    pass(30)
    click('Accept finished works (final milestone)')
    expect(within(section()).getByText(/Works: Completed/)).toBeInTheDocument()
    expect(within(section()).getByText(/Acceptance \(70%.*\): Payable/)).toBeInTheDocument()
    pass(31)
    expect(within(section()).getByText(/Mobilization \(30%.*\): Settled/)).toBeInTheDocument()
    expect(within(section()).getByText(/Acceptance \(70%.*\): Settled/)).toBeInTheDocument()
  })
})
