import { useMemo } from 'react'

import type { PlayerTruthRatingKey } from '@/domain/player'

import { useGameStore } from '@/stores/gameStore'
import { AttributeEvolutionChart } from '@/ui-ng/applications/player/components/AttributeEvolutionChart'
import { AttributeTrainingOptions } from '@/ui-ng/applications/player/components/AttributeTrainingOptions'
import { GapList } from '@/ui-ng/applications/player/components/DeclaredGaps'
import { RatingAttributeRow } from '@/ui-ng/applications/player/components/RatingAttributeRow'
import { AttributeCategoryProfiles } from '@/ui-ng/applications/player/components/AttributeCategoryProfiles'
import { AttributeRadar } from '@/ui-ng/applications/player/components/visual/BasketballVisuals'
import { ordinalPercentile, CATEGORY_LABELS } from '@/ui-ng/applications/player/data/ratingCatalog'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { useStructuralCompact } from '@/ui-ng/system/responsive/useStructuralCompact'

/** How many readings the compact skills and weak-link panels show, as in the reference. */
const COMPACT_LIST_SIZE = 2
/** The centre notes panel draws four readings, the number the reference gives it. */
const NOTES_SIZE = 4
/**
 * Below 600px the current profile + matrix columns no longer fit at their readability widths:
 * 272px profile + 302px matrix + 8px gap + 18px board insets.
 */
const STRUCTURAL_COMPACT_MIN_WIDTH = 600

/**
 * PLAYER · ATTRIBUTES — the reference's three columns: category profiles and the radar on the left,
 * the category matrix with its notes in the centre, and the attribute detail split into its own
 * modules on the right. Everything is derived from the player's canonical ratings and the tracked
 * competition sample; nothing on this board is authored copy.
 */
export function PlayerAttributesView() {
  const { model, session } = usePlayerWorkspace()
  const assignTrainingModuleToPlayer = useGameStore((state) => state.assignTrainingModuleToPlayer)
  const { attributesCategory, setAttributesCategory, selectedRatingId, setSelectedRatingId } = session
  const structuralCompact = useStructuralCompact<HTMLDivElement>(STRUCTURAL_COMPACT_MIN_WIDTH)

  const categoryModel = useMemo(
    () => model?.attributes.categories.find((entry) => entry.category === attributesCategory),
    [attributesCategory, model?.attributes.categories],
  )

  const activeRatingId = useMemo((): PlayerTruthRatingKey | null => {
    if (categoryModel === undefined) return null
    if (
      selectedRatingId !== null &&
      categoryModel.all.some((rating) => rating.id === selectedRatingId)
    ) {
      return selectedRatingId
    }
    return categoryModel.all[0]?.id ?? null
  }, [categoryModel, selectedRatingId])

  if (model === null) return null

  if (categoryModel === undefined || activeRatingId === null) {
    return (
      <div className="po-attributes po-at-board po-attributes--empty">
        <p className="po-lane-empty">No attribute categories available for this player.</p>
      </div>
    )
  }

  const activeRating = categoryModel.all.find((rating) => rating.id === activeRatingId)
  if (activeRating === undefined) return null

  const evolution = model.attributes.evolutionByRating[activeRatingId]
  const league = evolution.league
  const team = evolution.team
  const standing = evolution.standing
  const comparedToLeague =
    league.status !== 'available' || league.average === null
      ? null
      : Math.round((evolution.current - league.average) * 10) / 10
  const comparedToTeam =
    team.status !== 'available' || team.average === null
      ? null
      : Math.round((evolution.current - team.average) * 10) / 10
  const firstSeason = evolution.points[0]
  const slot = evolution.assignment
  const assignSlot =
    slot.status === 'available' &&
    slot.date !== null &&
    slot.startTime !== null &&
    slot.sessionId !== null
      ? { date: slot.date, startTime: slot.startTime, sessionId: slot.sessionId }
      : null
  const roleFitGap = model.attributes.gaps.find((gap) => gap.id === 'role-fit')
  const otherGaps = model.attributes.gaps.filter((gap) => gap.id !== 'role-fit')
  const strengths = model.attributes.signatureSkills.slice(0, NOTES_SIZE)
  const weaknesses = model.attributes.weakLinks.slice(0, Math.max(0, NOTES_SIZE - strengths.length))
  const readings =
    model.attributes.signatureSkills.length + model.attributes.weakLinks.length
  // The radar names its axes as the reference does, with the value under each name.
  const radarAxes = model.radarAxes.map((axis) => ({
    ...axis,
    label: axis.key === 'defense' ? 'Defense' : CATEGORY_LABELS[axis.key],
  }))

  return (
    <div
      className="po-attributes po-at-board"
      data-bdm-attributes-width={structuralCompact.width}
      data-bdm-structural-compact={structuralCompact.isStructuralCompact ? 'true' : 'false'}
      data-ng-region="player-attributes"
      ref={structuralCompact.ref}
    >
      {/* Left column — category profiles over the eight-axis radar. */}
      <div className="po-at-col po-at-col--left">
        <AttributeCategoryProfiles
          categories={model.attributes.categories}
          onSelect={(category) => {
            const nextCategory = model.attributes.categories.find((entry) => entry.category === category)
            setAttributesCategory(category)
            setSelectedRatingId(nextCategory?.all[0]?.id ?? null)
          }}
          selectedCategory={attributesCategory}
          structuralCompact={structuralCompact.isStructuralCompact}
        />

        <section className="po-at-panel po-at-radar">
          <header className="po-at-panel__head">
            <span className="po-at-panel__title">Attribute radar</span>
          </header>
          <div className="po-at-radar__plot">
            <AttributeRadar
              accent="var(--po-ov-cyan)"
              axes={radarAxes}
              onCategorySelect={(category) => {
                setAttributesCategory(category)
                setSelectedRatingId(null)
              }}
              selectedCategory={attributesCategory}
              showValues
            />
          </div>
        </section>
      </div>

      {/* Centre column — the selected category's matrix over its measured notes. */}
      <div className="po-at-col po-at-col--center">
        <section className="po-at-panel po-at-matrix">
          <header className="po-at-matrix__head">
            <h2 className="po-at-matrix__title">{categoryModel.label}</h2>
            <p className="po-at-matrix__note">{categoryModel.note}</p>
          </header>
          <div className="po-at-matrix__table" role="list">
            <div aria-hidden className="po-at-matrix__thead">
              <span>Attribute</span>
              <span>Rating</span>
              <span>Bar</span>
              <span>Δ</span>
              <span>Percentile</span>
            </div>
            {categoryModel.all.map((rating) => {
              const ratingEvolution = model.attributes.evolutionByRating[rating.id]
              return (
                <RatingAttributeRow
                  change={ratingEvolution.changeSinceFirst}
                  id={rating.id}
                  key={rating.id}
                  label={rating.label}
                  onSelect={setSelectedRatingId}
                  percentile={ratingEvolution.standing.percentile}
                  selected={activeRatingId === rating.id}
                  value={rating.value}
                />
              )
            })}
          </div>
        </section>

        <div className="po-at-split po-at-split--notes">
          <section className="po-at-panel po-at-strengths">
          <header className="po-at-panel__head">
            <span className="po-at-panel__title">Strengths &amp; notes</span>
            <span className="po-at-panel__meta">{readings} readings</span>
          </header>
          <ul className="po-at-notes">
            {strengths.map((highlight) => (
              <li className="po-at-note is-positive" key={highlight.id}>
                <span aria-hidden className="po-at-note__glyph">
                  +
                </span>
                <span className="po-at-note__text">
                  <span className="po-at-note__label">{highlight.label}</span>
                  <span className="po-at-note__detail">
                    Rating {highlight.value} ·{' '}
                    {highlight.percentile === null
                      ? 'no competition sample'
                      : `${ordinalPercentile(highlight.percentile)} percentile of the competition`}
                  </span>
                </span>
              </li>
            ))}
            {weaknesses.map((highlight) => (
              <li className="po-at-note is-warning" key={highlight.id}>
                <span aria-hidden className="po-at-note__glyph">
                  −
                </span>
                <span className="po-at-note__text">
                  <span className="po-at-note__label">{highlight.label}</span>
                  <span className="po-at-note__detail">
                    Rating {highlight.value} ·{' '}
                    {highlight.percentile === null
                      ? 'no competition sample'
                      : `${ordinalPercentile(highlight.percentile)} percentile of the competition`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <GapList gaps={otherGaps} />
          </section>

          {/* The training block is what makes this board actionable, so it shares the row. */}
          <section className="po-at-panel po-at-trainings">
            <AttributeTrainingOptions
              evolution={evolution}
              label={activeRating.label}
              onAssign={
                assignSlot === null
                  ? undefined
                  : (moduleId) => {
                      assignTrainingModuleToPlayer({
                        playerId: model.identity.playerId,
                        moduleId,
                        ...assignSlot,
                      })
                    }
              }
            />
          </section>
        </div>
      </div>

      {/* Right column — the attribute detail, then the compact modules of the reference. */}
      <div className="po-at-col po-at-col--right">
        <section className="po-at-panel po-at-detail">
          <header className="po-at-panel__head">
            <span className="po-at-panel__title">Attribute detail</span>
            <span className="po-at-detail__value ng-type-numeric">{activeRating.value}</span>
          </header>
          <span className="po-at-detail__name">{activeRating.label}</span>
          <span className="po-at-detail__description">{evolution.note}</span>

          <dl className="po-at-detail__metrics">
            <div>
              <dt>This season</dt>
              <dd
                className={`ng-type-numeric${evolution.changeSinceFirst > 0 ? ' is-positive' : evolution.changeSinceFirst < 0 ? ' is-negative' : ''}`}
              >
                {evolution.changeSinceFirst === 0
                  ? '—'
                  : `${evolution.changeSinceFirst > 0 ? '+' : ''}${evolution.changeSinceFirst}`}
              </dd>
            </div>
            <div>
              <dt>League average</dt>
              <dd className="ng-type-numeric">
                {league.average === null ? '—' : league.average.toFixed(1)}
              </dd>
            </div>
            <div>
              <dt>Team average</dt>
              <dd className="ng-type-numeric">
                {team.average === null ? '—' : team.average.toFixed(1)}
              </dd>
            </div>
            <div>
              <dt>Position average ({standing.positionLabel})</dt>
              <dd className="ng-type-numeric">
                {standing.positionAverage === null ? '—' : standing.positionAverage.toFixed(1)}
              </dd>
            </div>
            <div>
              <dt>Percentile</dt>
              <dd className="ng-type-numeric is-accent">
                {standing.percentile === null ? '—' : ordinalPercentile(standing.percentile)}
              </dd>
            </div>
          </dl>

          <div className="po-at-detail__history">
            <AttributeEvolutionChart
              evolution={evolution}
              label={activeRating.label}
              title={`History (${evolution.points.length} recorded ${evolution.points.length === 1 ? 'season' : 'seasons'})`}
            />
          </div>

          <span className="po-at-detail__note">
            {standing.status !== 'available'
              ? standing.note
              : `${standing.note} ${league.status === 'available' ? `${league.sampleSize} rivals; player ${comparedToLeague === null ? '—' : `${comparedToLeague > 0 ? '+' : ''}${comparedToLeague}`} over the league average.` : league.note} ${team.status === 'available' ? `${team.sampleSize} teammates; player ${comparedToTeam === null ? '—' : `${comparedToTeam > 0 ? '+' : ''}${comparedToTeam}`} over the team average.` : team.note}`}
          </span>
        </section>

        <div className="po-at-split">
          <section className="po-at-panel po-at-skills">
            <header className="po-at-panel__head">
              <span className="po-at-panel__title">Signature skills</span>
              <span className="po-at-panel__meta ng-type-numeric">
                {model.attributes.signatureSkills.length}
              </span>
            </header>
            {model.attributes.signatureSkills.length === 0 ? (
              <p className="po-at-empty">No rating stands out against the competition yet.</p>
            ) : (
              <ul className="po-at-compact">
                {model.attributes.signatureSkills.slice(0, COMPACT_LIST_SIZE).map((highlight) => (
                  <li className="po-at-compact__row is-positive" key={highlight.id}>
                    <span aria-hidden className="po-at-compact__glyph">
                      ▲
                    </span>
                    <span className="po-at-compact__text">
                      <span className="po-at-compact__label">{highlight.label}</span>
                      <span className="po-at-compact__detail ng-type-numeric">
                        {highlight.value}
                        {' · '}
                        {highlight.percentile === null
                          ? 'no sample'
                          : ordinalPercentile(highlight.percentile)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="po-at-panel po-at-roles">
            <header className="po-at-panel__head">
              <span className="po-at-panel__title">Role fit ({standing.positionLabel})</span>
            </header>
            {roleFitGap === undefined ? null : (
              <ul className="po-at-compact">
                <li className="po-at-compact__row is-quiet">
                  <span aria-hidden className="po-at-compact__glyph">
                    i
                  </span>
                  <span className="po-at-compact__text">
                    <span className="po-at-compact__label">{roleFitGap.label}</span>
                    <span className="po-at-compact__detail">{roleFitGap.reason}</span>
                  </span>
                </li>
              </ul>
            )}
          </section>
        </div>

        <div className="po-at-split">
          <section className="po-at-panel po-at-weak">
            <header className="po-at-panel__head">
              <span className="po-at-panel__title">Weak links</span>
              <span className="po-at-panel__meta ng-type-numeric">
                {model.attributes.weakLinks.length}
              </span>
            </header>
            {model.attributes.weakLinks.length === 0 ? (
              <p className="po-at-empty">Nothing trails the competition sample.</p>
            ) : (
              <ul className="po-at-compact">
                {model.attributes.weakLinks.slice(0, COMPACT_LIST_SIZE).map((highlight) => (
                  <li className="po-at-compact__row is-negative" key={highlight.id}>
                    <span aria-hidden className="po-at-compact__glyph">
                      !
                    </span>
                    <span className="po-at-compact__text">
                      <span className="po-at-compact__label">{highlight.label}</span>
                      <span className="po-at-compact__detail ng-type-numeric">
                        {highlight.value}
                        {' · '}
                        {highlight.percentile === null
                          ? 'no sample'
                          : ordinalPercentile(highlight.percentile)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button
            className="po-at-compare"
            onClick={session.compare.open}
            title="Open the contextual comparison for this player"
            type="button"
          >
            <span aria-hidden className="po-at-compare__glyph">
              ▥
            </span>
            <span className="po-at-compare__label">Compare with…</span>
          </button>
        </div>
      </div>
    </div>
  )
}
