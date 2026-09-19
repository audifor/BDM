import { useMemo } from 'react'

import {
  ArchetypePanel,
  KnowledgeAreasPanel,
  ObservedGamesPanel,
  PersonalityPanel,
  PotentialAssessmentPanel,
  ProjectedRolesPanel,
  ScoutConsensusPanel,
  ScoutNotesPanel,
  ScoutedAttributePanel,
  ScoutingActionsPanel,
  ScoutingStatusPanel,
  TeamFitPanel,
} from '@/ui-ng/applications/player/components/ScoutingBoardPanels'
import { buildPlayerScoutingModel } from '@/ui-ng/applications/player/data/buildPlayerScoutingModel'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { useGameStore } from '@/stores/gameStore'

/**
 * PLAYER · SCOUTING REPORT — the reference's four bands: what the club knows, what it believes, how
 * much it trusts that, and what it has actually watched.
 *
 * Every reading here is knowledge, not truth: ranges instead of values, a knowledge state beside each
 * one, and an explicit `unknown` wherever the save holds nothing. Hidden ceilings are never shown.
 */
export function PlayerScoutingReportView() {
  const { model, playerId } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)

  const scouting = useMemo(
    () => (world === null || playerId === null ? null : buildPlayerScoutingModel(world, playerId)),
    [world, playerId],
  )

  if (model === null || scouting === null) return null

  if (scouting.status === 'unavailable' && scouting.statusPanel === null) {
    return (
      <div className="po-sc-board" data-ng-region="player-scouting">
        <section className="po-sc-panel po-sc-empty-panel">
          <p className="po-sc-empty">{scouting.unavailableLabel}</p>
        </section>
      </div>
    )
  }

  const notesGap = scouting.gaps.find((gap) => gap.id === 'scout-notes')
  const gameNotesGap = scouting.gaps.find((gap) => gap.id === 'game-notes')

  return (
    <div className="po-sc-board" data-ng-region="player-scouting">
      {/* Band 1 — status, then the six knowledge areas. */}
      <div className="po-sc-band po-sc-band--status">
        {scouting.statusPanel !== null && <ScoutingStatusPanel status={scouting.statusPanel} />}
        <KnowledgeAreasPanel areas={scouting.knowledgeAreas} />
      </div>

      {/* Band 2 — the scouted profile, the consensus, the archetype and the actions. */}
      <div className="po-sc-band po-sc-band--profile">
        <ScoutedAttributePanel rows={scouting.attributes} />
        <ScoutConsensusPanel
          note={scouting.consensusNote}
          rows={scouting.consensus}
          summary={scouting.consensusSummary}
        />
        <ArchetypePanel
          roleTitle={scouting.archetypeRoleTitle}
          strengths={scouting.strengths}
          tags={scouting.archetypeTags}
          title={scouting.archetypeTitle}
          weaknesses={scouting.weaknesses}
        />
        <ScoutingActionsPanel note={scouting.actionsNote} />
      </div>

      {/* Band 3 — projection, potential, character and fit. */}
      <div className="po-sc-band po-sc-band--projection">
        <ProjectedRolesPanel note={scouting.projectedRolesNote} roles={scouting.projectedRoles} />
        <PotentialAssessmentPanel
          note={scouting.potentialNote}
          outcomes={scouting.potentialOutcomes}
        />
        <PersonalityPanel note={scouting.personalityNote} rows={scouting.personalityTraits} />
        <TeamFitPanel
          note={scouting.teamFitNote}
          overallLabel={scouting.overallFitLabel}
          rows={scouting.teamFit}
        />
      </div>

      {/* Band 4 — what has actually been watched, and the filing timeline. */}
      <div className="po-sc-band po-sc-band--games">
        <ObservedGamesPanel
          games={scouting.observedGames}
          notesReason={gameNotesGap?.reason ?? 'No per-game note is stored.'}
        />
        <ScoutNotesPanel
          notes={scouting.consensusNote}
          onEmpty={notesGap?.reason ?? 'No report has been filed for this player.'}
          timeline={scouting.noteTimeline}
        />
      </div>
    </div>
  )
}
