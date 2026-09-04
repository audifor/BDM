import './Taskbar.css'

import { WORKSPACE_TASKBAR_APPS } from '@/ui-ng/workspace/workspaceApps'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

export function Taskbar() {
  const { app, setActiveApp } = useNgWorkspaceNavigation()
  const activeApp = app === 'player' ? 'player' : app

  return (
    <footer className="ng-taskbar" data-ng-region="taskbar">
      <div className="ng-taskbar__apps" role="toolbar">
        {WORKSPACE_TASKBAR_APPS.map((entry) => (
          <button
            aria-current={entry.id === activeApp ? 'page' : undefined}
            className={`ng-taskbar__app${entry.id === activeApp ? ' is-active' : ''}`}
            key={entry.id}
            onClick={() => {
              if (entry.id === 'home' || entry.id === 'scouting' || entry.id === 'tactics' || entry.id === 'medical') {
                setActiveApp(entry.id)
                return
              }
              if (entry.id === 'player') {
                setActiveApp('player')
                return
              }
              setActiveApp(entry.id)
            }}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>
      <span className="ng-taskbar__status">Simulation idle</span>
    </footer>
  )
}
