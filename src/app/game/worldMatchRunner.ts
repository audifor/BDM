import { createInlineMatchRunner, createWorkerPoolRunner, type MatchSimulationReply, type MatchSimulationRunner } from '@/app/matchNext/MatchSimulationRunner'

/**
 * ME-LOCK1.1: the runner the application uses to simulate a day's Games. In the app (browser/Tauri webview) it is a persistent pool of
 * Web Workers, one warm Match Next engine each; where no Worker exists (Node tests and tools) it is the inline runner. Both produce the
 * identical results for the same prepared setups, and the world they lead to is applied in schedule order on the main thread.
 */
let runner: MatchSimulationRunner | undefined

export function getWorldMatchRunner(): MatchSimulationRunner {
  if (runner !== undefined) return runner
  if (typeof Worker === 'undefined' || typeof navigator === 'undefined') {
    runner = createInlineMatchRunner()
    return runner
  }
  const cores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : 4
  // Leave one core to the interface; a day rarely needs more than eight Games at once.
  const size = Math.max(1, Math.min(8, cores - 1))
  runner = createWorkerPoolRunner(() => {
    const worker = new Worker(new URL('../matchNext/matchSimulation.worker.ts', import.meta.url), { type: 'module' })
    return {
      post: (job) => worker.postMessage(job),
      onReply: (listener) => { worker.onmessage = (event: MessageEvent<MatchSimulationReply>) => listener(event.data) },
      onFailure: (listener) => {
        worker.onerror = (event) => listener(event.message || 'Match simulation worker failed')
        worker.onmessageerror = () => listener('Match simulation worker message could not be read')
      },
      terminate: () => worker.terminate(),
    }
  }, size)
  return runner
}

/** For tests and tools: use this runner instead of the environment's default. */
export function setWorldMatchRunner(next: MatchSimulationRunner | undefined): void {
  runner?.dispose()
  runner = next
}
