import { useState } from 'react'

import { getCoachActiveNarratives, getTopNarratives } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'historic', label: 'Historic' },
] as const

const LABELS: Readonly<Record<string, string>> = {
  formerClub: 'Return to a former club',
  revenge: 'Revenge',
  rivalry: 'Sporting rivalry',
  formerPlayer: 'Reunion with a former player',
  promotionJourney: 'Promotion journey',
  dynasty: 'A dominant era',
}

export function NarrativesWorkspace() {
  const world = useGameStore((state) => state.world)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('active')

  if (world === null) {
    return <NgHoloShell appLabel="Stories" empty emptyMessage="No career loaded." region="narratives-workspace" />
  }

  const active = getCoachActiveNarratives(world, world.userCoachId)
  const historic = getTopNarratives(world).filter((thread) => thread.status === 'resolved' || thread.status === 'historic')
  const rows = tab === 'active' ? active : historic

  return (
    <NgHoloShell
      activeTabId={tab}
      appLabel="Stories"
      meta={`${active.length} active`}
      onTabSelect={(id) => setTab(id as (typeof TABS)[number]['id'])}
      region="narratives-workspace"
      tabs={TABS}
      title="Career narratives"
    >
      {rows.length === 0 ? (
        <p className="ng-canon__empty">{tab === 'active' ? 'No active stories yet.' : 'Resolved stories will appear here.'}</p>
      ) : (
        <div className="ng-canon__cards">
          {rows.map((thread) => (
            <article className="ng-canon__card ng-holo-panel" key={thread.id}>
              <p className="ng-canon__eyebrow">{thread.status}</p>
              <h3 className="ng-canon__title">{LABELS[thread.type] ?? thread.type}</h3>
              <p className="ng-canon__note">Relevance {thread.relevance}</p>
              <p className="ng-canon__note">Last beat: {thread.beats[thread.beats.length - 1]?.kind ?? '—'}</p>
            </article>
          ))}
        </div>
      )}
    </NgHoloShell>
  )
}
