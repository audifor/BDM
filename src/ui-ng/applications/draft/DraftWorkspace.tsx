import { useState } from 'react'
import { formatRatingEvaluation, getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { getPlayerAge } from '@/domain/player'
import { getUserTeam } from '@/engine/calendar'
import { assessNbaDraftEligibility, getAiDraftBoard, getCurrentDraftPick, getDraftPicks } from '@/engine/draft'
import { advisePlayerCareerPathway, estimatePlayerDraftOutlook } from '@/engine/career'
import { useGameStore } from '@/stores/gameStore'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { DraftPlayerStatus } from './DraftPlayerStatus'
import { TalentOperationsNav } from '@/ui-ng/applications/talent/TalentOperationsNav'

export function DraftWorkspace() {
  const world = useGameStore((state) => state.world)
  const selectDraftProspect = useGameStore((state) => state.selectDraftProspect)
  const considerEntry = useGameStore((state) => state.considerDraftEntry)
  const declareEntry = useGameStore((state) => state.declareDraftEntry)
  const withdrawEntry = useGameStore((state) => state.withdrawDraftEntry)
  const [careerActionError, setCareerActionError] = useState<string | null>(null)
  const [focusPlayerId] = useState(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('focusPlayerId'))

  if (world === null) {
    return <NgHoloShell appLabel="Draft" empty emptyMessage="No career loaded." region="draft-workspace" />
  }

  const drafts = Object.values(world.draftsById).sort((left, right) => right.scheduledOn.localeCompare(left.scheduledOn) || left.id.localeCompare(right.id))
  const team = getUserTeam(world)
  const teamEcosystem = team === undefined ? undefined : Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(team.id))?.ecosystemId
  const playerPathwayDraft = drafts.find((draft) => draft.status === 'scheduled')
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
      <TalentOperationsNav current="draft" />
      {drafts.map((draft) => {
        const current = getCurrentDraftPick(world, draft.id)
        const board = getAiDraftBoard(world, draft.id, team?.id)
        const picks = getDraftPicks(world, draft.id)
        const draftedPlayerIds = new Set(picks.flatMap((pick) => pick.selection === undefined ? [] : [pick.selection.playerId]))
        const draftRights = Object.values(world.playerRightsById).filter((rights) => rights.rightsType === 'draft' && draftedPlayerIds.has(rights.playerId))
        const userOnClock = current !== undefined && current.ownerTeamId === team?.id
        const currentOwner = current === undefined ? undefined : world.teams[current.ownerTeamId]
        const boardOrganizationId = team?.organizationId ?? currentOwner?.organizationId
        const boardRows = board.map((ranking) => {
          const player = world.players[ranking.playerId]!
          return { ...ranking, id: ranking.playerId, player, evaluation: boardOrganizationId === undefined ? 'Unknown' : formatRatingEvaluation(getOrganizationRatingEvaluation({ organizationId: boardOrganizationId, playerId: player.id, dimension: 'shooting', knowledge: world.organizationKnowledge, currentDate: world.currentDate, publicPosition: player.basketball.primaryPosition })) }
        })
        const visibleBoardRows = focusPlayerId ? boardRows.filter((row) => row.player.id === focusPlayerId) : boardRows
        return (
          <article className="ng-canon__panel ng-holo-panel" key={draft.id} style={{ marginBottom: 'var(--ng-spacing-12)' }}>
            <p className="ng-canon__eyebrow">{world.ecosystems[draft.ecosystemId]?.name ?? draft.ecosystemId}</p>
            <h3 className="ng-canon__title">{world.seasons[draft.sourceSeasonId]?.label ?? draft.sourceSeasonId} Draft</h3>
            {focusPlayerId && world.players[focusPlayerId as keyof typeof world.players] ? <p className="ng-canon__note">Focused on {world.players[focusPlayerId as keyof typeof world.players]!.firstName} {world.players[focusPlayerId as keyof typeof world.players]!.lastName}.</p> : null}
            <p className="ng-canon__note">
              Status {draft.status}
              {current === undefined
                ? ' · Completed'
                : ` · Round ${current.round} · Pick #${current.order} · ${currentOwner?.name ?? current.ownerTeamId}`}
            </p>
            {draft.rules.earlyEntryDeadline ? <p className="ng-canon__note">Early entry {draft.rules.earlyEntryDeadline} · NCAA return {draft.rules.collegeWithdrawalDeadline ?? 'not configured'} · NBA withdrawal {draft.rules.finalWithdrawalDeadline ?? 'not configured'} · Draft {draft.rules.draftDate ?? draft.scheduledOn}</p> : null}
            {team !== undefined && teamEcosystem !== undefined && world.ecosystems[teamEcosystem]?.kind === 'ncaaLike' && playerPathwayDraft?.id === draft.id ? <section aria-label="Player Draft decisions" style={{ margin: 'var(--ng-spacing-8) 0' }}><h4 className="ng-canon__title">Player Draft decisions</h4>{careerActionError ? <p role="alert">{careerActionError}</p> : null}{team.rosterPlayerIds.filter((playerId) => focusPlayerId === null || focusPlayerId === playerId).map((playerId) => { const player = world.players[playerId]!, eligibility = assessNbaDraftEligibility(world, playerId, draft), entry = draft.entries?.find((item) => item.playerId === playerId), outlook = estimatePlayerDraftOutlook(world, playerId), advice = advisePlayerCareerPathway(world, playerId, team.id); const act = (result: string | null) => setCareerActionError(result); return <div className="ng-canon__note" key={playerId}><strong>{player.firstName} {player.lastName}</strong> · outlook {outlook.band} · {entry?.status ?? (eligibility.eligible ? advice.decision : 'not eligible')} · {eligibility.reason}<DraftPlayerStatus world={world} draft={draft} playerId={playerId} />{entry?.collegeReturnAssessment ? <p>College return {entry.collegeReturnAssessment.allowed ? 'allowed' : 'blocked'} · NCAA deadline {entry.collegeReturnAssessment.deadline ?? 'not configured'} · rules {entry.collegeReturnAssessment.rulesetId ?? 'unavailable'} v{entry.collegeReturnAssessment.rulesetVersion ?? 'unknown'} · {entry.collegeReturnAssessment.reasons.join(', ')}</p> : null}<div>{entry?.status === 'declaredEarlyEntry' || entry?.status === 'finalPool' ? <button className="ng-canon__action" onClick={() => act(withdrawEntry(draft.id, playerId))} type="button">Withdraw</button> : eligibility.eligible && entry?.status !== 'withdrawnNBA' && entry?.status !== 'withdrawnNCAAEligible' && entry?.status !== 'withdrawnNCAAIneligible' ? <><button className="ng-canon__action" onClick={() => act(considerEntry(draft.id, playerId))} type="button">Consider Draft</button><button className="ng-canon__action" onClick={() => act(declareEntry(draft.id, playerId))} type="button">Declare</button></> : null}</div></div> })}</section> : null}
            {draft.status === 'inProgress' && userOnClock ? (
              <NgPrecisionTable
                className="ng-canon__table"
                columns={ngTableColumns(boardRows, [
                  ngCol('rank', 'Board', (row) => row.rank, { numeric: true, value: (row) => row.rank }),
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
                  ngCol('production', 'Public production', (row) => row.publicProduction.toFixed(1), { numeric: true, value: (row) => row.publicProduction }),
                  ngCol('confidence', 'Knowledge confidence', (row) => `${row.knowledgeConfidence}`, { numeric: true, value: (row) => row.knowledgeConfidence }),
                  ngCol('entry', 'Entry status', (row) => draft.entries?.find((entry) => entry.playerId === row.player.id)?.status ?? 'eligible', { value: (row) => draft.entries?.find((entry) => entry.playerId === row.player.id)?.status ?? 'eligible' }),
                  ngCol('action', 'Action', (row) => (
                    <button className="ng-canon__action" onClick={() => selectDraftProspect(draft.id, row.player.id)} type="button">
                      Select
                    </button>
                  )),
                ])}
                gridId={`ng-draft-available-${draft.id}`}
                rows={visibleBoardRows}
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
            {draftRights.length > 0 ? <section aria-label="Draft rights and contracts"><h4 className="ng-canon__title">Rights and professional contracts</h4>{draftRights.map((rights) => { const player = world.players[rights.playerId]!; return <div className="ng-canon__note" key={rights.id}><strong>{player.firstName} {player.lastName}</strong><DraftPlayerStatus world={world} draft={draft} playerId={rights.playerId} /></div> })}</section> : null}
          </article>
        )
      })}
    </NgHoloShell>
  )
}
