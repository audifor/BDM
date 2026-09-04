import '@/ui-ng/styles/reset.css'
import '@/ui-ng/styles/ng-global.css'

import { SystemBar } from '@/ui-ng/system/SystemBar'
import { Taskbar } from '@/ui-ng/system/Taskbar'
import { WorkspaceHost } from '@/ui-ng/workspace/WorkspaceHost'

export function BdmOsNg() {
  return (
    <div className="bdm-os-ng" data-ng-shell="bdm-os-ng">
      <SystemBar />
      <div className="bdm-os-ng__workspace-region">
        <WorkspaceHost />
      </div>
      <Taskbar />
    </div>
  )
}
