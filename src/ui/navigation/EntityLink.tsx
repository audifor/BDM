import { type MouseEvent, type ReactNode } from 'react'

import type { EntityDestination } from './entityNavigation'

export function EntityLink({ children, destination, onNavigate }: { readonly children: ReactNode; readonly destination: EntityDestination; readonly onNavigate: (destination: EntityDestination) => void }) {
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onNavigate(destination)
  }
  return <button className="entity-link" onClick={open} type="button">{children}</button>
}
