import type { MatchSetup } from '@/engine/match-next'
import { createMatchEnginePort } from './MatchEnginePortFactory'
import type { MatchNextResult } from './MatchNextResult'

/**
 * ME-LOCK1.1: where the simulation phase of a day runs. A runner only turns prepared setups into FAST results (setup -> result is
 * pure and deterministic): preparation and application stay on the canonical world, in schedule order, outside the runner. Results
 * come back in the order of the setups whatever order the work finished in, so the applied world never depends on scheduling.
 */
export interface MatchSimulationRunner {
  readonly kind: 'inline' | 'workers'
  simulate(setups: readonly MatchSetup[]): Promise<MatchNextResult[]>
  dispose(): void
}

/** The same engine on the calling thread (tests, Node tools, environments without workers). */
export function createInlineMatchRunner(): MatchSimulationRunner {
  const port = createMatchEnginePort('match-next')
  return {
    kind: 'inline',
    simulate: async (setups) => setups.map((setup) => port.simulate(setup, 'FAST')),
    dispose: () => {},
  }
}

/** Messages between the pool and a simulation worker (see matchSimulation.worker.ts). */
export interface MatchSimulationJob { readonly jobId: number; readonly setup: MatchSetup }
export type MatchSimulationReply =
  | { readonly jobId: number; readonly result: MatchNextResult }
  | { readonly jobId: number; readonly error: string }

/** The few operations the pool needs from a worker (a browser Web Worker or a Node worker_threads Worker, through an adapter). */
export interface MatchWorkerHandle {
  post(job: MatchSimulationJob): void
  onReply(listener: (reply: MatchSimulationReply) => void): void
  onFailure(listener: (message: string) => void): void
  terminate(): void
}

interface PendingJob {
  readonly jobId: number
  readonly setup: MatchSetup
  readonly settle: (outcome: { readonly result?: MatchNextResult; readonly error?: string }) => void
}

/**
 * A pool of persistent workers (warm engines across days). Each call's setups are queued as independent jobs; the call resolves with
 * the results in setup order, or rejects with the first failure (the caller then applies nothing).
 */
export function createWorkerPoolRunner(createWorker: () => MatchWorkerHandle, size: number): MatchSimulationRunner {
  const poolSize = Math.max(1, Math.floor(size))
  const idle: MatchWorkerHandle[] = []
  const all: MatchWorkerHandle[] = []
  const running = new Map<MatchWorkerHandle, PendingJob>()
  const queue: PendingJob[] = []
  let nextJobId = 1

  const dispatch = (): void => {
    while (queue.length > 0) {
      let worker = idle.pop()
      if (worker === undefined && all.length < poolSize) worker = spawn()
      if (worker === undefined) return
      const job = queue.shift()!
      running.set(worker, job)
      worker.post({ jobId: job.jobId, setup: job.setup })
    }
  }
  const finish = (worker: MatchWorkerHandle, outcome: { readonly result?: MatchNextResult; readonly error?: string }): void => {
    const job = running.get(worker)
    if (job === undefined) return
    running.delete(worker)
    idle.push(worker)
    job.settle(outcome)
    dispatch()
  }
  const spawn = (): MatchWorkerHandle => {
    const worker = createWorker()
    worker.onReply((reply) => finish(worker, 'error' in reply ? { error: reply.error } : { result: reply.result }))
    worker.onFailure((message) => {
      // A crashed worker is replaced; its job fails (and with it the whole call).
      const job = running.get(worker)
      running.delete(worker)
      all.splice(all.indexOf(worker), 1)
      worker.terminate()
      job?.settle({ error: message })
      dispatch()
    })
    all.push(worker)
    return worker
  }

  return {
    kind: 'workers',
    simulate: (setups) => new Promise<MatchNextResult[]>((resolve, reject) => {
      if (setups.length === 0) { resolve([]); return }
      const results = new Array<MatchNextResult>(setups.length)
      let remaining = setups.length
      let failed = false
      setups.forEach((setup, index) => {
        queue.push({
          jobId: nextJobId++,
          setup,
          settle: (outcome) => {
            if (failed) return
            if (outcome.error !== undefined || outcome.result === undefined) { failed = true; reject(new Error(`Match simulation failed: ${outcome.error ?? 'no result'}`)); return }
            results[index] = outcome.result
            remaining -= 1
            if (remaining === 0) resolve(results)
          },
        })
      })
      dispatch()
    }),
    dispose: () => {
      for (const worker of all) worker.terminate()
      all.length = 0
      idle.length = 0
      running.clear()
    },
  }
}
