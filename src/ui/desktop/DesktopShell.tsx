import { useEffect, type ReactNode } from 'react'

export function suppressNativeContextMenu(event: Pick<MouseEvent, 'preventDefault'>): void { event.preventDefault() }

export function DesktopShell({ children, ambient, dock, overlay, status, widgets }: { readonly children: ReactNode; readonly ambient?: ReactNode; readonly dock?: ReactNode; readonly overlay?: ReactNode; readonly status?: ReactNode; readonly widgets?: ReactNode }) {
  useEffect(() => { const handler = (event: MouseEvent) => suppressNativeContextMenu(event); document.addEventListener('contextmenu', handler, { capture: true }); return () => document.removeEventListener('contextmenu', handler, { capture: true }) }, [])
  return (
    <main className="desktop-shell" data-testid="desktop-shell">
      <DesktopWorkspace ambient={ambient} widgets={widgets}>{children}</DesktopWorkspace>
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
