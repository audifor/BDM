import { readdirSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { createWorkerPoolRunner } from '@/app/matchNext/MatchSimulationRunner'

/** Same production pool/FAST bundle as Windows; only the worker transport differs. */
export function createUniverseAcceptanceRunner() {
  const bundle = readdirSync('dist/assets').find(name => /^matchSimulation\.worker-.*\.js$/.test(name))
  if (!bundle) throw new Error('Build the current source before running worker acceptance')
  const engineUrl = pathToFileURL(resolve('dist/assets', bundle)).href
  return createWorkerPoolRunner(() => {
    const worker = new Worker(pathToFileURL(resolve('scripts/playable/worlddb-v2-05-node-worker.mjs')), { workerData: { engineUrl } })
    return {
      post: job => worker.postMessage(job),
      onReply: listener => { worker.on('message', listener) },
      onFailure: listener => { worker.on('error', error => listener(error.message)) },
      terminate: () => { void worker.terminate() },
    }
  }, Math.max(1, Math.min(8, availableParallelism() - 1)))
}
