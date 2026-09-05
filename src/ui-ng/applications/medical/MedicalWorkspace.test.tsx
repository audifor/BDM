// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { MedicalWorkspace } from '@/ui-ng/applications/medical/MedicalWorkspace'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=medical')
  useGameStore.getState().resetGame()
})

function withInjury(world: ReturnType<typeof createNewGame>) {
  const team = getUserTeam(world)!
  const playerId = team.rosterPlayerIds[0]!
  const injury = createInjury({
    id: injuryIdFromString('injury-medical-ui'),
    playerId,
    kind: 'hamstringStrain',
    severity: 'serious',
    injuredOn: world.currentDate,
    expectedReturnDate: addDays(world.currentDate, 21),
  })
  return {
    world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), injury] }),
    playerId,
  }
}

function mountMedicalWorkspace(world = createNewGame()) {
  useGameStore.getState().replaceWorld(world)
  const team = getUserTeam(world)!
  const view = render(
    <NgWorkspaceNavigationProvider>
      <MedicalWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
  return { ...view, world, team }
}

describe('MedicalWorkspace', () => {
  it('shows an empty state when no world is loaded', () => {
    render(
      <NgWorkspaceNavigationProvider>
        <MedicalWorkspace />
      </NgWorkspaceNavigationProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Medical' })).toBeInTheDocument()
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('renders canonical availability and medical staff without facilities fiction', () => {
    const { team } = mountMedicalWorkspace()

    expect(
      screen.getByText(
        (_, element) => element?.classList.contains('medical-workspace-header__team') === true && element.textContent === team.name,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('No active injuries.')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Facilities')
    expect(document.body.textContent).not.toContain('Prevention')

    fireEvent.click(screen.getByRole('button', { name: 'Staff' }))
    expect(screen.getByText(STAFF_ROLE_LABELS.physiotherapist)).toBeInTheDocument()
  })

  it('opens the injured tab with a canonical injury and navigates to the player medical dossier', () => {
    const base = createNewGame()
    const { world, playerId } = withInjury(base)
    const player = world.players[playerId]!
    mountMedicalWorkspace(world)

    fireEvent.click(screen.getByRole('button', { name: /^Injured/ }))
    expect(screen.getAllByText('Hamstring strain').length).toBeGreaterThan(0)
    expect(screen.getByText('Injury dossier')).toBeInTheDocument()
    expect(document.querySelector('[data-ng-region="medical-injured-inspector"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `${player.firstName} ${player.lastName}` }))
    const url = new URL(window.location.href)
    expect(url.searchParams.get('playerId')).toBe(playerId)
    expect(url.searchParams.get('playerView')).toBe('medical')
  })
})
