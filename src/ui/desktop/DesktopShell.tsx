import { useEffect, type ReactNode } from 'react'

export function suppressNativeContextMenu(event: Pick<MouseEvent, 'preventDefault'>): void { event.preventDefault() }

export function DesktopShell({ children, ambient, context, density = 'standard', dock, dockAutoHide = false, overlay, status, wallpaper = 'arena', widgets }: { readonly children: ReactNode; readonly ambient?: ReactNode; readonly context?: ReactNode; readonly density?: string; readonly dock?: ReactNode; readonly dockAutoHide?: boolean; readonly overlay?: ReactNode; readonly status?: ReactNode; readonly wallpaper?: string; readonly widgets?: ReactNode }) {
  useEffect(() => { const handler = (event: MouseEvent) => suppressNativeContextMenu(event); document.addEventListener('contextmenu', handler, { capture: true }); return () => document.removeEventListener('contextmenu', handler, { capture: true }) }, [])
  return (
    <main className={`desktop-shell${dockAutoHide ? ' desktop-shell--auto-hide-dock' : ''}`} data-density={density} data-testid="desktop-shell" data-wallpaper={wallpaper}>
      <DesktopWorkspace ambient={ambient} widgets={widgets}>{children}</DesktopWorkspace>
      {context}
      <OverlayLayer>{overlay}</OverlayLayer>
      <DesktopDockSlot>{dock}</DesktopDockSlot>
      {status}
    </main>
  )
}

export function DesktopWorkspace({ children, ambient, widgets }: { readonly children: ReactNode; readonly ambient?: ReactNode; readonly widgets?: ReactNode }) {
  return <div className="desktop-workspace" data-testid="desktop-workspace">{ambient}{widgets}{children}</div>
}

export function OverlayLayer({ children }: { readonly children?: ReactNode }) {
  return <div aria-live="polite" className="desktop-overlay-layer" data-testid="overlay-layer">{children}</div>
}

function DesktopDockSlot({ children }: { readonly children?: ReactNode }) {
  return <div className="desktop-dock-slot" data-testid="desktop-dock-slot">{children}</div>
}

export function AppSurface({ children, title }: { readonly children: ReactNode; readonly title?: ReactNode }) {
  return (
    <section className="app-surface">
      {title !== undefined && <div className="app-surface__title">{title}</div>}
      {children}
    </section>
  )
}
