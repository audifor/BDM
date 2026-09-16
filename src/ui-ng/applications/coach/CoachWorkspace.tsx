import { useMemo, useState } from 'react'

import { getRelationshipBandForPeople, getRelationshipsForPerson } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { CoachCareerScreen } from '@/ui-ng/applications/coach/CoachCareerScreen'
import { CoachDevelopmentWorkspace } from '@/ui-ng/applications/coach/CoachDevelopmentWorkspace'
import { CoachLegacyScreen } from '@/ui-ng/applications/coach/CoachLegacyScreen'
import { CoachOpportunitiesScreen } from '@/ui-ng/applications/coach/CoachOpportunitiesScreen'
import { CoachOverviewScreen } from '@/ui-ng/applications/coach/CoachOverviewScreen'
import { CoachReputationScreen } from '@/ui-ng/applications/coach/CoachReputationScreen'
import { buildCoachOverviewModel } from '@/ui-ng/applications/coach/coachOverviewModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'career', label: 'Career' },
  { id: 'reputation', label: 'Reputation' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'development', label: 'Development' },
  { id: 'legacy', label: 'Legacy' },
] as const

export function CoachWorkspace() {
  const world = useGameStore((state) => state.world)
  const purchaseUserCoachSkill = useGameStore((state) => state.purchaseUserCoachSkill)
  const purchaseUserCoachPerk = useGameStore((state) => state.purchaseUserCoachPerk)
  const applyUserCoachForJob = useGameStore((state) => state.applyUserCoachForJob)
  const acceptUserCoachOffer = useGameStore((state) => state.acceptUserCoachOffer)
  const declineUserCoachOffer = useGameStore((state) => state.declineUserCoachOffer)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview')
  // The Overview reads a runtime projection of the world; the hook stays unconditional because the
  // empty-world branch below renders a different tree.
  const overviewModel = useMemo(() => (world === null ? null : buildCoachOverviewModel(world)), [world])

  if (world === null) {
    return <NgHoloShell appLabel="Coach" empty emptyMessage="No career loaded." region="coach-workspace" />
  }

  const coach = world.coaches[world.userCoachId]
  const reputation = world.coachReputationProfilesByCoachId[world.userCoachId]
  const rpg = world.coachRpgProfilesByCoachId[world.userCoachId]
  const professional = world.coachProfessionalProfilesByCoachId[world.userCoachId]
  if (coach === undefined || reputation === undefined || rpg === undefined || professional === undefined) {
    return <NgHoloShell appLabel="Coach" empty emptyMessage="Coach profile unavailable." region="coach-workspace" />
  }

  const employment = world.coachEmploymentByCoachId[world.userCoachId]
  const relationships = getRelationshipsForPerson(world, coach.id)
  const teamName =
    employment?.status === 'employed' && employment.teamId !== undefined ? world.teams[employment.teamId]?.name ?? 'Employed' : 'Unemployed'
  const personName = (id: string) => {
    const player = world.players[id as never]
    if (player !== undefined) return `${player.firstName} ${player.lastName}`
    const other = world.coaches[id as never]
    return other === undefined ? id : `${other.firstName} ${other.lastName}`
  }
  // Every child screen navigates by tab id; ignore anything that is not a real tab.
  const openTab = (id: string) => {
    if (TABS.some((entry) => entry.id === id)) setTab(id as (typeof TABS)[number]['id'])
  }

  return (
    <NgHoloShell
      activeTabId={tab}
      appLabel="Coach"
      meta={teamName}
      onTabSelect={(id) => setTab(id as (typeof TABS)[number]['id'])}
      region="coach-workspace"
      tabs={TABS}
      teamId={employment?.teamId}
      title={`${coach.firstName} ${coach.lastName}`}
    >
      {tab === 'overview' ? (
        <CoachOverviewScreen
          model={overviewModel ?? undefined}
          onOpenHistory={() => setTab('career')}
          onOpenTab={openTab}
          onSelectStatus={openTab}
        />
      ) : null}
      {tab === 'opportunities' ? (
        <CoachOpportunitiesScreen
          onAcceptOffer={acceptUserCoachOffer}
          onApplyForJob={applyUserCoachForJob}
          onDeclineOffer={declineUserCoachOffer}
          onOpenTab={openTab}
        />
      ) : null}
      {tab === 'career' ? <CoachCareerScreen onOpenTab={openTab} /> : null}
      {tab === 'reputation' ? <CoachReputationScreen onOpenTab={openTab} /> : null}
      {tab === 'relationships' ? (
        <div className="ng-canon__panel ng-holo-panel">
          {relationships.length === 0 ? (
            <p className="ng-canon__empty">No materialized relationships.</p>
          ) : (
            <NgPrecisionTable
              className="ng-canon__table"
              columns={ngTableColumns(relationships.map((item) => {
                const otherId = item.sourceId === world.userCoachId ? item.targetId : item.sourceId
                return {
                  id: `${item.sourceId}-${item.targetId}`,
                  name: personName(otherId),
                  value: item.value,
                  band: getRelationshipBandForPeople(world, item.sourceId, item.targetId),
                }
              }), [
                ngCol('person', 'Person', (row) => row.name, { value: (row) => row.name }),
                ngCol('value', 'Value', (row) => row.value, { numeric: true, value: (row) => row.value }),
                ngCol('band', 'Band', (row) => row.band, { value: (row) => row.band }),
              ])}
              gridId="ng-coach-relationships"
              rows={relationships.map((item) => {
                const otherId = item.sourceId === world.userCoachId ? item.targetId : item.sourceId
                return {
                  id: `${item.sourceId}-${item.targetId}`,
                  name: personName(otherId),
                  value: item.value,
                  band: getRelationshipBandForPeople(world, item.sourceId, item.targetId),
                }
              })}
            />
          )}
        </div>
      ) : null}
      {tab === 'development' ? (
        <CoachDevelopmentWorkspace onDevelopSkill={purchaseUserCoachSkill} onPurchasePerk={purchaseUserCoachPerk} rpg={rpg} />
      ) : null}
      {tab === 'legacy' ? <CoachLegacyScreen onOpenTab={openTab} /> : null}
    </NgHoloShell>
  )
}
