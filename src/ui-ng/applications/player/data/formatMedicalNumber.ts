/** Render simulation metrics without IEEE-754 artifacts; leave canonical values untouched. */
export function formatMedicalNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—'
  const precision = Math.max(0, Math.min(2, Math.trunc(decimals)))
  const rounded = Number(value.toFixed(precision))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}
