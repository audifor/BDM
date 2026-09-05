import type { ReactNode } from 'react'

import type { StaffWorkloadState } from '@/ui/staffPresentation'
import { WORKLOAD_STATE_LABELS } from '@/ui/staffPresentation'

import { formatStaffPercent } from '@/ui-ng/applications/staff/staffWorkspaceModel'

export function WorkloadBadge({
  state,
  utilization,
}: {
  readonly state: StaffWorkloadState
  readonly utilization: number
}) {
  return (
    <span className={`staff-workspace__badge staff-workspace__badge--${state}`}>
      {WORKLOAD_STATE_LABELS[state]} · {formatStaffPercent(utilization)}
    </span>
  )
}

export function InspectorSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="staff-workspace__group">
      <h3 className="staff-workspace__group-title">{title}</h3>
      {children}
    </section>
  )
}

export function MetricRow({
  label,
  value,
  current = false,
}: {
  readonly label: string
  readonly value: ReactNode
  readonly current?: boolean
}) {
  return (
    <div className={current ? 'staff-workspace__metric is-current' : 'staff-workspace__metric'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function FilterGroup({ children }: { readonly children: ReactNode }) {
  return (
    <div className="staff-workspace__filters" role="group">
      {children}
    </div>
  )
}
