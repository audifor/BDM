import type {
  ScoutingAttributeRowModel,
  ScoutingConsensusRowModel,
  ScoutingFitRowModel,
  ScoutingHighlightModel,
  ScoutingKnowledgeAreaModel,
  ScoutingKnowledgeState,
  ScoutingNoteModel,
  ScoutingObservedGameModel,
  ScoutingPotentialOutcomeModel,
  ScoutingStatusModel,
  ScoutingTraitRowModel,
} from '@/ui-ng/applications/player/data/buildPlayerScoutingModel'

/**
 * The uncertainty legend of the reference. These four states are levels of knowledge, never ratings:
 * the same number is cyan when it is known and amber when it is only estimated.
 */
const KNOWLEDGE_STATES: readonly {
  readonly id: ScoutingKnowledgeState
  readonly label: string
}[] = [
  { id: 'known', label: 'Known (high confidence)' },
  { id: 'estimated', label: 'Estimated (range)' },
  { id: 'low', label: 'Low confidence' },
  { id: 'unknown', label: 'Unknown' },
]

/** Actions the reference offers. None of them exists in this workspace yet, so all stay disabled. */
const SCOUTING_ACTIONS: readonly {
  readonly id: string
  readonly label: string
  readonly tone: 'normal' | 'priority' | 'destructive'
}[] = [
  { id: 'detailed-report', label: 'View detailed report', tone: 'normal' },
  { id: 'assign-scout', label: 'Assign scout', tone: 'normal' },
  { id: 'increase-priority', label: 'Increase priority', tone: 'priority' },
  { id: 'watch-next-game', label: 'Watch next game', tone: 'normal' },
  { id: 'request-report', label: 'Request report', tone: 'normal' },
  { id: 'end-scouting', label: 'End scouting', tone: 'destructive' },
]

function KnowledgeLegend() {
  return (
    <ul className="po-sc-legend">
      {KNOWLEDGE_STATES.map((state) => (
        <li className={`is-${state.id}`} key={state.id}>
          <span aria-hidden className="po-sc-legend__key" />
          {state.label}
        </li>
      ))}
    </ul>
  )
}

/** The reference's range visual: a band for the estimate, a point for its centre. */
function RangeBar({ row }: { readonly row: ScoutingAttributeRowModel }) {
  if (row.low === null || row.high === null || row.estimate === null) {
    return <span aria-hidden className="po-sc-range is-unknown" />
  }

  return (
    <span
      aria-hidden
      className={`po-sc-range is-${row.knowledgeState}`}
      title={`Estimated: ${row.low}-${row.high} · confidence ${row.confidence === null ? 'unknown' : `${Math.round(row.confidence * 100)}%`}`}
    >
      <span className="po-sc-range__band" style={{ left: `${row.low}%`, right: `${100 - row.high}%` }} />
      <span className="po-sc-range__point" style={{ left: `${row.estimate}%` }} />
    </span>
  )
}

/* ── Band 1 ── */

export function ScoutingStatusPanel({ status }: { readonly status: ScoutingStatusModel }) {
  const unscouted = status.knownDimensionCount === 0
  const coverage = Math.round(status.knowledgeCoverage * 100)
  const state: ScoutingKnowledgeState = unscouted
    ? 'unknown'
    : coverage >= 75
      ? 'known'
      : coverage >= 40
        ? 'estimated'
        : 'low'

  return (
    <section className="po-sc-panel po-sc-status" data-ng-region="scouting-status">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">
          <span aria-hidden className="po-sc-panel__icon">
            ⌖
          </span>
          Scouting status
        </span>
        <span className="po-sc-panel__meta">Disagreement {status.disagreementLabel}</span>
      </header>
      <div className="po-sc-status__blocks">
        <div className="po-sc-status__block is-wide">
          <span className="po-sc-stat__label">Knowledge</span>
          <span className={`po-sc-status__knowledge ng-type-numeric is-${state}`}>
            {status.knowledgeLabel}
          </span>
          <span aria-hidden className="po-sc-bar">
            <span
              className={`po-sc-bar__fill is-${state}`}
              style={{ width: `${coverage}%` }}
            />
          </span>
        </div>
        <div className="po-sc-status__block">
          <span className="po-sc-stat__label">Confidence</span>
          <span className={`po-sc-status__confidence is-${status.confidenceLabel.toLowerCase()}`}>
            {status.confidenceLabel}
          </span>
          <span className="po-sc-note" title={status.confidenceNote}>
            {status.confidenceNote}
          </span>
        </div>
        <div className="po-sc-status__block">
          <span className="po-sc-stat__label">Last scouted</span>
          <span className="po-sc-status__value ng-type-numeric">
            {status.lastScoutedLabel ?? 'Never'}
          </span>
        </div>
        <div className="po-sc-status__block">
          <span className="po-sc-stat__label">Scout</span>
          <span className="po-sc-status__value">{status.observerLabel}</span>
        </div>
      </div>
    </section>
  )
}

export function KnowledgeAreasPanel({
  areas,
}: {
  readonly areas: readonly ScoutingKnowledgeAreaModel[]
}) {
  return (
    <section className="po-sc-panel po-sc-areas" data-ng-region="scouting-knowledge-areas">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">
          <span aria-hidden className="po-sc-panel__icon">
            i
          </span>
          Knowledge areas
        </span>
      </header>
      <ul className="po-sc-areas__list">
        {areas.map((area) => (
          <li className={`po-sc-area is-${area.knowledgeState}`} key={area.id} title={area.note}>
            <span className="po-sc-area__label">{area.label}</span>
            <span aria-hidden className="po-sc-bar">
              <span
                className={`po-sc-bar__fill is-${area.knowledgeState}`}
                style={{ width: `${Math.round(area.coverage * 100)}%` }}
              />
            </span>
            <span className="po-sc-area__value ng-type-numeric">{area.coverageLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── Band 2 ── */

export function ScoutedAttributePanel({
  rows,
}: {
  readonly rows: readonly ScoutingAttributeRowModel[]
}) {
  return (
    <section className="po-sc-panel po-sc-profile" data-ng-region="scouting-attribute-profile">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">
          <span aria-hidden className="po-sc-panel__icon">
            i
          </span>
          Scouted attribute profile
        </span>
        <span className="po-sc-panel__meta ng-type-numeric">
          {rows.length} {rows.length === 1 ? 'dimension' : 'dimensions'}
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="po-sc-empty">No attribute has been evaluated yet.</p>
      ) : (
        <div className="po-sc-profile__table">
          <div aria-hidden className="po-sc-profile__head">
            <span>Attribute</span>
            <span>Scouted range</span>
            <span>Est. value</span>
          </div>
          {rows.map((row) => (
            <div className={`po-sc-profile__row is-${row.knowledgeState}`} key={row.id}>
              <span className="po-sc-profile__label">{row.label}</span>
              <span className="po-sc-profile__range ng-type-numeric">{row.rangeLabel}</span>
              <RangeBar row={row} />
              <span className="po-sc-profile__estimate ng-type-numeric">{row.estimateLabel}</span>
            </div>
          ))}
        </div>
      )}

      <KnowledgeLegend />
    </section>
  )
}

export function ScoutConsensusPanel({
  note,
  rows,
  summary,
}: {
  readonly note: string
  readonly rows: readonly ScoutingConsensusRowModel[]
  readonly summary: string
}) {
  return (
    <section className="po-sc-panel po-sc-consensus" data-ng-region="scouting-consensus">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">Scout consensus</span>
        <span className="po-sc-panel__meta ng-type-numeric">
          {rows.length} {rows.length === 1 ? 'scout' : 'scouts'}
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="po-sc-empty">No report has been filed for this player.</p>
      ) : (
        <div className="po-sc-consensus__table">
          <div aria-hidden className="po-sc-consensus__head">
            <span>Scout</span>
            <span>Knowledge</span>
            <span>Overall opinion</span>
          </div>
          {rows.map((row) => (
            <div className={`po-sc-consensus__row is-${row.knowledgeState}`} key={row.id}>
              <span className="po-sc-consensus__scout">{row.scoutLabel}</span>
              <span className="po-sc-consensus__knowledge">
                <span className="ng-type-numeric">{row.knowledgeLabel}</span>
                <span aria-hidden className="po-sc-bar">
                  <span
                    className={`po-sc-bar__fill is-${row.knowledgeState}`}
                    style={{ width: `${Math.round(row.knowledgeCoverage * 100)}%` }}
                  />
                </span>
              </span>
              <span className="po-sc-consensus__opinion">
                <span className="ng-type-numeric">{row.rangeLabel}</span>
                <span className="po-sc-note">
                  {row.opinionLabel}
                  {row.tacticalFitLabel === null ? '' : ` · ${row.tacticalFitLabel}`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="po-sc-summary">
        <span aria-hidden className="po-sc-summary__icon">
          ⌖
        </span>
        <span className="po-sc-summary__text">
          <span className="po-sc-summary__title">Consensus summary</span>
          <span className="po-sc-summary__body">{summary}</span>
          <span className="po-sc-note">{note}</span>
        </span>
      </div>
    </section>
  )
}

export function ArchetypePanel({
  strengths,
  tags,
  title,
  roleTitle,
  weaknesses,
}: {
  readonly strengths: readonly ScoutingHighlightModel[]
  readonly tags: readonly string[]
  readonly title: string
  readonly roleTitle: string
  readonly weaknesses: readonly ScoutingHighlightModel[]
}) {
  return (
    <section className="po-sc-panel po-sc-archetype" data-ng-region="scouting-archetype">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">
          <span aria-hidden className="po-sc-panel__icon">
            i
          </span>
          Player archetype
        </span>
      </header>

      <div className="po-sc-archetype__headline">
        <span aria-hidden className="po-sc-archetype__court">
          <span className="po-sc-archetype__court-node" />
        </span>
        <span className="po-sc-archetype__text">
          <span className="po-sc-archetype__title">{title}</span>
          <span className="po-sc-archetype__role">{roleTitle}</span>
        </span>
      </div>

      <ul className="po-sc-archetype__tags">
        {tags.map((tag) => (
          <li className="po-sc-tag" key={tag}>
            {tag}
          </li>
        ))}
      </ul>

      <div className="po-sc-archetype__signals">
        <div className="po-sc-signals">
          <span className="po-sc-signals__title">Strengths</span>
          {strengths.length === 0 ? (
            <p className="po-sc-note">Nothing has been scouted yet.</p>
          ) : (
            <ul>
              {strengths.map((entry) => (
                <li className={`is-${entry.knowledgeState}`} key={entry.id}>
                  <span aria-hidden className="po-sc-signals__glyph">
                    +
                  </span>
                  <span className="po-sc-signals__text">
                    {entry.label}
                    <span className="po-sc-note ng-type-numeric"> {entry.rangeLabel}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="po-sc-signals is-weak">
          <span className="po-sc-signals__title">Weaknesses</span>
          {weaknesses.length === 0 ? (
            <p className="po-sc-note">Nothing has been scouted yet.</p>
          ) : (
            <ul>
              {weaknesses.map((entry) => (
                <li key={entry.id}>
                  <span aria-hidden className="po-sc-signals__glyph">
                    −
                  </span>
                  <span className="po-sc-signals__text">
                    {entry.label}
                    <span className="po-sc-note ng-type-numeric"> {entry.rangeLabel}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

export function ScoutingActionsPanel({ note }: { readonly note: string }) {
  return (
    <section className="po-sc-panel po-sc-actions" data-ng-region="scouting-actions">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">Actions</span>
      </header>
      <ul className="po-sc-actions__list">
        {SCOUTING_ACTIONS.map((action) => (
          <li key={action.id}>
            <button
              className={`po-sc-action is-${action.tone}`}
              disabled
              title="Not performed by this workspace yet"
              type="button"
            >
              {action.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="po-sc-note">{note}</p>
    </section>
  )
}

/* ── Band 3 ── */

export function ProjectedRolesPanel({
  roles,
  note,
}: {
  readonly roles: readonly ScoutingFitRowModel[]
  readonly note: string
}) {
  return (
    <section className="po-sc-panel po-sc-roles" data-ng-region="scouting-projected-roles">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">
          <span aria-hidden className="po-sc-panel__icon">
            i
          </span>
          Projected roles
        </span>
      </header>
      {roles.length === 0 ? (
        <p className="po-sc-empty">{note}</p>
      ) : (
        <ul className="po-sc-fit__list">
          {roles.map((role) => (
            <li className={`is-${role.knowledgeState}`} key={role.id}>
              <span aria-hidden className="po-sc-fit__dot" />
              <span className="po-sc-fit__label">{role.label}</span>
              <span className="po-sc-fit__status">{role.statusLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function PotentialAssessmentPanel({
  note,
  outcomes,
}: {
  readonly note: string
  readonly outcomes: readonly ScoutingPotentialOutcomeModel[]
}) {
  return (
    <section className="po-sc-panel po-sc-potential" data-ng-region="scouting-potential">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">Potential assessment</span>
      </header>
      <ul className="po-sc-potential__bands">
        {outcomes.map((outcome) => (
          <li
            className={`is-${outcome.id} is-${outcome.knowledgeState}${
              outcome.id === 'expected' ? ' is-emphasis' : ''
            }`}
            key={outcome.id}
          >
            <span className="po-sc-potential__label">{outcome.label}</span>
            <span className="po-sc-potential__range ng-type-numeric">{outcome.rangeLabel}</span>
            <span className="po-sc-note">{outcome.stateLabel}</span>
          </li>
        ))}
      </ul>
      <p className="po-sc-note">{note}</p>
    </section>
  )
}

export function PersonalityPanel({
  note,
  rows,
}: {
  readonly note: string
  readonly rows: readonly ScoutingTraitRowModel[]
}) {
  return (
    <section className="po-sc-panel po-sc-personality" data-ng-region="scouting-personality">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">Personality / character</span>
        <span className="po-sc-panel__meta" title={note}>
          Not tracked
        </span>
      </header>
      <div className="po-sc-traits">
        <div aria-hidden className="po-sc-traits__head">
          <span>Trait</span>
          <span>Knowledge</span>
          <span>Assessment</span>
        </div>
        {rows.map((row) => (
          <div className={`po-sc-traits__row is-${row.knowledgeState}`} key={row.id}>
            <span className="po-sc-traits__label">{row.label}</span>
            <span className="po-sc-traits__state">
              {row.knowledgeState === 'unknown'
                ? 'Unknown'
                : row.knowledgeState === 'known'
                  ? 'Known'
                  : 'Estimated'}
            </span>
            <span className="po-sc-traits__value ng-type-numeric">{row.assessmentLabel}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function TeamFitPanel({
  note,
  overallLabel,
  rows,
}: {
  readonly note: string
  readonly overallLabel: string
  readonly rows: readonly ScoutingFitRowModel[]
}) {
  return (
    <section className="po-sc-panel po-sc-teamfit" data-ng-region="scouting-team-fit">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">Fit with our team</span>
        <span className="po-sc-panel__meta" title={note}>
          Not tracked
        </span>
      </header>
      <ul className="po-sc-fit__list">
        {rows.map((row) => (
          <li className={`is-${row.knowledgeState}`} key={row.id}>
            <span aria-hidden className="po-sc-fit__dot" />
            <span className="po-sc-fit__label">{row.label}</span>
            <span className="po-sc-fit__status">{row.statusLabel}</span>
          </li>
        ))}
      </ul>
      <div className="po-sc-overall">
        <span aria-hidden className="po-sc-overall__icon">
          ✓
        </span>
        <span className="po-sc-overall__title">Overall fit</span>
        <span className="po-sc-overall__value">{overallLabel}</span>
      </div>
    </section>
  )
}

/* ── Band 4 ── */

export function ObservedGamesPanel({
  games,
  notesReason,
}: {
  readonly games: readonly ScoutingObservedGameModel[]
  readonly notesReason: string
}) {
  return (
    <section className="po-sc-panel po-sc-games" data-ng-region="scouting-observed-games">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">
          <span aria-hidden className="po-sc-panel__icon">
            i
          </span>
          Observed games
        </span>
        <span className="po-sc-panel__meta ng-type-numeric">
          {games.length} tracked
        </span>
      </header>

      <div className="po-sc-games__table">
        <div aria-hidden className="po-sc-games__head">
          <span>Date</span>
          <span>Competition</span>
          <span>Opponent</span>
          <span>Min</span>
          <span>Pts</span>
          <span>Reb</span>
          <span>Ast</span>
          <span>Stl</span>
          <span>Blk</span>
          <span>Notes</span>
        </div>
        {games.length === 0 ? (
          <p className="po-sc-empty">No game has been tracked yet.</p>
        ) : (
          games.map((game) => (
            <div className="po-sc-games__row" key={game.id}>
              <span className="ng-type-numeric">{game.dateLabel}</span>
              <span className="po-sc-games__competition">{game.competitionLabel}</span>
              <span>{game.opponent}</span>
              <span className="ng-type-numeric">{game.minutes}</span>
              <span className="ng-type-numeric">{game.points}</span>
              <span className="ng-type-numeric">{game.rebounds}</span>
              <span className="ng-type-numeric">{game.assists}</span>
              <span className="ng-type-numeric">{game.steals}</span>
              <span className="ng-type-numeric">{game.blocks}</span>
              <span className="po-sc-games__notes" title={notesReason}>
                —
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export function ScoutNotesPanel({
  notes,
  onEmpty,
  timeline,
}: {
  readonly notes: string
  readonly onEmpty: string
  readonly timeline: readonly ScoutingNoteModel[]
}) {
  return (
    <section className="po-sc-panel po-sc-notes" data-ng-region="scouting-notes">
      <header className="po-sc-panel__head">
        <span className="po-sc-panel__title">Scout notes</span>
        <span className="po-sc-panel__meta ng-type-numeric">
          {timeline.length} {timeline.length === 1 ? 'filing' : 'filings'}
        </span>
      </header>

      {timeline.length === 0 ? (
        <p className="po-sc-empty">{onEmpty}</p>
      ) : (
        <ol className="po-sc-notes__track">
          {timeline.map((entry) => (
            <li className={`po-sc-notes__node is-${entry.knowledgeState}`} key={entry.id}>
              <span className="po-sc-notes__date ng-type-numeric">{entry.dateLabel}</span>
              <span aria-hidden className="po-sc-notes__dot" />
              <span className="po-sc-notes__text">
                <span className="po-sc-notes__title">{entry.title}</span>
                <span className="po-sc-notes__detail">{entry.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="po-sc-note">{notes}</p>
    </section>
  )
}
