import { type MouseEvent, type ReactNode } from 'react'

import type { EntityDestination } from './entityNavigation'
import { useEntityContextMenu } from '@/ui/entityContextMenu/EntityContextMenuProvider'

export function EntityLink({ children, destination, onNavigate }: { readonly children: ReactNode; readonly destination: EntityDestination; readonly onNavigate: (destination: EntityDestination) => void }) {
  const { onContextMenu, onKeyDown } = useEntityContextMenu(destination.type === 'player' ? { type: 'player', id: destination.playerId } : destination.type === 'team' ? { type: 'team', id: destination.teamId } : { type: 'competition', id: destination.competitionId })
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onNavigate(destination)
  }
  return <button className="entity-link" onClick={open} onContextMenu={onContextMenu} onKeyDown={onKeyDown} type="button">{children}</button>
}
