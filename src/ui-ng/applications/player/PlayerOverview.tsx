import type { CSSProperties } from 'react'



import './player-overview.css'



import { useEffect, useMemo, useState } from 'react'



import { EntityIdentityBand } from '@/ui-ng/applications/player/components/EntityIdentityBand'

import { PerformanceStrip, FormTimeline } from '@/ui-ng/applications/player/components/PerformanceLanes'

import { PlayerWorkspaceHeader } from '@/ui-ng/applications/player/components/PlayerWorkspaceHeader'

import { RatingInspectorDetail } from '@/ui-ng/applications/player/components/RatingInspectorDetail'

import { RatingMatrix } from '@/ui-ng/applications/player/components/RatingMatrix'

import { AttributeProfilePanel, ShotProfileCourt } from '@/ui-ng/applications/player/components/ShotProfileCourt'

import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'

import { usePlayerWorkspaceModel } from '@/ui-ng/applications/player/data/usePlayerWorkspaceModel'

import { PlayerWorkspaceProvider, usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

import { WORKSPACE_TABS } from '@/ui-ng/applications/player/playerStructuralData'

import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'

import { InspectorPane } from '@/ui-ng/workspace/InspectorPane'

import { WorkspaceBody } from '@/ui-ng/workspace/WorkspaceBody'

import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'



function PlayerOverviewContent() {

  const { model, emptyState } = usePlayerWorkspace()

  const [selectedRatingId, setSelectedRatingId] = useState<string | null>(null)

  const [selectedCategory, setSelectedCategory] = useState<RatingCategory | null>(null)

  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)

  const activeRatingId = useMemo(() => {
    if (model === null) return null
    if (selectedRatingId !== null && model.ratings.some((rating) => rating.id === selectedRatingId)) {
      return selectedRatingId
    }
    return model.ratings[0]?.id ?? null
  }, [model, selectedRatingId])

  useEffect(() => {

    if (model === null) {

      setSelectedRatingId(null)

      return

    }

    if (selectedRatingId === null || !model.ratings.some((rating) => rating.id === selectedRatingId)) {

      setSelectedRatingId(model.ratings[0]?.id ?? null)

    }

  }, [model, selectedRatingId])



  const teamStyle = useMemo(() => {

    if (model === null) return undefined

    return {

      '--po-team-primary': model.identity.teamColors.primary,

      '--po-team-secondary': model.identity.teamColors.secondary,

      '--po-team-muted': model.identity.teamColors.muted,

    } as CSSProperties

  }, [model])



  if (emptyState !== null || model === null || activeRatingId === null) {

    return (

      <div className="po-root po-root--empty">

        <section className="po-empty-state">

          <h1 className="po-empty-state__title">Player Workspace</h1>

          <p className="po-empty-state__message">{emptyState?.message ?? 'Player data is unavailable.'}</p>

        </section>

      </div>

    )

  }



  const handleCategorySelect = (category: RatingCategory) => {

    const nextCategory = selectedCategory === category ? null : category

    setSelectedCategory(nextCategory)



    if (nextCategory === null) {

      return

    }



    const firstInCategory = model.ratings.find((rating) => rating.category === nextCategory)

    if (firstInCategory !== undefined) {

      setSelectedRatingId(firstInCategory.id)

    }

  }



  const handleRatingSelect = (id: string) => {

    if (id === activeRatingId && selectedCategory !== null) {

      setSelectedCategory(null)

      return

    }



    setSelectedRatingId(id)

    const rating = model.ratings.find((entry) => entry.id === id)

    if (rating !== undefined) {

      setSelectedCategory(rating.category)

    }

  }



  return (

    <div className="po-root" style={teamStyle}>

      <ApplicationWorkspace

        header={<PlayerWorkspaceHeader />}

        tabs={<WorkspaceTabs tabs={WORKSPACE_TABS} />}

      >

        <WorkspaceBody

          inspector={

            <InspectorPane

              collapsed={inspectorCollapsed}

              onToggleCollapse={() => setInspectorCollapsed((value) => !value)}

              title="Rating Detail"

            >

              <RatingInspectorDetail ratingId={activeRatingId} />

            </InspectorPane>

          }

          main={

            <div className="po-overview" data-ng-region="player-overview">

              <EntityIdentityBand />

              <div className="po-overview__core">

                <AttributeProfilePanel

                  onCategorySelect={handleCategorySelect}

                  selectedCategory={selectedCategory}

                />

                <RatingMatrix

                  categoryFilter={selectedCategory}

                  onSelect={handleRatingSelect}

                  selectedId={activeRatingId}

                />

              </div>

              <div className="po-performance-deck" data-ng-region="performance-deck">

                <PerformanceStrip />

                <FormTimeline />

                <ShotProfileCourt />

              </div>

            </div>

          }

        />

      </ApplicationWorkspace>

    </div>

  )

}



export function PlayerOverview() {

  const workspaceState = usePlayerWorkspaceModel(

    new URLSearchParams(window.location.search).get('playerId'),

  )



  return (

    <PlayerWorkspaceProvider value={workspaceState}>

      <PlayerOverviewContent />

    </PlayerWorkspaceProvider>

  )

}


