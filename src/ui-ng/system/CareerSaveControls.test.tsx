// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { CareerSaveControls } from './CareerSaveControls'

const native = vi.hoisted(() => ({ file: '', save: vi.fn(), load: vi.fn() }))
vi.mock('@/tauri/TauriGameSaveRepository', () => ({ tauriGameSaveRepository: {
  save: native.save, load: native.load,
} }))

beforeEach(() => {
  native.file = ''
  native.save.mockReset().mockImplementation(async (json: string) => { native.file = json })
  native.load.mockReset().mockImplementation(async () => native.file)
  useGameStore.getState().resetGame()
  useMatchViewerStore.getState().clear()
})
afterEach(cleanup)

describe('Courtside career persistence controls', () => {
  it('saves and restores the canonical ACB world through the existing Save V4 service', async () => {
    const world = createConfiguredGame({ universeId: 'acb-2026-27', userTeamKey: 'caz' })
    useGameStore.getState().replaceWorld(world)
    render(<CareerSaveControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar partida' }))
    await screen.findByText('Partida guardada.')
    expect(JSON.parse(native.file).schemaVersion).toBe(4)
    useGameStore.getState().replaceWorld(createConfiguredGame({ universeId: 'acb-2026-27', userTeamKey: 'rmb' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cargar partida' }))
    await screen.findByText('Partida cargada.')
    expect(projectPersistentWorldTruth(useGameStore.getState().world!)).toEqual(projectPersistentWorldTruth(world))
  })

  it('keeps the active world when a save cannot be loaded and displays the error', async () => {
    const world = createConfiguredGame({ universeId: 'acb-2026-27' })
    useGameStore.getState().replaceWorld(world)
    native.file = '{malformed'
    render(<CareerSaveControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Cargar partida' }))
    await screen.findByText('Saved game contains malformed JSON')
    expect(useGameStore.getState().world).toBe(world)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cargar partida' })).toBeEnabled())
  })

  it('disables persistence during canonical day processing', () => {
    useGameStore.setState({ world: createConfiguredGame({ universeId: 'acb-2026-27' }), simulationBusy: true })
    render(<CareerSaveControls />)
    expect(screen.getByRole('button', { name: 'Guardar partida' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cargar partida' })).toBeDisabled()
    useGameStore.setState({ simulationBusy: false })
  })

  it('displays the string errors returned by native Tauri commands', async () => {
    useGameStore.getState().replaceWorld(createConfiguredGame({ universeId: 'acb-2026-27' }))
    native.save.mockRejectedValue('Native save write failed')
    render(<CareerSaveControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar partida' }))
    await screen.findByText('Native save write failed')
  })
})

describe('F1 · guardado durante un partido', () => {
  it('rechaza guardar y cargar mientras hay un partido en directo y lo explica', () => {
    useGameStore.setState({ world: createConfiguredGame({ universeId: 'acb-2026-27' }), liveMatchActive: true })
    render(<CareerSaveControls />)
    expect(screen.getByRole('button', { name: 'Guardar partida' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cargar partida' })).toBeDisabled()
    expect(screen.getByText(/Hay un partido en curso/)).toBeInTheDocument()
    expect(native.save).not.toHaveBeenCalled()
    useGameStore.setState({ liveMatchActive: false })
  })
})
