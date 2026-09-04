import { useState } from 'react'

import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { InspectorPane } from '@/ui-ng/workspace/InspectorPane'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { SplitPane } from '@/ui-ng/workspace/SplitPane'
import { WorkspaceBody } from '@/ui-ng/workspace/WorkspaceBody'
import { WorkspaceHeader } from '@/ui-ng/workspace/WorkspaceHeader'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'
import { WorkspaceToolbar } from '@/ui-ng/workspace/WorkspaceToolbar'

const PLACEHOLDER_TABS = [
  { id: 'overview', label: 'Overview', active: true },
  { id: 'details', label: 'Details' },
  { id: 'history', label: 'History' },
] as const

export function PlaceholderWorkspace() {
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)

  return (
    <ApplicationWorkspace
      header={
        <WorkspaceHeader
          meta="STEP 002 · Architecture scaffold"
          title="Placeholder Workspace"
        />
      }
      tabs={<WorkspaceTabs tabs={PLACEHOLDER_TABS} />}
      toolbar={
        <WorkspaceToolbar>
          <span className="bdm-os-ng__scaffold-label">Workspace Toolbar</span>
          <span>Filter · Sort · View</span>
        </WorkspaceToolbar>
      }
    >
      <WorkspaceBody
        inspector={
          <InspectorPane
            collapsed={inspectorCollapsed}
            onToggleCollapse={() => setInspectorCollapsed((value) => !value)}
          />
        }
        main={
          <SplitPane
            primary={
              <ScrollRegion>
                <div className="ng-placeholder-panel bdm-os-ng__scaffold-outline">
                  <span className="bdm-os-ng__scaffold-label">Main Region · ScrollRegion</span>
                  <div className="ng-placeholder-panel__rows">
                    {Array.from({ length: 24 }, (_, index) => (
                      <div className="ng-placeholder-panel__row" key={index}>
                        Row {index + 1} · dense data scaffold
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollRegion>
            }
            primaryRatio={0.65}
            secondary={
              <div className="ng-placeholder-panel bdm-os-ng__scaffold-outline">
                <span className="bdm-os-ng__scaffold-label">Secondary Region · 35%</span>
                <p className="bdm-os-ng__scaffold-label">SplitPane secondary panel</p>
              </div>
            }
          />
        }
      />
    </ApplicationWorkspace>
  )
}
