import { organizationIdForTeam } from '@/domain/ids'
import { formatRatingEvaluation, getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { getPlayerAge } from '@/domain/player'
import { getUserTeam } from '@/engine/calendar'
import { getAvailableDraftProspects, getCurrentDraftPick, getDraftPicks } from '@/engine/draft'
import { useGameStore } from '@/stores/gameStore'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'

export function DraftWorkspace() {
  const world = useGameStore((state) => state.world)
  const selectDraftProspect = useGameStore((state) => state.selectDraftProspect)

  if (world === null) {
    return <NgHoloShell appLabel="Draft" empty emptyMessage="No career loaded." region="draft-workspace" />
  }

  const drafts = Object.values(world.draftsById).sort((left, right) => right.scheduledOn.localeCompare(left.scheduledOn) || left.id.localeCompare(right.id))
  const team = getUserTeam(world)
  if (!resolveGameCapabilities(world).hasDraft || drafts.length === 0) {
    return (
      <NgHoloShell
        appLabel="Draft"
        empty
        emptyMessage={UNAVAILABLE_SECTION_MESSAGE}
        region="draft-workspace"
        teamId={team?.id}
      />
    )
  }

  return (
    <NgHoloShell appLabel="Draft" meta={`${drafts.length} cycles`} region="draft-workspace" teamId={team?.id} title="Draft board">
      {drafts.map((draft) => {
        const current = getCurrentDraftPick(world, draft.id)
        const available = getAvailableDraftProspects(world, draft.id)
        const picks = getDraftPicks(world, draft.id)
        const userOnClock = current !== undefined && current.ownerTeamId === team?.id
        const currentOwner = current === undefined ? undefined : world.teams[current.ownerTeamId]
        return (
          <article className="ng-canon__panel ng-holo-panel" key={draft.id} style={{ marginBottom: 'var(--ng-spacing-12)' }}>
            <p className="ng-canon__eyebrow">{world.ecosystems[draft.ecosystemId]?.name ?? draft.ecosystemId}</p>
            <h3 className="ng-canon__title">{world.seasons[draft.sourceSeasonId]?.label ?? draft.sourceSeasonId} Draft</h3>
            <p className="ng-canon__note">
              Status {draft.status}
              {current === undefined
                ? ' · Completed'
                : ` · Round ${current.round} · Pick #${current.order} · ${currentOwner?.name ?? current.ownerTeamId}`}
            </p>
            {draft.status === 'inProgress' && userOnClock ? (
              <NgPrecisionTable
                className="ng-canon__table"
                columns={ngTableColumns(available.map((playerId) => {
                  const player = world.players[playerId]!
                  return {
                    id: player.id,
                    player,
                    evaluation: formatRatingEvaluation(
                      getOrganizationRatingEvaluation({
                        organizationId: organizationIdForTeam(team!.id),
                        playerId: player.id,
                        dimension: 'shooting',
                        knowledge: world.organizationKnowledge,
                        currentDate: world.currentDate,
                        publicPosition: player.basketball.primaryPosition,
                      }),
                    ),
                  }
                }), [
                  ngCol('prospect', 'Prospect', (row) => (
                    <>
                      <button className="ng-canon__link" onClick={() => navigateToPlayer(row.player.id)} type="button">
                        {row.player.firstName} {row.player.lastName}
                      </button>
                      <span className="ng-canon__note"> · {row.evaluation}</span>
                    </>
                  ), { value: (row) => `${row.player.firstName} ${row.player.lastName}` }),
                  ngCol('pos', 'Pos', (row) => <PlayPositionMark position={row.player.basketball.primaryPosition} />, {
                    value: (row) => row.player.basketball.primaryPosition,
                  }),
                  ngCol('age', 'Age', (row) => getPlayerAge(world, row.player.id), {
                    numeric: true,
                    value: (row) => getPlayerAge(world, row.player.id) ?? 0,
                  }),
                  ngCol('action', 'Action', (row) => (
                    <button className="ng-canon__action" onClick={() => selectDraftProspect(draft.id, row.player.id)} type="button">
                      Select
                    </button>
                  )),
                ])}
                gridId={`ng-draft-available-${draft.id}`}
                rows={available.map((playerId) => {
                  const player = world.players[playerId]!
                  return {
                    id: player.id,
                    player,
                    evaluation: formatRatingEvaluation(
                      getOrganizationRatingEvaluation({
                        organizationId: organizationIdForTeam(team!.id),
                        playerId: player.id,
                        dimension: 'shooting',
                        knowledge: world.organizationKnowledge,
                        currentDate: world.currentDate,
                        publicPosition: player.basketball.primaryPosition,
                      }),
                    ),
                  }
                })}
              />
            ) : draft.status === 'inProgress' ? (
              <p className="ng-canon__note">Selection is unavailable until your team owns the current pick.</p>
            ) : null}
            <NgPrecisionTable
              className="ng-canon__table"
              columns={ngTableColumns(picks, [
                ngCol('round', 'Round', (pick) => pick.round, { numeric: true, value: (pick) => pick.round }),
                ngCol('order', 'Pick', (pick) => `#${pick.order}`, { numeric: true, value: (pick) => pick.order }),
                ngCol('owner', 'Owner', (pick) => world.teams[pick.ownerTeamId]?.name, { value: (pick) => world.teams[pick.ownerTeamId]?.name ?? pick.ownerTeamId }),
                ngCol('selected', 'Selected', (pick) => {
                  const selected = pick.selection === undefined ? undefined : world.players[pick.selection.playerId]
                  return selected === undefined ? 'Pending' : `${selected.firstName} ${selected.lastName}`
                }, { value: (pick) => pick.selection?.playerId ?? '' }),
              ])}
              gridId={`ng-draft-picks-${draft.id}`}
              rows={picks}
            />
          </article>
        )
      })}
    </NgHoloShell>
  )
}
