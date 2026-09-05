import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'

import type { LineupSlot } from '@/domain/tactics'
import type { PlayerId } from '@/domain/ids'

import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { CanonicalRoster } from '@/ui/pcb-migrated/plantilla/CanonicalRoster'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import { RosterContextDeck } from '@/ui-ng/applications/roster/components/RosterContextDeck'
import { RosterDepthChart } from '@/ui-ng/applications/roster/components/RosterDepthChart'
import { RosterWorkspaceHeader } from '@/ui-ng/applications/roster/components/RosterWorkspaceHeader'
import { buildRosterBriefing } from '@/ui-ng/applications/roster/buildRosterBriefing'
import { buildRosterDepthChart } from '@/ui-ng/applications/roster/buildRosterDepthChart'
import {
  buildRosterWorkspaceContext,
  rosterTeamForWorld,
} from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import {
  useRosterWorkspaceSession,
  type RosterNgSessionBridge,
} from '@/ui-ng/applications/roster/rosterWorkspaceSession'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { readNgWorkspaceNavigation } from '@/ui-ng/workspace/workspaceApps'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'

import './roster-workspace.css'

export function RosterWorkspace() {
  const world = useGameStore((state) => state.world)
  const setLineupSlot = useGameStore((state) => state.setLineupSlot)
  const clearLineupSlot = useGameStore((state) => state.clearLineupSlot)
  const { openEntity, teamId: navTeamId } = useNgWorkspaceNavigation()
  const teamId = navTeamId ?? readNgWorkspaceNavigation().teamId
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
    () => (world === null ? null : buildRosterWorkspaceContext(world, teamId)),
    [teamId, world],
  )
  const team = useMemo(
    () => (world === null ? undefined : rosterTeamForWorld(world, teamId)),
    [teamId, world],
  )
  const userTeam = world === null ? undefined : getUserTeam(world)
  const canEditLineup = team !== undefined && userTeam?.id === team.id

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

  const teamStyle = useMemo(() => {
    if (team === undefined) return undefined
    const colors = deriveTeamColors(team.id)
    return {
      '--po-team-primary': colors.primary,
      '--po-team-secondary': colors.secondary,
      '--po-team-muted': colors.muted,
    } as CSSProperties
  }, [team])

  const depthChart = useMemo(
    () => (world === null || team === undefined ? null : buildRosterDepthChart(world, team.id)),
    [team, world],
  )
  const briefing = useMemo(
    () => (world === null || team === undefined ? null : buildRosterBriefing(world, team.id)),
    [team, world],
  )
  const inspectedPlayer = useMemo(() => {
    if (world === null) return undefined
    const inspectedId = selectedRowIds.at(-1)
    return inspectedId === undefined ? undefined : world.players[inspectedId as PlayerId]
  }, [selectedRowIds, world])

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
    <div className="roster-workspace" data-ng-region="roster-workspace" style={teamStyle}>
      <ApplicationWorkspace header={<RosterWorkspaceHeader context={context} />}>
        <div className="roster-workspace__body">
          <ScrollRegion
            className="roster-workspace__scroll"
            onScroll={persistScroll}
            ref={scrollRef}
          >
            <CanonicalRoster
              embedInspector={false}
              onLineupSlotChange={
                canEditLineup ? (slot: LineupSlot, playerId) => setLineupSlot(slot, playerId) : undefined
              }
              onLineupSlotClear={canEditLineup ? (slot: LineupSlot) => clearLineupSlot(slot) : undefined}
              onOpenEntity={openPlayerFromRoster}
              sessionBridge={sessionBridge}
              team={team}
              variant="ng"
              world={world}
            />
          </ScrollRegion>
          {briefing !== null && (
            <RosterContextDeck
              briefing={briefing}
              onOpenPlayer={(player) =>
                openPlayerFromRoster({ type: 'player', playerId: player.id, section: 'overview' })
              }
              player={inspectedPlayer}
              teamId={team.id}
              world={world}
            />
          )}
          {depthChart !== null && (
            <RosterDepthChart
              model={depthChart}
              onOpenPlayer={openPlayerFromRoster}
              selectedPlayerId={inspectedPlayer?.id}
            />
          )}
        </div>
      </ApplicationWorkspace>
    </div>
  )
}
