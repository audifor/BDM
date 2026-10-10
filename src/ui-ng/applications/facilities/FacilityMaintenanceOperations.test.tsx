// @vitest-environment jsdom
/*
 * BS17E-A — manager surface for authorized maintenance and repair.
 *
 * Every assertion drives the real store -> command -> Finance/Governance path. A button exists only when the
 * command layer's dry run says it would apply; a disabled action names its reason; a quoted cost is shown as
 * evidence and never as committed money.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createFacilityMaintenanceScenario } from '@/app/facilityMaintenance/testFixtures'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

import { FacilitiesWorkspace } from './FacilitiesWorkspace'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })
afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=facilities')
  useGameStore.getState().resetGame()
})

function mount(options: Parameters<typeof createFacilityMaintenanceScenario>[0] = { registerEvidence: true }) {
  const scenario = createFacilityMaintenanceScenario(options)
  useGameStore.getState().replaceWorld(scenario.world)
  render(
    <NgWorkspaceNavigationProvider>
      <FacilitiesWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Condition & maintenance' }))
  return scenario
}

const panel = () => screen.getByText('Maintenance & repair operations').closest('[data-ng-region="facilities-maintenance-operations"]') as HTMLElement
const need = () => panel().querySelector('[data-need-id="need:mx06-physio-critical"]') as HTMLElement
const click = (name: RegExp | string) => fireEvent.click(within(need()).getByRole('button', { name }))

describe('BS17E-A maintenance operations in the Facilities workspace', () => {
  it('shows an unknown cost honestly and offers only the action that can apply', () => {
    mount({ registerEvidence: false })
    expect(within(need()).getByText('No sourced offer exists for this need: its cost is unknown.')).toBeInTheDocument()
    expect(within(need()).getByRole('button', { name: 'Request quote / open proposal' })).toBeEnabled()
    click('Request quote / open proposal')
    const card = need().querySelector('[data-stage="COST_UNKNOWN"]') as HTMLElement
    expect(within(card).getByText(/Cost: Unknown/)).toBeInTheDocument()
    expect(within(card).getByText(/Cost unknown: no sourced offer is selected/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Request institutional approval' })).toBeDisabled()
    expect(within(card).getByRole('button', { name: 'Reserve funds and accept contract' })).toBeDisabled()
    expect(within(card).getByRole('button', { name: 'Start work' })).toBeDisabled()
  })

  it('drives request -> select -> approve -> reserve -> start through real commands, showing quote as evidence, not money', () => {
    const scenario = mount()
    click('Request quote / open proposal')
    click('Select sourced offer')
    const card = () => need().querySelector('[data-operation-id]') as HTMLElement
    expect(within(card()).getByText(/1\.?200\.?000|12[ ,.]?000/, { exact: false })).toBeInTheDocument()
    expect(within(card()).getByText(/evidence, not committed/)).toBeInTheDocument()
    expect(within(card()).getByText(/Funding: Not reserved/)).toBeInTheDocument()
    click('Request institutional approval')
    expect(within(card()).getByText(/Governance: Pending \(0\/1 required approvals\)/)).toBeInTheDocument()
    // Approving is a distinct step from reserving.
    expect(within(card()).getByRole('button', { name: 'Reserve funds and accept contract' })).toBeDisabled()
    click('Approve as my governing body')
    expect(within(card()).getByText(/Governance: Approved/)).toBeInTheDocument()
    click('Reserve funds and accept contract')
    expect(within(card()).getByText(/Funding: Reserved/)).toBeInTheDocument()
    expect(within(card()).getByText(/Funds are reserved; nothing is owed yet\./)).toBeInTheDocument()
    expect(within(card()).getByText('Finance: no cost is authorized yet; nothing is recognized, owed or paid.')).toBeInTheDocument()
    click('Start work')
    expect(within(card()).getByText(/Physical work: In progress/)).toBeInTheDocument()
    const world = useGameStore.getState().world!
    expect(Object.values(world.financialReservationsById).filter((r) => r.sourceAuthority === 'FACILITY')).toHaveLength(1)
    expect(world.facilityMaintenanceNeedsById[scenario.needId as never]!.status).toBe('IN_PROGRESS')
  })

  it('reports why funding is blocked and keeps the proposal, instead of confirming anything', () => {
    mount({ registerEvidence: true, facilityBudgetMinorUnits: 1_000 })
    click('Request quote / open proposal')
    click('Select sourced offer')
    click('Request institutional approval')
    click('Approve as my governing body')
    expect(within(need()).getByText(/Finance currently refuses this: Finance refused the reservation/)).toBeInTheDocument()
    click('Reserve funds and accept contract')
    const card = need().querySelector('[data-operation-id]') as HTMLElement
    expect(within(panel()).getByRole('status')).toHaveTextContent(/Finance refused the reservation/)
    expect(within(card).getByText(/Funding: Funding blocked — Insufficient authorized headroom/)).toBeInTheDocument()
    expect(within(card).getByText(/Funding blocked by Finance \(Insufficient authorized headroom\)\. The need and the proposal are preserved\./)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Start work' })).toBeDisabled()
    expect(Object.values(useGameStore.getState().world!.financialReservationsById).filter((r) => r.sourceAuthority === 'FACILITY')).toHaveLength(0)
  })

  it('shows institutional authority as unverified when the club has no Governance institution, and no approval action', () => {
    mount({ registerEvidence: true, withGovernance: false })
    click('Request quote / open proposal')
    click('Select sourced offer')
    const card = need().querySelector('[data-operation-id]') as HTMLElement
    expect(within(card).getByText(/Institutional authority is unverified for this club\./)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Request institutional approval' })).toBeDisabled()
    expect(within(card).getByText(/The institutional authority for this decision cannot be verified\./)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Approve as my governing body' })).toBeDisabled()
  })

  it('cancels an unapproved proposal, keeps its history and lets the manager open a new one', () => {
    mount()
    click('Request quote / open proposal')
    click('Cancel operation')
    expect(within(need()).getByText(/Earlier operation .*: Cancelled\./)).toBeInTheDocument()
    expect(within(need()).getByRole('button', { name: 'Request quote / open proposal' })).toBeEnabled()
  })
})
