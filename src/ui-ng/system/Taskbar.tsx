import { useEffect, useState } from 'react'

import './Taskbar.css'

import { useGameStore } from '@/stores/gameStore'
import { NgStartMenu } from '@/ui-ng/system/NgStartMenu'
import { TaskbarIcon } from '@/ui-ng/system/TaskbarIcon'
import { CourtsideGlyph, CourtsideTaskbarIcon } from '@/ui-ng/system/CourtsideGlyph'
import { isClosableTaskbarApp, taskbarAppLabel } from '@/ui-ng/workspace/taskbarOpenApps'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

const COURTSIDE_PINNED: readonly WorkspaceAppId[] = ['home', 'roster', 'tactics', 'match']

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
  // MX0.4: the status is a canonical signal, not a static caption, so it cannot claim the simulation is idle
  // while a background day advance is running.
  const simulationBusy = useGameStore((state) => state.simulationBusy)
  const [startOpen, setStartOpen] = useState(false)
  const [menu, setMenu] = useState<WorkspaceAppId | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [capacity, setCapacity] = useState(12)
  const activeApp = app === 'player' ? 'player' : app
  const courtside = app === 'home'
  const allCourtsideApps = [...COURTSIDE_PINNED, ...openApps.filter((id) => !COURTSIDE_PINNED.includes(id))]
  const count = Math.max(1, capacity - (allCourtsideApps.length > capacity ? 1 : 0))
  const shownApps = courtside ? allCourtsideApps.slice(0, count) : openApps
  const overflowApps = courtside ? allCourtsideApps.slice(count) : []

  useEffect(() => {
    const measure = () => setCapacity(Math.max(2, Math.floor((window.innerWidth - 340) / 54)))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

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
          {courtside ? <CourtsideGlyph name="diamond" /> : <StartMenuMark />}
        </button>
        {shownApps.map((id) => {
          const label = taskbarAppLabel(id)
          const closable = isClosableTaskbarApp(id) && openApps.includes(id)
          const menuOpen = menu === id
          return (
            <div className="ng-taskbar__app-slot" data-app={id} key={id}>
              <button
                aria-label={label}
                aria-current={id === activeApp ? 'page' : undefined}
                aria-expanded={closable ? menuOpen : undefined}
                aria-haspopup={closable ? 'menu' : undefined}
                className={`ng-taskbar__app${id === activeApp ? ' is-active' : ''}${openApps.includes(id) ? ' is-running' : ''}${courtside && COURTSIDE_PINNED.includes(id) ? ' is-pinned' : ''}`}
                title={label}
                onAuxClick={(event) => {
                  if (event.button !== 1 || !closable) return
                  event.preventDefault()
                  setStartOpen(false)
                  setMenu(null)
                  closeApp(id)
                }}
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
                onMouseDown={(event) => {
                  if (event.button === 1 && closable) event.preventDefault()
                }}
                type="button"
              >
                {courtside ? <CourtsideTaskbarIcon id={id} /> : <TaskbarIcon id={id} />}
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
        {overflowApps.length > 0 ? (
          <div className="ng-taskbar__overflow">
            <button aria-expanded={moreOpen} aria-label={`${overflowApps.length} aplicaciones más`} className="ng-taskbar__app ng-taskbar__more" onClick={() => setMoreOpen((open) => !open)} title="Más aplicaciones" type="button">
              <CourtsideGlyph name="more" /><em>+{overflowApps.length}</em>
            </button>
            {moreOpen ? (
              <div className="ng-taskbar__overflow-list" role="menu">
                {overflowApps.map((id) => (
                  <button key={id} onClick={() => { setMoreOpen(false); setActiveApp(id) }} role="menuitem" type="button">{taskbarAppLabel(id)}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <span className="ng-taskbar__status">{simulationBusy ? 'Simulation running' : 'Simulation idle'}</span>
    </footer>
  )
}
