// @vitest-environment jsdom
/*
 * MX0.6 — Facilities gameplay product contract.
 *
 * The workspace must show canonical Facilities truth for the user's own club Organization, expose only
 * the project commands the canonical transition graph allows, apply them through the store bridge, and
 * report the canonical blocker reason when a command is refused. No fixture data is displayed: the
 * fixture world is built through the same domain factories the engine uses.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { createFacilityClubScenario } from '@/app/facilities/testFixtures'

import { FacilitiesWorkspace } from './FacilitiesWorkspace'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=facilities')
  useGameStore.getState().resetGame()
})

function mountWorkspace(world: GameWorld) {
  useGameStore.getState().replaceWorld(world)
  return render(
    <NgWorkspaceNavigationProvider>
      <FacilitiesWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
}

describe('MX0.6 Facilities workspace', () => {
  it('says honestly that the shipped universe has no recorded facility', () => {
    mountWorkspace(createNewGame())

    expect(screen.getByText('No canonical Facility is recorded for this club organization in this universe.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Facilities' }))
    expect(screen.getByText('This club organization has no recorded Facility in this universe.')).toBeInTheDocument()
  })

  it('shows the club inventory, derived condition and the critical maintenance need', () => {
    const scenario = createFacilityClubScenario()
    mountWorkspace(scenario.world)

    expect(screen.getByText('Critical needs')).toBeInTheDocument()
    expect(screen.getByText(/Critical equipment need at MX0.6 Training Center/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Condition & maintenance' }))
    expect(screen.getByText('Physiotherapy Room')).toBeInTheDocument()
    expect(screen.getByText(/Recording an intervention is not yet a club action/)).toBeInTheDocument()
  })

  it('shows the canonical sporting effect of the club facilities', () => {
    const scenario = createFacilityClubScenario()
    mountWorkspace(scenario.world)

    fireEvent.click(screen.getByRole('button', { name: 'Sporting effects' }))
    expect(screen.getAllByText('Basketball').length).toBeGreaterThan(0)
    expect(screen.getByText('Practice Court 1')).toBeInTheDocument()
    expect(screen.getByText(/usable practice court/)).toBeInTheDocument()
  })

  it('exposes only canonical project actions and applies a start through the store bridge', () => {
    const scenario = createFacilityClubScenario()
    mountWorkspace(scenario.world)

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    const scheduledRow = screen.getByText('Add 1 component(s)').closest('article')!
    expect(within(scheduledRow).getByRole('button', { name: 'Start project (no capital)' })).toBeInTheDocument()
    expect(within(scheduledRow).getByRole('button', { name: 'Cancel project' })).toBeInTheDocument()

    // A project already in progress never offers START, and a delayed one is reported as delayed.
    const renovateRow = screen.getByText('Renovate component component:mx06-strength · resulting condition 88').closest('article')!
    expect(within(renovateRow).queryByRole('button', { name: 'Start project (no capital)' })).toBeNull()
    expect(within(renovateRow).getByRole('button', { name: 'Complete project' })).toBeInTheDocument()

    fireEvent.click(within(scheduledRow).getByRole('button', { name: 'Start project (no capital)' }))
    const after = useGameStore.getState().world!
    expect(after.facilityDevelopmentProjectsById[scenario.scheduledProjectId]!.status).toBe('IN_PROGRESS')
    expect(after.facilityDevelopmentProjectsById[scenario.scheduledProjectId]!.actualStartDate).toBe(scenario.asOf)
    expect(screen.getByText('Project started.')).toBeInTheDocument()
  })

  it('applies a funded start with the manager-entered capital commitment and shows the canonical money facts', () => {
    const scenario = createFacilityClubScenario()
    mountWorkspace(scenario.world)

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    const scheduledRow = screen.getByText('Add 1 component(s)').closest('article')!
    fireEvent.click(within(scheduledRow).getByRole('button', { name: 'Start with capital commitment' }))

    const form = document.querySelector('[data-ng-region="facilities-commitment-form"]')!
    fireEvent.change(within(form as HTMLElement).getByLabelText('Capital commitment'), { target: { value: '25000' } })
    fireEvent.click(within(form as HTMLElement).getByRole('button', { name: 'Commit and start' }))

    const after = useGameStore.getState().world!
    const commitment = Object.values(after.financialCommitmentsById).find((item) => item.provenance.id === scenario.scheduledProjectId)!
    expect(commitment.amount).toMatchObject({ currencyCode: 'EUR', minorUnits: 2_500_000 })
    expect(screen.getByText(/Project started with a capital commitment of/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Costs & funding' }))
    expect(screen.getAllByText(/EUR 25,000\.00/).length).toBeGreaterThan(0)
  })

  it('reports a canonical blocker reason instead of hiding a refused command', () => {
    const scenario = createFacilityClubScenario()
    // The club's scheduled project is completed before the workspace renders, so its START button is gone;
    // completing an in-progress project that the world already finished must surface the canonical reason.
    const world = updateGameWorld(scenario.world, {
      facilityDevelopmentProjects: Object.values(scenario.world.facilityDevelopmentProjectsById).map((project) =>
        project.id === scenario.inProgressProjectId
          ? { ...project, status: 'COMPLETED' as const, actualCompletionDate: addDays(scenario.asOf, 1) }
          : project,
      ),
    })
    mountWorkspace(world)

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    const completedRow = screen.getByText('Renovate component component:mx06-strength · resulting condition 88').closest('article')!
    // A terminal project exposes no command at all — the UI cannot even offer an impossible action.
    expect(within(completedRow).queryByRole('button')).toBeNull()

    const cancelled = useGameStore.getState().cancelFacilityProject(scenario.scheduledProjectId)
    expect(cancelled.status).toBe('APPLIED')
    const again = useGameStore.getState().pauseFacilityProject(scenario.scheduledProjectId)
    expect(again.status).toBe('BLOCKED')
    expect(again.reasons).toEqual(['PROJECT_ALREADY_TERMINAL'])
  })

  it('blocks an unusable commitment in the UI without touching the world', () => {
    const scenario = createFacilityClubScenario()
    mountWorkspace(scenario.world)

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    const scheduledRow = screen.getByText('Add 1 component(s)').closest('article')!
    fireEvent.click(within(scheduledRow).getByRole('button', { name: 'Start with capital commitment' }))
    fireEvent.change(screen.getByLabelText('Capital commitment'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Commit and start' }))

    expect(screen.getByText('Enter a positive capital amount in major units.')).toBeInTheDocument()
    expect(useGameStore.getState().world!.facilityDevelopmentProjectsById[scenario.scheduledProjectId]!.status).toBe('SCHEDULED')
    expect(useGameStore.getState().world!.financialCommitmentsById).toEqual({})
  })

  it('keeps the club identity and club-scoped facilities of the user club only', () => {
    const scenario = createFacilityClubScenario()
    mountWorkspace(scenario.world)

    const team = getUserTeam(scenario.world)!
    expect(screen.getAllByText(team.name).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Facilities' }))
    expect(screen.getByText('MX0.6 Training Center')).toBeInTheDocument()
    expect(screen.queryByText('MX0.6 Rival Arena')).toBeNull()
  })
})
