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
  discoverWorldDbV2: vi.fn(),
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
vi.mock('@/tauri/TauriWorldDbV2', () => ({ discoverWorldDbV2: mocks.discoverWorldDbV2 }))

vi.mock('@/ui/App', () => ({ App: () => <div>Legacy home</div> }))
vi.mock('@/ui-ng/BdmOsNg', () => ({ BdmOsNg: () => <div>BDM home</div> }))

import { BootstrapApp } from './BootstrapApp'

const teams = Array.from({ length: 18 }, (_, index) => ({
  key: `team:ESP:${String(index + 1).padStart(3, '0')}`,
  name: `Spain Team ${String(index + 1).padStart(2, '0')}`,
  code: `team:ESP:${String(index + 1).padStart(3, '0')}`,
}))

const coachCreation = {
  firstName: 'Elena', lastName: 'Carrera', dateOfBirth: '1990-01-01',
  gender: 'male', nationalityCountryCode: '', background: 'rookie', ambition: 'firstTitle', biography: '', coachingStyle: 'balanced', disposition: 'balanced',
} as const

function fillCoachIdentity() {
  fireEvent.change(screen.getByLabelText('COACH FIRST NAME'), { target: { value: coachCreation.firstName } })
  fireEvent.change(screen.getByLabelText('COACH LAST NAME'), { target: { value: coachCreation.lastName } })
}

function openWizard(universeId?: string) {
  render(<BootstrapApp />)
  fireEvent.click(screen.getByRole('button', { name: 'NEW GAME' }))
  if (universeId) fireEvent.change(screen.getByLabelText('UNIVERSE'), { target: { value: universeId } })
}

function enterManager() {
  fireEvent.click(screen.getByRole('button', { name: /Continuar: crear mánager/ }))
}

describe('New Game two-step league universe and manager', () => {
  beforeEach(() => {
    mocks.createConfiguredGameAsync.mockReset()
    mocks.discoverWorldDbSpainSelection.mockReset().mockResolvedValue({ teams })
    mocks.replaceWorld.mockReset()
    mocks.clearMatch.mockReset()
    mocks.resetTacticalPlan.mockReset()
    mocks.getSaveInfo.mockReset().mockResolvedValue(null)
    mocks.discoverWorldDbV2.mockReset().mockResolvedValue({ teams })
  })
  afterEach(cleanup)

  it('opens in league selection with an organised WorldDB list and no manager form', () => {
    openWizard()
    expect((screen.getByLabelText('UNIVERSE') as HTMLSelectElement).value).toBe('worldDbV2')
    expect(screen.getByText('Configurar universo')).toBeTruthy()
    expect(screen.getByText('Países y regiones')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^España\s*4$/ }).textContent).toContain('España')
    expect(screen.queryByLabelText('COACH FIRST NAME')).toBeNull()
    expect(mocks.discoverWorldDbV2).not.toHaveBeenCalled()
  })

  it('reconciles national countries and prevents starting directly in continental tournaments', () => {
    openWizard()
    expect(screen.getByRole('button', { name: /Grecia/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Japón/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /País pendiente/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('BUSCAR LIGAS'), { target: { value: 'Euroleague' } })
    expect(screen.queryByLabelText('Detalle de Euroleague')).toBeNull()
    expect(screen.getByText(/No hay ligas que coincidan/)).toBeTruthy()
    expect(screen.getByText(/competiciones por acceso reglamentario/)).toBeTruthy()
  })

  it('selects loaded and reduced leagues, then sends them into the same world and manager', async () => {
    mocks.createConfiguredGameAsync.mockResolvedValue({ marker: 'shared-universe' })
    openWizard()
    fireEvent.change(screen.getByLabelText('Detalle de Liga Endesa'), { target: { value: 'reduced' } })
    fireEvent.change(screen.getByLabelText('BUSCAR LIGAS'), { target: { value: 'Betclic Élite' } })
    fireEvent.change(screen.getByLabelText('Detalle de Betclic Élite'), { target: { value: 'off' } })
    enterManager()
    expect(screen.getByText('Tu mánager')).toBeTruthy()
    const select = await screen.findByLabelText('TEAM')
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(19))
    fireEvent.change(select, { target: { value: teams[0]!.key } })
    fillCoachIdentity()
    fireEvent.click(screen.getByRole('button', { name: 'START CAREER' }))
    await waitFor(() => expect(mocks.createConfiguredGameAsync).toHaveBeenCalledWith({
      universeId: 'worldDbV2', userTeamKey: teams[0]!.key,
      userCoachCreation: coachCreation,
      worldDbV2: expect.objectContaining({
        sourceRoot: 'C:\\BDM_DB\\WORLDDB_PBM',
        activeCompetitionIds: ['pbm:DYN_championnat:5', 'pbm:DYN_championnat:10', 'pbm:DYN_championnat:109'],
        reducedCompetitionIds: ['pbm:DYN_championnat:5'],
      }),
    }))
    expect(mocks.replaceWorld).toHaveBeenCalledWith({ marker: 'shared-universe' })
  })

  it('preserves league configuration and manager data when returning to the first step', () => {
    openWizard()
    fireEvent.change(screen.getByLabelText('Detalle de Liga Endesa'), { target: { value: 'reduced' } })
    enterManager()
    fillCoachIdentity()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a ligas' }))
    expect((screen.getByLabelText('Detalle de Liga Endesa') as HTMLSelectElement).value).toBe('reduced')
    enterManager()
    expect((screen.getByLabelText('COACH FIRST NAME') as HTMLInputElement).value).toBe('Elena')
  })

  it.each([
    {universeId: 'ncaaD1Real2026Men', count: 365},
    {universeId: 'ncaaD1Real2026Women', count: 363},
  ])('selects NCAA programs and sends $universeId through the manager step', async ({ universeId, count }) => {
    mocks.createConfiguredGameAsync.mockResolvedValue({ marker: universeId })
    openWizard(universeId)
    expect(screen.getByText('Masculina')).toBeTruthy()
    expect(screen.getByText('Femenina')).toBeTruthy()
    enterManager()
    const select = screen.getByLabelText('TEAM')
    const options = within(select).getAllByRole('option') as HTMLOptionElement[]
    expect(options).toHaveLength(count + 1)
    fireEvent.change(select, {target: {value: options[1]!.value}})
    fillCoachIdentity()
    fireEvent.click(screen.getByRole('button', { name: 'START CAREER' }))
    await waitFor(() => expect(mocks.createConfiguredGameAsync).toHaveBeenCalledWith({
      universeId, userTeamKey: options[1]!.value, ncaaSeed: 202627, userCoachCreation: coachCreation,
    }))
  })

  it('keeps the existing Spain DB flow and surfaces a bootstrap failure', async () => {
    mocks.createConfiguredGameAsync.mockRejectedValue(new Error('World DB not found'))
    openWizard('worldDbSpain')
    enterManager()
    const select = await screen.findByLabelText('TEAM - 18 CANONICAL OPTIONS')
    fireEvent.change(select, { target: { value: teams[0]!.key } })
    fillCoachIdentity()
    fireEvent.click(screen.getByRole('button', { name: 'START CAREER' }))
    await waitFor(() => expect(screen.getByText('World DB not found')).toBeTruthy())
    expect(mocks.replaceWorld).not.toHaveBeenCalled()
  })

  it('requires manager identity for ACB and submits the canonical RPG profile', async () => {
    mocks.createConfiguredGameAsync.mockResolvedValue({ marker: 'created-coach-world' })
    openWizard('acb-2026-27')
    enterManager()
    expect(screen.getByRole('button', { name: 'START CAREER' }).hasAttribute('disabled')).toBe(true)
    fillCoachIdentity()
    fireEvent.click(screen.getByRole('button', { name: 'START CAREER' }))
    await waitFor(() => expect(mocks.createConfiguredGameAsync).toHaveBeenCalledWith({
      universeId: 'acb-2026-27',
      userTeamKey: expect.any(String),
      userCoachCreation: coachCreation,
    }))
    expect(mocks.replaceWorld).toHaveBeenCalledWith({ marker: 'created-coach-world' })
  })
})
