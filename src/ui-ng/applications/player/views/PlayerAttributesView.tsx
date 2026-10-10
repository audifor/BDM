import { CATEGORY_LABELS } from '@/ui-ng/applications/player/data/ratingCatalog'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { PlayerCourtsideAttributes } from '@/ui-ng/applications/player/views/PlayerCourtsideAttributes'

/**
 * Canonical Courtside Attributes landing. The old duplicated NG analysis board
 * has been retired from this screen at the user's request. Knowledge-limited
 * scouting remains separate, so undiscovered ratings are never exposed.
 */
export function PlayerAttributesView() {
  const { model } = usePlayerWorkspace()
  if (model === null) return null

  if (model.knowledgeAccess.kind !== 'own-roster') {
    const knownRatings = model.knowledgeAccess.ratingEvaluations.filter((entry) => entry.evaluation !== null)
    return (
      <section className="po-attributes po-at-board" data-ng-region="player-attributes">
        <header>
          <h2>Scouted ratings</h2>
          <p className="po-lane-empty">
            {knownRatings.length === 0
              ? 'Not scouted. Individual ratings are unknown.'
              : `${knownRatings.length} of ${model.knowledgeAccess.ratingEvaluations.length} individual ratings have scouting information. Estimates remain organization-specific.`}
          </p>
          {model.knowledgeAccess.knownDimensions.length > 0 && (
            <p className="po-lane-empty">Aggregate view: {model.knowledgeAccess.knownDimensions.map((entry) => `${entry.label} ${entry.displayLabel}`).join(' · ')}</p>
          )}
        </header>
        <div className="po-at-scouted-families">
          {Object.entries(CATEGORY_LABELS).map(([family, familyLabel]) => {
            const rows = model.knowledgeAccess.ratingEvaluations.filter((entry) => entry.family === family)
            return (
              <section className="po-at-scouted-family" key={family}>
                <h3>{familyLabel}</h3>
                <dl className="player-profile__ratings">
                  {rows.map((rating) => (
                    <div key={rating.id}>
                      <dt>{rating.label}</dt>
                      <dd title={rating.evaluation === null ? 'Not scouted' : `${rating.evaluation.confidence}% confidence · ${rating.coveragePercent}% coverage`}>
                        {rating.displayLabel}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div className="pac-workspace" data-ng-region="player-attributes">
      <PlayerCourtsideAttributes />
    </div>
  )
}
