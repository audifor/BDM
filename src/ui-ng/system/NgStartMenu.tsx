import { useEffect, useMemo, useRef, useState } from 'react'

import { useGameStore } from '@/stores/gameStore'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { TaskbarIcon } from '@/ui-ng/system/TaskbarIcon'
import { filterStartMenuApps, startMenuAppLabel, visibleStartMenuGroups } from '@/ui-ng/system/startMenuCatalog'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

import './ng-start-menu.css'

export function NgStartMenu({ onClose }: { readonly onClose: () => void }) {
  const { app, setActiveApp } = useNgWorkspaceNavigation()
  const world = useGameStore((state) => state.world)
  const searchInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const capabilities = useMemo(
    () => (world === null ? undefined : resolveGameCapabilities(world)),
    [world],
  )
  const visibleApps = useMemo(() => filterStartMenuApps(query, capabilities), [query, capabilities])
  const groups = useMemo(() => visibleStartMenuGroups(capabilities), [capabilities])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    searchInput.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const openApp = (id: WorkspaceAppId) => {
    setActiveApp(id)
    onClose()
  }

  return (
    <div
      className="ng-start-backdrop"
      data-ng-region="start-menu-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section aria-label="BDM Inicio" className="ng-start-menu" data-ng-region="start-menu" role="dialog">
        <div className="ng-start-menu__main">
          <header className="ng-start-menu__search">
            <label>
              <span aria-hidden>⌕</span>
              <input
                aria-label="Buscar en BDM"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar apps…"
                ref={searchInput}
                value={query}
              />
            </label>
          </header>

          <div className="ng-start-menu__categories">
            <h2>Todas las categorías</h2>
            {groups.map((group) => {
              const apps = group.appIds.filter((id) => visibleApps.includes(id))
              if (apps.length === 0) return null
              return (
                <section className="ng-start-menu__category" key={group.id}>
                  <div className="ng-start-menu__category-title">
                    <h3>{group.label}</h3>
                    <p>{group.description}</p>
                  </div>
                  <div className="ng-start-menu__category-apps">
                    {apps.map((id) => (
                      <button
                        aria-current={app === id ? 'page' : undefined}
                        key={id}
                        onClick={() => openApp(id)}
                        type="button"
                      >
                        <TaskbarIcon id={id} />
                        <span>{startMenuAppLabel(id)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
