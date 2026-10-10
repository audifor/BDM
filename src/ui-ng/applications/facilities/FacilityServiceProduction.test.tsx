// @vitest-environment jsdom
/*
 * BS17E-C — the production Facilities screen contracts a recurring conservation service on a NEW game through real buttons.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace } from '@/engine/calendar'
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

describe('BS17E-C: production Facilities UI contracts a conservation service', () => {
  it('walks proposal -> offers -> Board -> signature -> billed period -> notice of termination through real buttons', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=facilities')
    useGameStore.getState().replaceWorld(createConfiguredGame({ universeId: 'prototype' }))
    const mount = () => {
      render(<NgWorkspaceNavigationProvider><FacilitiesWorkspace /></NgWorkspaceNavigationProvider>)
      fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    }
    const pass = (days: number) => { useGameStore.getState().replaceWorld(advance(useGameStore.getState().world!, days)); cleanup(); mount() }
    mount()
    const section = () => document.querySelector('[data-ng-region="facilities-services"] [data-service-key]') as HTMLElement
    const click = (name: RegExp | string) => fireEvent.click(within(section()).getByRole('button', { name }))

    expect(within(section()).getByText(/A recurring contract/)).toBeInTheDocument()
    click('Open service proposal')
    expect(within(section()).getByText(/Cost: Unknown/)).toBeInTheDocument()
    click('Request service offers')
    const offers = section().querySelectorAll('[data-offer-id]')
    expect(offers.length).toBe(3)
    fireEvent.click(within(offers[1] as HTMLElement).getByRole('button', { name: /^Select service offer / }))
    expect(within(section()).getByText(/evidence, not committed/)).toBeInTheDocument()
    click('Request service approval')
    expect(within(section()).getByRole('button', { name: 'Sign service contract' })).toBeDisabled()

    pass(1)
    expect(within(section()).getByText(/Governance: Approved/)).toBeInTheDocument()
    click('Sign service contract')
    expect(within(section()).getByText(/Periods: processed 0/)).toBeInTheDocument()

    pass(1)
    expect(within(section()).getByText(/Periods: processed 1 · skipped 0/)).toBeInTheDocument()
    click('Give notice of termination')
    expect(within(section()).getByText(/termination effective/)).toBeInTheDocument()
  })
})
