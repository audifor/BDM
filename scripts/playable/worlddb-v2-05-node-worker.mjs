// Node acceptance adapter for the exact Web Worker bundle shipped by this build.
import { parentPort, workerData } from 'node:worker_threads'
globalThis.postMessage = reply => parentPort.postMessage(reply)
await import(workerData.engineUrl)
parentPort.on('message', data => globalThis.onmessage({ data }))
