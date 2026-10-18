/**
 * Display formatter for live medical UI only. Never round stored world values.
 * One decimal avoids displaying floating point representation artefacts.
 */
export function formatMedicalOneDecimal(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0'
}
