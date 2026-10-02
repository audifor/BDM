import type { StaffAssignmentsTone } from '@/ui-ng/applications/staff/assignments/staffAssignmentsModel'

/** Horizontal 4px load/coverage bar; width is driven by canonical utilization. */
export function WorkloadBar({ tone, value }: { readonly tone: StaffAssignmentsTone; readonly value: number }) {
  const percent = Number.isFinite(value) ? Math.min(100, Math.round(value * 100)) : 100
  return (
    <span aria-hidden className={`sa-bar sa-tone-${tone}`}>
      <span className="sa-bar__fill" style={{ width: `${percent}%` }} />
    </span>
  )
}

export function StaffRoleChip({ label, tone }: { readonly label: string; readonly tone: StaffAssignmentsTone }) {
  return <span className={`sa-chip sa-tone-${tone}`}>{label}</span>
}
