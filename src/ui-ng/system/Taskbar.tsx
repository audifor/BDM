import { useEffect, useState } from 'react'

import './Taskbar.css'

import { NgStartMenu } from '@/ui-ng/system/NgStartMenu'
import { TaskbarIcon } from '@/ui-ng/system/TaskbarIcon'
import { isClosableTaskbarApp, taskbarAppLabel } from '@/ui-ng/workspace/taskbarOpenApps'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

function StartMenuMark() {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M8 1.8 L14.2 8 L8 14.2 L1.8 8 Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5.2 L10.8 8 L8 10.8 L5.2 8 Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function Taskbar() {
  const { app, closeApp, openApps, setActiveApp } = useNgWorkspaceNavigation()
  const [startOpen, setStartOpen] = useState(false)
  const [menu, setMenu] = useState<WorkspaceAppId | null>(null)
  const activeApp = app === 'player' ? 'player' : app

  useEffect(() => {
    if (menu === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menu])

  return (
    <footer className="ng-taskbar" data-ng-region="taskbar">
      {startOpen ? <NgStartMenu onClose={() => setStartOpen(false)} /> : null}
      <div className="ng-taskbar__apps" role="toolbar">
        <button
          aria-expanded={startOpen}
          aria-haspopup="dialog"
          aria-label="Abrir menú de inicio BDM"
          className={`ng-taskbar__app ng-taskbar__start${startOpen ? ' is-open' : ''}`}
          onClick={() => setStartOpen((open) => !open)}
          type="button"
        >
          <StartMenuMark />
          <span>BDM</span>
        </button>
        {openApps.map((id) => {
          const label = taskbarAppLabel(id)
          const closable = isClosableTaskbarApp(id)
          const menuOpen = menu === id
          return (
            <div className="ng-taskbar__app-slot" data-app={id} key={id}>
              <button
                aria-current={id === activeApp ? 'page' : undefined}
                aria-expanded={closable ? menuOpen : undefined}
                aria-haspopup={closable ? 'menu' : undefined}
                className={`ng-taskbar__app${id === activeApp ? ' is-active' : ''}`}
                onClick={() => {
                  setStartOpen(false)
                  setMenu(null)
                  setActiveApp(id)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setStartOpen(false)
                  setMenu(closable ? id : null)
                }}
                type="button"
              >
                <TaskbarIcon id={id} />
                <span>{label}</span>
              </button>
              {menuOpen ? (
                <>
                  <div
                    className="ng-taskbar__menu-backdrop"
                    data-ng-region="taskbar-app-menu"
                    onPointerDown={() => setMenu(null)}
                  />
                  <div
                    aria-label={`Opciones de ${label}`}
                    className="ng-taskbar__menu"
                    role="menu"
                  >
                    <button
                      onClick={() => {
                        closeApp(id)
                        setMenu(null)
                      }}
                      role="menuitem"
                      type="button"
                    >
                      Cerrar
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
      <span className="ng-taskbar__status">Simulation idle</span>
    </footer>
  )
}
