export type RepairClassification = 'RECOVERABLE' | 'UNRECOVERABLE' | 'NOT_APPLICABLE' | 'ALREADY_VALID'

export interface WorldRepairDiagnostic {
  readonly code: string
  readonly message: string
}

/** Transient evidence for one deterministic repair assessment or attempt. */
export interface WorldRepairReport {
  readonly repairKind: string
  readonly sourceDomain: string
  readonly targetEntity: string
  readonly classification: RepairClassification
  readonly previousStateSummary: string
  readonly actionApplied: string
  readonly resultingStateSummary: string
  readonly diagnostics: readonly WorldRepairDiagnostic[]
  readonly worldChanged: boolean
  readonly userActionRequired: boolean
}
