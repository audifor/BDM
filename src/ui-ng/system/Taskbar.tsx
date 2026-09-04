import './Taskbar.css'

const TASKBAR_APPS = [
  'Launcher',
  'Home',
  'Player',
  'Roster',
  'Scouting',
  'Tactics',
] as const

export function Taskbar() {
  return (
    <footer className="ng-taskbar" data-ng-region="taskbar">
      <div aria-label="Application launcher and sessions" className="ng-taskbar__apps" role="toolbar">
        {TASKBAR_APPS.map((app) => (
          <button className="ng-taskbar__app" key={app} type="button">
            {app}
          </button>
        ))}
      </div>
    </footer>
  )
}
