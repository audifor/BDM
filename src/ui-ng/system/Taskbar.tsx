import './Taskbar.css'

import { TASKBAR_APPS } from '@/ui-ng/applications/player/playerStructuralData'

export function Taskbar() {
  return (
    <footer className="ng-taskbar" data-ng-region="taskbar">
      <div className="ng-taskbar__apps" role="toolbar">
        {TASKBAR_APPS.map((app) => (
          <button
            aria-current={'active' in app && app.active ? 'page' : undefined}
            className={`ng-taskbar__app${'active' in app && app.active ? ' is-active' : ''}`}
            key={app.id}
            type="button"
          >
            {app.label}
          </button>
        ))}
      </div>
      <span className="ng-taskbar__status">Simulation idle</span>
    </footer>
  )
}
