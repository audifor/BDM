import { useState } from 'react'

import { getRelationshipsForPerson } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { CoachDevelopmentWorkspace } from '@/ui-ng/applications/coach/CoachDevelopmentWorkspace'
import { CoachRelationshipsPanel } from '@/ui-ng/applications/coach/CoachRelationshipsPanel'
import { CoachFactsWorkspace, type CoachFactsTab } from '@/ui-ng/applications/coach/CoachFactsWorkspace'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import './coach-courtside.css'
import './coach-truth.css'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'development', label: 'Development' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'reputation', label: 'Reputation' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'career', label: 'Career' },
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
      {tab !== 'development' && tab !== 'relationships' ? (
        <CoachFactsWorkspace
          tab={tab as CoachFactsTab}
          world={world}
          onNavigate={openTab}
          onApply={applyUserCoachForJob}
          onAcceptOffer={acceptUserCoachOffer}
          onDeclineOffer={declineUserCoachOffer}
        />
      ) : null}
      {tab === 'relationships' ? <CoachRelationshipsPanel world={world} relationships={relationships} /> : null}
      {tab === 'development' ? (
        rpg === undefined ? (
          <p className="ng-canon__empty">Coach development data is not available for this career.</p>
        ) : (
          <CoachDevelopmentWorkspace onDevelopSkill={purchaseUserCoachSkill} onPurchasePerk={purchaseUserCoachPerk} rpg={rpg} />
        )
      ) : null}
    </NgHoloShell>
  )
}
