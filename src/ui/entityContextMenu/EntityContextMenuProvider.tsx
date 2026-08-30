import { createContext, type KeyboardEvent, type MouseEvent, type ReactNode, useContext, useRef, useState } from 'react'

import type { EntityRef } from '@/app/entityActions/EntityRef'
import type { GameWorld } from '@/domain/world'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'

import { EntityContextMenu, type ContextMenuAnchor } from './EntityContextMenu'
import { resolveEntityContextActions } from './entityContextActions'

interface OpenContextMenu { readonly entity: EntityRef; readonly anchor: ContextMenuAnchor }
interface EntityContextMenuApi { readonly open: (entity: EntityRef, anchor: ContextMenuAnchor, restoreFocus?: HTMLElement | null) => void; readonly close: () => void }

const EntityContextMenuContext = createContext<EntityContextMenuApi | null>(null)

export function EntityContextMenuProvider({ children, onOpenEntity, world }: { readonly children: ReactNode; readonly onOpenEntity: (destination: EntityDestination) => void; readonly world: GameWorld }) {
  const [openMenu, setOpenMenu] = useState<OpenContextMenu | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const close = () => { setOpenMenu(null); restoreFocus.current?.focus(); restoreFocus.current = null }
  const open: EntityContextMenuApi['open'] = (entity, anchor, focusTarget = null) => {
    if (resolveEntityContextActions(world, entity).length === 0) return
    restoreFocus.current = focusTarget
    setOpenMenu({ entity, anchor })
  }
  const actions = openMenu === null ? [] : resolveEntityContextActions(world, openMenu.entity)
  return <EntityContextMenuContext.Provider value={{ open, close }}>{children}{openMenu !== null && actions.length > 0 && <EntityContextMenu actions={actions} anchor={openMenu.anchor} onClose={close} onInvoke={(action) => { onOpenEntity(action.destination); close() }} />}</EntityContextMenuContext.Provider>
}

export function useEntityContextMenu(entity: EntityRef) {
  const context = useContext(EntityContextMenuContext)
  const onContextMenu = (event: MouseEvent<HTMLElement>) => { if (context !== null) { event.preventDefault(); context.open(entity, { x: event.clientX, y: event.clientY }, event.currentTarget) } }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (context === null || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) return
    event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); context.open(entity, { x: bounds.left, y: bounds.bottom }, event.currentTarget)
  }
  return { onContextMenu, onKeyDown }
}
