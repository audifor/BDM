import { useState } from 'react'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { tauriGameSaveRepository } from '@/tauri/TauriGameSaveRepository'

export function CareerSaveControls() {
  const world = useGameStore(state => state.world)
  const simulationBusy = useGameStore(state => state.simulationBusy)
  const simulation = useMatchViewerStore(state => state.simulation)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const disabled = world === null || simulationBusy || simulation !== null || busy

  const run = async (action: 'save' | 'load') => {
    if (disabled || world === null) return
    setBusy(true)
    setMessage(null)
    try {
      if (action === 'save') {
        await saveCurrentGame(world, tauriGameSaveRepository, new Date().toISOString())
        setMessage('Partida guardada.')
      } else {
        const loaded = await loadSavedGame(tauriGameSaveRepository)
        useMatchViewerStore.getState().clear()
        useTacticalPlanStore.getState().reset()
        useGameStore.getState().replaceWorld(loaded)
        setMessage('Partida cargada.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : typeof error === 'string' ? error : 'No se pudo completar la operación.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="ng-career-save">
    <div>
      <button className="ng-btn ng-btn--ghost" disabled={disabled} onClick={() => void run('save')} type="button">Guardar partida</button>
      <button className="ng-btn ng-btn--ghost" disabled={disabled} onClick={() => void run('load')} type="button">Cargar partida</button>
    </div>
    {message !== null && <span role="status">{message}</span>}
  </div>
}
