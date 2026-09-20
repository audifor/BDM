import type { CSSProperties } from 'react'

import './player-overview.css'
import './player-attributes.css'
import './player-attributes-board.css'
import './player-performance.css'
import './player-performance-board.css'
import './player-contract.css'
import './player-medical.css'
import './player-medical-board.css'
import './player-development.css'
import './player-development-board.css'
import './player-history.css'
import './player-history-board.css'
import './player-compare.css'
import './player-scouting.css'
import './player-scouting-board.css'
import './player-responsive.css'

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { GameId, InjuryId, PlayerId, SeasonId } from '@/domain/ids'

import { CompareWithPanel } from '@/ui-ng/applications/player/components/CompareWithPanel'
import { EntityIdentityBand } from '@/ui-ng/applications/player/components/EntityIdentityBand'
import { PlayerScoutingReportView } from '@/ui-ng/applications/player/views/PlayerScoutingReportView'
import type {
  PerformanceCompetitionFilter,
  PerformancePhaseFilter,
  PerformanceSplitFilter,
} from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'
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
  ContractInspectorContent,
  PlayerContractView,
} from '@/ui-ng/applications/player/views/PlayerContractView'
import { PlayerPerformanceView } from '@/ui-ng/applications/player/views/PlayerPerformanceView'
import {
  MedicalInspectorContent,
  PlayerMedicalView,
} from '@/ui-ng/applications/player/views/PlayerMedicalView'
import {
  DevelopmentInspectorContent,
  PlayerDevelopmentView,
} from '@/ui-ng/applications/player/views/PlayerDevelopmentView'
import {
  PlayerHistoryView,
} from '@/ui-ng/applications/player/views/PlayerHistoryView'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { InspectorPane } from '@/ui-ng/workspace/InspectorPane'
import { WorkspaceBody } from '@/ui-ng/workspace/WorkspaceBody'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'

import { syncPlayerViewQueryFromApps } from '@/ui-ng/workspace/workspaceApps'

function PlayerWorkspaceShell({
  data,
  urlPlayerView,
}: {
  readonly data: PlayerWorkspaceState
  readonly urlPlayerView: PlayerWorkspaceViewId
}) {
  const { model, emptyState } = data
  const [activeView, setActiveViewState] = useState<PlayerWorkspaceViewId>(urlPlayerView)
  const [selectedRatingId, setSelectedRatingId] =
    useState<PlayerWorkspaceSession['selectedRatingId']>(null)
  const [selectedCategory, setSelectedCategory] = useState<RatingCategory | null>(null)
  const [attributesCategory, setAttributesCategory] = useState<RatingCategory>(RADAR_CATEGORY_ORDER[0]!)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [selectedGameId, setSelectedGameId] = useState<GameId | null>(null)
  const [performanceSeasonId, setPerformanceSeasonId] = useState<SeasonId | null>(null)
  const [competitionFilter, setCompetitionFilter] = useState<PerformanceCompetitionFilter>('all')
  const [phaseFilter, setPhaseFilter] = useState<PerformancePhaseFilter>('all')
  const [splitFilter, setSplitFilter] = useState<PerformanceSplitFilter>('all')
  const [selectedContractItemId, setSelectedContractItemId] = useState<string | null>(null)
  const [selectedMedicalEventId, setSelectedMedicalEventId] = useState<InjuryId | null>(null)
  const [selectedDevelopmentItemId, setSelectedDevelopmentItemId] = useState<string | null>(null)
  const [selectedHistoryItemId, setSelectedHistoryItemId] = useState<string | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [comparePlayerId, setComparePlayerId] = useState<PlayerId | null>(null)

  const openCompare = useCallback(() => setCompareOpen(true), [])
  const closeCompare = useCallback(() => setCompareOpen(false), [])

  const setActiveView = useCallback((view: PlayerWorkspaceViewId) => {
    setActiveViewState(view)
    syncPlayerViewQueryFromApps(view)
  }, [])

  useEffect(() => {
    setActiveViewState(urlPlayerView)
  }, [urlPlayerView])

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
      setPerformanceSeasonId(null)
      setCompetitionFilter('all')
      setPhaseFilter('all')
      setSplitFilter('all')
      setSelectedContractItemId(null)
      setSelectedMedicalEventId(null)
      setSelectedDevelopmentItemId(null)
      setSelectedHistoryItemId(null)
      return
    }
    setSelectedGameId(null)
    setPerformanceSeasonId(null)
    setCompetitionFilter('all')
    setPhaseFilter('all')
    setSplitFilter('all')
    setSelectedContractItemId(model.contract.defaultSelectedItemId)
    setSelectedMedicalEventId(model.medical.defaultSelectedEventId)
    setSelectedDevelopmentItemId(model.development.defaultSelectedItemId)
    setSelectedHistoryItemId(model.history.defaultSelectedItemId)
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
      compare: {
        isOpen: compareOpen,
        playerId: comparePlayerId,
        open: openCompare,
        close: closeCompare,
        setPlayerId: setComparePlayerId,
      },
      performance: {
        selectedGameId,
        setSelectedGameId,
        seasonId: performanceSeasonId,
        setSeasonId: setPerformanceSeasonId,
        competitionFilter,
        setCompetitionFilter,
        phaseFilter,
        setPhaseFilter,
        splitFilter,
        setSplitFilter,
      },
      contract: {
        selectedItemId: selectedContractItemId,
        setSelectedItemId: setSelectedContractItemId,
      },
      medical: {
        selectedEventId: selectedMedicalEventId,
        setSelectedEventId: setSelectedMedicalEventId,
      },
      development: {
        selectedItemId: selectedDevelopmentItemId,
        setSelectedItemId: setSelectedDevelopmentItemId,
      },
      history: {
        selectedItemId: selectedHistoryItemId,
        setSelectedItemId: setSelectedHistoryItemId,
      },
    }),
    [
      activeView,
      attributesCategory,
      closeCompare,
      compareOpen,
      comparePlayerId,
      competitionFilter,
      inspectorCollapsed,
      openCompare,
      performanceSeasonId,
      phaseFilter,
      selectedCategory,
      selectedContractItemId,
      selectedDevelopmentItemId,
      selectedGameId,
      selectedHistoryItemId,
      selectedMedicalEventId,
      selectedRatingId,
      setActiveView,
      splitFilter,
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
  const { inspectorCollapsed, setInspectorCollapsed } = session

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

  return (
    <div className="po-root" style={teamStyle}>
      <ApplicationWorkspace
        identityBand={<EntityIdentityBand />}
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
            ) : activeView === 'medical' ? (
              <InspectorPane
                collapsed={inspectorCollapsed}
                onToggleCollapse={() => setInspectorCollapsed(!inspectorCollapsed)}
                title="Medical Detail"
              >
                <MedicalInspectorContent />
              </InspectorPane>
            ) : activeView === 'development' ? (
              <InspectorPane
                collapsed={inspectorCollapsed}
                onToggleCollapse={() => setInspectorCollapsed(!inspectorCollapsed)}
                title="Development Detail"
              >
                <DevelopmentInspectorContent />
              </InspectorPane>
            ) : undefined
          }
          main={
            <div className="po-workspace-content" data-ng-region="player-workspace-content">
              {activeView === 'overview' && <PlayerOverviewView />}
              {activeView === 'attributes' && <PlayerAttributesView />}
              {activeView === 'performance' && <PlayerPerformanceView />}
              {activeView === 'contract' && <PlayerContractView />}
              {activeView === 'medical' && <PlayerMedicalView />}
              {activeView === 'development' && <PlayerDevelopmentView />}
              {activeView === 'scouting' && <PlayerScoutingReportView />}
              {activeView === 'history' && <PlayerHistoryView />}
            </div>
          }
        />
        <CompareWithPanel />
      </ApplicationWorkspace>
    </div>
  )
}

export function PlayerWorkspace() {
  const urlState = useNgPlayerUrlState()
  const data = usePlayerWorkspaceModel(urlState.playerId)
  return <PlayerWorkspaceShell data={data} urlPlayerView={urlState.playerView} />
}

function useNgPlayerUrlState() {
  const read = () => {
    const params = new URLSearchParams(window.location.search)
    return {
      playerId: params.get('playerId'),
      playerView: parsePlayerWorkspaceView(params.get('playerView')),
    }
  }

  const [urlState, setUrlState] = useState(read)

  useEffect(() => {
    const sync = () => setUrlState(read())
    window.addEventListener('bdm-ng-nav', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('bdm-ng-nav', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  return urlState
}

/** @deprecated Use PlayerWorkspace. Kept for transitional imports. */
export function PlayerOverview() {
  return <PlayerWorkspace />
}
