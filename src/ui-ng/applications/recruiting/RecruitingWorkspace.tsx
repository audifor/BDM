import { useState } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { useGameStore } from '@/stores/gameStore'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'

const REASON_TEXT: Readonly<Record<string, string>> = {
  RECRUITING_NOT_OPEN: 'The recruiting window is closed.',
  INVALID_RECRUIT: 'This recruit is not part of the active cycle.',
  INSUFFICIENT_RECRUITING_CAPACITY: 'No recruiting capacity remains.',
  DUPLICATE_OFFER: 'An active offer already exists.',
  OFFER_LIMIT_REACHED: 'The offer or signing limit was reached.',
  RECRUIT_ALREADY_COMMITTED: 'This recruit is no longer available.',
  NO_CONTROLLED_PROGRAM: 'You do not control an NCAA program.',
}

export function RecruitingWorkspace() {
  const world = useGameStore((state) => state.world)
  const addRecruitingTarget = useGameStore((state) => state.addRecruitingTarget)
  const removeRecruitingTarget = useGameStore((state) => state.removeRecruitingTarget)
  const performRecruitingAction = useGameStore((state) => state.performRecruitingAction)
  const makeRecruitingOffer = useGameStore((state) => state.makeRecruitingOffer)
  const [feedback, setFeedback] = useState<string | null>(null)

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
  const profiles = Object.values(world.recruitProfilesById).sort((left, right) => left.publicRank - right.publicRank)
  const cycle = Object.values(world.recruitingCyclesById).find((item) => item.status === 'open' || item.status === 'signing')
  const run = (callback: () => string | null) => {
    const reason = callback()
    setFeedback(reason === null ? 'Action completed.' : (REASON_TEXT[reason] ?? reason))
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
      {feedback !== null ? <p className="ng-canon__note">{feedback}</p> : null}
      {profiles.length === 0 ? (
        <p className="ng-canon__empty">No recruit profiles in the world.</p>
      ) : (
        <div className="ng-canon__panel ng-holo-panel">
          <NgPrecisionTable
            className="ng-canon__table"
            columns={[
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
              ngCol('interest', 'Interest', (row) => row.interestLabel, { value: (row) => row.interest ?? -1 }),
              ngCol('status', 'Status', (row) => row.status, { value: (row) => row.status }),
              ngCol('actions', 'Actions', (row) =>
                controlled && cycle !== undefined ? (
                  <div className="ng-canon__actions">
                    {row.board === undefined ? (
                      <button className="ng-canon__action" onClick={() => addRecruitingTarget(cycle.id, row.id, 'normal')} type="button">
                        Target
                      </button>
                    ) : (
                      <button className="ng-canon__action" onClick={() => removeRecruitingTarget(row.id)} type="button">
                        Remove
                      </button>
                    )}
                    <button className="ng-canon__action" onClick={() => run(() => performRecruitingAction(cycle.id, row.id, 'contact'))} type="button">
                      Contact
                    </button>
                    <button className="ng-canon__action" onClick={() => run(() => performRecruitingAction(cycle.id, row.id, 'pitch'))} type="button">
                      Pitch
                    </button>
                    <button className="ng-canon__action" onClick={() => run(() => performRecruitingAction(cycle.id, row.id, 'visit'))} type="button">
                      Visit
                    </button>
                    <button className="ng-canon__action" onClick={() => run(() => makeRecruitingOffer(cycle.id, row.id))} type="button">
                      Offer
                    </button>
                  </div>
                ) : null,
              ),
            ]}
            gridId="ng-recruiting"
            rows={profiles.map((profile) => {
              const player = world.players[profile.playerId]
              const interest =
                team === undefined
                  ? undefined
                  : world.recruitingInterests.find((item) => item.recruitId === profile.id && item.programTeamId === team.id)?.value
              return {
                id: profile.id,
                playerId: profile.playerId,
                player,
                publicRank: profile.publicRank,
                position: profile.position,
                tier: profile.tier,
                status: profile.status,
                interest,
                interestLabel:
                  interest === undefined
                    ? 'Cold'
                    : interest >= 75
                      ? 'Leader'
                      : interest >= 55
                        ? 'Strong'
                        : interest >= 30
                          ? 'Warm'
                          : 'Interested',
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
