import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { STAFF_DEPARTMENTS, type StaffDepartment } from '@/domain/staff'
import type { StaffWorkloadState } from '@/ui/staffPresentation'
import { STAFF_DEPARTMENT_LABELS, WORKLOAD_STATE_LABELS } from '@/ui/staffPresentation'

import { formatStaffPercent } from '@/ui-ng/applications/staff/staffWorkspaceModel'
import { navigateToStaffDepartment } from '@/ui-ng/workspace/workspaceApps'

function portalHost(): Element {
  return document.querySelector('[data-ng-shell="bdm-os-ng"]') ?? document.body
}

export interface StaffDepartmentTabHover {
  readonly tabButtonRef: (node: HTMLButtonElement | null) => void
  readonly onTabMouseEnter: () => void
  readonly onTabMouseLeave: () => void
  readonly menu: ReactNode
}

/**
 * Hover-triggered department picker scoped to exactly the "Staff" workspace tab's own button —
 * not the whole tab bar. Call this hook, wire its three handlers onto `WorkspaceTabs`'
 * `tabRef`/`onTabMouseEnter`/`onTabMouseLeave` (matched by `tabRefId="staff"`), and render
 * `.menu` as a sibling. Portals the dropdown to the shell root so it escapes the tabs slot's
 * `overflow: hidden` (the slot clips anything positioned within it, which otherwise makes the
 * menu render with zero visible effect).
 */
export function useStaffDepartmentTabHover(activeDepartment: StaffDepartment | null): StaffDepartmentTabHover {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | undefined>(undefined)
  const [menuPosition, setMenuPosition] = useState<{ readonly top: number; readonly left: number } | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  const cancelClose = () => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = undefined
    }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 150)
  }

  useLayoutEffect(() => {
    if (!open) return
    const buttonRect = buttonRef.current?.getBoundingClientRect()
    const host = portalHost()
    const hostRect = host.getBoundingClientRect()
    const hostElement = host as HTMLElement
    const scaleX = hostElement.offsetWidth === 0 ? 1 : hostRect.width / hostElement.offsetWidth
    const scaleY = hostElement.offsetHeight === 0 ? 1 : hostRect.height / hostElement.offsetHeight
    setRect(buttonRect)
    if (buttonRect !== undefined) {
      setMenuPosition({
        top: (buttonRect.bottom - hostRect.top) / scaleY,
        left: (buttonRect.left - hostRect.left) / scaleX,
      })
    }
  }, [open])

  const menu =
    open && rect !== undefined && menuPosition !== undefined
      ? createPortal(
          <ul
            className="staff-workspace-header__menu-list"
            onClick={() => setOpen(false)}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            role="menu"
            style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left }}
          >
            <li>
              <button
                aria-current={activeDepartment === null ? 'true' : undefined}
                className={activeDepartment === null ? 'is-active' : undefined}
                onClick={() => navigateToStaffDepartment(null)}
                role="menuitem"
                type="button"
              >
                Overview
              </button>
            </li>
            {STAFF_DEPARTMENTS.map((department) => (
              <li key={department}>
                <button
                  aria-current={department === activeDepartment ? 'true' : undefined}
                  className={department === activeDepartment ? 'is-active' : undefined}
                  onClick={() => navigateToStaffDepartment(department)}
                  role="menuitem"
                  type="button"
                >
                  {STAFF_DEPARTMENT_LABELS[department]}
                </button>
              </li>
            ))}
          </ul>,
          portalHost(),
        )
      : null

  return {
    tabButtonRef: (node) => {
      buttonRef.current = node
    },
    onTabMouseEnter: () => {
      cancelClose()
      setOpen(true)
    },
    onTabMouseLeave: scheduleClose,
    menu,
  }
}

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
