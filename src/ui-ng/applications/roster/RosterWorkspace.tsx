import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'

import type { LineupSlot } from '@/domain/tactics'

import { useGameStore } from '@/stores/gameStore'
import { CanonicalRoster } from '@/ui/pcb-migrated/plantilla/CanonicalRoster'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import { RosterWorkspaceHeader } from '@/ui-ng/applications/roster/components/RosterWorkspaceHeader'
import {
  buildRosterWorkspaceContext,
  rosterTeamForWorld,
} from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import {
  useRosterWorkspaceSession,
  type RosterNgSessionBridge,
} from '@/ui-ng/applications/roster/rosterWorkspaceSession'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'

import './roster-workspace.css'
import '@/ui-ng/styles/ng-data-grid.css'

export function RosterWorkspace() {
  const world = useGameStore((state) => state.world)
  const setLineupSlot = useGameStore((state) => state.setLineupSlot)
  const clearLineupSlot = useGameStore((state) => state.clearLineupSlot)
  const { openEntity } = useNgWorkspaceNavigation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollSnapshotRef = useRef(0)
  const activePreset = useRosterWorkspaceSession((state) => state.activePreset)
  const searchQuery = useRosterWorkspaceSession((state) => state.searchQuery)
  const positionFilter = useRosterWorkspaceSession((state) => state.positionFilter)
  const selectedRowIds = useRosterWorkspaceSession((state) => state.selectedRowIds)
  const scrollTop = useRosterWorkspaceSession((state) => state.scrollTop)
  const setActivePreset = useRosterWorkspaceSession((state) => state.setActivePreset)
  const setSearchQuery = useRosterWorkspaceSession((state) => state.setSearchQuery)
  const setPositionFilter = useRosterWorkspaceSession((state) => state.setPositionFilter)
  const setSelectedRowIds = useRosterWorkspaceSession((state) => state.setSelectedRowIds)
  const setScrollTop = useRosterWorkspaceSession((state) => state.setScrollTop)

  const context = useMemo(
    () => (world === null ? null : buildRosterWorkspaceContext(world)),
    [world],
  )
  const team = useMemo(
    () => (world === null ? undefined : rosterTeamForWorld(world)),
    [world],
  )

  const persistScroll = useCallback(() => {
    const element = scrollRef.current
    if (element !== null) {
      scrollSnapshotRef.current = element.scrollTop
      setScrollTop(element.scrollTop)
    }
  }, [setScrollTop])

  const openPlayerFromRoster = useCallback(
    (destination: EntityDestination) => {
      if (destination.type !== 'player') return
      setScrollTop(scrollSnapshotRef.current)
      openEntity(destination)
    },
    [openEntity, setScrollTop],
  )

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (element === null) return
    const snapshotBeforeInteraction = () => {
      scrollSnapshotRef.current = element.scrollTop
    }
    element.addEventListener('mousedown', snapshotBeforeInteraction, true)
    return () => element.removeEventListener('mousedown', snapshotBeforeInteraction, true)
  }, [])

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (element === null || scrollTop <= 0) return
    element.scrollTop = scrollTop
    requestAnimationFrame(() => {
      if (element.scrollTop + 48 < scrollTop) {
        element.scrollTop = scrollTop
      }
    })
  }, [scrollTop])

  const sessionBridge = useMemo<RosterNgSessionBridge>(
    () => ({
      activePreset,
      onActivePresetChange: setActivePreset,
      searchQuery,
      onSearchQueryChange: setSearchQuery,
      positionFilter,
      onPositionFilterChange: setPositionFilter,
      selectedRowIds,
      onSelectedRowIdsChange: setSelectedRowIds,
    }),
    [
      activePreset,
      positionFilter,
      searchQuery,
      selectedRowIds,
      setActivePreset,
      setPositionFilter,
      setSearchQuery,
      setSelectedRowIds,
    ],
  )

  if (world === null || context === null || team === undefined) {
    return (
      <div className="roster-workspace roster-workspace--empty" data-ng-region="roster-workspace">
        <section className="roster-workspace__empty-state">
          <h1 className="roster-workspace__empty-title">Roster</h1>
          <p className="roster-workspace__empty-message">No team assigned to the user coach.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="roster-workspace" data-ng-region="roster-workspace">
      <ApplicationWorkspace header={<RosterWorkspaceHeader context={context} />}>
        <div className="roster-workspace__body">
          <ScrollRegion
            className="roster-workspace__scroll"
            onScroll={persistScroll}
            ref={scrollRef}
          >
            <CanonicalRoster
              onLineupSlotChange={(slot: LineupSlot, playerId) => setLineupSlot(slot, playerId)}
              onLineupSlotClear={(slot: LineupSlot) => clearLineupSlot(slot)}
              onOpenEntity={openPlayerFromRoster}
              sessionBridge={sessionBridge}
              team={team}
              variant="ng"
              world={world}
            />
          </ScrollRegion>
        </div>
      </ApplicationWorkspace>
    </div>
  )
}
