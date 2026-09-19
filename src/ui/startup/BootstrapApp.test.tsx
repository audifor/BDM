// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  createConfiguredGameAsync: vi.fn(),
  discoverWorldDbSpainSelection: vi.fn(),
  replaceWorld: vi.fn(),
  clearMatch: vi.fn(),
  resetTacticalPlan: vi.fn(),
  getSaveInfo: vi.fn(),
}))

vi.mock('@/app/game', async () => {
  const actual = await vi.importActual<typeof import('@/app/game')>('@/app/game')
  return {
    ...actual,
    createConfiguredGameAsync: mocks.createConfiguredGameAsync,
    discoverWorldDbSpainSelection: mocks.discoverWorldDbSpainSelection,
  }
})

vi.mock('@/stores/gameStore', () => ({
  useGameStore: (select: (state: { world: null; replaceWorld: typeof mocks.replaceWorld }) => unknown) =>
    select({ world: null, replaceWorld: mocks.replaceWorld }),
}))

vi.mock('@/stores/matchViewerStore', () => ({
  useMatchViewerStore: (select: (state: { clear: typeof mocks.clearMatch }) => unknown) =>
    select({ clear: mocks.clearMatch }),
}))

vi.mock('@/stores/tacticalPlanStore', () => ({
  useTacticalPlanStore: (select: (state: { reset: typeof mocks.resetTacticalPlan }) => unknown) =>
    select({ reset: mocks.resetTacticalPlan }),
}))

vi.mock('@/tauri/TauriGameSaveRepository', () => ({
  tauriGameSaveRepository: { getInfo: mocks.getSaveInfo },
}))

vi.mock('@/ui/App', () => ({ App: () => <div>Legacy home</div> }))
vi.mock('@/ui-ng/BdmOsNg', () => ({ BdmOsNg: () => <div>BDM home</div> }))

import { BootstrapApp } from './BootstrapApp'

const teams = Array.from({ length: 18 }, (_, index) => ({
  key: `team:ESP:${String(index + 1).padStart(3, '0')}`,
  name: `Spain Team ${String(index + 1).padStart(2, '0')}`,
  code: `team:ESP:${String(index + 1).padStart(3, '0')}`,
}))

describe('New Game World DB Spain ACB flow', () => {
  beforeEach(() => {
    mocks.createConfiguredGameAsync.mockReset()
    mocks.discoverWorldDbSpainSelection.mockReset().mockResolvedValue({ teams })
    mocks.replaceWorld.mockReset()
    mocks.clearMatch.mockReset()
    mocks.resetTacticalPlan.mockReset()
    mocks.getSaveInfo.mockReset().mockResolvedValue(null)
  })

  afterEach(cleanup)

  it('lists 18 canonical teams and sends the selected team through async creation into the normal world store', async () => {
    let finishCreation!: (world: object) => void
    const createdWorld = { marker: 'world-db-gameworld' }
    mocks.createConfiguredGameAsync.mockReturnValue(new Promise((resolve) => { finishCreation = resolve }))
    render(<BootstrapApp />)

    fireEvent.click(screen.getByRole('button', { name: 'NEW GAME' }))
    const teamSelect = await screen.findByLabelText('TEAM - 18 CANONICAL OPTIONS') as HTMLSelectElement
    const options = within(teamSelect).getAllByRole('option') as HTMLOptionElement[]
    expect(options.filter((option) => option.value !== '')).toHaveLength(18)
    expect(teamSelect.value).toBe('')

    const selectedTeam = teams[7]!
    fireEvent.change(teamSelect, { target: { value: selectedTeam.key } })
    fireEvent.click(screen.getByRole('button', { name: 'START CAREER' }))

    await waitFor(() => expect(mocks.createConfiguredGameAsync).toHaveBeenCalledWith({
      universeId: 'worldDbSpain',
      userTeamKey: selectedTeam.key,
    }))
    expect(screen.getByRole('status').textContent).toBe('Cargando World Database...')
    expect(screen.getByRole('button', { name: 'STARTING CAREER...' }).hasAttribute('disabled')).toBe(true)
    expect(mocks.replaceWorld).not.toHaveBeenCalled()

    finishCreation(createdWorld)
    await waitFor(() => expect(mocks.replaceWorld).toHaveBeenCalledWith(createdWorld))
    expect(mocks.clearMatch).toHaveBeenCalledOnce()
    expect(mocks.resetTacticalPlan).toHaveBeenCalledOnce()
  })

  it('shows the World DB bootstrap error and does not fall back to the fake ACB universe', async () => {
    mocks.createConfiguredGameAsync.mockRejectedValue(new Error('World DB not found'))
    render(<BootstrapApp />)

    fireEvent.click(screen.getByRole('button', { name: 'NEW GAME' }))
    const teamSelect = await screen.findByLabelText('TEAM - 18 CANONICAL OPTIONS')
    fireEvent.change(teamSelect, { target: { value: teams[0]!.key } })
    fireEvent.click(screen.getByRole('button', { name: 'START CAREER' }))

    await waitFor(() => expect(screen.getByText('World DB not found')).toBeTruthy())
    expect(mocks.createConfiguredGameAsync).toHaveBeenCalledWith({
      universeId: 'worldDbSpain',
      userTeamKey: teams[0]!.key,
    })
    expect(mocks.replaceWorld).not.toHaveBeenCalled()
  })
})
