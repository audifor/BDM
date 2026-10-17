import { useMemo, useState } from 'react'

import { getRelationshipsForPerson } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { CoachCareerScreen } from '@/ui-ng/applications/coach/CoachCareerScreen'
import { CoachDevelopmentWorkspace } from '@/ui-ng/applications/coach/CoachDevelopmentWorkspace'
import { CoachLegacyScreen } from '@/ui-ng/applications/coach/CoachLegacyScreen'
import { CoachOpportunitiesScreen } from '@/ui-ng/applications/coach/CoachOpportunitiesScreen'
import { CoachOverviewScreen } from '@/ui-ng/applications/coach/CoachOverviewScreen'
import { CoachReputationScreen } from '@/ui-ng/applications/coach/CoachReputationScreen'
import { buildCoachOverviewModel } from '@/ui-ng/applications/coach/coachOverviewModel'
import { CoachRelationshipsPanel } from '@/ui-ng/applications/coach/CoachRelationshipsPanel'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import './coach-courtside.css'

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
    return <NgHoloShell className="coach-courtside-ng" appLabel="Coach" empty emptyMessage="No career loaded." region="coach-workspace" />
  }

  const coach = world.coaches[world.userCoachId]
  const rpg = world.coachRpgProfilesByCoachId[world.userCoachId]
  const staffProfile = coach === undefined ? undefined : world.staffPeopleById[coach.staffProfileId]
  if (coach === undefined || staffProfile === undefined) {
    return <NgHoloShell className="coach-courtside-ng" appLabel="Coach" empty emptyMessage="Coach profile unavailable." region="coach-workspace" />
  }

  const headCoachAssignment = Object.values(world.teamStaffAssignmentsById).find(
    (assignment) => assignment.staffPersonId === staffProfile.id && assignment.role === 'headCoach',
  )
  const relationships = getRelationshipsForPerson(world, coach.id)
  const teamName = headCoachAssignment === undefined
    ? 'Unemployed'
    : world.teams[headCoachAssignment.teamId]?.name ?? 'Unassigned'
  // Every child screen navigates by tab id; ignore anything that is not a real tab.
  const openTab = (id: string) => {
    if (TABS.some((entry) => entry.id === id)) setTab(id as (typeof TABS)[number]['id'])
  }

  return (
    <NgHoloShell
      className="coach-courtside-ng"
      activeTabId={tab}
      appLabel="Coach"
      meta={teamName}
      onTabSelect={(id) => setTab(id as (typeof TABS)[number]['id'])}
      region="coach-workspace"
      tabs={TABS}
      teamId={headCoachAssignment?.teamId}
      title={`${staffProfile.identity.firstName} ${staffProfile.identity.lastName}`}
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
      {tab === 'relationships' ? <CoachRelationshipsPanel world={world} relationships={relationships} /> : null}
      {tab === 'development' ? (
        rpg === undefined ? (
          <p className="ng-canon__empty">Coach development data is not available for this career.</p>
        ) : (
          <CoachDevelopmentWorkspace onDevelopSkill={purchaseUserCoachSkill} onPurchasePerk={purchaseUserCoachPerk} rpg={rpg} />
        )
      ) : null}
      {tab === 'legacy' ? <CoachLegacyScreen onOpenTab={openTab} /> : null}
    </NgHoloShell>
  )
}
