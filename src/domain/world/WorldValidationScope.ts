import type { GameWorld } from './GameWorld'

export type WorldValidationMode = 'full' | 'incremental'
type Receipt = ReadonlyMap<keyof GameWorld, unknown>
const receipts = new WeakMap<GameWorld, ReadonlyMap<string, Receipt>>()
const reports = new WeakMap<GameWorld, WorldValidationReport>()
export interface WorldValidationReport {
  readonly mode: WorldValidationMode
  readonly dirtyCollections: readonly string[]
  readonly blocks: Readonly<Record<string, { readonly elapsedMs: number; readonly reused: boolean }>>
}

/** Only collection/value references are retained. Never a prior world or a generation chain. */
export class WorldValidationScope {
  readonly world: GameWorld
  private readonly prior: ReadonlyMap<string, Receipt> | undefined
  private readonly next = new Map<string, Receipt>()
  private readonly blocks: Record<string, { elapsedMs: number; reused: boolean }> = {}
  private reading: Map<keyof GameWorld, unknown> | undefined
  constructor(private readonly canonical: GameWorld, previous: GameWorld | undefined, readonly mode: WorldValidationMode) {
    this.prior = previous === undefined ? undefined : receipts.get(previous)
    this.world = new Proxy(canonical, { get: (target, key, receiver) => {
      const value = Reflect.get(target, key, receiver)
      if (typeof key === 'string') this.reading?.set(key as keyof GameWorld, value)
      return value
    } })
  }
  run(id: string, execute: () => void, extra: readonly (keyof GameWorld)[] = []): void {
    const started = performance.now()
    const receipt = this.prior?.get(id)
    if (this.mode === 'incremental' && receipt !== undefined && [...receipt].every(([key, value]) => this.canonical[key] === value)) {
      this.next.set(id, receipt)
      this.blocks[id] = { elapsedMs: performance.now() - started, reused: true }
      return
    }
    const reads = new Map<keyof GameWorld, unknown>(extra.map(key => [key, this.canonical[key]]))
    this.reading = reads
    try { execute() }
    finally { this.reading = undefined }
    this.next.set(id, reads)
    this.blocks[id] = { elapsedMs: performance.now() - started, reused: false }
  }
  complete(previous: GameWorld | undefined): void {
    receipts.set(this.canonical, this.next)
    reports.set(this.canonical, { mode: this.mode, dirtyCollections: previous === undefined ? Object.keys(this.canonical) : Object.keys(this.canonical).filter(key => this.canonical[key as keyof GameWorld] !== previous[key as keyof GameWorld]), blocks: this.blocks })
  }
}
export function getWorldValidationReport(world: GameWorld): WorldValidationReport | undefined { return reports.get(world) }
