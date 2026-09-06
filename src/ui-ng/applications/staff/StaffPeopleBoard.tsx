import type { GameWorld } from '@/domain/world'
import type { StaffPersonId } from '@/domain/ids'
import type { StaffPresentationItem } from '@/ui/staffPresentation'

import { useMemo } from 'react'

import { buildStaffDepartmentBoardModel } from '@/ui-ng/applications/staff/buildStaffDepartmentBoardModel'
import { StaffDepartmentBoard } from '@/ui-ng/applications/staff/StaffDepartmentBoard'
import { navigateToStaffDepartment } from '@/ui-ng/workspace/workspaceApps'
import type { TeamId } from '@/domain/ids'

export function StaffPeopleBoard({
  world,
  teamId,
  staff,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly staff: readonly StaffPresentationItem[]
}) {
  const departmentModel = useMemo(() => buildStaffDepartmentBoardModel(world, teamId), [world, teamId])

  if (staff.length === 0) {
    return <p className="staff-workspace__empty">No staff assigned to this team.</p>
  }

  return (
    <div className="staff-workspace__stack">
      <StaffDepartmentBoard model={departmentModel} onOpenDepartment={navigateToStaffDepartment} />
    </div>
  )
}

