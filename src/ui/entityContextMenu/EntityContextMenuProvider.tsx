import { createContext, type KeyboardEvent, type MouseEvent, type ReactNode, useContext, useRef, useState } from 'react'

import type { EntityRef } from '@/app/entityActions/EntityRef'
import type { GameWorld } from '@/domain/world'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'

import { EntityContextMenu, type ContextMenuAnchor } from './EntityContextMenu'
import { resolveEntityContextActions } from './entityContextActions'
import { createEntityId } from '@/domain/ids'
import { nextEligibleTrainingDate } from '@/engine/training'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import type { EntityActionContext, EntityContextAction } from './entityContextActions'

interface OpenContextMenu { readonly entity: EntityRef; readonly anchor: ContextMenuAnchor; readonly context: EntityActionContext }
interface EntityContextMenuApi { readonly open: (entity: EntityRef, anchor: ContextMenuAnchor, restoreFocus?: HTMLElement | null, context?: EntityActionContext) => void; readonly close: () => void }

const EntityContextMenuContext = createContext<EntityContextMenuApi | null>(null)

export function EntityContextMenuProvider({ children, onOpenEntity, world }: { readonly children: ReactNode; readonly onOpenEntity: (destination: EntityDestination) => void; readonly world: GameWorld }) {
  const [openMenu, setOpenMenu] = useState<OpenContextMenu | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const setLineupSlot = useGameStore((state) => state.setLineupSlot); const clearLineupSlot = useGameStore((state) => state.clearLineupSlot); const assignTraining = useGameStore((state) => state.assignTrainingModuleToPlayer); const updateMatchups = useGameStore((state) => state.updateGamePlanMatchups)
  const close = () => { setOpenMenu(null); restoreFocus.current?.focus(); restoreFocus.current = null }
  const open: EntityContextMenuApi['open'] = (entity, anchor, focusTarget = null, context = {}) => {
    if (resolveEntityContextActions(world, entity, context).length === 0) return
    restoreFocus.current = focusTarget
    setOpenMenu({ entity, anchor, context })
  }
  const actions = openMenu === null ? [] : resolveEntityContextActions(world, openMenu.entity, openMenu.context)
  const invoke = (action: EntityContextAction) => { const command = action.command; if (command.type === 'navigate') onOpenEntity(command.destination); else if (command.type === 'lineup') setLineupSlot(command.slot, command.playerId); else if (command.type === 'clearLineup') clearLineupSlot(command.slot); else if (command.type === 'training') command.playerIds.forEach((playerId) => assignTraining({ playerId, moduleId: command.moduleId, date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', sessionId: `context:${createEntityId()}` })); else { const team = getUserTeam(world); const game = getNextUserGame(world); if (team !== undefined && game !== undefined) { const current = world.gamePlansByKey[`${game.id}:${team.id}`]?.matchups ?? []; updateMatchups([...current.filter((item) => item.opponentPlayerId !== command.opponentPlayerId), { ourPlayerId: command.defenderId, opponentPlayerId: command.opponentPlayerId }]) } }; close() }
  return <EntityContextMenuContext.Provider value={{ open, close }}>{children}{openMenu !== null && actions.length > 0 && <EntityContextMenu actions={actions} anchor={openMenu.anchor} onClose={close} onInvoke={invoke} />}</EntityContextMenuContext.Provider>
}

export function useEntityContextMenu(entity?: EntityRef, context: EntityActionContext = {}) {
  const api = useContext(EntityContextMenuContext)
  const open = (target: EntityRef, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, nextContext = context) => { if (api !== null) { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); api.open(target, 'clientX' in event && event.clientX !== 0 ? { x: event.clientX, y: event.clientY } : { x: bounds.left, y: bounds.bottom }, event.currentTarget, nextContext) } }
  const onContextMenu = (event: MouseEvent<HTMLElement>) => { if (entity !== undefined) open(entity, event) }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (entity === undefined || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) return
    open(entity, event)
  }
  return { open, onContextMenu, onKeyDown }
}
