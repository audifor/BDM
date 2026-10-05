/** ME-LOCK1.1 Node worker_threads entry for benchmarks: the same job/reply protocol as src/app/matchNext/matchSimulation.worker.ts. */
import { parentPort } from 'node:worker_threads'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchSimulationJob } from '@/app/matchNext/MatchSimulationRunner'
const port = createMatchEnginePort('match-next')
parentPort!.on('message', (job: MatchSimulationJob) => {
  try { parentPort!.postMessage({ jobId: job.jobId, result: port.simulate(job.setup, 'FAST') }) }
  catch (error) { parentPort!.postMessage({ jobId: job.jobId, error: error instanceof Error ? error.message : String(error) }) }
})
