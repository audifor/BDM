/**
 * ME-LOCK1.1 Web Worker entry: one Match Next engine per worker, simulating prepared setups in FAST mode (setup -> result).
 * It never sees the GameWorld: preparation and application stay on the main thread.
 */
import { createMatchEnginePort } from './MatchEnginePortFactory'
import type { MatchSimulationJob, MatchSimulationReply } from './MatchSimulationRunner'

const scope = globalThis as unknown as {
  onmessage: ((event: { readonly data: MatchSimulationJob }) => void) | null
  postMessage(reply: MatchSimulationReply): void
}
const port = createMatchEnginePort('match-next')

scope.onmessage = (event) => {
  const { jobId, setup } = event.data
  try {
    scope.postMessage({ jobId, result: port.simulate(setup, 'FAST') })
  } catch (error) {
    scope.postMessage({ jobId, error: error instanceof Error ? error.message : String(error) })
  }
}
