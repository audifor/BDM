import type { CSSProperties } from 'react'

import './player-overview.css'
import './player-attributes.css'
import './player-performance.css'
import './player-contract.css'

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { GameId } from '@/domain/ids'

import { PlayerWorkspaceHeader } from '@/ui-ng/applications/player/components/PlayerWorkspaceHeader'
import { RatingInspectorDetail } from '@/ui-ng/applications/player/components/RatingInspectorDetail'
import type { PerformanceCompetitionFilter } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'
import { RADAR_CATEGORY_ORDER, type RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import {
  usePlayerWorkspaceModel,
  type PlayerWorkspaceState,
} from '@/ui-ng/applications/player/data/usePlayerWorkspaceModel'
import { PlayerWorkspaceProvider, usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import type { PlayerWorkspaceSession } from '@/ui-ng/applications/player/context/playerWorkspaceSession'
import {
  PLAYER_VIEW_LABELS,
  PLAYER_WORKSPACE_VIEWS,
  parsePlayerWorkspaceView,
  type PlayerWorkspaceViewId,
} from '@/ui-ng/applications/player/playerStructuralData'
import { PlayerAttributesView } from '@/ui-ng/applications/player/views/PlayerAttributesView'
import { PlayerOverviewView } from '@/ui-ng/applications/player/views/PlayerOverviewView'
import {
  PerformanceGameInspectorContent,
  PlayerPerformanceView,
} from '@/ui-ng/applications/player/views/PlayerPerformanceView'
import {
  ContractInspectorContent,
  PlayerContractView,
} from '@/ui-ng/applications/player/views/PlayerContractView'
import { PlayerPlaceholderView } from '@/ui-ng/applications/player/views/PlayerPlaceholderView'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { InspectorPane } from '@/ui-ng/workspace/InspectorPane'
import { WorkspaceBody } from '@/ui-ng/workspace/WorkspaceBody'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'

function syncPlayerViewQuery(view: PlayerWorkspaceViewId) {
  const url = new URL(window.location.href)
  if (view === 'overview') {
    url.searchParams.delete('playerView')
  } else {
    url.searchParams.set('playerView', view)
  }
  window.history.replaceState(window.history.state, '', url)
}

function PlayerWorkspaceShell({ data }: { readonly data: PlayerWorkspaceState }) {
  const { model, emptyState } = data
  const [activeView, setActiveViewState] = useState<PlayerWorkspaceViewId>(() =>
    parsePlayerWorkspaceView(new URLSearchParams(window.location.search).get('playerView')),
  )
  const [selectedRatingId, setSelectedRatingId] =
    useState<PlayerWorkspaceSession['selectedRatingId']>(null)
  const [selectedCategory, setSelectedCategory] = useState<RatingCategory | null>(null)
  const [attributesCategory, setAttributesCategory] = useState<RatingCategory>(RADAR_CATEGORY_ORDER[0]!)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [selectedGameId, setSelectedGameId] = useState<GameId | null>(null)
  const [competitionFilter, setCompetitionFilter] = useState<PerformanceCompetitionFilter>('all')
  const [selectedContractItemId, setSelectedContractItemId] = useState<string | null>(null)

  const setActiveView = useCallback((view: PlayerWorkspaceViewId) => {
    setActiveViewState(view)
    syncPlayerViewQuery(view)
  }, [])

  useEffect(() => {
    if (model === null) {
      setSelectedRatingId(null)
      return
    }

    if (activeView === 'overview') {
      if (selectedRatingId === null || !model.ratings.some((rating) => rating.id === selectedRatingId)) {
        setSelectedRatingId(model.ratings[0]?.id ?? null)
      }
      return
    }

    if (activeView === 'attributes') {
      const category =
        model.attributes.categories.find((entry) => entry.category === attributesCategory) ??
        model.attributes.categories[0]
      if (category === undefined) return
      if (category.category !== attributesCategory) {
        setAttributesCategory(category.category)
      }
      if (selectedRatingId === null || !category.all.some((rating) => rating.id === selectedRatingId)) {
        setSelectedRatingId(category.all[0]?.id ?? null)
      }
    }
  }, [activeView, attributesCategory, model, selectedRatingId])

  useEffect(() => {
    if (model === null) {
      setSelectedGameId(null)
      setCompetitionFilter('all')
      setSelectedContractItemId(null)
      return
    }
    setSelectedGameId(null)
    setCompetitionFilter('all')
    setSelectedContractItemId(model.contract.defaultSelectedItemId)
  }, [model?.identity.playerId])

  const session = useMemo<PlayerWorkspaceSession>(
    () => ({
      activeView,
      setActiveView,
      selectedRatingId,
      setSelectedRatingId,
      selectedCategory,
      setSelectedCategory,
      attributesCategory,
      setAttributesCategory,
      inspectorCollapsed,
      setInspectorCollapsed,
      performance: {
        selectedGameId,
        setSelectedGameId,
        competitionFilter,
        setCompetitionFilter,
      },
      contract: {
        selectedItemId: selectedContractItemId,
        setSelectedItemId: setSelectedContractItemId,
      },
    }),
    [
      activeView,
      attributesCategory,
      competitionFilter,
      inspectorCollapsed,
      selectedCategory,
      selectedContractItemId,
      selectedGameId,
      selectedRatingId,
      setActiveView,
    ],
  )

  const contextValue = useMemo(() => ({ ...data, session }), [data, session])

  if (emptyState !== null || model === null) {
    return (
      <div className="po-root po-root--empty">
        <section className="po-empty-state">
          <h1 className="po-empty-state__title">Player Workspace</h1>
          <p className="po-empty-state__message">{emptyState?.message ?? 'Player data is unavailable.'}</p>
        </section>
      </div>
    )
  }

  return (
    <PlayerWorkspaceProvider value={contextValue}>
      <PlayerWorkspaceLayout activeView={activeView} setActiveView={setActiveView} />
    </PlayerWorkspaceProvider>
  )
}

function PlayerWorkspaceLayout({
  activeView,
  setActiveView,
}: {
  readonly activeView: PlayerWorkspaceViewId
  readonly setActiveView: (view: PlayerWorkspaceViewId) => void
}) {
  const { model, session } = usePlayerWorkspace()
  const { selectedRatingId, inspectorCollapsed, setInspectorCollapsed } = session

  const teamStyle = useMemo(() => {
    if (model === null) return undefined
    return {
      '--po-team-primary': model.identity.teamColors.primary,
      '--po-team-secondary': model.identity.teamColors.secondary,
      '--po-team-muted': model.identity.teamColors.muted,
    } as CSSProperties
  }, [model])

  const tabs = useMemo(
    () =>
      PLAYER_WORKSPACE_VIEWS.map((id) => ({
        id,
        label: PLAYER_VIEW_LABELS[id],
        active: id === activeView,
      })),
    [activeView],
  )

  const inspectorRatingId =
    activeView === 'attributes'
      ? selectedRatingId
      : selectedRatingId ?? model?.ratings[0]?.id ?? null

  return (
    <div className="po-root" style={teamStyle}>
      <ApplicationWorkspace
        header={<PlayerWorkspaceHeader />}
        tabs={
          <WorkspaceTabs
            activeTabId={activeView}
            onTabSelect={(tabId) => setActiveView(tabId as PlayerWorkspaceViewId)}
            tabs={tabs}
          />
        }
      >
        <WorkspaceBody
          inspector={
            activeView === 'contract' ? (
              <InspectorPane
                collapsed={inspectorCollapsed}
                onToggleCollapse={() => setInspectorCollapsed(!inspectorCollapsed)}
                title="Contract Detail"
              >
                <ContractInspectorContent />
              </InspectorPane>
            ) : activeView === 'performance' ? (
              <InspectorPane
                collapsed={inspectorCollapsed}
                onToggleCollapse={() => setInspectorCollapsed(!inspectorCollapsed)}
                title="Game Detail"
              >
                <PerformanceGameInspectorContent />
              </InspectorPane>
            ) : (activeView === 'overview' || activeView === 'attributes') && inspectorRatingId !== null ? (
              <InspectorPane
                collapsed={inspectorCollapsed}
                onToggleCollapse={() => setInspectorCollapsed(!inspectorCollapsed)}
                title="Rating Detail"
              >
                <RatingInspectorDetail ratingId={inspectorRatingId} viewId={activeView} />
              </InspectorPane>
            ) : undefined
          }
          main={
            <div className="po-workspace-content" data-ng-region="player-workspace-content">
              {activeView === 'overview' && <PlayerOverviewView />}
              {activeView === 'attributes' && <PlayerAttributesView />}
              {activeView === 'performance' && <PlayerPerformanceView />}
              {activeView === 'contract' && <PlayerContractView />}
              {(activeView === 'development' ||
                activeView === 'medical' ||
                activeView === 'history') && <PlayerPlaceholderView viewId={activeView} />}
            </div>
          }
        />
      </ApplicationWorkspace>
    </div>
  )
}

export function PlayerWorkspace() {
  const data = usePlayerWorkspaceModel(new URLSearchParams(window.location.search).get('playerId'))
  return <PlayerWorkspaceShell data={data} />
}

/** @deprecated Use PlayerWorkspace. Kept for transitional imports. */
export function PlayerOverview() {
  return <PlayerWorkspace />
}
