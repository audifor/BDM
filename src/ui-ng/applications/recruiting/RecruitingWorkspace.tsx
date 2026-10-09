import { useEffect, useState } from 'react'

import { getUserTeam } from '@/engine/calendar'
import type { PlayerId } from '@/domain/ids'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { useGameStore } from '@/stores/gameStore'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { clearRecruitingPlayerFocus, navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { TalentOperationsNav } from '@/ui-ng/applications/talent/TalentOperationsNav'

const REASON_TEXT: Readonly<Record<string, string>> = {
  RECRUITING_NOT_OPEN: 'The recruiting window is closed.',
  NO_UNDISCOVERED_TALENT: 'No eligible undiscovered TalentCohort candidate is available.',
  INVALID_RECRUIT: 'This recruit is not part of the active cycle.',
  INSUFFICIENT_RECRUITING_CAPACITY: 'No recruiting capacity remains.',
  DUPLICATE_OFFER: 'An active offer already exists.',
  OFFER_LIMIT_REACHED: 'The offer or signing limit was reached.',
  RECRUIT_ALREADY_COMMITTED: 'This recruit is no longer available.',
  SIGNING_RULESET_MISSING: 'No current NCAA signing rules are configured for this cycle.',
  SIGNING_PROSPECT_CLASS_NOT_ELIGIBLE: 'This prospect class cannot sign in this configured period.',
  SIGNING_PERIOD_NOT_YET_OPEN: 'The signing period opens at 7:00 a.m.',
  SIGNING_PERIOD_CLOSED: 'No applicable NCAA signing period is open.',
  SIGNING_PERIOD_CLOSED_OR_UNCONFIGURED: 'No applicable NCAA signing period is open or configured.',
  NO_ACTIVE_RECRUITING_PERIOD: 'No configured recruiting period is active on this date.',
  NCAA_RULESET_MISSING: 'This NCAA cycle has no valid recruiting ruleset.',
  RECRUITING_SHUTDOWN: 'Recruiting is fully shut down for this period.',
  DEAD_PERIOD_IN_PERSON_BLOCKED: 'In-person recruiting is prohibited during this dead period.',
  QUIET_PERIOD_OFF_CAMPUS: 'In-person contact is limited to campus during this quiet period.',
  EVALUATION_PERIOD_NO_IN_PERSON_CONTACT: 'Off-campus in-person contact is prohibited during this evaluation period.',
  EVALUATION_CONTEXT_NOT_ALLOWED: 'This event is not authorized for evaluation during this period.',
  JULY_VISIT_RESTRICTION: 'This visit type is restricted during the July evaluation period.',
  VISIT_NOT_ALLOWED_IN_PERIOD: 'Visits are not permitted during this recruiting period.',
  SIGNED_WITH_OTHER_PROGRAM: 'This prospect has formally signed with another program.',
  PROSPECT_COMPETING_TODAY: 'In-person contact is restricted on a prospect competition day.',
  NEGOTIATION_TOPIC_NOT_OPEN: 'There is no active concern for that response.',
  PROMISE_TOPIC_UNSUPPORTED: 'This concern cannot be addressed with a role or support promise.',
  STAFF_HIGH_TOUCH_ACTIVITY_CONFLICT: 'This Staff member already has an incompatible off-campus Recruiting activity today.',
  STAFF_WORKLOAD_CAPACITY_EXHAUSTED: 'This Staff member has no remaining Staff V2 workload capacity.',
  STAFF_RECRUITING_CAPACITY_EXHAUSTED: 'This Staff member has reached today’s Recruiting activity limit.',
  RECRUITING_STAFF_REQUIRED: 'An assigned Staff member is required for this Recruiting action.',
  STAFF_NOT_DESIGNATED_OFF_CAMPUS_RECRUITER: 'An off-campus contact requires an active designated recruiter.',
  OFF_CAMPUS_RECRUITER_DAILY_LIMIT: 'Four designated recruiters have already made off-campus contacts today.',
  OFF_CAMPUS_RECRUITER_DESIGNATION_LIMIT: 'The cycle’s designated recruiter limit has been reached.',
  NO_CONTROLLED_PROGRAM: 'You do not control an NCAA program.',
}

export function RecruitingWorkspace() {
  const world = useGameStore((state) => state.world)
  const addRecruitingTarget = useGameStore((state) => state.addRecruitingTarget)
  const discoverRecruitingTalent = useGameStore((state) => state.discoverRecruitingTalent)
  const removeRecruitingTarget = useGameStore((state) => state.removeRecruitingTarget)
  const performRecruitingAction = useGameStore((state) => state.performRecruitingAction)
  const makeRecruitingOffer = useGameStore((state) => state.makeRecruitingOffer)
  const signRecruit = useGameStore((state) => state.signRecruit)
  const promiseRecruitingRole = useGameStore((state) => state.promiseRecruitingRole)
  const openNegotiation = useGameStore((state) => state.openRecruitingNegotiation)
  const respondToConcern = useGameStore((state) => state.respondToRecruitingConcern)
  const applyPressure = useGameStore((state) => state.applyRecruitingPressure)
  const [feedback, setFeedback] = useState<string | null>(null)
  const readFocus = () => new URLSearchParams(window.location.search).get('focusPlayerId')
  const [focusPlayerId, setFocusPlayerId] = useState(readFocus)
  useEffect(() => {
    const sync = () => setFocusPlayerId(readFocus())
    window.addEventListener('bdm-ng-nav', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('bdm-ng-nav', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  if (world === null) {
    return <NgHoloShell appLabel="Recruiting" empty emptyMessage="No career loaded." region="recruiting-workspace" />
  }

  const team = getUserTeam(world)
  const ncaa = resolveGameCapabilities(world).isNcaa
  if (!ncaa) {
    return (
      <NgHoloShell
        appLabel="Recruiting"
        empty
        emptyMessage={UNAVAILABLE_SECTION_MESSAGE}
        region="recruiting-workspace"
        teamId={team?.id}
      />
    )
  }

  const controlled =
    team !== undefined &&
    Object.values(world.competitions).some(
      (competition) => competition.participantTeamIds.includes(team.id) && world.ecosystems[competition.ecosystemId]?.kind === 'ncaaLike',
    )
  const profiles = Object.values(world.recruitProfilesById).filter((profile) => focusPlayerId === null || profile.playerId === focusPlayerId).sort((left, right) => left.publicRank - right.publicRank)
  const cycle = Object.values(world.recruitingCyclesById).find((item) => item.status === 'open' || item.status === 'signing')
  const run = (callback: () => string | null) => {
    const reason = callback()
    setFeedback(reason === null ? 'Action completed.' : (REASON_TEXT[reason] ?? reason.toLocaleLowerCase().replaceAll('_', ' ')))
  }

  return (
    <NgHoloShell
      appLabel="Recruiting"
      meta={
        controlled
          ? `Capacity ${world.recruitingCapacityByProgramId[team!.id] ?? cycle?.rules.periodCapacity ?? 0}`
          : 'Consultation mode'
      }
      region="recruiting-workspace"
      teamId={team?.id}
      title="Recruiting center"
    >
      <TalentOperationsNav current="recruiting" />
      {focusPlayerId !== null ? <p className="ng-canon__note">Focused Portal Player: {world.players[focusPlayerId as PlayerId]?.firstName ?? ''} {world.players[focusPlayerId as PlayerId]?.lastName ?? 'record unavailable'} · <button className="ng-canon__link" onClick={() => { clearRecruitingPlayerFocus(); setFocusPlayerId(null) }} type="button">Show all recruiting profiles</button></p> : null}
      {feedback !== null ? <p className="ng-canon__note">{feedback}</p> : null}
      {controlled && cycle !== undefined ? (
        <button className="ng-canon__action" onClick={() => run(() => discoverRecruitingTalent(cycle.id))} type="button">
          Discover prospect
        </button>
      ) : null}
      {profiles.length === 0 ? (
        <p className="ng-canon__empty">{focusPlayerId === null ? 'No recruit profiles in the world.' : 'This Player is not in an active Recruiting cycle.'}</p>
      ) : (
        <div className="ng-canon__panel ng-holo-panel">
          <NgPrecisionTable
            className="ng-canon__table"
            columns={ngTableColumns(profiles.map((profile) => {
              const player = world.players[profile.playerId]
              const profileCycle = world.recruitingCyclesById[profile.cycleId]
              const rpg = profile.recruitingRpg
              const relationship = team === undefined ? undefined : rpg?.relationships.filter((item) => item.programTeamId === team.id).reduce((best, item) => Math.max(best, item.rapport), 0)
              const known = team === undefined ? [] : Object.entries(rpg?.intel.find((item) => item.programTeamId === team.id)?.beliefs ?? {}).filter(([, band]) => band !== undefined).map(([dimension]) => dimension)
              return {
                id: profile.id,
                playerId: profile.playerId,
                player,
                publicRank: profile.publicRank,
                position: profile.position,
                tier: profile.tier,
                status: profile.status,
                cycleStatus: profileCycle?.status,
                cycleId: profileCycle?.id,
                relationship,
                relationshipLabel: relationship === undefined ? 'Not established' : relationship >= 55 ? 'Strong rapport' : relationship >= 25 ? 'Building' : 'New contact',
                known,
                committedByProgram: team !== undefined && Object.values(world.recruitingCommitmentsById).some((item) => item.recruitId === profile.id && item.programTeamId === team.id),
                board:
                  team === undefined
                    ? undefined
                    : world.recruitingBoards.find((entry) => entry.recruitId === profile.id && entry.programTeamId === team.id),
              }
            }), [
              ngCol('rank', 'Rank', (row) => row.publicRank, { numeric: true, value: (row) => row.publicRank }),
              ngCol('player', 'Player', (row) =>
                row.player === undefined ? (
                  row.playerId
                ) : (
                  <button className="ng-canon__link" onClick={() => navigateToPlayer(row.player.id)} type="button">
                    {row.player.firstName} {row.player.lastName}
                  </button>
                ), { value: (row) => row.player === undefined ? row.playerId : `${row.player.firstName} ${row.player.lastName}` }),
              ngCol('pos', 'Pos', (row) => <PlayPositionMark position={row.position} />, { value: (row) => row.position }),
              ngCol('tier', 'Tier', (row) => row.tier, { value: (row) => row.tier }),
              ngCol('relationship', 'Relationship', (row) => row.relationshipLabel, { value: (row) => row.relationship ?? -1 }),
              ngCol('knowledge', 'Known priorities', (row) => row.known.length ? row.known.join(', ') : 'Not yet known', { value: (row) => row.known.join(', ') }),
              ngCol('status', 'Status', (row) => row.status, { value: (row) => row.status }),
              ngCol('actions', 'Actions', (row) =>
                controlled && cycle !== undefined ? (
                  <div className="ng-canon__actions">
                    {row.cycleStatus === 'open' && row.cycleId !== undefined && !['signed', 'incoming', 'arrived', 'ineligible', 'unsigned'].includes(row.status) ? <>
                    {row.board === undefined ? (
                      <button className="ng-canon__action" onClick={() => addRecruitingTarget(row.cycleId!, row.id, 'normal')} type="button">
                        Target
                      </button>
                    ) : (
                      <button className="ng-canon__action" onClick={() => removeRecruitingTarget(row.id)} type="button">
                        Remove
                      </button>
                    )}
                    <button className="ng-canon__action" onClick={() => run(() => performRecruitingAction(row.cycleId!, row.id, 'contact'))} type="button">
                      Contact
                    </button>
                    <button className="ng-canon__action" onClick={() => run(() => performRecruitingAction(row.cycleId!, row.id, 'pitch'))} type="button">
                      Pitch
                    </button>
                    <button className="ng-canon__action" onClick={() => run(() => performRecruitingAction(row.cycleId!, row.id, 'visit'))} type="button">
                      Visit
                    </button>
                    <button className="ng-canon__action" onClick={() => run(() => makeRecruitingOffer(row.cycleId!, row.id))} type="button">
                      Offer
                    </button>
                    <button className="ng-canon__action" onClick={() => run(() => promiseRecruitingRole(row.cycleId!, row.id))} type="button">
                      Promise role
                    </button>
                    <button className="ng-canon__action" onClick={() => run(() => openNegotiation(row.cycleId!, row.id))} type="button">
                      Discuss concerns
                    </button>
                    </> : row.status === 'signed' || row.status === 'incoming' || row.status === 'arrived' || row.status === 'ineligible' || row.status === 'unsigned'
                      ? <p className="ng-canon__note">Recruiting closed for this prospect.</p>
                      : row.cycleStatus === 'signing' && row.committedByProgram && row.cycleId !== undefined
                        ? <button className="ng-canon__action" onClick={() => run(() => signRecruit(row.cycleId!, row.id))} type="button">Sign</button>
                        : <p className="ng-canon__note">{row.cycleStatus === 'signing' ? 'Recruiting is closed; only a prospect committed to this program can be signed.' : row.cycleStatus === 'open' ? 'Recruiting closed for this prospect.' : 'Recruiting closed for this cycle.'}</p>}
                    {row.cycleStatus === 'open' && row.cycleId !== undefined && !['signed', 'incoming', 'arrived', 'ineligible', 'unsigned'].includes(row.status) ? (() => {
                      const negotiation = row.player === undefined ? undefined : world.recruitProfilesById[row.id]?.recruitingRpg?.negotiations?.find((item) => item.cycleId === row.cycleId && item.programTeamId === team?.id && item.terminalState === 'active')
                      const topic = negotiation?.unresolvedTopics[0]
                      if (!negotiation || topic === undefined) return null
                      return <>
                        {negotiation.currentConcerns.filter((item) => item.status === 'open').map((item) => <p className="ng-canon__note" key={item.id}>Prospect concern: {item.description}</p>)}
                        <button className="ng-canon__action" onClick={() => run(() => respondToConcern(negotiation.id, topic, 'factualReassurance'))} type="button">Explain concern</button>
                        <button className="ng-canon__action" onClick={() => run(() => respondToConcern(negotiation.id, topic, 'promise'))} type="button">Make assurance</button>
                        <button className="ng-canon__action" onClick={() => run(() => applyPressure(negotiation.id))} type="button">Apply pressure</button>
                      </>
                    })() : null}
                  </div>
                ) : null,
              ),
            ])}
            gridId="ng-recruiting"
            rows={profiles.map((profile) => {
              const player = world.players[profile.playerId]
              const profileCycle = world.recruitingCyclesById[profile.cycleId]
              const rpg = profile.recruitingRpg
              const relationship = team === undefined ? undefined : rpg?.relationships.filter((item) => item.programTeamId === team.id).reduce((best, item) => Math.max(best, item.rapport), 0)
              const actorRelationshipLabel = (actor: 'recruiter'|'headCoach'|'program') => {
                const rapport = team === undefined ? undefined : rpg?.relationships.find((item) => item.programTeamId === team.id && item.actor === actor)?.rapport
                return rapport === undefined ? 'Not established' : rapport >= 55 ? 'Strong rapport' : rapport >= 25 ? 'Building rapport' : 'New relationship'
              }
              const known = team === undefined ? [] : Object.entries(rpg?.intel.find((item) => item.programTeamId === team.id)?.beliefs ?? {}).filter(([, band]) => band !== undefined).map(([dimension]) => dimension)
              return {
                id: profile.id,
                playerId: profile.playerId,
                player,
                publicRank: profile.publicRank,
                position: profile.position,
                tier: profile.tier,
                status: profile.status,
                cycleStatus: profileCycle?.status,
                cycleId: profileCycle?.id,
                relationship,
                relationshipLabel: `Recruiter: ${actorRelationshipLabel('recruiter')} · Head Coach: ${actorRelationshipLabel('headCoach')} · Program: ${actorRelationshipLabel('program')}`,
                known,
                committedByProgram: team !== undefined && Object.values(world.recruitingCommitmentsById).some((item) => item.recruitId === profile.id && item.programTeamId === team.id),
                board:
                  team === undefined
                    ? undefined
                    : world.recruitingBoards.find((entry) => entry.recruitId === profile.id && entry.programTeamId === team.id),
              }
            })}
          />
        </div>
      )}
    </NgHoloShell>
  )
}
