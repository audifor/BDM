/**
 * ME-LOCK1.2 execution diagnostics. The execution machinery (carried action summaries, the session event log) replaces whole-history
 * scans and copies with incremental projections. At FULL every projection is checked against the definition it replaces, and a mismatch
 * throws. Checks only read, so the simulation is identical at every level; production runs at NONE, tests and certification at FULL.
 */
export type ExecutionDiagnosticsLevel = 'NONE' | 'FULL'

let level: ExecutionDiagnosticsLevel = 'NONE'

export function setExecutionDiagnostics(next: ExecutionDiagnosticsLevel): void {
  level = next
}

export function fullExecutionDiagnostics(): boolean {
  return level === 'FULL'
}

export function executionInvariant(condition: boolean, message: () => string): void {
  if (!condition) throw new Error(`Match execution invariant violated: ${message()}`)
}
